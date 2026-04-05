import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, Search, ChevronLeft, ChevronRight, ShieldAlert, ShieldCheck, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface AuditLog {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  module: string;
  details: any;
  ip_address: string;
  origin: string;
  created_at: string;
}

interface SecurityAlert {
  id: string;
  alert_type: string;
  severity: string;
  message: string;
  details: any;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  login: 'Login',
  logout: 'Logout',
  setup_admin: 'Setup Administrador',
  create_employee: 'Criação de Funcionário',
  delete_employee: 'Exclusão de Funcionário',
  update_password: 'Alteração de Senha',
  reset_password: 'Redefinição de Senha',
  view_recovery_code: 'Visualização Código Recuperação',
  create_product: 'Criação de Produto',
  edit_product: 'Edição de Produto',
  delete_product: 'Exclusão de Produto',
  create_sale: 'Criação de Venda',
  cancel_sale: 'Cancelamento de Venda',
  cancel_sale_item: 'Cancelamento de Item',
  open_caixa: 'Abertura de Caixa',
  close_caixa: 'Fechamento de Caixa',
  create_nf: 'Adição de NF',
  cancel_nf: 'Cancelamento de NF',
  update_permissions: 'Alteração de Permissões',
  create_client: 'Criação de Cliente',
  edit_client: 'Edição de Cliente',
  delete_client: 'Exclusão de Cliente',
};

const MODULE_LABELS: Record<string, string> = {
  auth: 'Autenticação',
  admin: 'Administração',
  produtos: 'Produtos',
  vendas: 'Vendas',
  caixa: 'Caixa',
  fiscal: 'Fiscal',
  clientes: 'Clientes',
  funcionarios: 'Funcionários',
  estoque: 'Estoque',
  permissoes: 'Permissões',
};

const MODULES = Object.keys(MODULE_LABELS).sort();

export default function Auditoria() {
  const { isAdmin } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'logs' | 'alerts'>('logs');
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  useEffect(() => {
    if (!isAdmin) return;

    const fetchData = async () => {
      setLoading(true);

      let logsQuery = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (moduleFilter !== 'all') {
        logsQuery = logsQuery.eq('module', moduleFilter);
      }
      if (search.trim()) {
        logsQuery = logsQuery.or(`user_name.ilike.%${search}%,action.ilike.%${search}%`);
      }

      const [logsRes, alertsRes] = await Promise.all([
        logsQuery,
        supabase
          .from('security_alerts')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100),
      ]);

      if (logsRes.data) setLogs(logsRes.data as unknown as AuditLog[]);
      if (alertsRes.data) setAlerts(alertsRes.data as unknown as SecurityAlert[]);
      setLoading(false);
    };

    fetchData();
  }, [isAdmin, page, moduleFilter, search]);

  const handleResolveAlert = async (id: string) => {
    await supabase
      .from('security_alerts')
      .update({ resolved: true, resolved_at: new Date().toISOString() } as any)
      .eq('id', id);
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, resolved: true, resolved_at: new Date().toISOString() } : a));
    toast.success('Alerta resolvido');
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground">
        <Shield className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-lg font-medium">Acesso restrito</p>
        <p className="text-sm">Apenas administradores podem acessar a auditoria.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Auditoria & Segurança
          </h1>
          <p className="text-sm text-muted-foreground">Logs de operações críticas e alertas de segurança</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <Button
          variant={tab === 'logs' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTab('logs')}
          className="gap-1.5"
        >
          <FileText className="h-4 w-4" />
          Logs de Auditoria
        </Button>
        <Button
          variant={tab === 'alerts' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTab('alerts')}
          className="gap-1.5"
        >
          <ShieldAlert className="h-4 w-4" />
          Alertas de Segurança
          {alerts.filter(a => !a.resolved).length > 0 && (
            <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
              {alerts.filter(a => !a.resolved).length}
            </Badge>
          )}
        </Button>
      </div>

      {tab === 'logs' && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por usuário ou ação..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                  className="pl-9"
                />
              </div>
              <Select value={moduleFilter} onValueChange={(v) => { setModuleFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Todos os módulos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os módulos</SelectItem>
                  {MODULES.map(m => (
                    <SelectItem key={m} value={m}>{MODULE_LABELS[m] || m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Detalhes</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell>
                  </TableRow>
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum registro encontrado</TableCell>
                  </TableRow>
                ) : (
                  logs.map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {format(new Date(log.created_at), "dd/MM/yy HH:mm:ss", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{log.user_name || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {ACTION_LABELS[log.action] || log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{MODULE_LABELS[log.module] || log.module}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {log.details && Object.keys(log.details).length > 0
                          ? Object.entries(log.details).map(([k, v]) => `${k}: ${v}`).join(', ')
                          : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{log.ip_address || '—'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-muted-foreground">{logs.length} registros</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={logs.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'alerts' && (
        <Card>
          <CardContent className="pt-6">
            {alerts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ShieldCheck className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Nenhum alerta de segurança</p>
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map(alert => (
                  <div key={alert.id} className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                    alert.resolved ? 'bg-muted/30 border-border/50 opacity-60' :
                    alert.severity === 'high' ? 'bg-destructive/5 border-destructive/20' : 'bg-warning/5 border-warning/20'
                  }`}>
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                      alert.resolved ? 'bg-muted' :
                      alert.severity === 'high' ? 'bg-destructive/20' : 'bg-warning/20'
                    }`}>
                      {alert.resolved
                        ? <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                        : <ShieldAlert className={`h-4 w-4 ${alert.severity === 'high' ? 'text-destructive' : 'text-warning'}`} />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{alert.message}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant={alert.severity === 'high' ? 'destructive' : 'secondary'} className="text-[10px] h-4 px-1.5">
                          {alert.severity === 'high' ? 'Alta' : 'Média'}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {format(new Date(alert.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </span>
                        {alert.resolved && (
                          <span className="text-[11px] text-muted-foreground">
                            · Resolvido em {format(new Date(alert.resolved_at!), "dd/MM/yy HH:mm", { locale: ptBR })}
                          </span>
                        )}
                      </div>
                    </div>
                    {!alert.resolved && (
                      <Button variant="outline" size="sm" onClick={() => handleResolveAlert(alert.id)} className="shrink-0 gap-1">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Resolver
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
