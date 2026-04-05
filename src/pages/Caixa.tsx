import { useState, useMemo } from "react";
import { Wallet, ArrowUpCircle, ArrowDownCircle, Plus, Minus, Lock, Unlock, Clock, DollarSign, CreditCard, Banknote, QrCode, X, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useFilial } from "@/contexts/FilialContext";
import { useAuth } from "@/contexts/AuthContext";
import { FilialSelector } from "@/components/FilialSelector";
import { DateRangeFilter, useDateRangeFilter, filterByDateRange } from "@/components/DateRangeFilter";
import { useCaixas, useMovimentacoes, abrirCaixa, fecharCaixa, addMovimentacao, removeCaixaHistorico, type DbCaixa } from "@/hooks/useCaixa";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const FORMAS_PAGAMENTO = [
  { value: "dinheiro", label: "Dinheiro", icon: Banknote },
  { value: "pix", label: "Pix", icon: QrCode },
  { value: "debito", label: "Cartão Débito", icon: CreditCard },
  { value: "credito", label: "Cartão Crédito", icon: CreditCard },
];

function formatCurrency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Caixa() {
  const { selectedFilial, filialLabel } = useFilial();
  const { user, profile, hasPermission } = useAuth();
  const canManage = hasPermission('Caixa', 'manage');
  const { caixas, loading } = useCaixas();
  const { preset, range, onChange: onDateChange } = useDateRangeFilter();

  const [selectedCaixa, setSelectedCaixa] = useState<DbCaixa | null>(null);
  const [openDialog, setOpenDialog] = useState<"abrir" | "fechar" | "movimento" | null>(null);
  const [valorAbertura, setValorAbertura] = useState<number>(0);
  const [valorFechamento, setValorFechamento] = useState<number>(0);
  const [obsFechamento, setObsFechamento] = useState("");
  const [movTipo, setMovTipo] = useState<"sangria" | "reforco" | "despesa">("sangria");
  const [movValor, setMovValor] = useState<number>(0);
  const [movForma, setMovForma] = useState("dinheiro");
  const [movDesc, setMovDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState("ativo");
  const [caixaParaRemoverHistorico, setCaixaParaRemoverHistorico] = useState<DbCaixa | null>(null);
  const [removingHistory, setRemovingHistory] = useState(false);

  // Find open caixa for current filial
  const caixaAberto = useMemo(() => {
    if (selectedFilial === "all") return caixas.find(c => c.status === "aberto") || null;
    return caixas.find(c => c.status === "aberto" && c.filial_id === selectedFilial) || null;
  }, [caixas, selectedFilial]);

  const activeCaixaId = selectedCaixa?.id || caixaAberto?.id || null;
  const { movs } = useMovimentacoes(activeCaixaId);

  // Filtered caixas for history
  const filteredCaixas = useMemo(() => {
    return filterByDateRange(caixas, range);
  }, [caixas, range]);

  // Summary calculations for the active caixa
  const summary = useMemo(() => {
    const target = selectedCaixa || caixaAberto;
    if (!target) return { vendas: 0, sangrias: 0, reforcos: 0, despesas: 0, entradas: 0, saidas: 0, saldo: 0, porForma: {} as Record<string, number> };

    let vendas = 0, sangrias = 0, reforcos = 0, despesas = 0;
    const porForma: Record<string, number> = {};

    for (const m of movs) {
      if (m.tipo === "venda") { vendas += m.valor; }
      else if (m.tipo === "sangria") { sangrias += m.valor; }
      else if (m.tipo === "reforco") { reforcos += m.valor; }
      else if (m.tipo === "despesa") { despesas += m.valor; }

      if (m.tipo === "venda" || m.tipo === "reforco") {
        porForma[m.forma_pagamento] = (porForma[m.forma_pagamento] || 0) + m.valor;
      }
    }

    const entradas = vendas + reforcos;
    const saidas = sangrias + despesas;
    const saldo = target.valor_abertura + entradas - saidas;

    return { vendas, sangrias, reforcos, despesas, entradas, saidas, saldo, porForma };
  }, [movs, selectedCaixa, caixaAberto]);

  const userName = profile?.nome || user?.email || "Usuário";

  async function handleAbrirCaixa() {
    if (!user || selectedFilial === "all") return;
    setSubmitting(true);
    try {
      await abrirCaixa(selectedFilial, valorAbertura, user.id, userName);
      toast.success("Caixa aberto com sucesso!");
      setOpenDialog(null);
      setValorAbertura(0);
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSubmitting(false); }
  }

  async function handleFecharCaixa() {
    if (!user || !caixaAberto) return;
    setSubmitting(true);
    try {
      const valorInf = valorFechamento;
      await fecharCaixa(caixaAberto.id, valorInf, summary.saldo, user.id, userName, obsFechamento);
      toast.success("Caixa fechado com sucesso!");
      setOpenDialog(null);
      setValorFechamento(0);
      setObsFechamento("");
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSubmitting(false); }
  }

  async function handleAddMov() {
    if (!user || !caixaAberto) return;
    const valor = movValor;
    if (!valor || valor <= 0) { toast.error("Informe um valor válido."); return; }
    if (!movDesc.trim()) { toast.error("Informe uma descrição/justificativa."); return; }
    setSubmitting(true);
    try {
      await addMovimentacao(caixaAberto.id, movTipo, valor, movForma, movDesc.trim(), user.id, userName);
      toast.success("Movimentação registrada!");
      setOpenDialog(null);
      setMovValor(0);
      setMovDesc("");
    } catch (e: any) {
      toast.error(e.message);
    } finally { setSubmitting(false); }
  }

  async function handleRemoveCaixaHistory() {
    if (!caixaParaRemoverHistorico) return;

    setRemovingHistory(true);
    try {
      await removeCaixaHistorico(caixaParaRemoverHistorico.id);
      toast.success("Histórico do caixa removido com sucesso!");

      if (selectedCaixa?.id === caixaParaRemoverHistorico.id) {
        setSelectedCaixa(null);
      }
      setCaixaParaRemoverHistorico(null);
    } catch (e: any) {
      toast.error(e.message || "Erro ao remover histórico do caixa");
    } finally {
      setRemovingHistory(false);
    }
  }

  const tipoLabel: Record<string, string> = { venda: "Venda", sangria: "Sangria", reforco: "Reforço", despesa: "Despesa" };
  const tipoColor: Record<string, string> = { venda: "bg-primary/10 text-primary", sangria: "bg-destructive/10 text-destructive", reforco: "bg-accent/10 text-accent-foreground", despesa: "bg-warning/10 text-warning-foreground" };

  const viewingCaixa = selectedCaixa || caixaAberto;

  return (
    <div>
      <FilialSelector hideAll />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-title font-semibold tracking-tighter">Caixa</h1>
            <p className="text-ui text-muted-foreground">Controle de caixa — {filialLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            {caixaAberto ? (
              <>
                <Badge variant="outline" className="gap-1.5 bg-accent/10 text-accent-foreground border-accent/30">
                  <Unlock className="h-3 w-3" /> Caixa Aberto
                </Badge>
                {canManage && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpenDialog("movimento")}>
                    <Plus className="h-3.5 w-3.5" /> Movimentação
                  </Button>
                )}
                {canManage && (
                  <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => setOpenDialog("fechar")}>
                    <Lock className="h-3.5 w-3.5" /> Fechar Caixa
                  </Button>
                )}
              </>
            ) : (
              <>
                <Badge variant="outline" className="gap-1.5 text-muted-foreground">
                  <Lock className="h-3 w-3" /> Caixa Fechado
                </Badge>
                {canManage && (
                  <Button size="sm" className="gap-1.5" onClick={() => {
                    if (selectedFilial === "all") { toast.error("Selecione uma filial para abrir o caixa."); return; }
                    setOpenDialog("abrir");
                  }}>
                    <Unlock className="h-3.5 w-3.5" /> Abrir Caixa
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="ativo">Caixa Ativo</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="ativo" className="space-y-4 mt-3">
            {viewingCaixa ? (
              <>
                {/* Info bar */}
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Aberto em {format(new Date(viewingCaixa.aberto_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                  <span>por {viewingCaixa.usuario_abertura_nome}</span>
                  <span>Abertura: {formatCurrency(viewingCaixa.valor_abertura)}</span>
                  {viewingCaixa.status === "fechado" && viewingCaixa.fechado_em && (
                    <Badge variant="secondary" className="text-xs">Fechado em {format(new Date(viewingCaixa.fechado_em), "dd/MM HH:mm", { locale: ptBR })}</Badge>
                  )}
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Card className="shadow-card">
                    <CardContent className="p-4">
                      <p className="text-caption text-muted-foreground">Saldo Atual</p>
                      <p className="text-title font-semibold tabular-nums text-primary mt-1">{formatCurrency(summary.saldo)}</p>
                    </CardContent>
                  </Card>
                  <Card className="shadow-card">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2"><ArrowUpCircle className="h-4 w-4 text-accent" /><p className="text-caption text-muted-foreground">Entradas</p></div>
                      <p className="text-title font-semibold tabular-nums text-accent-foreground mt-1">{formatCurrency(summary.entradas)}</p>
                    </CardContent>
                  </Card>
                  <Card className="shadow-card">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2"><ArrowDownCircle className="h-4 w-4 text-destructive" /><p className="text-caption text-muted-foreground">Saídas</p></div>
                      <p className="text-title font-semibold tabular-nums text-destructive mt-1">{formatCurrency(summary.saidas)}</p>
                    </CardContent>
                  </Card>
                  <Card className="shadow-card">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-primary" /><p className="text-caption text-muted-foreground">Vendas</p></div>
                      <p className="text-title font-semibold tabular-nums mt-1">{formatCurrency(summary.vendas)}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Payment breakdown */}
                {Object.keys(summary.porForma).length > 0 && (
                  <Card className="shadow-card">
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-ui font-semibold">Resumo por Forma de Pagamento</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {FORMAS_PAGAMENTO.map(fp => {
                          const val = summary.porForma[fp.value] || 0;
                          const Icon = fp.icon;
                          return (
                            <div key={fp.value} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="text-xs text-muted-foreground">{fp.label}</p>
                                <p className="text-sm font-semibold tabular-nums">{formatCurrency(val)}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Detail cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-md border bg-card text-center">
                    <p className="text-xs text-muted-foreground">Sangrias</p>
                    <p className="text-sm font-semibold tabular-nums text-destructive">{formatCurrency(summary.sangrias)}</p>
                  </div>
                  <div className="p-3 rounded-md border bg-card text-center">
                    <p className="text-xs text-muted-foreground">Reforços</p>
                    <p className="text-sm font-semibold tabular-nums text-accent-foreground">{formatCurrency(summary.reforcos)}</p>
                  </div>
                  <div className="p-3 rounded-md border bg-card text-center">
                    <p className="text-xs text-muted-foreground">Despesas</p>
                    <p className="text-sm font-semibold tabular-nums text-destructive">{formatCurrency(summary.despesas)}</p>
                  </div>
                  <div className="p-3 rounded-md border bg-card text-center">
                    <p className="text-xs text-muted-foreground">Abertura</p>
                    <p className="text-sm font-semibold tabular-nums">{formatCurrency(viewingCaixa.valor_abertura)}</p>
                  </div>
                </div>

                {/* Fechamento result */}
                {viewingCaixa.status === "fechado" && viewingCaixa.diferenca !== null && (
                  <Card className={`shadow-card border-l-4 ${viewingCaixa.diferenca === 0 ? "border-l-accent" : "border-l-destructive"}`}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">Resultado do Fechamento</p>
                        <p className="text-xs text-muted-foreground">
                          Esperado: {formatCurrency(viewingCaixa.valor_fechamento_esperado || 0)} | Informado: {formatCurrency(viewingCaixa.valor_fechamento_informado || 0)}
                        </p>
                      </div>
                      <Badge variant={viewingCaixa.diferenca === 0 ? "default" : "destructive"}>
                        {viewingCaixa.diferenca === 0 ? "Caixa bateu" : `Diferença: ${formatCurrency(viewingCaixa.diferenca)}`}
                      </Badge>
                    </CardContent>
                  </Card>
                )}

                {/* Movements table */}
                <Card className="shadow-card">
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-ui font-semibold">Movimentações</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {movs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <Wallet className="h-12 w-12 mb-3 opacity-30" />
                        <p className="text-ui font-medium">Nenhuma movimentação no caixa</p>
                      </div>
                    ) : (
                      <div className="overflow-auto max-h-[400px]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Data/Hora</TableHead>
                              <TableHead>Tipo</TableHead>
                              <TableHead>Descrição</TableHead>
                              <TableHead>Pagamento</TableHead>
                              <TableHead>Usuário</TableHead>
                              <TableHead className="text-right">Valor</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {movs.map(m => (
                              <TableRow key={m.id}>
                                <TableCell className="text-xs tabular-nums">{format(new Date(m.created_at), "dd/MM HH:mm", { locale: ptBR })}</TableCell>
                                <TableCell>
                                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${tipoColor[m.tipo] || ""}`}>
                                    {tipoLabel[m.tipo] || m.tipo}
                                  </span>
                                </TableCell>
                                <TableCell className="text-sm max-w-[200px] truncate">{m.descricao || "—"}</TableCell>
                                <TableCell className="text-xs">{FORMAS_PAGAMENTO.find(f => f.value === m.forma_pagamento)?.label || m.forma_pagamento}</TableCell>
                                <TableCell className="text-xs">{m.usuario_nome}</TableCell>
                                <TableCell className={`text-right font-semibold tabular-nums text-sm ${m.tipo === "sangria" || m.tipo === "despesa" ? "text-destructive" : "text-primary"}`}>
                                  {m.tipo === "sangria" || m.tipo === "despesa" ? "- " : "+ "}{formatCurrency(m.valor)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card className="shadow-card">
                <CardContent className="p-4">
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Wallet className="h-16 w-16 mb-4 opacity-20" />
                    <p className="text-lg font-medium">Nenhum caixa aberto</p>
                    <p className="text-sm mt-1">Abra o caixa para iniciar as operações</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="historico" className="space-y-4 mt-3">
            <DateRangeFilter preset={preset} range={range} onChange={onDateChange} />

            {filteredCaixas.length === 0 ? (
              <Card className="shadow-card">
                <CardContent className="p-4">
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Clock className="h-12 w-12 mb-3 opacity-30" />
                    <p className="text-ui font-medium">Nenhum caixa encontrado no período</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="shadow-card">
                <CardContent className="p-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Abertura</TableHead>
                        <TableHead>Fechamento</TableHead>
                        <TableHead>Filial</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Abertura (R$)</TableHead>
                        <TableHead>Diferença</TableHead>
                        <TableHead>Responsável</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCaixas.map(c => (
                        <TableRow key={c.id} className="cursor-pointer" onClick={() => { setSelectedCaixa(c); setTab("ativo"); }}>
                          <TableCell className="text-xs tabular-nums">{format(new Date(c.aberto_em), "dd/MM/yy HH:mm", { locale: ptBR })}</TableCell>
                          <TableCell className="text-xs tabular-nums">{c.fechado_em ? format(new Date(c.fechado_em), "dd/MM/yy HH:mm", { locale: ptBR }) : "—"}</TableCell>
                          <TableCell className="text-xs">Filial {c.filial_id}</TableCell>
                          <TableCell>
                            <Badge variant={c.status === "aberto" ? "default" : "secondary"} className="text-xs">
                              {c.status === "aberto" ? "Aberto" : "Fechado"}
                            </Badge>
                          </TableCell>
                          <TableCell className="tabular-nums text-sm">{formatCurrency(c.valor_abertura)}</TableCell>
                          <TableCell className="tabular-nums text-sm">
                            {c.diferenca !== null ? (
                              <span className={c.diferenca === 0 ? "text-accent-foreground" : "text-destructive"}>{formatCurrency(c.diferenca)}</span>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-xs">{c.usuario_abertura_nome}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedCaixa(c);
                                  setTab("ativo");
                                }}
                              >
                                Ver
                              </Button>
                              {canManage && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCaixaParaRemoverHistorico(c);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Back button when viewing historical */}
        {selectedCaixa && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSelectedCaixa(null)}>
            <X className="h-3.5 w-3.5" /> Voltar ao caixa ativo
          </Button>
        )}
      </div>

      {/* Dialog: Abrir Caixa */}
      <Dialog open={openDialog === "abrir"} onOpenChange={o => !o && setOpenDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Abrir Caixa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Valor de abertura (troco)</Label>
              <CurrencyInput placeholder="0,00" value={valorAbertura} onValueChange={setValorAbertura} />
            </div>
            <p className="text-xs text-muted-foreground">Filial: {filialLabel} | Responsável: {userName}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(null)}>Cancelar</Button>
            <Button onClick={handleAbrirCaixa} disabled={submitting}>{submitting ? "Abrindo..." : "Abrir Caixa"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Fechar Caixa */}
      <Dialog open={openDialog === "fechar"} onOpenChange={o => !o && setOpenDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Fechar Caixa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 rounded-md bg-muted">
                <p className="text-xs text-muted-foreground">Saldo Esperado</p>
                <p className="font-semibold tabular-nums text-primary">{formatCurrency(summary.saldo)}</p>
              </div>
              <div className="p-3 rounded-md bg-muted">
                <p className="text-xs text-muted-foreground">Total Vendas</p>
                <p className="font-semibold tabular-nums">{formatCurrency(summary.vendas)}</p>
              </div>
              <div className="p-3 rounded-md bg-muted">
                <p className="text-xs text-muted-foreground">Sangrias</p>
                <p className="font-semibold tabular-nums text-destructive">{formatCurrency(summary.sangrias)}</p>
              </div>
              <div className="p-3 rounded-md bg-muted">
                <p className="text-xs text-muted-foreground">Reforços</p>
                <p className="font-semibold tabular-nums text-accent-foreground">{formatCurrency(summary.reforcos)}</p>
              </div>
            </div>
            <div>
              <Label>Valor contado em dinheiro</Label>
              <CurrencyInput placeholder="0,00" value={valorFechamento} onValueChange={setValorFechamento} />
            </div>
            {valorFechamento >= 0 && (
              <div className={`p-3 rounded-md border-l-4 ${valorFechamento - summary.saldo === 0 ? "border-l-accent bg-accent/5" : "border-l-destructive bg-destructive/5"}`}>
                <p className="text-sm font-semibold">
                  Diferença: {formatCurrency(valorFechamento - summary.saldo)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {valorFechamento - summary.saldo === 0 ? "Caixa batendo ✓" : valorFechamento > summary.saldo ? "Sobra no caixa" : "Quebra no caixa"}
                </p>
              </div>
            )}
            <div>
              <Label>Observações (opcional)</Label>
              <Textarea placeholder="Observações sobre o fechamento..." value={obsFechamento} onChange={e => setObsFechamento(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleFecharCaixa} disabled={submitting || valorFechamento < 0}>{submitting ? "Fechando..." : "Confirmar Fechamento"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Nova Movimentação */}
      <Dialog open={openDialog === "movimento"} onOpenChange={o => !o && setOpenDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Movimentação</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Tipo</Label>
              <Select value={movTipo} onValueChange={v => setMovTipo(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sangria">Sangria (Retirada)</SelectItem>
                  <SelectItem value="reforco">Reforço (Entrada)</SelectItem>
                  <SelectItem value="despesa">Despesa Operacional</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor</Label>
              <CurrencyInput placeholder="0,00" value={movValor} onValueChange={setMovValor} />
            </div>
            <div>
              <Label>Forma de pagamento</Label>
              <Select value={movForma} onValueChange={setMovForma}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMAS_PAGAMENTO.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Motivo / Justificativa *</Label>
              <Textarea placeholder="Descreva o motivo da movimentação..." value={movDesc} onChange={e => setMovDesc(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(null)}>Cancelar</Button>
            <Button onClick={handleAddMov} disabled={submitting}>{submitting ? "Registrando..." : "Registrar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!caixaParaRemoverHistorico}
        onOpenChange={() => {}}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover histórico do caixa?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o histórico deste caixa? Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={removingHistory}
              onClick={() => setCaixaParaRemoverHistorico(null)}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleRemoveCaixaHistory();
              }}
              disabled={removingHistory}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removingHistory ? "Removendo..." : "Remover histórico"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
