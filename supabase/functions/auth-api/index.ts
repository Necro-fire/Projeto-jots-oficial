import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.2";

// ─── CORS ────────────────────────────────────────────────────────────────────
// Defina o segredo ALLOWED_ORIGINS (lista separada por vírgula, ex.:
// "https://sistema.exemplo.com.br") para restringir o acesso ao domínio do sistema.
// Sem o segredo, a função segue aceitando qualquer origem (comportamento anterior).
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

function corsFor(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Vary': 'Origin',
  };
  const origin = req.headers.get('Origin') || '';
  if (ALLOWED_ORIGINS.length === 0) {
    headers['Access-Control-Allow-Origin'] = '*';
  } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

// ─── Política de tentativas de login ────────────────────────────────────────
const BLOCK_MINUTES = 15;
const MAX_ATTEMPTS_PER_CPF = 5;
const MAX_ATTEMPTS_PER_IP = 20;

const GENERIC_LOGIN_ERROR = 'CPF ou senha inválidos';

type Admin = ReturnType<typeof createClient>;

function logError(context: string, err: unknown) {
  console.error(`[auth-api] ${context}:`, err instanceof Error ? err.message : err);
}

async function logAudit(
  admin: Admin, userId: string, userName: string, action: string, module: string,
  details: Record<string, unknown> = {}, ip = '',
) {
  const { error } = await admin.from('audit_logs').insert({
    user_id: userId, user_name: userName, action, module, details, ip_address: ip,
  });
  if (error) logError(`audit_logs (${action})`, error);
}

async function createAlert(
  admin: Admin, alertType: string, severity: string, message: string,
  details: Record<string, unknown> = {}, userId?: string,
) {
  const { error } = await admin.from('security_alerts').insert({
    alert_type: alertType, severity, message, details, user_id: userId || null,
  });
  if (error) logError(`security_alerts (${alertType})`, error);
}

// cf-connecting-ip é definido pela borda (Cloudflare) e sobrescrito lá: o cliente não consegue
// forjá-lo. x-forwarded-for pode vir com um primeiro valor escolhido pelo cliente, o que
// permitiria contornar o limite de tentativas por IP; fica só como último recurso.
function getClientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip')?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
}

// Limites para o que o chamador (qualquer usuário autenticado) pode gravar na auditoria.
const AUDIT_FIELD_MAX = 64;
const AUDIT_DETAILS_MAX_CHARS = 4000;

function boundedDetails(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  try {
    if (JSON.stringify(value).length > AUDIT_DETAILS_MAX_CHARS) return { truncated: true };
  } catch {
    return {};
  }
  return value as Record<string, unknown>;
}

// Desfaz um usuário criado pela metade (o perfil e o vínculo caem em cascata).
async function rollbackUser(admin: Admin, userId: string, context: string) {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) logError(`rollback ${context}`, error);
}

function maskCpf(cpf: string) {
  return cpf.substring(0, 3) + '***';
}

// Bloqueio por CPF: MAX falhas desde o último sucesso, dentro da janela.
// Bloqueio por IP: MAX falhas na janela, qualquer CPF.
async function isBlocked(admin: Admin, cpf: string, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - BLOCK_MINUTES * 60 * 1000).toISOString();

  const { data: byCpf, error: cpfErr } = await admin
    .from('login_attempts')
    .select('success')
    .eq('cpf', cpf)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(MAX_ATTEMPTS_PER_CPF);
  if (cpfErr) logError('login_attempts (cpf)', cpfErr);
  if (byCpf && byCpf.length >= MAX_ATTEMPTS_PER_CPF && byCpf.every((a: { success: boolean }) => !a.success)) {
    return true;
  }

  if (ip) {
    const { count, error: ipErr } = await admin
      .from('login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', ip)
      .eq('success', false)
      .gte('created_at', since);
    if (ipErr) logError('login_attempts (ip)', ipErr);
    if ((count ?? 0) >= MAX_ATTEMPTS_PER_IP) return true;
  }
  return false;
}

