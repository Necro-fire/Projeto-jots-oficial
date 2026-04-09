import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FileText, Search, Banknote, CreditCard, QrCode, Ban, Receipt, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFilial } from "@/contexts/FilialContext";
import { FilialSelector } from "@/components/FilialSelector";
import { DateRangeFilter, useDateRangeFilter, filterByDateRange } from "@/components/DateRangeFilter";
import { VendaDetailDialog } from "@/components/VendaDetailDialog";
import { CupomFiscalDialog } from "@/components/CupomFiscalDialog";
import { useVendas, type DbVenda } from "@/hooks/useSupabaseData";
import { useNotasFiscais } from "@/hooks/useNotasFiscais";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { parsePaymentDisplay, parseSplitPaymentDisplay, formatCurrency, type BoletoMetaInfo } from "@/lib/paymentUtils";
import { buildCupomFromVendaId } from "@/lib/cupomFiscalUtils";
import type { CupomFiscalData } from "@/components/CupomFiscal";

function getPaymentIcon(method: string) {
  const key = method.toLowerCase();
  if (key.includes("pix")) return <QrCode className="h-3.5 w-3.5" />;
  if (key.includes("boleto")) return <FileText className="h-3.5 w-3.5" />;
  if (key.includes("cart") || key.includes("debit") || key.includes("credit") || key.includes("débito") || key.includes("crédito")) return <CreditCard className="h-3.5 w-3.5" />;
  return <Banknote className="h-3.5 w-3.5" />;
}

