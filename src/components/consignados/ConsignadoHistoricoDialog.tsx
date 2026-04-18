import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  ArrowLeftRight,
  RotateCcw,
  Pencil,
  ShoppingCart,
  CheckCircle2,
  Package,
  Calendar,
  User as UserIcon,
  Layers,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchConsignadoHistorico, type Consignado, type ConsignadoHistorico } from "@/hooks/useConsignados";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  consignadoId: string;
  consignadoCodigo: string;
}

interface TimelineEvent {
  id: string;
  acao: string;
  detalhes: Record<string, any>;
  usuario_nome: string;
  created_at: string;
}

const acaoMeta: Record<string, { label: string; icon: any; tone: string; bg: string; ring: string }> = {
  criado: {
    label: "Consignação criada",
    icon: Plus,
    tone: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
    ring: "ring-emerald-200 dark:ring-emerald-900",
  },
  criado_por_troca: {
    label: "Criado a partir de troca",
    icon: ArrowLeftRight,
    tone: "text-violet-700 dark:text-violet-300",
    bg: "bg-violet-100 dark:bg-violet-900/30",
    ring: "ring-violet-200 dark:ring-violet-900",
  },
  troca: {
    label: "Troca total realizada",
    icon: ArrowLeftRight,
    tone: "text-violet-700 dark:text-violet-300",
    bg: "bg-violet-100 dark:bg-violet-900/30",
    ring: "ring-violet-200 dark:ring-violet-900",
  },
  troca_parcial: {
    label: "Troca parcial",
    icon: ArrowLeftRight,
    tone: "text-violet-700 dark:text-violet-300",
    bg: "bg-violet-100 dark:bg-violet-900/30",
    ring: "ring-violet-200 dark:ring-violet-900",
  },
  devolucao: {
    label: "Devolução",
    icon: RotateCcw,
    tone: "text-blue-700 dark:text-blue-300",
    bg: "bg-blue-100 dark:bg-blue-900/30",
    ring: "ring-blue-200 dark:ring-blue-900",
  },
  devolucao_total: {
    label: "Devolução total",
    icon: RotateCcw,
    tone: "text-blue-700 dark:text-blue-300",
    bg: "bg-blue-100 dark:bg-blue-900/30",
    ring: "ring-blue-200 dark:ring-blue-900",
  },
  devolucao_parcial: {
    label: "Devolução parcial",
    icon: RotateCcw,
    tone: "text-blue-700 dark:text-blue-300",
    bg: "bg-blue-100 dark:bg-blue-900/30",
    ring: "ring-blue-200 dark:ring-blue-900",
  },
  status_alterado: {
    label: "Status alterado",
    icon: Pencil,
    tone: "text-slate-700 dark:text-slate-300",
    bg: "bg-slate-100 dark:bg-slate-800",
    ring: "ring-slate-200 dark:ring-slate-700",
  },
  venda_pdv: {
    label: "Vendido via PDV",
    icon: ShoppingCart,
    tone: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
    ring: "ring-emerald-200 dark:ring-emerald-900",
  },
  venda_manual: {
    label: "Marcado como vendido",
    icon: CheckCircle2,
    tone: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
    ring: "ring-emerald-200 dark:ring-emerald-900",
  },
  editado: {
    label: "Registro editado",
    icon: Pencil,
    tone: "text-amber-700 dark:text-amber-300",
    bg: "bg-amber-100 dark:bg-amber-900/30",
    ring: "ring-amber-200 dark:ring-amber-900",
  },
};

function getMeta(acao: string) {
  return (
    acaoMeta[acao] || {
      label: acao,
      icon: Clock,
      tone: "text-slate-700 dark:text-slate-300",
      bg: "bg-slate-100 dark:bg-slate-800",
      ring: "ring-slate-200 dark:ring-slate-700",
    }
  );
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("pt-BR"),
    time: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    full: d.toLocaleString("pt-BR"),
  };
}