async function recordAttempt(admin: Admin, cpf: string, success: boolean, ip: string) {
  const { error } = await admin.from('login_attempts').insert({ cpf, success, ip_address: ip });
  if (error) logError('login_attempts insert', error);
}

// Encontra o e-mail interno (nunca devolvido ao cliente) e o id do usuário a partir do CPF.
async function findLoginTarget(admin: Admin, cpf: string): Promise<{ id: string; email: string; nome: string } | null> {
  const { data: func } = await admin
    .from('funcionarios_auth')
    .select('user_id, nome')
    .eq('cpf', cpf)
    .eq('status', 'active')
    .maybeSingle();

  if (func?.user_id) {
    const { data: authUser } = await admin.auth.admin.getUserById(func.user_id);
    if (authUser?.user?.email) {
      return { id: func.user_id, email: authUser.user.email, nome: func.nome || '' };
    }
  }

  const { data: prof } = await admin
    .from('profiles')
    .select('id, email, nome')
    .eq('email', `admin_${cpf}@jots.interno`)
    .eq('tipo', 'admin')
    .maybeSingle();

  return prof ? { id: prof.id, email: prof.email, nome: prof.nome || '' } : null;
}

// Valida o JWT do usuário no servidor de Auth (a anon key não passa nesta checagem).
async function getCaller(admin: Admin, req: Request): Promise<{ id: string; nome: string } | null> {
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;

  const { data: prof } = await admin.from('profiles').select('nome').eq('id', data.user.id).maybeSingle();
  return { id: data.user.id, nome: prof?.nome || '' };
}

