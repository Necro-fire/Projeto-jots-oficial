import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, FileText, Check, Clock, ChevronDown, ChevronUp, AlertTriangle, CalendarClock, Ban, ShieldAlert, ShieldCheck, ExternalLink, Landmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBoletoAlertas, type BoletoAlerta } from "@/hooks/useBoletoAlertas";
import { useSecurityAlerts } from "@/hooks/useSecurityAlerts";
import { useAuth } from "@/contexts/AuthContext";
import { boletoAvisoLabel, classifyBoleto, groupByVenda, type BoletoDisplayStatus } from "@/lib/boletoStatus";
import { format, isPast, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const vendaLabel = (a: BoletoAlerta) => a.venda_code || `#${a.venda_number ?? ""}`;

export function BellNotifications() {
  const { isAdmin, hasPermission } = useAuth();
  // "Bloquear sino de boleto" é uma restrição: admin nunca é bloqueado.
  const blocked = !isAdmin && hasPermission("boleto", "block_bell");
  if (blocked) return null;
  return <BellPanel />;
}

function BellPanel() {
  const { alertas, updateStatus, resolveAviso } = useBoletoAlertas();
  const { isAdmin, hasPermission } = useAuth();
  const { alerts: securityAlerts, resolveAlert } = useSecurityAlerts();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [showGerados, setShowGerados] = useState(false);
  const [showFuturos, setShowFuturos] = useState(false);
  const [showCancelados, setShowCancelados] = useState(false);
  const [showSecurity, setShowSecurity] = useState(true);

  // A classificação por vencimento depende da hora atual: reavalia a cada minuto, sem ir ao servidor.
  const [minuteTick, setMinuteTick] = useState(0);
  useEffect(() => {
    const interval = window.setInterval(() => setMinuteTick((n) => n + 1), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  // Só admin altera o status (regra do banco); resolver aviso também é permitido a quem gerencia/cancela vendas.
  const canChangeStatus = isAdmin;
  const canResolveAviso = isAdmin || hasPermission("vendas", "cancel") || hasPermission("vendas", "manage");

  const { avisos, pendentes, gerados, futuros, cancelados } = useMemo(() => {
    const now = new Date();
    const out = {
      avisos: [] as BoletoAlerta[],
      pendentes: [] as BoletoAlerta[],
      gerados: [] as BoletoAlerta[],
      futuros: [] as BoletoAlerta[],
      cancelados: [] as BoletoAlerta[],
    };
    for (const a of alertas) {
      if (a.aviso) {
        out.avisos.push(a);
        continue;
      }
      const kind = classifyBoleto(a, now);
      if (kind === "pendente") out.pendentes.push(a);
      else if (kind === "gerado") out.gerados.push(a);
      else if (kind === "futuro") out.futuros.push(a);
      else out.cancelados.push(a);
    }
    return out;
    // minuteTick força a reclassificação por vencimento a cada minuto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertas, minuteTick]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await updateStatus(id, newStatus);
      toast.success(`Status alterado para ${newStatus}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar status");
    }
  };

  const handleResolveAviso = async (id: string) => {
    try {
      await resolveAviso(id);
      toast.success("Aviso resolvido");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao resolver aviso");
    }
  };

  const handleResolveAlert = async (id: string) => {
    try {
      await resolveAlert(id);
      toast.success("Alerta resolvido");
    } catch {
      toast.error("Erro ao resolver alerta");
    }
  };

  const goToVenda = (a: BoletoAlerta) => {
    setOpen(false);
    const busca = a.venda_code || String(a.venda_number ?? "");
    navigate(`/vendas?busca=${encodeURIComponent(busca)}`);
  };

  const highSecurity = isAdmin ? securityAlerts.filter((a) => a.severity === "high").length : 0;
  const urgentCount = pendentes.length + avisos.length + highSecurity;

  const summary = [
    isAdmin && securityAlerts.length > 0 ? `${securityAlerts.length} de segurança` : null,
    avisos.length > 0 ? `${avisos.length} ação${avisos.length !== 1 ? "ões" : ""} no banco` : null,
    `${pendentes.length} pendente${pendentes.length !== 1 ? "s" : ""}`,
    `${gerados.length} gerado${gerados.length !== 1 ? "s" : ""}`,
    `${futuros.length} futuro${futuros.length !== 1 ? "s" : ""}`,
    cancelados.length > 0 ? `${cancelados.length} cancelado${cancelados.length !== 1 ? "s" : ""}` : null,
  ].filter(Boolean).join(" · ");

  const isEmpty = avisos.length + pendentes.length + gerados.length + futuros.length + cancelados.length === 0;

  const renderGroups = (list: BoletoAlerta[], variant: BoletoDisplayStatus) =>
    groupByVenda(list).map((g) => (
      <div key={g.vendaId} className="mb-2">
        <VendaHeader alerta={g.items[0]} onOpen={goToVenda} />
        {g.items.map((a) => (
          <BoletoItem key={a.id} alerta={a} variant={variant} canChangeStatus={canChangeStatus} onStatusChange={handleStatusChange} />
        ))}
      </div>
    ));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label="Central de notificações">
          <Bell className="h-4 w-4" />
          {urgentCount > 0 && (
            <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] flex items-center justify-center animate-pulse">
              {urgentCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] max-w-[95vw] p-0" align="end">
        <div className="p-3 border-b">
          <h4 className="text-sm font-semibold flex items-center gap-1.5">
            <Bell className="h-4 w-4" />
            Central de Notificações
          </h4>
          <p className="text-xs text-muted-foreground">{summary}</p>
        </div>

        <div className="max-h-[450px] overflow-y-auto overscroll-contain" onWheel={(e) => e.stopPropagation()}>
          {/* Security Alerts */}
          {isAdmin && securityAlerts.length > 0 && (
            <div className="border-b">
              <button
                onClick={() => setShowSecurity(!showSecurity)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-destructive hover:bg-destructive/5 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Segurança ({securityAlerts.length})
                </span>
                {showSecurity ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {showSecurity && (
                <div className="p-2 pt-0 space-y-1.5">
                  {securityAlerts.map((alert) => (
                    <div key={alert.id} className={`flex items-start gap-2 p-2 rounded-md transition-colors ${
                      alert.severity === 'high' ? 'bg-destructive/10 border border-destructive/20' : 'bg-warning/10 border border-warning/20'
                    }`}>
                      <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${
                        alert.severity === 'high' ? 'bg-destructive/20' : 'bg-warning/20'
                      }`}>
                        <ShieldAlert className={`h-4 w-4 ${alert.severity === 'high' ? 'text-destructive' : 'text-warning'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{alert.message}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {format(new Date(alert.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => handleResolveAlert(alert.id)}
                        title="Resolver"
                      >
                        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Ações pendentes no banco: boleto emitido de venda cancelada/alterada */}
          {avisos.length > 0 && (
            <div className="p-2 border-b bg-warning/5">
              <div className="flex items-center gap-1.5 px-2 mb-1.5">
                <Landmark className="h-3.5 w-3.5 text-warning" />
                <p className="text-[11px] font-semibold text-warning uppercase tracking-wide">
                  Ação necessária no banco ({avisos.length})
                </p>
              </div>
              {avisos.map((a) => (
                <div key={a.id} className="flex items-start gap-2 p-2 rounded-md mb-1.5 bg-warning/10 border border-warning/30">
                  <div className="h-8 w-8 rounded-md flex items-center justify-center shrink-0 bg-warning/20">
                    <Landmark className="h-4 w-4 text-warning" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">
                      Venda {vendaLabel(a)} — Parcela {a.parcela_numero}/{a.total_parcelas}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">{a.client_name}</p>
                    <p className="text-[11px] font-medium text-warning mt-0.5">
                      {boletoAvisoLabel(a.aviso)}
                      {a.aviso_detalhe ? <span className="font-normal text-muted-foreground"> · {a.aviso_detalhe}</span> : null}
                    </p>
                  </div>
                  <div className="shrink-0 flex flex-col gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver venda" onClick={() => goToVenda(a)}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                    {canResolveAviso && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Marcar como resolvido" onClick={() => handleResolveAviso(a.id)}>
                        <Check className="h-3.5 w-3.5 text-primary" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pendentes */}
          {pendentes.length > 0 && (
            <div className="p-2">
              <div className="flex items-center gap-1.5 px-2 mb-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                <p className="text-[11px] font-semibold text-destructive uppercase tracking-wide">
                  Pendentes ({pendentes.length})
                </p>
              </div>
              {renderGroups(pendentes, "pendente")}
            </div>
          )}

          {/* Gerados - collapsible */}
          {gerados.length > 0 && (
            <div className="border-t">
              <button
                onClick={() => setShowGerados(!showGerados)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-muted-foreground hover:bg-secondary/50 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-primary" />
                  Gerados ({gerados.length})
                </span>
                {showGerados ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {showGerados && <div className="p-2 pt-0">{renderGroups(gerados, "gerado")}</div>}
            </div>
          )}

          {/* Futuros - collapsible */}
          {futuros.length > 0 && (
            <div className="border-t">
              <button
                onClick={() => setShowFuturos(!showFuturos)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-muted-foreground hover:bg-secondary/50 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Futuros ({futuros.length})
                </span>
                {showFuturos ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {showFuturos && <div className="p-2 pt-0">{renderGroups(futuros, "futuro")}</div>}
            </div>
          )}

          {/* Cancelados - collapsible */}
          {cancelados.length > 0 && (
            <div className="border-t">
              <button
                onClick={() => setShowCancelados(!showCancelados)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-muted-foreground hover:bg-secondary/50 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Ban className="h-3.5 w-3.5 text-muted-foreground" />
                  Cancelados ({cancelados.length})
                </span>
                {showCancelados ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {showCancelados && <div className="p-2 pt-0">{renderGroups(cancelados, "cancelado")}</div>}
            </div>
          )}

          {isEmpty && (
            <div className="p-8 text-center text-muted-foreground text-sm">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
              Nenhum boleto registrado
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function VendaHeader({ alerta, onOpen }: { alerta: BoletoAlerta; onOpen: (a: BoletoAlerta) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2 pb-1">
      <p className="text-[11px] font-semibold text-muted-foreground truncate">
        Venda {vendaLabel(alerta)} · {alerta.client_name}
      </p>
      <button
        type="button"
        onClick={() => onOpen(alerta)}
        className="shrink-0 flex items-center gap-1 text-[10px] text-primary hover:underline"
      >
        Ver venda <ExternalLink className="h-3 w-3" />
      </button>
    </div>
  );
}

function BoletoItem({
  alerta,
  variant,
  canChangeStatus,
  onStatusChange,
}: {
  alerta: BoletoAlerta;
  variant: BoletoDisplayStatus;
  canChangeStatus: boolean;
  onStatusChange: (id: string, status: string) => void;
}) {
  const venc = new Date(alerta.data_vencimento);
  const isOverdue = isPast(venc) && !isToday(venc);
  const isCancelado = variant === "cancelado";

  const bgClass =
    variant === "pendente"
      ? "bg-destructive/10 border border-destructive/20"
      : variant === "gerado"
      ? "bg-primary/5 border border-primary/20"
      : variant === "cancelado"
      ? "bg-muted/50 border border-border/50 opacity-70"
      : "hover:bg-secondary/50";

  const iconBg =
    variant === "pendente" ? "bg-destructive/20" : variant === "gerado" ? "bg-primary/20" : "bg-muted";

  const iconColor =
    variant === "pendente" ? "text-destructive" : variant === "gerado" ? "text-primary" : "text-muted-foreground";

  const statusLabel = variant === "gerado" ? "Gerado" : variant === "pendente" ? "Pendente" : "Futuro";
  const statusBadge = (
    <Badge
      variant={variant === "gerado" ? "default" : variant === "pendente" ? "destructive" : "secondary"}
      className="text-[10px] h-4 px-1.5"
    >
      {statusLabel}
    </Badge>
  );

  return (
    <div className={`flex items-start gap-2 p-2 rounded-md mb-1.5 transition-colors ${bgClass}`}>
      <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${iconBg}`}>
        {isCancelado ? <Ban className={`h-4 w-4 ${iconColor}`} /> : <FileText className={`h-4 w-4 ${iconColor}`} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold truncate ${isCancelado ? "line-through text-muted-foreground" : ""}`}>
          Parcela {alerta.parcela_numero}/{alerta.total_parcelas}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[11px] font-medium flex items-center gap-1 ${
            isCancelado ? "text-muted-foreground" :
            variant === "pendente" && isOverdue ? "text-destructive" :
            variant === "pendente" ? "text-warning" : "text-muted-foreground"
          }`}>
            <Clock className="h-3 w-3" />
            {isCancelado ? "" : variant === "pendente" && isOverdue ? "Vencido " : "Vence "}
            {format(venc, "dd/MM/yy", { locale: ptBR })}
          </span>
          <span className={`text-[11px] font-bold ${isCancelado ? "line-through text-muted-foreground" : "text-foreground"}`}>
            R$ {Number(alerta.valor_parcela).toFixed(2)}
          </span>
        </div>
      </div>
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        {isCancelado ? (
          <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-muted text-muted-foreground">
            Cancelado
          </Badge>
        ) : canChangeStatus ? (
          <Select value={alerta.status} onValueChange={(v) => onStatusChange(alerta.id, v)}>
            <SelectTrigger className="h-7 text-[10px] px-2 w-auto min-w-[90px] border-border/50">
              <SelectValue>{statusBadge}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="gerado">Gerado</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          statusBadge
        )}
      </div>
    </div>
  );
}
