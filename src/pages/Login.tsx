import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Shield, Lock, KeyRound, Loader2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { maskCpf, unmask } from '@/lib/masks';
import jotsLogo from '@/assets/jots-logo.png';

type View = 'login' | 'setup' | 'forgot';

export default function Login() {
  const [view, setView] = useState<View>('login');
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [setupNome, setSetupNome] = useState('');
  const [checkingSetup, setCheckingSetup] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const { data } = await supabase.functions.invoke('auth-api', {
          body: { action: 'check-setup' },
        });
        if (data?.needs_setup) setView('setup');
      } catch {}
      setCheckingSetup(false);
    };
    checkSetup();
  }, []);

  const handleLogin = async () => {
    const rawCpf = unmask(cpf);
    if (rawCpf.length !== 11) { toast.error('CPF inválido'); return; }
    setLoading(true);
    try {
      const { data, error: lookupError } = await supabase.functions.invoke('auth-api', {
        body: { action: 'lookup', cpf: rawCpf },
      });
      if (lookupError || data?.error) {
        toast.error(data?.error || 'CPF não encontrado');
        setLoading(false);
        return;
      }
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password,
      });
      if (error) {
        // Record failed password attempt
        await supabase.functions.invoke('auth-api', {
          body: { action: 'login-failed', cpf: rawCpf },
        }).catch(() => {});
        toast.error('Senha inválida');
      } else {
        // Record successful login
        await supabase.functions.invoke('auth-api', {
          body: { action: 'login-success', cpf: rawCpf, user_id: authData.user?.id, user_name: authData.user?.user_metadata?.nome || '' },
        }).catch(() => {});
        navigate('/');
      }
    } catch {
      toast.error('Erro ao conectar');
    }
    setLoading(false);
  };

  const handleSetup = async () => {
    const rawCpf = unmask(cpf);
    if (rawCpf.length !== 11) { toast.error('CPF inválido'); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('auth-api', {
        body: { action: 'setup', cpf: rawCpf, password, nome: setupNome },
      });
      if (error || data?.error) {
        toast.error(data?.error || 'Erro ao configurar');
        setLoading(false);
        return;
      }
      toast.success('Administrador criado! Anote o código de recuperação: ' + data.recovery_code);
      setView('login');
      setCpf('');
      setPassword('');
      setSetupNome('');
    } catch {
      toast.error('Erro ao configurar');
    }
    setLoading(false);
  };

  const handleResetPassword = async () => {
    const rawCpf = unmask(cpf);
    if (rawCpf.length !== 11) { toast.error('CPF inválido'); return; }
    if (!recoveryCode.trim()) { toast.error('Informe o código de recuperação'); return; }
    if (newPassword.length < 6) { toast.error('Senha deve ter pelo menos 6 caracteres'); return; }
    if (newPassword !== confirmPassword) { toast.error('As senhas não coincidem'); return; }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('auth-api', {
        body: { action: 'reset-password', cpf: rawCpf, recovery_code: recoveryCode.trim(), new_password: newPassword },
      });
      if (error || data?.error) {
        toast.error(data?.error || 'Erro ao redefinir senha');
        setLoading(false);
        return;
      }
      toast.success('Senha redefinida com sucesso!');
      setView('login');
      setCpf('');
      setNewPassword('');
      setConfirmPassword('');
      setRecoveryCode('');
    } catch {
      toast.error('Erro ao redefinir senha');
    }
    setLoading(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (view === 'setup') return handleSetup();
    if (view === 'forgot') return handleResetPassword();
    return handleLogin();
  };

  if (checkingSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(221,83%,18%)] via-[hsl(221,83%,28%)] to-[hsl(221,70%,42%)]">
        <Loader2 className="h-8 w-8 animate-spin text-white/60" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left — Form */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center px-6 py-12 bg-gradient-to-br from-[hsl(221,83%,18%)] via-[hsl(221,83%,28%)] to-[hsl(221,70%,42%)]">
        <div className="w-full max-w-md space-y-8">
          {/* Logo */}
          <div className="flex flex-col items-center gap-3">
            <img src={jotsLogo} alt="Jots" className="h-14 w-14 rounded-xl shadow-lg" />
            <h1 className="text-2xl font-bold text-white tracking-tight">Jots Distribuidora</h1>
            <p className="text-white/50 text-sm">
              {view === 'setup' ? 'Configure o primeiro administrador'
                : view === 'forgot' ? 'Redefinir senha'
                : 'Acesse sua conta para continuar'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {view === 'forgot' && (
              <button type="button" onClick={() => setView('login')} className="flex items-center gap-1.5 text-white/60 hover:text-white text-sm transition-colors">
                <ArrowLeft className="h-4 w-4" /> Voltar ao login
              </button>
            )}

            {view === 'setup' && (
              <div className="space-y-2">
                <Label className="text-white/70 text-sm">Nome completo</Label>
                <div className="relative">
                  <Input
                    value={setupNome}
                    onChange={(e) => setSetupNome(e.target.value)}
                    placeholder="Seu nome"
                    className="h-12 bg-white/10 border-white/15 text-white placeholder:text-white/25 rounded-xl focus-visible:ring-white/30 focus-visible:ring-offset-0"
                    required
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-white/70 text-sm">CPF</Label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                <Input
                  value={cpf}
                  onChange={(e) => setCpf(maskCpf(e.target.value))}
                  placeholder="000.000.000-00"
                  className="pl-10 h-12 bg-white/10 border-white/15 text-white placeholder:text-white/25 rounded-xl focus-visible:ring-white/30 focus-visible:ring-offset-0"
                  maxLength={14}
                  required
                />
              </div>
            </div>

            {view === 'forgot' && (
              <>
                <div className="space-y-2">
                  <Label className="text-white/70 text-sm">Código de Recuperação</Label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                    <Input
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                      placeholder="Código fixo de alteração"
                      className="pl-10 h-12 bg-white/10 border-white/15 text-white placeholder:text-white/25 rounded-xl focus-visible:ring-white/30 focus-visible:ring-offset-0 uppercase font-mono"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-white/70 text-sm">Nova Senha</Label>
                  <Input
                    type="password"
                    preserveCase
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mín. 6 caracteres"
                    className="h-12 bg-white/10 border-white/15 text-white placeholder:text-white/25 rounded-xl focus-visible:ring-white/30 focus-visible:ring-offset-0"
                    required
                    minLength={6}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/70 text-sm">Confirmar Senha</Label>
                  <Input
                    type="password"
                    preserveCase
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a nova senha"
                    className="h-12 bg-white/10 border-white/15 text-white placeholder:text-white/25 rounded-xl focus-visible:ring-white/30 focus-visible:ring-offset-0"
                    required
                    minLength={6}
                  />
                </div>
              </>
            )}

            {view !== 'forgot' && (
              <div className="space-y-2">
                <Label className="text-white/70 text-sm">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    preserveCase
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-10 pr-10 h-12 bg-white/10 border-white/15 text-white placeholder:text-white/25 rounded-xl focus-visible:ring-white/30 focus-visible:ring-offset-0"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-white text-[hsl(221,83%,28%)] hover:bg-white/90 font-semibold text-base shadow-xl shadow-black/20 transition-all duration-200"
            >
              {loading ? 'Processando...'
                : view === 'setup' ? 'Configurar Sistema'
                : view === 'forgot' ? 'Redefinir Senha'
                : 'Entrar'}
            </Button>

            {view === 'login' && (
              <button
                type="button"
                onClick={() => { setView('forgot'); setCpf(''); setPassword(''); }}
                className="w-full text-center text-white/40 hover:text-white/70 text-sm transition-colors"
              >
                Esqueceu a senha?
              </button>
            )}
          </form>
        </div>
      </div>

      {/* Right — Visual */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-[hsl(221,83%,50%)] via-[hsl(221,70%,42%)] to-[hsl(221,83%,32%)] items-center justify-center relative overflow-hidden">
        <div className="absolute top-16 right-16 w-80 h-80 rounded-full bg-white/[0.04]" />
        <div className="absolute bottom-24 left-12 w-56 h-56 rounded-full bg-white/[0.04]" />
        <div className="absolute top-1/3 left-1/4 w-36 h-36 rounded-3xl bg-white/[0.04] rotate-45" />
        <div className="absolute bottom-1/4 right-1/3 w-20 h-20 rounded-2xl bg-white/[0.06] -rotate-12" />

        <div className="relative z-10 text-center space-y-8 px-12">
          <div className="w-28 h-28 mx-auto rounded-3xl bg-white/10 backdrop-blur-sm flex items-center justify-center shadow-2xl border border-white/10">
            <Shield className="h-14 w-14 text-white/90" />
          </div>
          <div className="space-y-3">
            <h2 className="text-4xl font-bold text-white tracking-tight">Sistema de Gestão</h2>
            <p className="text-white/50 text-lg max-w-sm mx-auto leading-relaxed">
              Controle completo de vendas, estoque, funcionários e muito mais.
            </p>
          </div>
          <div className="flex justify-center gap-2 pt-4">
            <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
            <div className="w-2.5 h-2.5 rounded-full bg-white/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
          </div>
        </div>
      </div>
    </div>
  );
}