Deno.serve(async (req) => {
  const corsHeaders = corsFor(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const clientIp = getClientIp(req);

  // Retorna o chamador autenticado e administrador, ou a resposta de erro.
  const requireAdmin = async (): Promise<{ id: string; nome: string } | Response> => {
    const caller = await getCaller(admin, req);
    if (!caller) return json({ error: 'Não autorizado' }, 401);
    const { data: isAdmin } = await admin.rpc('has_role', { _user_id: caller.id, _role: 'admin' });
    if (!isAdmin) return json({ error: 'Acesso negado' }, 403);
    return caller;
  };

  try {
    const body = await req.json();
    const { action, ...data } = body;

    // ─── LOGIN: CPF + senha validados aqui; o e-mail interno nunca sai do servidor ───
    if (action === 'login') {
      const cpf = String(data.cpf || '').replace(/\D/g, '');
      const password = String(data.password || '');
      if (cpf.length !== 11 || !password) return json({ error: GENERIC_LOGIN_ERROR }, 400);

      if (await isBlocked(admin, cpf, clientIp)) {
        await createAlert(admin, 'login_blocked', 'high',
          `Login bloqueado para CPF ${maskCpf(cpf)}.*** após tentativas falhas`,
          { cpf_partial: maskCpf(cpf), ip: clientIp });
        return json({ error: `Muitas tentativas. Tente novamente em ${BLOCK_MINUTES} minutos.` }, 429);
      }

      const target = await findLoginTarget(admin, cpf);

      // Mesma mensagem para CPF inexistente e senha errada (não revela quais CPFs existem).
      if (!target) {
        await recordAttempt(admin, cpf, false, clientIp);
        return json({ error: GENERIC_LOGIN_ERROR }, 401);
      }

      const anon = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
        email: target.email,
        password,
      });

      if (signInError || !signIn?.session) {
        await recordAttempt(admin, cpf, false, clientIp);
        if (await isBlocked(admin, cpf, clientIp)) {
          await createAlert(admin, 'login_blocked', 'high',
            `CPF ${maskCpf(cpf)}.*** bloqueado após ${MAX_ATTEMPTS_PER_CPF} tentativas falhas`,
            { cpf_partial: maskCpf(cpf), ip: clientIp }, target.id);
          return json({ error: `Muitas tentativas. Tente novamente em ${BLOCK_MINUTES} minutos.` }, 429);
        }
        return json({ error: GENERIC_LOGIN_ERROR }, 401);
      }

      await recordAttempt(admin, cpf, true, clientIp);
      await logAudit(admin, target.id, target.nome, 'login', 'auth', { cpf_partial: maskCpf(cpf) }, clientIp);

      return json({
        success: true,
        session: {
          access_token: signIn.session.access_token,
          refresh_token: signIn.session.refresh_token,
        },
      });
    }

    // ─── LOGOUT: quem sai é o dono do token, não um campo do corpo ───
    if (action === 'logout') {
      const caller = await getCaller(admin, req);
      if (caller) await logAudit(admin, caller.id, caller.nome, 'logout', 'auth', {}, clientIp);
      return json({ success: true });
    }

    // ─── AUDIT-LOG: autoria vem do JWT validado ───
    if (action === 'audit-log') {
      const caller = await getCaller(admin, req);
      if (!caller) return json({ error: 'Não autorizado' }, 401);
      if (data.action_name && data.module) {
        await logAudit(
          admin, caller.id, caller.nome,
          String(data.action_name).slice(0, AUDIT_FIELD_MAX),
          String(data.module).slice(0, AUDIT_FIELD_MAX),
          boundedDetails(data.details), clientIp,
        );
      }
      return json({ success: true });
    }

    // ─── CREATE ADDITIONAL ADMIN (admin only) ───
    if (action === 'create-admin') {
      const caller = await requireAdmin();
      if (caller instanceof Response) return caller;

      const cpf = String(data.cpf || '').replace(/\D/g, '');
      if (!data.nome || cpf.length !== 11 || !data.password || String(data.password).length < 6) {
        return json({ error: 'Nome, CPF válido e senha (mín. 6) são obrigatórios' }, 400);
      }
      const email = `admin_${cpf}@jots.interno`;
      const { data: authUser, error: authError } = await admin.auth.admin.createUser({
        email, password: data.password, email_confirm: true,
        user_metadata: { nome: data.nome, tipo: 'admin' },
      });
      if (authError) return json({ error: authError.message }, 400);

      const { error: profErr } = await admin.from('profiles')
        .insert({ id: authUser.user.id, nome: data.nome, email, tipo: 'admin' });
      if (profErr) {
        logError('create-admin profiles', profErr);
        await rollbackUser(admin, authUser.user.id, 'create-admin');
        return json({ error: 'Erro interno' }, 500);
      }
      const { data: adminRole } = await admin.from('roles').select('id').eq('name', 'admin').single();
      const { error: roleErr } = adminRole
        ? await admin.from('user_roles').insert({ user_id: authUser.user.id, role_id: adminRole.id })
        : { error: new Error('cargo admin não encontrado') };
      if (roleErr) {
        // Sem o cargo o usuário ficaria "admin" só no nome, sem nenhum acesso: desfaz tudo.
        logError('create-admin user_roles', roleErr);
        await rollbackUser(admin, authUser.user.id, 'create-admin');
        return json({ error: 'Erro interno' }, 500);
      }

      await logAudit(admin, caller.id, caller.nome, 'create_admin', 'auth', { new_admin: data.nome }, clientIp);
      return json({ success: true });
    }

    // ─── CREATE EMPLOYEE (admin only) ───
    if (action === 'create-employee') {
      const caller = await requireAdmin();
      if (caller instanceof Response) return caller;

      if (!data.nome || !data.cpf || !data.password) {
        return json({ error: 'Nome, CPF e senha são obrigatórios' }, 400);
      }
      const cpf = String(data.cpf).replace(/\D/g, '');
      if (cpf.length !== 11) return json({ error: 'CPF deve ter 11 dígitos' }, 400);
      if (String(data.password).length < 6) return json({ error: 'Senha deve ter pelo menos 6 caracteres' }, 400);

      const { data: existing } = await admin.from('funcionarios_auth').select('id').eq('cpf', cpf).maybeSingle();
      if (existing) return json({ error: 'CPF já cadastrado no sistema' }, 400);

      const email = `func_${cpf}@jots.interno`;
      const { data: authUser, error: authError } = await admin.auth.admin.createUser({
        email, password: data.password, email_confirm: true,
        user_metadata: { nome: data.nome, tipo: 'funcionario' },
      });
      if (authError) return json({ error: authError.message }, 400);

      const { error: profErr } = await admin.from('profiles')
        .insert({ id: authUser.user.id, nome: data.nome, email, tipo: 'funcionario' });
      const { error: funcErr } = profErr ? { error: null } : await admin.from('funcionarios_auth').insert({
        user_id: authUser.user.id,
        nome: data.nome,
        cpf,
        codigo_acesso: cpf,
        telefone: data.telefone || '',
        cargo: data.cargo || '',
        filial_id: data.filial_id || '1',
      });
      const { error: roleErr } = (profErr || funcErr || !data.role_id) ? { error: null } :
        await admin.from('user_roles').insert({ user_id: authUser.user.id, role_id: data.role_id });
      if (profErr || funcErr || roleErr) {
        // Cadastro pela metade deixaria um login sem perfil/cargo (ou bloqueando o CPF): desfaz.
        logError('create-employee', profErr || funcErr || roleErr);
        await rollbackUser(admin, authUser.user.id, 'create-employee');
        return json({ error: 'Erro ao cadastrar funcionário' }, 500);
      }

      await logAudit(admin, caller.id, caller.nome, 'create_employee', 'funcionarios',
        { employee_name: data.nome, cpf_partial: maskCpf(cpf) }, clientIp);
      return json({ success: true });
    }

    // ─── UPDATE PASSWORD (admin only): funcionário ou outro administrador ───
    if (action === 'update-password') {
      const caller = await requireAdmin();
      if (caller instanceof Response) return caller;

      if ((!data.funcionario_id && !data.user_id) || !data.new_password) {
        return json({ error: 'Usuário e nova senha são obrigatórios' }, 400);
      }
      if (String(data.new_password).length < 6) return json({ error: 'Senha deve ter pelo menos 6 caracteres' }, 400);

      let targetUserId: string | null = null;
      let targetName = '';
      if (data.funcionario_id) {
        const { data: func } = await admin
          .from('funcionarios_auth').select('user_id, nome').eq('id', data.funcionario_id).single();
        targetUserId = func?.user_id || null;
        targetName = func?.nome || '';
      } else {
        const { data: prof } = await admin
          .from('profiles').select('id, nome').eq('id', data.user_id).maybeSingle();
        targetUserId = prof?.id || null;
        targetName = prof?.nome || '';
      }
      if (!targetUserId) return json({ error: 'Usuário não encontrado' }, 404);

      const { error: updateError } = await admin.auth.admin.updateUserById(targetUserId, {
        password: data.new_password,
      });
      if (updateError) return json({ error: updateError.message }, 400);

      await logAudit(admin, caller.id, caller.nome, 'update_password', 'funcionarios', { target_user: targetName }, clientIp);
      await createAlert(admin, 'password_changed', 'medium',
        `Senha de ${targetName} alterada`, { changed_by: caller.nome }, caller.id);
      return json({ success: true });
    }

    // ─── DELETE EMPLOYEE (admin only) ───
    if (action === 'delete-employee') {
      const caller = await requireAdmin();
      if (caller instanceof Response) return caller;

      const { data: func } = await admin
        .from('funcionarios_auth').select('user_id, nome').eq('id', data.funcionario_id).single();

      await logAudit(admin, caller.id, caller.nome, 'delete_employee', 'funcionarios',
        { target_employee: func?.nome }, clientIp);

      if (func?.user_id) {
        const { error: delError } = await admin.auth.admin.deleteUser(func.user_id);
        if (delError) return json({ error: delError.message }, 400);
      }
      return json({ success: true });
    }

    return json({ error: 'Ação inválida' }, 400);
  } catch (err) {
    logError('unhandled', err);
    return json({ error: 'Erro interno' }, 500);
  }
});
