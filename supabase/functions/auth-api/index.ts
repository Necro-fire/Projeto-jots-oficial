import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const BLOCK_MINUTES = 15;
const MAX_ATTEMPTS = 3;

async function logAudit(supabaseAdmin: any, userId: string, userName: string, action: string, module: string, details: any = {}, ip = '') {
  try {
    await supabaseAdmin.from('audit_logs').insert({
      user_id: userId,
      user_name: userName,
      action,
      module,
      details,
      ip_address: ip,
    });
  } catch {}
}

async function createAlert(supabaseAdmin: any, alertType: string, severity: string, message: string, details: any = {}, userId?: string) {
  try {
    await supabaseAdmin.from('security_alerts').insert({
      alert_type: alertType,
      severity,
      message,
      details,
      user_id: userId || null,
    });
  } catch {}
}

async function checkLoginBlocked(supabaseAdmin: any, cpf: string): Promise<{ blocked: boolean; remaining: number }> {
  const since = new Date(Date.now() - BLOCK_MINUTES * 60 * 1000).toISOString();
  const { data: attempts } = await supabaseAdmin
    .from('login_attempts')
    .select('id, success')
    .eq('cpf', cpf)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(MAX_ATTEMPTS);

  if (!attempts || attempts.length < MAX_ATTEMPTS) return { blocked: false, remaining: MAX_ATTEMPTS - (attempts?.length || 0) };

  const allFailed = attempts.every((a: any) => !a.success);
  if (allFailed) {
    return { blocked: true, remaining: 0 };
  }
  return { blocked: false, remaining: MAX_ATTEMPTS };
}

async function recordLoginAttempt(supabaseAdmin: any, cpf: string, success: boolean, ip = '') {
  await supabaseAdmin.from('login_attempts').insert({ cpf, success, ip_address: ip });
}

function getClientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
         req.headers.get('x-real-ip') || '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const clientIp = getClientIp(req);

  try {
    const body = await req.json();
    const { action, ...data } = body;

    // ─── CHECK-SETUP ───
    if (action === 'check-setup') {
      const { data: adminProfiles } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('tipo', 'admin')
        .limit(1);
      return json({ needs_setup: !adminProfiles || adminProfiles.length === 0 });
    }

    // ─── LOOKUP: CPF → email (for login) ───
    if (action === 'lookup') {
      const cpf = (data.cpf || '').replace(/\D/g, '');
      if (!cpf) return json({ error: 'CPF é obrigatório' }, 400);

      // Check if blocked
      const { blocked } = await checkLoginBlocked(supabaseAdmin, cpf);
      if (blocked) {
        await createAlert(supabaseAdmin, 'login_blocked', 'high',
          `CPF ${cpf.substring(0, 3)}.***.*** bloqueado após ${MAX_ATTEMPTS} tentativas falhas`,
          { cpf_partial: cpf.substring(0, 3) + '***' + cpf.substring(8), ip: clientIp });
        return json({ error: `Conta bloqueada temporariamente. Tente novamente em ${BLOCK_MINUTES} minutos.` }, 429);
      }

      // First check funcionarios_auth
      const { data: func } = await supabaseAdmin
        .from('funcionarios_auth')
        .select('user_id')
        .eq('cpf', cpf)
        .eq('status', 'active')
        .maybeSingle();

      if (func?.user_id) {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(func.user_id);
        if (authUser?.user) return json({ email: authUser.user.email });
      }

      // Then check admin by internal email pattern
      const adminEmail = `admin_${cpf}@jots.interno`;
      const { data: profileMatch } = await supabaseAdmin
        .from('profiles')
        .select('id, email')
        .eq('email', adminEmail)
        .eq('tipo', 'admin')
        .maybeSingle();

      if (profileMatch) return json({ email: profileMatch.email });

      // Record failed attempt
      await recordLoginAttempt(supabaseAdmin, cpf, false, clientIp);

      return json({ error: 'CPF não encontrado' }, 404);
    }

    // ─── LOGIN-SUCCESS: record successful login ───
    if (action === 'login-success') {
      const cpf = (data.cpf || '').replace(/\D/g, '');
      if (cpf) {
        await recordLoginAttempt(supabaseAdmin, cpf, true, clientIp);
      }
      if (data.user_id && data.user_name) {
        await logAudit(supabaseAdmin, data.user_id, data.user_name, 'login', 'auth', { cpf_partial: cpf.substring(0, 3) + '***' }, clientIp);
      }
      return json({ success: true });
    }

    // ─── LOGIN-FAILED: record failed password attempt ───
    if (action === 'login-failed') {
      const cpf = (data.cpf || '').replace(/\D/g, '');
      if (cpf) {
        await recordLoginAttempt(supabaseAdmin, cpf, false, clientIp);
        const { blocked } = await checkLoginBlocked(supabaseAdmin, cpf);
        if (blocked) {
          await createAlert(supabaseAdmin, 'login_blocked', 'high',
            `CPF ${cpf.substring(0, 3)}.***.*** bloqueado após ${MAX_ATTEMPTS} tentativas falhas`,
            { cpf_partial: cpf.substring(0, 3) + '***' + cpf.substring(8), ip: clientIp });
          return json({ error: `Conta bloqueada temporariamente. Tente novamente em ${BLOCK_MINUTES} minutos.`, blocked: true }, 429);
        }
      }
      return json({ success: true });
    }

    // ─── LOGOUT ───
    if (action === 'logout') {
      if (data.user_id && data.user_name) {
        await logAudit(supabaseAdmin, data.user_id, data.user_name, 'logout', 'auth', {}, clientIp);
      }
      return json({ success: true });
    }

    // ─── AUDIT-LOG: generic audit entry ───
    if (action === 'audit-log') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Não autorizado' }, 401);

      if (data.user_id && data.action_name && data.module) {
        await logAudit(supabaseAdmin, data.user_id, data.user_name || '', data.action_name, data.module, data.details || {}, clientIp);
      }
      return json({ success: true });
    }

    // ─── SETUP: primeiro admin ───
    if (action === 'setup') {
      const { data: existingAdmin } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('tipo', 'admin')
        .limit(1);

      if (existingAdmin && existingAdmin.length > 0) {
        return json({ error: 'Sistema já configurado' }, 400);
      }

      if (!data.cpf || !data.password || !data.nome) {
        return json({ error: 'CPF, senha e nome são obrigatórios' }, 400);
      }
      if (data.password.length < 6) return json({ error: 'Senha deve ter pelo menos 6 caracteres' }, 400);

      const cpf = data.cpf.replace(/\D/g, '');
      if (cpf.length !== 11) return json({ error: 'CPF deve ter 11 dígitos' }, 400);

      // Purge
      await supabaseAdmin.from('funcionarios_auth').delete().gte('created_at', '1970-01-01');
      await supabaseAdmin.from('user_roles').delete().gte('id', '00000000-0000-0000-0000-000000000000');
      await supabaseAdmin.from('profiles').delete().gte('created_at', '1970-01-01');
      await supabaseAdmin.from('system_settings').delete().gte('created_at', '1970-01-01');
      const { data: { users: allUsers } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      if (allUsers) {
        for (const u of allUsers) {
          try { await supabaseAdmin.auth.admin.deleteUser(u.id); } catch {}
        }
      }

      const email = `admin_${cpf}@jots.interno`;

      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: data.password,
        email_confirm: true,
        user_metadata: { nome: data.nome, tipo: 'admin' },
      });

      if (authError) return json({ error: authError.message }, 400);

      await supabaseAdmin.from('profiles').insert({
        id: authUser.user.id,
        nome: data.nome,
        email,
        tipo: 'admin',
      });

      const { data: adminRole } = await supabaseAdmin
        .from('roles')
        .select('id')
        .eq('name', 'admin')
        .single();

      if (adminRole) {
        await supabaseAdmin.from('user_roles').insert({
          user_id: authUser.user.id,
          role_id: adminRole.id,
        });
      }

      const recoveryCode = Array.from({ length: 8 }, () => 
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]
      ).join('');

      await supabaseAdmin.from('system_settings').insert({
        key: 'recovery_code',
        value: recoveryCode,
      });

      await logAudit(supabaseAdmin, authUser.user.id, data.nome, 'setup_admin', 'auth', { first_admin: true }, clientIp);

      return json({ success: true, recovery_code: recoveryCode });
    }

    // ─── CREATE EMPLOYEE ───
    if (action === 'create-employee') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Não autorizado' }, 401);

      const callerClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const token = authHeader.replace('Bearer ', '');
      const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) return json({ error: 'Token inválido' }, 401);

      const callerId = claimsData.claims.sub as string;
      const { data: isAdmin } = await supabaseAdmin.rpc('has_role', { _user_id: callerId, _role: 'admin' });
      if (!isAdmin) return json({ error: 'Acesso negado' }, 403);

      if (!data.nome || !data.cpf || !data.password) {
        return json({ error: 'Nome, CPF e senha são obrigatórios' }, 400);
      }

      const cpf = data.cpf.replace(/\D/g, '');
      if (cpf.length !== 11) return json({ error: 'CPF deve ter 11 dígitos' }, 400);

      const { data: existing } = await supabaseAdmin
        .from('funcionarios_auth')
        .select('id')
        .eq('cpf', cpf)
        .maybeSingle();

      if (existing) return json({ error: 'CPF já cadastrado no sistema' }, 400);

      const email = `func_${cpf}@jots.interno`;

      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: data.password,
        email_confirm: true,
        user_metadata: { nome: data.nome, tipo: 'funcionario' },
      });

      if (authError) return json({ error: authError.message }, 400);

      await supabaseAdmin.from('profiles').insert({
        id: authUser.user.id,
        nome: data.nome,
        email,
        tipo: 'funcionario',
      });

      await supabaseAdmin.from('funcionarios_auth').insert({
        user_id: authUser.user.id,
        nome: data.nome,
        cpf,
        codigo_acesso: cpf,
        telefone: data.telefone || '',
        cargo: data.cargo || '',
        filial_id: data.filial_id || '1',
      });

      if (data.role_id) {
        await supabaseAdmin.from('user_roles').insert({
          user_id: authUser.user.id,
          role_id: data.role_id,
        });
      }

      // Get caller name for audit
      const { data: callerProfile } = await supabaseAdmin.from('profiles').select('nome').eq('id', callerId).single();
      await logAudit(supabaseAdmin, callerId, callerProfile?.nome || '', 'create_employee', 'funcionarios', { employee_name: data.nome, cpf_partial: cpf.substring(0, 3) + '***' }, clientIp);

      return json({ success: true });
    }

    // ─── UPDATE EMPLOYEE PASSWORD (admin only) ───
    if (action === 'update-password') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Não autorizado' }, 401);

      const callerClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const token = authHeader.replace('Bearer ', '');
      const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) return json({ error: 'Token inválido' }, 401);

      const callerId = claimsData.claims.sub as string;
      const { data: isAdmin } = await supabaseAdmin.rpc('has_role', { _user_id: callerId, _role: 'admin' });
      if (!isAdmin) return json({ error: 'Acesso negado' }, 403);

      if (!data.funcionario_id || !data.new_password) {
        return json({ error: 'ID do funcionário e nova senha são obrigatórios' }, 400);
      }
      if (data.new_password.length < 6) return json({ error: 'Senha deve ter pelo menos 6 caracteres' }, 400);

      const { data: func } = await supabaseAdmin
        .from('funcionarios_auth')
        .select('user_id, nome')
        .eq('id', data.funcionario_id)
        .single();

      if (!func?.user_id) return json({ error: 'Funcionário não encontrado' }, 404);

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(func.user_id, {
        password: data.new_password,
      });

      if (updateError) return json({ error: updateError.message }, 400);

      const { data: callerProfile } = await supabaseAdmin.from('profiles').select('nome').eq('id', callerId).single();
      await logAudit(supabaseAdmin, callerId, callerProfile?.nome || '', 'update_password', 'funcionarios', { target_employee: func.nome }, clientIp);
      await createAlert(supabaseAdmin, 'password_changed', 'medium', `Senha do funcionário ${func.nome} alterada`, { changed_by: callerProfile?.nome }, callerId);

      return json({ success: true });
    }

    // ─── RESET PASSWORD (via recovery code) ───
    if (action === 'reset-password') {
      const cpf = (data.cpf || '').replace(/\D/g, '');
      if (!cpf || cpf.length !== 11) return json({ error: 'CPF inválido' }, 400);
      if (!data.recovery_code) return json({ error: 'Código de recuperação é obrigatório' }, 400);
      if (!data.new_password || data.new_password.length < 6) return json({ error: 'Senha deve ter pelo menos 6 caracteres' }, 400);

      const { data: setting } = await supabaseAdmin
        .from('system_settings')
        .select('value')
        .eq('key', 'recovery_code')
        .single();

      if (!setting || setting.value !== data.recovery_code) {
        await createAlert(supabaseAdmin, 'invalid_recovery_code', 'high',
          `Tentativa de recuperação com código inválido para CPF ${cpf.substring(0, 3)}***`,
          { cpf_partial: cpf.substring(0, 3) + '***', ip: clientIp });
        return json({ error: 'Código de recuperação inválido' }, 403);
      }

      let userId: string | null = null;
      let userName = '';

      const { data: func } = await supabaseAdmin
        .from('funcionarios_auth')
        .select('user_id, nome')
        .eq('cpf', cpf)
        .eq('status', 'active')
        .maybeSingle();

      if (func?.user_id) {
        userId = func.user_id;
        userName = func.nome;
      } else {
        const adminEmail = `admin_${cpf}@jots.interno`;
        const { data: prof } = await supabaseAdmin
          .from('profiles')
          .select('id, nome')
          .eq('email', adminEmail)
          .eq('tipo', 'admin')
          .maybeSingle();
        if (prof) { userId = prof.id; userName = prof.nome; }
      }

      if (!userId) return json({ error: 'CPF não encontrado' }, 404);

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: data.new_password,
      });

      if (updateError) return json({ error: updateError.message }, 400);

      await logAudit(supabaseAdmin, userId, userName, 'reset_password', 'auth', { via: 'recovery_code' }, clientIp);
      await createAlert(supabaseAdmin, 'password_reset', 'medium', `Senha redefinida via código de recuperação para ${userName}`, {}, userId);

      return json({ success: true });
    }

    // ─── DELETE EMPLOYEE ───
    if (action === 'delete-employee') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Não autorizado' }, 401);

      const callerClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const token = authHeader.replace('Bearer ', '');
      const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) return json({ error: 'Token inválido' }, 401);

      const callerId = claimsData.claims.sub as string;
      const { data: isAdmin } = await supabaseAdmin.rpc('has_role', { _user_id: callerId, _role: 'admin' });
      if (!isAdmin) return json({ error: 'Acesso negado' }, 403);

      const { data: func } = await supabaseAdmin
        .from('funcionarios_auth')
        .select('user_id, nome')
        .eq('id', data.funcionario_id)
        .single();

      const { data: callerProfile } = await supabaseAdmin.from('profiles').select('nome').eq('id', callerId).single();
      await logAudit(supabaseAdmin, callerId, callerProfile?.nome || '', 'delete_employee', 'funcionarios', { target_employee: func?.nome }, clientIp);

      if (func?.user_id) {
        await supabaseAdmin.auth.admin.deleteUser(func.user_id);
      }

      return json({ success: true });
    }

    // ─── GET RECOVERY CODE (admin only) ───
    if (action === 'get-recovery-code') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Não autorizado' }, 401);

      const callerClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const token = authHeader.replace('Bearer ', '');
      const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) return json({ error: 'Token inválido' }, 401);

      const callerId = claimsData.claims.sub as string;
      const { data: isAdmin } = await supabaseAdmin.rpc('has_role', { _user_id: callerId, _role: 'admin' });
      if (!isAdmin) return json({ error: 'Acesso negado' }, 403);

      const { data: setting } = await supabaseAdmin
        .from('system_settings')
        .select('value')
        .eq('key', 'recovery_code')
        .single();

      const { data: callerProfile } = await supabaseAdmin.from('profiles').select('nome').eq('id', callerId).single();
      await logAudit(supabaseAdmin, callerId, callerProfile?.nome || '', 'view_recovery_code', 'admin', {}, clientIp);

      return json({ recovery_code: setting?.value || '' });
    }

    return json({ error: 'Ação inválida' }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
