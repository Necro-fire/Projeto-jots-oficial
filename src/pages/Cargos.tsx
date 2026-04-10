import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Shield, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Role {
  id: string;
  name: string;
  description: string;
}

interface Permission {
  id: string;
  module: string;
  action: string;
  description: string;
}

export default function Cargos() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    const [rolesRes, permsRes, rpRes] = await Promise.all([
      supabase.from('roles').select('*').order('name'),
      supabase.from('permissions').select('*').order('module').order('action'),
      supabase.from('role_permissions').select('*'),
    ]);

    if (rolesRes.data) setRoles(rolesRes.data);
    if (permsRes.data) setPermissions(permsRes.data);
    if (rpRes.data) {
      const map: Record<string, string[]> = {};
      rpRes.data.forEach((rp: any) => {
        if (!map[rp.role_id]) map[rp.role_id] = [];
        map[rp.role_id].push(rp.permission_id);
      });
      setRolePermissions(map);
    }
  };

  useEffect(() => { loadData(); }, []);

  const openNew = () => {
    setEditingRole(null);
    setName('');
    setDescription('');
    setSelectedPerms([]);
    setDialogOpen(true);
  };

  const openEdit = (role: Role) => {
    setEditingRole(role);
    setName(role.name);
    setDescription(role.description);
    setSelectedPerms(rolePermissions[role.id] || []);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return toast.error('Nome é obrigatório');
    setLoading(true);

    try {
      let roleId: string;

      if (editingRole) {
        await supabase.from('roles').update({ name, description }).eq('id', editingRole.id);
        roleId = editingRole.id;

        // Remove old permissions
        await supabase.from('role_permissions').delete().eq('role_id', roleId);
      } else {
        const { data, error } = await supabase.from('roles').insert({ name, description }).select().single();
        if (error) throw error;
        roleId = data.id;
      }

      // Insert new permissions
      if (selectedPerms.length > 0) {
        await supabase.from('role_permissions').insert(
          selectedPerms.map(pid => ({ role_id: roleId, permission_id: pid }))
        );
      }

      toast.success(editingRole ? 'Cargo atualizado' : 'Cargo criado');
      setDialogOpen(false);
      loadData();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    }
    setLoading(false);
  };

  const handleDelete = async (role: Role) => {
    if (role.name === 'admin') return toast.error('Não é possível excluir o cargo de admin');
    if (!confirm(`Excluir o cargo "${role.name}"?`)) return;

    const { error } = await supabase.from('roles').delete().eq('id', role.id);
    if (error) toast.error(error.message);
    else {
      toast.success('Cargo excluído');
      loadData();
    }
  };

  const togglePerm = (permId: string) => {
    setSelectedPerms(prev =>
      prev.includes(permId) ? prev.filter(p => p !== permId) : [...prev, permId]
    );
  };

  // Group permissions by module
  const permsByModule = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module].push(p);
    return acc;
  }, {});

  const moduleLabels: Record<string, string> = {
    dashboard: 'Dashboard', produtos: 'Produtos', clientes: 'Clientes',
    vendas: 'Vendas', estoque: 'Estoque', caixa: 'Caixa',
    funcionarios: 'Funcionários', relatorios: 'Relatórios', fiscal: 'Fiscal',
    pdv: 'PDV', admin: 'Administração', fornecedores: 'Fornecedores',
    trafego_filiais: 'Tráfego de Filiais', produtos_consignados: 'Produtos Consignados',
    boleto: 'Boleto',
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-title font-semibold tracking-tighter">Cargos</h1>
          <p className="text-ui text-muted-foreground">{roles.length} cargos cadastrados</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={openNew}>
          <Plus className="h-4 w-4" />
          Novo Cargo
        </Button>
      </div>

      <div className="grid gap-3">
        {roles.map(role => (
          <Card key={role.id} className="shadow-sm">
            <CardContent className="flex items-center justify-between py-4 px-5">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center">
                  <Shield className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-ui font-medium capitalize">{role.name}</p>
                  <p className="text-caption text-muted-foreground">{role.description || 'Sem descrição'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="text-caption">
                  {(rolePermissions[role.id] || []).length} permissões
                </Badge>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(role)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {role.name !== 'admin' && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(role)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRole ? 'Editar Cargo' : 'Novo Cargo'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: vendedor" disabled={editingRole?.name === 'admin'} />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição do cargo" />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-base font-medium">Permissões</Label>
              <div className="grid gap-4">
                {Object.entries(permsByModule).map(([mod, perms]) => (
                  <Card key={mod} className="shadow-none border">
                    <CardHeader className="py-3 px-4">
                      <CardTitle className="text-sm font-medium">{moduleLabels[mod] || mod}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3 pt-0">
                      <div className="flex flex-wrap gap-x-6 gap-y-2">
                        {perms.map(perm => (
                          <label key={perm.id} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={selectedPerms.includes(perm.id)}
                              onCheckedChange={() => togglePerm(perm.id)}
                            />
                            <span>{perm.description || `${perm.module}.${perm.action}`}</span>
                          </label>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
