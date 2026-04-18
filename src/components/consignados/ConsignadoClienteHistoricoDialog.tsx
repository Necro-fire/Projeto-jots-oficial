import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Plus,
  ArrowLeftRight,
  RotateCcw,
  Pencil,
  ShoppingCart,
  CheckCircle2,
  Clock,
  Package,
  User as UserIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Consignado } from "@/hooks/useConsignados";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteId: string | null;
  clienteLabel: string;
  consignadosDoCliente: Consignado[];
}

interface AggregatedEvent {
  id: string;
  consignado_id: string;
  consignado_codigo: string;
  produto_label: string;
  acao: string;
  detalhes: any;
  usuario_nome: string;
  created_at: string;
}

const acaoMeta: Record<string, { label: string; icon: any; tone: string; bg: string; ring: string }> = {
  criado: { label: "Adicionado", icon: Plus, tone: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-100 dark:bg-emerald-900/30", ring: "ring-emerald-200 dark:ring-emerald-900" },
  criado_por_troca: { label: "Criado por troca", icon: ArrowLeftRight, tone: "text-violet-700 dark:text-violet-300", bg: "bg-violet-100 dark:bg-violet-900/30", ring: "ring-violet-200 dark:ring-violet-900" },
  troca: { label: "Troca total", icon: ArrowLeftRight, tone: "text-violet-700 dark:text-violet-300", bg: "bg-violet-100 dark:bg-violet-900/30", ring: "ring-violet-200 dark:ring-violet-900" },
  troca_parcial: { label: "Troca parcial", icon: ArrowLeftRight, tone: "text-violet-700 dark:text-violet-300", bg: "bg-violet-100 dark:bg-violet-900/30", ring: "ring-violet-200 dark:ring-violet-900" },
  devolucao: { label: "Devolução", icon: RotateCcw, tone: "text-blue-700 dark:text-blue-300", bg: "bg-blue-100 dark:bg-blue-900/30", ring: "ring-blue-200 dark:ring-blue-900" },
  devolucao_total: { label: "Devolução total", icon: RotateCcw, tone: "text-blue-700 dark:text-blue-300", bg: "bg-blue-100 dark:bg-blue-900/30", ring: "ring-blue-200 dark:ring-blue-900" },
  devolucao_parcial: { label: "Devolução parcial", icon: RotateCcw, tone: "text-blue-700 dark:text-blue-300", bg: "bg-blue-100 dark:bg-blue-900/30", ring: "ring-blue-200 dark:ring-blue-900" },
  status_alterado: { label: "Status alterado", icon: Pencil, tone: "text-slate-700 dark:text-slate-300", bg: "bg-slate-100 dark:bg-slate-800", ring: "ring-slate-200 dark:ring-slate-700" },
  venda_pdv: { label: "Vendido via PDV", icon: ShoppingCart, tone: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-100 dark:bg-emerald-900/30", ring: "ring-emerald-200 dark:ring-emerald-900" },
  venda_manual: { label: "Marcado como vendido", icon: CheckCircle2, tone: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-100 dark:bg-emerald-900/30", ring: "ring-emerald-200 dark:ring-emerald-900" },
};

function getMeta(acao: string) {
  return acaoMeta[acao] || { label: acao, icon: Clock, tone: "text-slate-700 dark:text-slate-300", bg: "bg-slate-100 dark:bg-slate-800", ring: "ring-slate-200 dark:ring-slate-700" };
}

function fmt(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("pt-BR"),
    time: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  };
}

function renderDetails(acao: string, det: any) {
  if (!det || Object.keys(det).length === 0) return null;
  const items: { label: string; value: string }[] = [];

  if (acao === "criado") {
    if (det.quantidade != null) items.push({ label: "Qtd", value: `${det.quantidade} un.` });
    if (det.valor_unitario != null) items.push({ label: "Unit.", value: `R$ ${Number(det.valor_unitario).toFixed(2)}` });
  } else if (acao === "troca" || acao === "troca_parcial") {
    if (det.qty_trocada != null) items.push({ label: "Qtd trocada", value: `${det.qty_trocada} un.` });
    if (det.diferenca != null) items.push({ label: "Diferença", value: `R$ ${Number(det.diferenca).toFixed(2)} (${det.tipo_diferenca || "-"})` });
  } else if (acao === "devolucao_parcial" || acao === "devolucao_total" || acao === "devolucao") {
    if (det.quantidade_devolvida != null) items.push({ label: "Devolvida", value: `${det.quantidade_devolvida} un.` });
    if (det.restante != null) items.push({ label: "Restante", value: `${det.restante} un.` });
  } else if (acao === "status_alterado") {
    if (det.de) items.push({ label: "De", value: det.de });
    if (det.para) items.push({ label: "Para", value: det.para });
  }

  if (items.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
      {items.map((it, i) => (
        <span key={i} className="text-[11px]">
          <span className="text-muted-foreground">{it.label}: </span>
          <span className="font-medium tabular-nums">{it.value}</span>
        </span>
      ))}
    </div>
  );
}

export function ConsignadoClienteHistoricoDialog({ open, onOpenChange, clienteId, clienteLabel, consignadosDoCliente }: Props) {
  const [events, setEvents] = useState<AggregatedEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const consignadoIds = useMemo(() => consignadosDoCliente.map(c => c.id), [consignadosDoCliente]);

  useEffect(() => {
    if (!open || consignadoIds.length === 0) {
      setEvents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const { data, error } = await (supabase as any)
        .from("consignado_historico")
        .select("*")
        .in("consignado_id", consignadoIds)
        .order("created_at", { ascending: true });
      if (error) {
        console.error(error);
        setEvents([]);
        setLoading(false);
        return;
      }

      const byId = new Map(consignadosDoCliente.map(c => [c.id, c]));
      const enriched: AggregatedEvent[] = (data || []).map((ev: any) => {
        const c = byId.get(ev.consignado_id);
        return {
          id: ev.id,
          consignado_id: ev.consignado_id,
          consignado_codigo: c?.codigo || ev.consignado_id.slice(0, 6),
          produto_label: c ? `${c.produto_referencia || c.produto_code} · ${c.produto_model}` : "—",
          acao: ev.acao,
          detalhes: ev.detalhes,
          usuario_nome: ev.usuario_nome,
          created_at: ev.created_at,
        };
      });
      setEvents(enriched);
      setLoading(false);
    })();
  }, [open, consignadoIds.join(","), consignadosDoCliente]);

  // Stats
  const stats = useMemo(() => {
    const ativos = consignadosDoCliente.filter(c => c.status === "consignado");
    const totalValor = ativos.reduce((s, c) => s + Number(c.valor_total), 0);
    const totalQtd = ativos.reduce((s, c) => s + c.quantidade, 0);
    const trocas = events.filter(e => e.acao === "troca" || e.acao === "troca_parcial").length;
    const devolucoes = events.filter(e => e.acao === "devolucao_total" || e.acao === "devolucao_parcial" || e.acao === "devolucao").length;
    const vendas = events.filter(e => e.acao === "venda_pdv" || e.acao === "venda_manual").length;
    return { ativos: ativos.length, totalValor, totalQtd, trocas, devolucoes, vendas };
  }, [consignadosDoCliente, events]);

  // Group events by day for visual breaks
  const grouped = useMemo(() => {
    const map = new Map<string, AggregatedEvent[]>();
    for (const ev of events) {
      const day = new Date(ev.created_at).toLocaleDateString("pt-BR");
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(ev);
    }
    return Array.from(map.entries());
  }, [events]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <UserIcon className="h-4 w-4 text-muted-foreground" />
            Histórico do cliente — {clienteLabel}
          </DialogTitle>
          <DialogDescription className="sr-only">Linha do tempo agregada de todas as consignações do cliente</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Carregando histórico...</div>
        ) : (
          <ScrollArea className="max-h-[75vh]">
            <div className="p-5 space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div className="rounded-lg border bg-card p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Ativos</p>
                  <p className="text-lg font-semibold tabular-nums">{stats.ativos}</p>
                </div>
                <div className="rounded-lg border bg-card p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Qtd em mãos</p>
                  <p className="text-lg font-semibold tabular-nums">{stats.totalQtd}</p>
                </div>
                <div className="rounded-lg border bg-card p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Valor</p>
                  <p className="text-lg font-semibold tabular-nums">R$ {stats.totalValor.toFixed(2)}</p>
                </div>
                <div className="rounded-lg border bg-card p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Trocas</p>
                  <p className="text-lg font-semibold tabular-nums text-violet-600">{stats.trocas}</p>
                </div>
                <div className="rounded-lg border bg-card p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Devoluções</p>
                  <p className="text-lg font-semibold tabular-nums text-blue-600">{stats.devolucoes}</p>
                </div>
              </div>

              {/* Active items snapshot */}
              {consignadosDoCliente.filter(c => c.status === "consignado").length > 0 && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                    <Package className="h-3 w-3" /> Em posse do cliente agora
                  </p>
                  <div className="space-y-1">
                    {consignadosDoCliente.filter(c => c.status === "consignado").map(c => (
                      <div key={c.id} className="flex items-center justify-between text-sm">
                        <span className="font-mono text-xs">{c.codigo}</span>
                        <span className="text-muted-foreground truncate flex-1 mx-2">
                          {c.produto_referencia || c.produto_code} · {c.produto_model}
                        </span>
                        <span className="tabular-nums shrink-0">
                          {c.quantidade} un. · R$ {Number(c.valor_total).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* Timeline grouped by day */}
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum evento registrado.</p>
              ) : (
                <div className="space-y-5">
                  {grouped.map(([day, evs]) => (
                    <div key={day}>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="text-[11px]">{day}</Badge>
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-[11px] text-muted-foreground">{evs.length} evento{evs.length !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="relative pl-2">
                        <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" aria-hidden />
                        <ol className="space-y-2.5">
                          {evs.map(ev => {
                            const meta = getMeta(ev.acao);
                            const Icon = meta.icon;
                            const t = fmt(ev.created_at);
                            return (
                              <li key={ev.id} className="relative flex gap-3">
                                <div className={`relative z-10 h-8 w-8 rounded-full ${meta.bg} ring-4 ${meta.ring} flex items-center justify-center shrink-0`}>
                                  <Icon className={`h-4 w-4 ${meta.tone}`} />
                                </div>
                                <div className="flex-1 rounded-lg border bg-card p-2.5">
                                  <div className="flex items-start justify-between gap-2 flex-wrap">
                                    <div className="min-w-0">
                                      <p className={`text-sm font-semibold ${meta.tone}`}>
                                        {meta.label}
                                        <span className="ml-2 font-mono text-xs text-muted-foreground">{ev.consignado_codigo}</span>
                                      </p>
                                      <p className="text-[11px] text-muted-foreground truncate">{ev.produto_label}</p>
                                      {ev.usuario_nome && (
                                        <p className="text-[11px] text-muted-foreground">por {ev.usuario_nome}</p>
                                      )}
                                    </div>
                                    <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{t.time}</span>
                                  </div>
                                  {renderDetails(ev.acao, ev.detalhes)}
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[11px] text-muted-foreground text-center pt-2 border-t">
                🔒 Histórico imutável — somente leitura para garantir rastreabilidade
              </p>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
