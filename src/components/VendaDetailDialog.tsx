import { useState, useEffect } from "react";
import { getSignedUrl } from "@/lib/storageUtils";
import { format, isPast, isToday, isSameMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Banknote, CreditCard, QrCode, FileText, Package, Ban, AlertTriangle, XCircle, Tag, Clock, Receipt, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cancelarVenda } from "@/hooks/useSupabaseData";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { parsePaymentDisplay, parseSplitPaymentDisplay, isSplitPayment, parseSplitMethods, formatCurrency, type BoletoMetaInfo } from "@/lib/paymentUtils";
import type { DbVenda, DbVendaItem } from "@/hooks/useSupabaseData";

interface VendaDetailDialogProps {
  venda: DbVenda | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const paymentIcons: Record<string, React.ReactNode> = {
  dinheiro: <Banknote className="h-4 w-4" />,
  pix: <QrCode className="h-4 w-4" />,
  "cartão de débito": <CreditCard className="h-4 w-4" />,
  "cartão de crédito": <CreditCard className="h-4 w-4" />,
  debito: <CreditCard className="h-4 w-4" />,
  credito: <CreditCard className="h-4 w-4" />,
  cartao: <CreditCard className="h-4 w-4" />,
  boleto: <Banknote className="h-4 w-4" />,
};

function getPaymentIcon(method: string) {
  const key = method.toLowerCase();
  for (const [k, icon] of Object.entries(paymentIcons)) {
    if (key.includes(k)) return icon;
  }
  return <Banknote className="h-4 w-4" />;
}

interface VendaItemWithStatus extends DbVendaItem {
  status?: string;
}

interface PaymentSplitInfo {
  method: string;
  amount: number;
}

export function VendaDetailDialog({ venda, open, onOpenChange }: VendaDetailDialogProps) {
  const [items, setItems] = useState<VendaItemWithStatus[]>([]);
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplitInfo[]>([]);
  const [boletoMeta, setBoletoMeta] = useState<BoletoMetaInfo | null>(null);
  const [boletos, setBoletos] = useState<any[]>([]);
  const [nfData, setNfData] = useState<any | null>(null);
  const [signedNfXml, setSignedNfXml] = useState<string | null>(null);
  const [signedNfPdf, setSignedNfPdf] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const { user, profile, hasPermission } = useAuth();

  // Item-level cancel state
  const [cancellingItemId, setCancellingItemId] = useState<string | null>(null);
  const [itemMotivo, setItemMotivo] = useState("");
  const [itemCancelling, setItemCancelling] = useState(false);

  useEffect(() => {
    if (!venda || !open) return;
    setLoading(true);

    Promise.all([
      (supabase as any)
        .from("venda_items")
        .select("*")
        .eq("venda_id", venda.id),
      (supabase as any)
        .from("caixa_movimentacoes")
        .select("forma_pagamento, valor")
        .eq("venda_id", venda.id)
        .eq("tipo", "venda"),
      (supabase as any)
        .from("boleto_alertas")
        .select("*")
        .eq("venda_id", venda.id)
        .order("parcela_numero", { ascending: true }),
      (supabase as any)
        .from("notas_fiscais")
        .select("*")
        .eq("venda_id", venda.id)
        .neq("status", "cancelada")
        .limit(1),
    ]).then(([itemsRes, splitsRes, boletoRes, nfRes]) => {
      setItems(itemsRes.data || []);

      const splits: PaymentSplitInfo[] = (splitsRes.data || []).map((s: any) => ({
        method: s.forma_pagamento,
        amount: Number(s.valor),
      }));
      setPaymentSplits(splits);

      const allBoletos = boletoRes.data || [];
      setBoletos(allBoletos);

      const boletoRow = allBoletos[0];
      if (boletoRow?.total_parcelas && boletoRow?.intervalo_dias) {
        setBoletoMeta({
          installments: Number(boletoRow.total_parcelas),
          intervalDays: Number(boletoRow.intervalo_dias),
        });
      } else {
        setBoletoMeta(null);
      }

      const nf = nfRes.data?.[0] || null;
      setNfData(nf);
      if (nf?.xml_url) getSignedUrl(nf.xml_url, 'nfe-files').then(setSignedNfXml); else setSignedNfXml(null);
      if (nf?.pdf_url) getSignedUrl(nf.pdf_url, 'nfe-files').then(setSignedNfPdf); else setSignedNfPdf(null);

      setLoading(false);
    });
  }, [venda, open]);

  if (!venda) return null;

  const isCancelled = venda.status === "cancelada";
  const createdAt = new Date(venda.created_at);
  const isRecent = Date.now() - createdAt.getTime() < 24 * 60 * 60 * 1000;

  const handleCancel = async () => {
    if (!motivo.trim()) {
      toast.error("Informe o motivo do cancelamento");
      return;
    }
    setCancelling(true);
    try {
      await cancelarVenda(
        venda.id,
        motivo.trim(),
        user?.id || "",
        profile?.nome || user?.email || ""
      );
      toast.success("Venda cancelada com sucesso");
      setShowCancelConfirm(false);
      setMotivo("");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao cancelar venda");
    } finally {
      setCancelling(false);
    }
  };

  const handleCancelItem = async () => {
    if (!cancellingItemId) return;
    if (!itemMotivo.trim()) {
      toast.error("Informe o motivo do cancelamento");
      return;
    }
    setItemCancelling(true);
    try {
      const { error } = await (supabase as any).rpc("cancelar_item_venda", {
        _venda_item_id: cancellingItemId,
        _motivo: itemMotivo.trim(),
        _user_id: user?.id || "",
        _user_name: profile?.nome || user?.email || "",
      });
      if (error) throw new Error(error.message);
      toast.success("Item cancelado com sucesso");
      // Refresh items
      const { data } = await (supabase as any)
        .from("venda_items")
        .select("*")
        .eq("venda_id", venda.id);
      setItems(data || []);
      setCancellingItemId(null);
      setItemMotivo("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao cancelar item");
    } finally {
      setItemCancelling(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${isCancelled ? "bg-destructive/10" : "bg-primary/10"}`}>
                {isCancelled ? <Ban className="h-5 w-5 text-destructive" /> : <FileText className="h-5 w-5 text-primary" />}
              </div>
              <div>
                <span className="text-lg">{(venda as any).sale_code || `#${venda.number}`}</span>
                <span className="ml-2 text-xs text-muted-foreground font-mono">({venda.id.slice(0, 8).toUpperCase()})</span>
                {isCancelled && (
                  <Badge className="ml-2 text-[10px]" variant="destructive">Cancelada</Badge>
                )}
                {!isCancelled && isRecent && (
                  <Badge className="ml-2 text-[10px]" variant="default">Recente</Badge>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>

          {/* Cancellation info banner */}
          {isCancelled && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-destructive">Venda cancelada</p>
                {venda.cancelled_at && (
                  <p className="text-muted-foreground text-xs mt-0.5">
                    Em {format(new Date(venda.cancelled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    {venda.cancelled_by_name && ` por ${venda.cancelled_by_name}`}
                  </p>
                )}
                {venda.motivo_cancelamento && (
                  <p className="text-muted-foreground text-xs mt-1">Motivo: {venda.motivo_cancelamento}</p>
                )}
              </div>
            </div>
          )}

          {/* General info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Data e hora</p>
              <p className="font-medium">{format(createdAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Cliente</p>
              <p className="font-medium">{venda.client_name || "Cliente avulso"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Origem</p>
              <Badge variant="secondary">Estoque</Badge>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Valor</p>
              {(() => {
                // Use stored boleto data as source of truth
                if (boletos.length > 0 && !isCancelled) {
                  const boletoTotal = boletos.reduce((s, b) => s + Number(b.valor_parcela), 0);
                  // Base = first parcela (no interest) × total parcelas
                  const firstParcela = boletos.find((b: any) => b.parcela_numero === 1);
                  const basePerParcela = firstParcela ? Number(firstParcela.valor_parcela) : 0;
                  const totalParcelas = firstParcela ? Number(firstParcela.total_parcelas) : boletos.length;
                  const boletoBase = basePerParcela * totalParcelas;
                  // For split payments, non-boleto portion + boleto base = total without interest
                  const nonBoletoTotal = paymentSplits.length > 1
                    ? paymentSplits.filter(s => !s.method.toLowerCase().includes("boleto")).reduce((sum, s) => sum + s.amount, 0)
                    : 0;
                  const baseAmount = paymentSplits.length > 1 ? nonBoletoTotal + boletoBase : boletoBase;
                  const finalAmount = paymentSplits.length > 1 ? nonBoletoTotal + boletoTotal : boletoTotal;
                  const hasJuros = Math.abs(finalAmount - baseAmount) > 0.01;
                  if (hasJuros) {
                    return (
                      <div>
                        <p className="font-semibold text-base tabular-nums text-primary">
                          {formatCurrency(finalAmount)}
                          <span className="text-xs font-normal text-muted-foreground ml-1">c/ juros</span>
                        </p>
                        <p className="text-xs tabular-nums text-muted-foreground line-through">
                          {formatCurrency(baseAmount)}
                        </p>
                      </div>
                    );
                  }
                }

                const info = parsePaymentDisplay(venda.payment_method, Number(venda.total), boletoMeta);
                if (info.hasInterest && !isCancelled) {
                  return (
                    <div>
                      <p className="font-semibold text-base tabular-nums text-primary">
                        {formatCurrency(info.finalTotal)}
                        <span className="text-xs font-normal text-muted-foreground ml-1">c/ juros</span>
                      </p>
                      <p className="text-xs tabular-nums text-muted-foreground line-through">
                        {formatCurrency(info.originalTotal)}
                      </p>
                    </div>
                  );
                }
                return (
                  <p className={`font-semibold text-base tabular-nums ${isCancelled ? "line-through text-muted-foreground" : "text-primary"}`}>
                    {formatCurrency(Number(venda.total))}
                  </p>
                );
              })()}
            </div>
          </div>

          {venda.discount > 0 && (
            <div className="bg-success/10 border border-success/20 rounded-lg p-3 flex items-start gap-3">
              <Tag className="h-4 w-4 text-success mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-success">Desconto atacado aplicado</p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  Economia: <span className="font-semibold">{formatCurrency(Number(venda.discount))}</span>
                </p>
              </div>
            </div>
          )}

          {/* NF-e Info */}
          {nfData && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-start gap-3">
              <Receipt className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="text-sm flex-1">
                <p className="font-medium text-primary">NF-e #{nfData.numero} vinculada</p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  Chave: <span className="font-mono">{nfData.chave_acesso?.slice(0, 20)}...</span>
                </p>
                <div className="flex gap-2 mt-2">
                  {signedNfXml && (
                    <a href={signedNfXml} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <Download className="h-3 w-3" /> XML
                    </a>
                  )}
                  {signedNfPdf && (
                    <a href={signedNfPdf} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <Download className="h-3 w-3" /> PDF
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          <Separator />

          {/* Payment */}
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              {getPaymentIcon(venda.payment_method)}
              Pagamento
            </h4>
            {(() => {
              const hasSplits = paymentSplits.length > 1;
              
              if (hasSplits) {
                // Show each split with its own value and interest calculation
                return (
                  <div className="space-y-2">
                    {paymentSplits.map((split, i) => {
                      const isBoleto = split.method.toLowerCase().includes("boleto");
                      const hasBoletoData = isBoleto && boletos.length > 0;

                      // For boleto: use stored boleto data as single source of truth
                      if (hasBoletoData) {
                        const boletoTotal = boletos.reduce((s, b) => s + Number(b.valor_parcela), 0);
                        // Base amount = first parcela value (never has interest) × total parcelas
                        const firstParcela = boletos.find((b: any) => b.parcela_numero === 1);
                        const basePerParcela = firstParcela ? Number(firstParcela.valor_parcela) : 0;
                        const totalParcelas = firstParcela ? Number(firstParcela.total_parcelas) : boletos.length;
                        const baseAmount = basePerParcela * totalParcelas;
                        const hasJuros = Math.abs(boletoTotal - baseAmount) > 0.01;
                        return (
                          <div key={i} className="bg-secondary/50 rounded px-3 py-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {getPaymentIcon(split.method)}
                                <span className="text-sm font-medium">{split.method}</span>
                              </div>
                              <span className="text-sm font-semibold tabular-nums text-primary">
                                {formatCurrency(hasJuros ? boletoTotal : baseAmount)}
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground space-y-0.5 pl-6">
                              <p>Valor sem juros: {formatCurrency(baseAmount)}</p>
                              {hasJuros && <p>Juros: {boletos[0]?.intervalo_dias <= 15 ? '3' : '6'}%</p>}
                              {boletos.map((b) => (
                                <p key={b.id}>Parcela {b.parcela_numero}: R$ {Number(b.valor_parcela).toFixed(2)}</p>
                              ))}
                            </div>
                          </div>
                        );
                      }

                      const info = parseSplitPaymentDisplay(split.method, split.amount, venda.payment_method, boletoMeta);
                      return (
                        <div key={i} className="bg-secondary/50 rounded px-3 py-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {getPaymentIcon(split.method)}
                              <span className="text-sm font-medium">{split.method}</span>
                            </div>
                            <span className="text-sm font-semibold tabular-nums text-primary">
                              {info.hasInterest ? formatCurrency(info.finalTotal) : formatCurrency(split.amount)}
                            </span>
                          </div>
                          {info.hasInterest && info.installments ? (
                            <div className="mt-1 text-xs text-muted-foreground space-y-0.5 pl-6">
                              <p>Valor sem juros: {formatCurrency(info.originalTotal)}</p>
                              <p>{info.installments}x com {info.rate}% de juros</p>
                              <p>Valor final: {formatCurrency(info.finalTotal)}</p>
                              {info.installmentValue && (
                                <p>Parcelas: {info.installments}x de {formatCurrency(info.installmentValue)}</p>
                              )}
                            </div>
                          ) : (
                            <p className="mt-0.5 text-xs text-muted-foreground pl-6">Sem juros</p>
                          )}
                        </div>
                      );
                    })}
                    {/* Total line */}
                    <div className="flex items-center justify-between px-3 pt-1 border-t border-border/50">
                      <span className="text-xs text-muted-foreground">Total</span>
                      <span className="text-sm font-bold tabular-nums text-primary">
                        {formatCurrency(paymentSplits.reduce((sum, s) => sum + s.amount, 0))}
                      </span>
                    </div>
                  </div>
                );
              }

              // Single payment method
              if (paymentSplits.length === 1) {
                const split = paymentSplits[0];
                const isBoleto = split.method.toLowerCase().includes("boleto");
                const hasBoletoData = isBoleto && boletos.length > 0;

                if (hasBoletoData) {
                  const boletoTotal = boletos.reduce((s, b) => s + Number(b.valor_parcela), 0);
                  const firstParcela = boletos.find((b: any) => b.parcela_numero === 1);
                  const basePerParcela = firstParcela ? Number(firstParcela.valor_parcela) : 0;
                  const totalParcelas = firstParcela ? Number(firstParcela.total_parcelas) : boletos.length;
                  const baseAmount = basePerParcela * totalParcelas;
                  const hasJuros = Math.abs(boletoTotal - baseAmount) > 0.01;
                  return (
                    <div className="bg-secondary/50 rounded px-3 py-2">
                      <div className="flex items-center gap-2 mb-1">
                        {getPaymentIcon(split.method)}
                        <Badge variant="outline">{split.method}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5 pl-6">
                        <p>Valor sem juros: {formatCurrency(baseAmount)}</p>
                        {hasJuros && <p>Juros: {boletos[0]?.intervalo_dias <= 15 ? '3' : '6'}%</p>}
                        {boletos.map((b) => (
                          <p key={b.id}>Parcela {b.parcela_numero}: R$ {Number(b.valor_parcela).toFixed(2)}</p>
                        ))}
                        {hasJuros && (
                          <p>Total c/ juros: <span className="font-medium text-primary">{formatCurrency(boletoTotal)}</span></p>
                        )}
                      </div>
                    </div>
                  );
                }

                const info = parsePaymentDisplay(split.method, split.amount, boletoMeta);
                return (
                  <div className="bg-secondary/50 rounded px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      {getPaymentIcon(split.method)}
                      <Badge variant="outline">{split.method}</Badge>
                    </div>
                    {info.hasInterest && info.installments ? (
                      <div className="text-xs text-muted-foreground space-y-0.5 pl-6">
                        <p>Valor sem juros: {formatCurrency(info.originalTotal)}</p>
                        <p>{info.installments}x com {info.rate}% de juros</p>
                        <p>Valor final: <span className="font-medium text-primary">{formatCurrency(info.finalTotal)}</span></p>
                        {info.installmentValue && (
                          <p>Parcelas: {info.installments}x de {formatCurrency(info.installmentValue)}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground pl-6">
                        Valor: <span className="font-medium text-foreground">{formatCurrency(split.amount)}</span> (sem juros)
                      </p>
                    )}
                  </div>
                );
              }

              // Fallback: no caixa data, use payment_method string
              const isBoletoFallback = venda.payment_method.toLowerCase().includes("boleto");
              if (isBoletoFallback && boletos.length > 0) {
                const boletoTotal = boletos.reduce((s, b) => s + Number(b.valor_parcela), 0);
                const baseAmount = Number(venda.total);
                const hasJuros = Math.abs(boletoTotal - baseAmount) > 0.01;
                return (
                  <div className="bg-secondary/50 rounded px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      {getPaymentIcon(venda.payment_method)}
                      <Badge variant="outline">{venda.payment_method}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5 pl-6">
                      <p>Valor sem juros: {formatCurrency(baseAmount)}</p>
                      {hasJuros && <p>Juros: {boletos[0]?.intervalo_dias <= 15 ? '3' : '6'}%</p>}
                      {boletos.map((b) => (
                        <p key={b.id}>Parcela {b.parcela_numero}: R$ {Number(b.valor_parcela).toFixed(2)}</p>
                      ))}
                      {hasJuros && (
                        <p>Total c/ juros: <span className="font-medium text-primary">{formatCurrency(boletoTotal)}</span></p>
                      )}
                    </div>
                  </div>
                );
              }

              const info = parsePaymentDisplay(venda.payment_method, Number(venda.total), boletoMeta);
              return (
                <div className="bg-secondary/50 rounded px-3 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    {getPaymentIcon(venda.payment_method)}
                    <Badge variant="outline">{venda.payment_method}</Badge>
                  </div>
                  {info.hasInterest && info.installments ? (
                    <div className="text-xs text-muted-foreground space-y-0.5 pl-6">
                      <p>Valor sem juros: {formatCurrency(info.originalTotal)}</p>
                      <p>{info.installments}x com {info.rate}% de juros</p>
                      <p>Valor final: <span className="font-medium text-primary">{formatCurrency(info.finalTotal)}</span></p>
                      {info.installmentValue && (
                        <p>Parcelas: {info.installments}x de {formatCurrency(info.installmentValue)}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground pl-6">
                      Valor: <span className="font-medium text-foreground">{formatCurrency(Number(venda.total))}</span> (sem juros)
                    </p>
                  )}
                </div>
              );
            })()}
          </div>

          <Separator />

          {/* Items */}
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Package className="h-4 w-4" />
              Produtos ({items.length})
            </h4>

            {loading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Carregando itens...</p>
            ) : items.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-center">Qtd</TableHead>
                    <TableHead className="text-right">Unit.</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    {!isCancelled && hasPermission('Vendas', 'cancel') && (
                      <TableHead className="w-10"></TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const isItemCancelled = item.status === "cancelado";
                    return (
                      <TableRow key={item.id} className={isItemCancelled ? "opacity-50" : ""}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <p className={`font-medium text-sm ${isItemCancelled ? "line-through" : ""}`}>{item.product_code}</p>
                            {isItemCancelled && <Badge variant="destructive" className="text-[9px] h-4 px-1">Cancelado</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-center tabular-nums">{item.quantity}</TableCell>
                        <TableCell className="text-right tabular-nums">R$ {Number(item.unit_price).toFixed(2)}</TableCell>
                        <TableCell className={`text-right tabular-nums font-medium ${isItemCancelled ? "line-through" : ""}`}>R$ {Number(item.total).toFixed(2)}</TableCell>
                        {!isCancelled && hasPermission('Vendas', 'cancel') && (
                          <TableCell>
                            {!isItemCancelled && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => setCancellingItemId(item.id)}
                                title="Cancelar este item"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhum item encontrado</p>
            )}
          </div>


          {/* Boletos */}
          {boletos.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Boletos ({boletos.length})
                </h4>
                <div className="space-y-1.5">
                  {boletos.map((b) => {
                    const venc = new Date(b.data_vencimento);
                    const isOverdue = isPast(venc) && !isToday(venc);
                    const now = new Date();
                    const displayStatus = b.status === "gerado" ? "gerado" :
                      (isPast(venc) || isToday(venc) || isSameMonth(venc, now)) ? "pendente" : "futuro";

                    return (
                      <div key={b.id} className={`flex items-center justify-between p-2.5 rounded-md border ${
                        displayStatus === "pendente" ? "bg-destructive/5 border-destructive/20" :
                        displayStatus === "gerado" ? "bg-primary/5 border-primary/20" :
                        "bg-secondary/30 border-border/50"
                      }`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">
                            Parcela {b.parcela_numero}/{b.total_parcelas}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[11px] flex items-center gap-1 ${
                              displayStatus === "pendente" && isOverdue ? "text-destructive font-medium" :
                              displayStatus === "pendente" ? "text-warning font-medium" : "text-muted-foreground"
                            }`}>
                              <Clock className="h-3 w-3" />
                              {isOverdue ? "Vencido " : "Vence "}
                              {format(venc, "dd/MM/yy", { locale: ptBR })}
                            </span>
                            <span className="text-[11px] font-bold">
                              R$ {Number(b.valor_parcela).toFixed(2)}
                            </span>
                          </div>
                        </div>
                        <div onClick={(e) => e.stopPropagation()}>
                          <Select
                            value={b.status}
                            onValueChange={async (v) => {
                              const { error } = await (supabase as any)
                                .from("boleto_alertas")
                                .update({ status: v, updated_at: new Date().toISOString() })
                                .eq("id", b.id);
                              if (error) {
                                toast.error("Erro ao atualizar status");
                              } else {
                                toast.success("Status atualizado");
                                setBoletos(prev => prev.map(x => x.id === b.id ? { ...x, status: v } : x));
                              }
                            }}
                          >
                            <SelectTrigger className="h-7 text-[10px] px-2 w-auto min-w-[90px] border-border/50">
                              <Badge
                                variant={
                                  displayStatus === "gerado" ? "default" :
                                  displayStatus === "pendente" ? "destructive" : "secondary"
                                }
                                className="text-[10px] h-4 px-1.5"
                              >
                                {displayStatus === "gerado" ? "Gerado" : displayStatus === "pendente" ? "Pendente" : "Futuro"}
                              </Badge>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pendente">Pendente</SelectItem>
                              <SelectItem value="gerado">Gerado</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {venda.seller_name && (
            <>
              <Separator />
              <div className="text-sm">
                <p className="text-muted-foreground text-xs">Vendedor</p>
                <p className="font-medium">{venda.seller_name}</p>
              </div>
            </>
          )}

          {/* Cancel button */}
          {!isCancelled && hasPermission('Vendas', 'cancel') && (
            <>
              <Separator />
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => setShowCancelConfirm(true)}
              >
                <Ban className="h-4 w-4 mr-2" />
                Cancelar Venda
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel entire sale confirmation */}
      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Cancelar Venda {(venda as any).sale_code || `#${venda.number}`}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá reverter automaticamente o estoque e o financeiro.
              A venda permanecerá visível no sistema com status cancelada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium mb-1.5 block">Motivo do cancelamento *</label>
            <Textarea
              placeholder="Informe o motivo do cancelamento..."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleCancel();
              }}
              disabled={cancelling || !motivo.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? "Cancelando..." : "Confirmar Cancelamento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel individual item confirmation */}
      <AlertDialog open={!!cancellingItemId} onOpenChange={(open) => { if (!open) { setCancellingItemId(null); setItemMotivo(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Cancelar produto?
            </AlertDialogTitle>
            <AlertDialogDescription>
              O estoque será restaurado e o valor será subtraído da venda. A venda continuará ativa com os demais itens.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium mb-1.5 block">Motivo (opcional)</label>
            <Textarea
              placeholder="Motivo do cancelamento do item..."
              value={itemMotivo}
              onChange={(e) => setItemMotivo(e.target.value)}
              rows={2}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={itemCancelling}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleCancelItem();
              }}
              disabled={itemCancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {itemCancelling ? "Cancelando..." : "Cancelar Item"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
