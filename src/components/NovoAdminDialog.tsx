import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ShieldPlus } from 'lucide-react';
import { toast } from 'sonner';
import { maskCpf, unmask } from '@/lib/masks';

export function NovoAdminDialog() {
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);

  const salvar = async () => {
    const raw = unmask(cpf);
    if (!nome.trim() || raw.length !== 11 || senha.length < 6) {
      toast.error('Informe nome, CPF válido e senha (mín. 6)');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('auth-api', {
      body: { action: 'create-admin', nome: nome.trim(), cpf: raw, password: senha },
    });
    setLoading(false);
    if (error || data?.error) { toast.error(data?.error || 'Erro ao criar administrador'); return; }
    toast.success('Administrador criado');
    setOpen(false); setNome(''); setCpf(''); setSenha('');
  };

  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <ShieldPlus className="h-4 w-4" /> Novo Administrador
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Administrador Master</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={nome} onChange={e => setNome(e.target.value)} /></div>
            <div><Label>CPF</Label><Input value={cpf} maxLength={14} onChange={e => setCpf(maskCpf(e.target.value))} placeholder="000.000.000-00" /></div>
            <div><Label>Senha</Label><Input type="password" preserveCase value={senha} onChange={e => setSenha(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={loading}>{loading ? 'Criando...' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