export default function Vendas() {
  const { data: sales } = useVendas();
  const { data: notasFiscais } = useNotasFiscais();
  
  // Set of venda IDs that have NF-e linked
  const vendasComNF = useMemo(() => {
    return new Set(
      notasFiscais
        .filter(nf => nf.venda_id && nf.status !== "cancelada")
        .map(nf => nf.venda_id)
    );
  }, [notasFiscais]);

  // Fetch all payment splits (caixa_movimentacoes) keyed by venda_id
  const [splitsByVenda, setSplitsByVenda] = useState<Record<string, { method: string; amount: number }[]>>({});
  const [boletoMetaByVenda, setBoletoMetaByVenda] = useState<Record<string, BoletoMetaInfo>>({});

  useEffect(() => {
    if (sales.length === 0) return;

    Promise.all([
      (supabase as any)
        .from("caixa_movimentacoes")
        .select("venda_id, forma_pagamento, valor")
        .eq("tipo", "venda"),
      (supabase as any)
        .from("boleto_alertas")
        .select("venda_id, total_parcelas, intervalo_dias"),
    ]).then(([splitsRes, boletoRes]: [{ data: any[] | null }, { data: any[] | null }]) => {
      const splitMap: Record<string, { method: string; amount: number }[]> = {};
      (splitsRes.data || []).forEach((row: any) => {
        if (!row.venda_id) return;
        if (!splitMap[row.venda_id]) splitMap[row.venda_id] = [];
        splitMap[row.venda_id].push({ method: row.forma_pagamento, amount: Number(row.valor) });
      });

      const boletoMap: Record<string, BoletoMetaInfo> = {};
      (boletoRes.data || []).forEach((row: any) => {
        if (!row.venda_id) return;
        const installments = Number(row.total_parcelas || 0);
        const intervalDays = Number(row.intervalo_dias || 0);
        if (!installments || !intervalDays) return;

        const existing = boletoMap[row.venda_id];
        if (!existing || installments > existing.installments) {
          boletoMap[row.venda_id] = { installments, intervalDays };
        }
      });

      setSplitsByVenda(splitMap);
      setBoletoMetaByVenda(boletoMap);
    });
  }, [sales]);
  const { preset, range, onChange } = useDateRangeFilter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [boletoFilter, setBoletoFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState<string | null>(null);
  const [selectedVenda, setSelectedVenda] = useState<DbVenda | null>(null);

  const filtered = useMemo(() => {
    let result = filterByDateRange(sales, range);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (s) =>
          (s.sale_code || '').toLowerCase().includes(q) ||
          String(s.number).includes(q) ||
          s.client_name.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") {
      result = result.filter(s => s.status === statusFilter);
    }
    if (boletoFilter !== "all") {
      result = result.filter(s => (s as any).status_boleto === boletoFilter);
    }
    if (paymentFilter) {
      result = result.filter(s => s.payment_method.toLowerCase().includes(paymentFilter));
    }
    return result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [sales, range, search, statusFilter, boletoFilter, paymentFilter]);

  const totalRevenue = filtered.reduce((acc, s) => acc + Number(s.total), 0);

  const { filiais } = useFilial();
  const getFilialName = (filialId: string) => filiais.find((f) => f.id === filialId)?.name || filialId;

  const handleBoletoStatusChange = async (vendaId: string, newStatus: string) => {
    const { error } = await (supabase as any)
      .from("vendas")
      .update({ status_boleto: newStatus })
      .eq("id", vendaId);
    if (error) {
      toast.error("Erro ao atualizar status do boleto");
    } else {
      toast.success(`Status do boleto alterado para ${newStatus}`);
    }
  };

  const hasBoletos = sales.some(s => (s as any).status_boleto && (s as any).status_boleto !== "");

  return (
    <div>
      <FilialSelector />
      <div className="p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-title font-semibold tracking-tighter">Vendas</h1>
            <p className="text-ui text-muted-foreground">
              {filtered.length} venda{filtered.length !== 1 ? "s" : ""} · R$ {totalRevenue.toFixed(2)}
            </p>
          </div>
          <DateRangeFilter preset={preset} range={range} onChange={onChange} />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por código ou cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue placeholder="Status..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="concluida">Concluída</SelectItem>
              <SelectItem value="cancelada">Cancelada</SelectItem>
            </SelectContent>
          </Select>
          {hasBoletos && (
            <Select value={boletoFilter} onValueChange={setBoletoFilter}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="Status boleto..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos boletos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="gerado">Gerado</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Dinheiro", key: "dinheiro" },
            { label: "Pix", key: "pix" },
            { label: "Cartão de Crédito", key: "cartão de crédito" },
            { label: "Cartão de Débito", key: "cartão de débito" },
            { label: "Boleto", key: "boleto" },
          ].map(({ label, key }) => {
            const allSales = filterByDateRange(sales, range);
            const methodSales = allSales.filter((s) => s.payment_method.toLowerCase().includes(key));
            const methodTotal = methodSales.reduce((acc, s) => acc + Number(s.total), 0);
            const isActive = paymentFilter === key;
            return (
              <Card
                key={key}
                onClick={() => setPaymentFilter(isActive ? null : key)}
                className={`border-border/50 cursor-pointer transition-all hover:border-primary/50 ${isActive ? "ring-2 ring-primary border-primary" : ""}`}
              >
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    {getPaymentIcon(key)}
                    <span className="text-xs">{label}</span>
                  </div>
                  <p className="text-sm font-semibold tabular-nums">R$ {methodTotal.toFixed(2)}</p>
                  <p className="text-[11px] text-muted-foreground">{methodSales.length} venda{methodSales.length !== 1 ? "s" : ""}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Sales list */}
        {filtered.length > 0 ? (
          <div className="space-y-1">
            {filtered.map((sale) => {
              const createdAt = new Date(sale.created_at);
              const isRecent = Date.now() - createdAt.getTime() < 24 * 60 * 60 * 1000;
              const isCancelled = sale.status === "cancelada";
              const statusBoleto = (sale as any).status_boleto || "";
              const isBoleto = statusBoleto !== "";

              return (
                <div
                  key={sale.id}
                  onClick={() => setSelectedVenda(sale)}
                  className={`flex items-center justify-between py-3 px-4 rounded-md hover:bg-secondary/50 transition-colors cursor-pointer ${
                    isCancelled ? "opacity-60 border-l-2 border-l-destructive" : isRecent ? "border-l-2 border-l-primary" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-9 w-9 rounded-md flex items-center justify-center ${isCancelled ? "bg-destructive/10" : "bg-primary/10"}`}>
                      {isCancelled ? <Ban className="h-4 w-4 text-destructive" /> : <FileText className="h-4 w-4 text-primary" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className={`text-ui font-medium ${isCancelled ? "line-through" : ""}`}>{sale.sale_code || `#${sale.number}`}</p>
                        {isCancelled && <Badge variant="destructive" className="text-[10px] h-4 px-1.5">Cancelada</Badge>}
                        {!isCancelled && isRecent && <Badge className="text-[10px] h-4 px-1.5">Nova</Badge>}
                        {!isCancelled && vendasComNF.has(sale.id) && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-primary/50 text-primary">
                            <Receipt className="h-2.5 w-2.5 mr-0.5" />
                            NF-e
                          </Badge>
                        )}
                        {isBoleto && !isCancelled && (
                          <Select
                            value={statusBoleto}
                            onValueChange={(v) => {
                              handleBoletoStatusChange(sale.id, v);
                            }}
                          >
                            <SelectTrigger
                              className="h-5 text-[10px] px-2 w-auto min-w-0 border-none"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Badge
                                variant={statusBoleto === "gerado" ? "default" : "secondary"}
                                className="text-[10px] h-4 px-1.5"
                              >
                                {statusBoleto === "gerado" ? "Gerado" : "Pendente"}
                              </Badge>
                            </SelectTrigger>
                            <SelectContent onClick={(e) => e.stopPropagation()}>
                              <SelectItem value="pendente">Pendente</SelectItem>
                              <SelectItem value="gerado">Gerado</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <p className="text-caption text-muted-foreground">{sale.client_name || "Cliente avulso"}</p>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <Badge variant="outline" className="text-caption">{getFilialName(sale.filial_id)}</Badge>
                    <div className="flex flex-col items-end gap-0.5">
                      {(() => {
                        const splits = splitsByVenda[sale.id];
                        const hasSplits = splits && splits.length > 1;

                        if (hasSplits && !isCancelled) {
                          const boletoMeta = boletoMetaByVenda[sale.id];
                          return splits.map((s, idx) => {
                            const info = parseSplitPaymentDisplay(s.method, s.amount, sale.payment_method, boletoMeta);
                            return (
                              <div key={idx} className="flex items-center gap-1.5 text-caption">
                                {getPaymentIcon(s.method)}
                                <span className="text-muted-foreground">{s.method}:</span>
                                {info.hasInterest ? (
                                  <span className="text-primary font-medium">
                                    {formatCurrency(info.originalTotal)} c/ juros {info.rate}% {formatCurrency(info.finalTotal)}
                                    {info.installments && ` (${info.installments}x ${formatCurrency(info.installmentValue!)})`}
                                  </span>
                                ) : (
                                  <span className="font-medium text-primary">{formatCurrency(s.amount)}</span>
                                )}
                              </div>
                            );
                          });
                        }

                        // Single payment
                        const info = parsePaymentDisplay(sale.payment_method, Number(sale.total), boletoMetaByVenda[sale.id]);
                        return (
                          <div className="flex items-center gap-1.5 text-caption">
                            {getPaymentIcon(sale.payment_method)}
                            <span className="text-muted-foreground hidden sm:inline">{sale.payment_method}:</span>
                            {info.hasInterest && !isCancelled ? (
                              <span className="text-primary font-medium">
                                {formatCurrency(info.originalTotal)} c/ juros {info.rate}% {formatCurrency(info.finalTotal)}
                                {info.installments && ` (${info.installments}x ${formatCurrency(info.installmentValue!)})`}
                              </span>
                            ) : (
                              <span className={`font-medium ${isCancelled ? "line-through text-muted-foreground" : "text-primary"}`}>
                                {formatCurrency(Number(sale.total))}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                      <p className="text-caption text-muted-foreground">
                        {format(createdAt, "dd/MM/yy HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <FileText className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-ui font-medium">Nenhuma venda encontrada</p>
            <p className="text-caption mt-1">Ajuste os filtros ou realize vendas pelo PDV</p>
          </div>
        )}
      </div>

      <VendaDetailDialog
        venda={selectedVenda}
        open={!!selectedVenda}
        onOpenChange={(open) => { if (!open) setSelectedVenda(null); }}
      />
    </div>
  );
}
