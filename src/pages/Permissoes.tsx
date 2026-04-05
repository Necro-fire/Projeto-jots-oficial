import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, KeyRound, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Permission {
  id: string;
  module: string;
  action: string;
  description: string;
}

export default function Permissoes() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [module, setModule] = useState('');
  const [action, setAction] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const loadPermissions = async () => {
    const { data } = await supabase.from('permissions').select('*').order('module').order('action');
    if (data) setPermissions(data);
  };

  useEffect(() => { loadPermissions(); }, []);

  const handleCreate = async () => {
    if (!module.trim() || !action.trim()) return toast.error('Módulo e ação são obrigatórios');
    setLoading(true);
    const { error } = await supabase.from('permissions').insert({ module: module.toLowerCase(), action: action.toLowerCase(), description });
    if (error) toast.error(error.message);
    else {
      toast.success('Permissão criada');
      setDialogOpen(false);
      setModule(''); setAction(''); setDescription('');
      loadPermissions();
    }
    setLoading(false);
  };

  const handleDelete = async (perm: Permission) => {
    if (!confirm(`Excluir permissão "${perm.module}.${perm.action}"?`)) return;
    const { error } = await supabase.from('permissions').delete().eq('id', perm.id);
    if (error) toast.error(error.message);
    else { toast.success('Excluída'); loadPermissions(); }
  };

  const grouped = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module].push(p);
    return acc;
  }, {});

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-title font-semibold tracking-tighter">Permissões</h1>
          <p className="text-ui text-muted-foreground">{permissions.length} permissões no sistema</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Nova Permissão
        </Button>
      </div>

      <div className="space-y-4">
        {Object.entries(grouped).map(([mod, perms]) => (
          <Card key={mod} className="shadow-sm">
            <CardContent className="py-4 px-5 space-y-3">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" />
                <h3 className="font-medium text-ui capitalize">{mod}</h3>
                <Badge variant="secondary" className="text-caption">{perms.length}</Badge>
              </div>
              <div className="space-y-1">
                {perms.map(perm => (
                  <div key={perm.id} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-secondary/50">
                    <div>
                      <p className="text-sm font-medium">{perm.action}</p>
                      <p className="text-caption text-muted-foreground">{perm.description}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(perm)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Permissão</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Módulo</Label>
              <Input value={module} onChange={e => setModule(e.target.value)} placeholder="Ex: produtos" />
            </div>
            <div className="space-y-2">
              <Label>Ação</Label>
              <Input value={action} onChange={e => setAction(e.target.value)} placeholder="Ex: create" />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Criar produtos" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={loading}>{loading ? 'Salvando...' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
