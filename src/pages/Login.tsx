import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Shield, Lock, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { maskCpf, unmask } from '@/lib/masks';
import jotsLogo from '@/assets/jots-logo.png';

export default function Login() {
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async () => {
    const rawCpf = unmask(cpf);
    if (rawCpf.length !== 11) { toast.error('CPF inválido'); return; }
    setLoading(true);
    try {
      // CPF e senha são validados no servidor; o e-mail interno nunca chega ao navegador.
      const { data, error } = await supabase.functions.invoke('auth-api', {
        body: { action: 'login', cpf: rawCpf, password },
      });
      let message: string | undefined = data?.error;
      if (error && !message) {
        // Respostas 4xx chegam como erro; a mensagem do servidor vem no corpo.
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx) message = (await ctx.json())?.error;
        } catch {
          // corpo ilegível: usa a mensagem padrão
        }
      }
      if (error || data?.error || !data?.session) {
        toast.error(message || 'Erro ao conectar');
        setLoading(false);
        return;
      }
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      if (sessionError) {
        toast.error('Não foi possível iniciar a sessão');
        setLoading(false);
        return;
      }
      navigate('/');
    } catch {
      toast.error('Erro ao conectar');
    }
    setLoading(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    return handleLogin();
  };

  return (
    <div className="min-h-screen flex">
      {/* Left — Form */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center px-6 py-12 bg-gradient-to-br from-[hsl(221,83%,18%)] via-[hsl(221,83%,28%)] to-[hsl(221,70%,42%)]">
        <div className="w-full max-w-md space-y-8">
          {/* Logo */}
          <div className="flex flex-col items-center gap-3">
            <img src={jotsLogo} alt="Jots" className="h-14 w-14 rounded-xl shadow-lg" />
            <h1 className="text-2xl font-bold text-white tracking-tight">Jots Distribuidora</h1>
            <p className="text-white/50 text-sm">Acesse sua conta para continuar</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
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

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-white text-[hsl(221,83%,28%)] hover:bg-white/90 font-semibold text-base shadow-xl shadow-black/20 transition-all duration-200"
            >
              {loading ? 'Processando...' : 'Entrar'}
            </Button>

            <button
              type="button"
              onClick={() => setShowForgot((v) => !v)}
              className="w-full text-center text-white/40 hover:text-white/70 text-sm transition-colors"
            >
              Esqueceu a senha?
            </button>
            {showForgot && (
              <p className="text-center text-white/60 text-sm">
                Procure um administrador do sistema para redefinir a sua senha.
              </p>
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
