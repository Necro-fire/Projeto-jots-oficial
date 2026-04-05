import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useFilial } from '@/contexts/FilialContext';
import { FilialSelector } from '@/components/FilialSelector';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Search, Plus, UserCog, Eye, EyeOff, Pencil, Trash2, Phone, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { applyPhoneMask, isValidPhone } from '@/lib/phoneMask';
import { maskCpf, unmask, isValidCpf } from '@/lib/masks';

interface Funcionario {
  id: string;
  nome: string;
  cpf: string;
  codigo_acesso: string;
  telefone: string;
  cargo: string;
  filial_id: string;
  status: string;
  created_at: string;
  user_id: string | null;
}

interface Role {
  id: string;
  name: string;
  description: string;
}

interface UserRole {
  role_id: string;
  user_id: string;
}

export default function Funcionarios() {
  const [search, setSearch] = useState('');
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingFunc, setEditingFunc] = useState<Funcionario | null>(null);
  const [viewingFunc, setViewingFunc] = useState<Funcionario | null>(null);
  const [deletingFunc, setDeletingFunc] = useState<Funcionario | null>(null);
  const [passwordFunc, setPasswordFunc] = useState<Funcionario | null>(null);
  const { selectedFilial } = useFilial();
  const { isAdmin, hasPermission } = useAuth();
  const canCreate = hasPermission('Funcionários', 'create');
  const canEdit = hasPermission('Funcionários', 'edit');

  // Form state
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [senha, setSenha] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [telefone, setTelefone] = useState('');
  const [cargo, setCargo] = useState('');
  const [filialId, setFilialId] = useState('1');
  const [roleId, setRoleId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  const loadData = async () => {
    const [funcRes, rolesRes, urRes] = await Promise.all([
      supabase.from('funcionarios_auth').select('*').order('created_at', { ascending: false }),
      supabase.from('roles').select('*').order('name'),
      supabase.from('user_roles').select('*'),
    ]);
    if (funcRes.data) setFuncionarios(funcRes.data as Funcionario[]);
    if (rolesRes.data) setRoles(rolesRes.data);
    if (urRes.data) setUserRoles(urRes.data);
  };

  useEffect(() => { loadData(); }, []);

  const filtered = funcionarios.filter(f => {
    if (selectedFilial !== 'all' && f.filial_id !== selectedFilial) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return f.nome.toLowerCase().includes(s) || (f.cpf || '').includes(unmask(s)) || (f.cargo || '').toLowerCase().includes(s);
  });

  const resetForm = () => {
    setNome(''); setCpf(''); setSenha(''); setTelefone('');
    setCargo(''); setFilialId('1'); setRoleId(''); setEditingFunc(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (func: Funcionario) => {
    setEditingFunc(func);
    setNome(func.nome);
    setCpf(maskCpf(func.cpf || ''));
    setSenha('');
    setTelefone(func.telefone || '');
    setCargo(func.cargo || '');
    setFilialId(func.filial_id || '1');
    const ur = func.user_id ? userRoles.find(u => u.user_id === func.user_id) : null;
    setRoleId(ur?.role_id || '');
    setDialogOpen(true);
  };

  const openView = (func: Funcionario) => {
    setViewingFunc(func);
    setViewDialogOpen(true);
  };

  const handleSave = async () => {
    if (!nome.trim()) { return toast.error('Nome é obrigatório'); }
    const rawCpf = unmask(cpf);
    if (!rawCpf || rawCpf.length !== 11) { return toast.error('CPF inválido (11 dígitos)'); }
    if (!editingFunc && !senha.trim()) { return toast.error('Senha é obrigatória para novos funcionários'); }
    if (!editingFunc && senha.length < 6) { return toast.error('Senha deve ter pelo menos 6 caracteres'); }
    if (telefone && !isValidPhone(telefone)) { return toast.error('Telefone inválido'); }

    setLoading(true);
    try {
      if (editingFunc) {
        await supabase.from('funcionarios_auth').update({
          nome,
          telefone,
          cargo,
          filial_id: filialId,
        }).eq('id', editingFunc.id);

        if (editingFunc.user_id) {
          await supabase.from('user_roles').delete().eq('user_id', editingFunc.user_id);
          if (roleId) {
            await supabase.from('user_roles').insert({ user_id: editingFunc.user_id, role_id: roleId });
          }
        }
        toast.success('Funcionário atualizado');
      } else {
        const { data, error } = await supabase.functions.invoke('auth-api', {
          body: {
            action: 'create-employee',
            nome,
            cpf: rawCpf,
            password: senha,
            telefone,
            cargo,
            filial_id: filialId,
            role_id: roleId || undefined,
          },
        });
        if (error || data?.error) {
          toast.error(data?.error || 'Erro ao criar funcionário');
          setLoading(false);
          return;
        }
        toast.success('Funcionário criado com sucesso!');
      }
      setDialogOpen(false);
      resetForm();
      loadData();
    } catch {
      toast.error('Erro ao salvar funcionário');
    }
    setLoading(false);
  };

  const handleChangePassword = async () => {
    if (!passwordFunc) return;
    if (newPassword.length < 6) { toast.error('Senha deve ter pelo menos 6 caracteres'); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('auth-api', {
        body: { action: 'update-password', funcionario_id: passwordFunc.id, new_password: newPassword },
      });
      if (error || data?.error) {
        toast.error(data?.error || 'Erro ao alterar senha');
      } else {
        toast.success('Senha alterada com sucesso');
        setPasswordDialogOpen(false);
        setPasswordFunc(null);
        setNewPassword('');
      }
    } catch {
      toast.error('Erro ao alterar senha');
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!deletingFunc) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('auth-api', {
        body: { action: 'delete-employee', funcionario_id: deletingFunc.id },
      });
      if (error || data?.error) {
        toast.error(data?.error || 'Erro ao excluir');
      } else {
        toast.success('Funcionário excluído');
        loadData();
      }
    } catch {
      toast.error('Erro ao excluir funcionário');
    }
    setDeleteDialogOpen(false);
    setDeletingFunc(null);
    setLoading(false);
  };

  const { filiais } = useFilial();
  const getFilialName = (id: string) => filiais.find(f => f.id === id)?.name || id;
  const getRoleName = (func: Funcionario) => {
    if (!func.user_id) return null;
    const ur = userRoles.find(u => u.user_id === func.user_id);
    if (!ur) return null;
    return roles.find(r => r.id === ur.role_id)?.name || null;
  };

  return (
    <div>
      <FilialSelector />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-title font-semibold tracking-tighter">Funcionários</h1>
            <p className="text-ui text-muted-foreground">{filtered.length} funcionários</p>
          </div>
          {canCreate && (
            <Button size="sm" className="gap-1.5" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Novo Funcionário
            </Button>
          )}
        </div>

        {funcionarios.length > 0 && (
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome, CPF ou cargo..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
        )}

        {filtered.length > 0 ? (
          <div className="space-y-1">
            {filtered.map(func => {
              const roleName = getRoleName(func);
              return (
                <div key={func.id} className="flex items-center justify-between py-3 px-4 rounded-md hover:bg-secondary/50 transition-colors">
                  <div className="flex items-center gap-3 cursor-pointer" onClick={() => openView(func)}>
                    <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center">
                      <UserCog className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-ui font-medium">{func.nome}</p>
                      <p className="text-caption text-muted-foreground">
                        {func.cargo || 'Sem cargo'} · CPF: {maskCpf(func.cpf || '')}
                        {func.telefone && ` · ${func.telefone}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {roleName && (
                      <Badge variant="secondary" className="text-caption capitalize">{roleName}</Badge>
                    )}
                    {selectedFilial === 'all' && (
                      <Badge variant="outline" className="text-caption">{getFilialName(func.filial_id)}</Badge>
                    )}
                    <Badge variant={func.status === 'active' ? 'secondary' : 'outline'} className="text-caption">
                      {func.status === 'active' ? 'Ativo' : 'Inativo'}
                    </Badge>
                    {canEdit && (
                      <>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(func)} title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setPasswordFunc(func); setPasswordDialogOpen(true); setNewPassword(''); }} title="Alterar senha">
                          <KeyRound className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => { setDeletingFunc(func); setDeleteDialogOpen(true); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <UserCog className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-ui font-medium">Nenhum funcionário cadastrado</p>
            <p className="text-caption mt-1">Cadastre seu primeiro funcionário para começar</p>
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingFunc ? 'Editar Funcionário' : 'Novo Funcionário'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome completo *</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do funcionário" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>CPF *</Label>
                <Input
                  value={cpf}
                  onChange={e => setCpf(maskCpf(e.target.value))}
                  placeholder="000.000.000-00"
                  maxLength={14}
                  disabled={!!editingFunc}
                />
              </div>
              {!editingFunc && (
                <div className="space-y-2">
                  <Label>Senha *</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      preserveCase
                      value={senha}
                      onChange={e => setSenha(e.target.value)}
                      placeholder="Mín. 6 caracteres"
                      className="pr-9"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Telefone</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={telefone}
                    onChange={e => setTelefone(applyPhoneMask(e.target.value))}
                    placeholder="(00) 0 0000-0000"
                    className="pl-9"
                    maxLength={16}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Função</Label>
                <Input value={cargo} onChange={e => setCargo(e.target.value)} placeholder="Ex: Vendedor" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Filial</Label>
                <Select value={filialId} onValueChange={setFilialId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {filiais.map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cargo (permissões)</Label>
                <Select value={roleId || '__none__'} onValueChange={v => setRoleId(v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {roles.filter(r => r.name !== 'admin').map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? 'Salvando...' : editingFunc ? 'Salvar Alterações' : 'Criar Funcionário'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes do Funcionário</DialogTitle>
          </DialogHeader>
          {viewingFunc && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-md bg-primary/10 flex items-center justify-center">
                  <UserCog className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-medium">{viewingFunc.nome}</p>
                  <Badge variant={viewingFunc.status === 'active' ? 'secondary' : 'outline'}>
                    {viewingFunc.status === 'active' ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">CPF</p>
                  <p className="font-medium">{maskCpf(viewingFunc.cpf || '')}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Função</p>
                  <p className="font-medium">{viewingFunc.cargo || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Telefone</p>
                  <p className="font-medium">{viewingFunc.telefone || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Filial</p>
                  <p className="font-medium">{getFilialName(viewingFunc.filial_id)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Cargo (permissões)</p>
                  <p className="font-medium capitalize">{getRoleName(viewingFunc) || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Cadastrado em</p>
                  <p className="font-medium">{viewingFunc.created_at ? new Date(viewingFunc.created_at).toLocaleDateString('pt-BR') : '—'}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Change Dialog (admin only) */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Alterar Senha</DialogTitle>
          </DialogHeader>
          {passwordFunc && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Alterar a senha de <strong>{passwordFunc.nome}</strong></p>
              <div className="space-y-2">
                <Label>Nova Senha</Label>
                <div className="relative">
                  <Input
                    type={showNewPassword ? 'text' : 'password'}
                    preserveCase
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Mín. 6 caracteres"
                    className="pr-9"
                  />
                  <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleChangePassword} disabled={loading}>
              {loading ? 'Salvando...' : 'Alterar Senha'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir Funcionário</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir <strong>{deletingFunc?.nome}</strong>? Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={loading}>
              {loading ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