function statusBadge(status: string) {
  switch (status) {
    case "consignado":
      return <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">Ativa</Badge>;
    case "vendido":
      return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Finalizada (venda)</Badge>;
    case "devolvido":
      return <Badge variant="secondary">Devolvida</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function renderDetails(acao: string, det: Record<string, any>) {
  if (!det || Object.keys(det).length === 0) return null;

  const items: { label: string; value: string }[] = [];

  if (acao === "criado") {
    if (det.quantidade != null) items.push({ label: "Quantidade", value: `${det.quantidade} un.` });
    if (det.valor_unitario != null) items.push({ label: "Valor unit.", value: `R$ ${Number(det.valor_unitario).toFixed(2)}` });
  } else if (acao === "status_alterado") {
    if (det.de) items.push({ label: "De", value: String(det.de) });
    if (det.para) items.push({ label: "Para", value: String(det.para) });
  } else if (acao === "troca" || acao === "troca_parcial") {
    if (det.qty_trocada != null) items.push({ label: "Qtd trocada", value: `${det.qty_trocada} un.` });
    if (det.total_original != null) items.push({ label: "Total original", value: `${det.total_original} un.` });
    if (det.trocado_por) items.push({ label: "Trocado por", value: String(det.trocado_por) });
    if (det.diferenca != null) {
      const diff = Number(det.diferenca);
      items.push({
        label: "Diferença",
        value: `${diff >= 0 ? "+" : ""}R$ ${diff.toFixed(2)} (${det.tipo_diferenca || "-"})`,
      });
    }
  } else if (acao === "devolucao_parcial" || acao === "devolucao_total" || acao === "devolucao") {
    if (det.quantidade_devolvida != null) items.push({ label: "Devolvida", value: `${det.quantidade_devolvida} un.` });
    if (det.restante != null) items.push({ label: "Restante", value: `${det.restante} un.` });
  } else if (acao === "criado_por_troca") {
    if (det.originado_de) items.push({ label: "Originado de", value: String(det.originado_de).slice(0, 8) });
    if (det.diferenca != null) {
      items.push({ label: "Diferença", value: `R$ ${Number(det.diferenca).toFixed(2)}` });
    }
  } else {
    // generic
    Object.entries(det).slice(0, 4).forEach(([k, v]) => {
      items.push({ label: k, value: typeof v === "object" ? JSON.stringify(v) : String(v) });
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
      {items.map((it, idx) => (
        <div key={idx} className="text-[11px]">
          <span className="text-muted-foreground">{it.label}: </span>
          <span className="tabular-nums font-medium">{it.value}</span>
        </div>
      ))}
    </div>
  );
}

export function ConsignadoHistoricoDialog({ open, onOpenChange, consignadoId, consignadoCodigo }: Props) {
  const [historico, setHistorico] = useState<ConsignadoHistorico[]>([]);
  const [consignado, setConsignado] = useState<Consignado | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !consignadoId) return;
    setLoading(true);
    Promise.all([
      fetchConsignadoHistorico(consignadoId),
      (supabase as any)
        .from("consignados")
        .select("*, produtos:produto_id(code, model, referencia), clientes:cliente_id(responsible_name, store_name)")
        .eq("id", consignadoId)
        .maybeSingle(),
    ]).then(([hist, { data: row }]) => {
      setHistorico(hist);
      if (row) {
        setConsignado({
          ...row,
          produto_code: row.produtos?.code || "",
          produto_model: row.produtos?.model || "",
          produto_referencia: row.produtos?.referencia || "",
          cliente_nome: row.clientes?.responsible_name || "",
          cliente_loja: row.clientes?.store_name || "",
        } as Consignado);
      } else {
        setConsignado(null);
      }
      setLoading(false);
    });
  }, [open, consignadoId]);

  // Build chronological timeline (oldest → newest, so we can show timeline naturally)
  const events = useMemo<TimelineEvent[]>(() => {
    return [...historico].sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [historico]);

  // Determine inferred state of consignment
  const isParcial = useMemo(() => {
    return events.some(e => e.acao === "troca_parcial" || e.acao === "devolucao_parcial");
  }, [events]);

  const dataInicio = events.find(e => e.acao === "criado" || e.acao === "criado_por_troca")?.created_at
    || consignado?.created_at;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Histórico — <span className="font-mono">{consignadoCodigo}</span>
            {consignado && statusBadge(consignado.status)}
            {isParcial && consignado?.status === "consignado" && (
              <Badge variant="outline" className="border-violet-400 text-violet-700 dark:text-violet-300">
                Parcialmente resolvida
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="sr-only">Linha do tempo da consignação</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Carregando histórico...</div>
        ) : (
          <ScrollArea className="max-h-[70vh]">
            <div className="p-5 space-y-4">
              {/* Summary card */}
              {consignado && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    <div className="flex items-center gap-2">
                      <UserIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">Cliente:</span>
                      <span className="font-medium truncate">{consignado.cliente_loja || consignado.cliente_nome || "Sem cliente"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">Início:</span>
                      <span className="font-medium tabular-nums">
                        {dataInicio ? formatDateTime(dataInicio).full : "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">Produto:</span>
                      <span className="font-medium truncate">
                        {consignado.produto_referencia || consignado.produto_code} · {consignado.produto_model}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">Atual:</span>
                      <span className="font-medium tabular-nums">
                        {consignado.quantidade} un. · R$ {Number(consignado.valor_total).toFixed(2)}
                      </span>
                    </div>
                  </div>
                  {consignado.vendedor_nome && (
                    <p className="text-[11px] text-muted-foreground">Vendedor: {consignado.vendedor_nome}</p>
                  )}
                </div>
              )}

              <Separator />

              {/* Timeline */}
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum evento registrado.</p>
              ) : (
                <div className="relative pl-2">
                  {/* vertical line */}
                  <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" aria-hidden />

                  <ol className="space-y-3">
                    {events.map((ev, idx) => {
                      const meta = getMeta(ev.acao);
                      const Icon = meta.icon;
                      const dt = formatDateTime(ev.created_at);
                      const isLast = idx === events.length - 1;
                      return (
                        <li key={ev.id} className="relative flex gap-3">
                          <div
                            className={`relative z-10 h-8 w-8 rounded-full ${meta.bg} ring-4 ${meta.ring} flex items-center justify-center shrink-0`}
                          >
                            <Icon className={`h-4 w-4 ${meta.tone}`} />
                          </div>
                          <div className={`flex-1 rounded-lg border bg-card p-3 ${isLast ? "border-primary/30" : ""}`}>
                            <div className="flex items-start justify-between gap-2 flex-wrap">
                              <div className="min-w-0">
                                <p className={`text-sm font-semibold ${meta.tone}`}>{meta.label}</p>
                                {ev.usuario_nome && (
                                  <p className="text-[11px] text-muted-foreground">por {ev.usuario_nome}</p>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-[11px] text-muted-foreground tabular-nums">{dt.date}</p>
                                <p className="text-[11px] text-muted-foreground tabular-nums">{dt.time}</p>
                              </div>
                            </div>
                            {renderDetails(ev.acao, ev.detalhes || {})}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}

              <p className="text-[11px] text-muted-foreground text-center pt-2 border-t">
                🔒 Histórico imutável — registros somente leitura para garantir rastreabilidade
              </p>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
