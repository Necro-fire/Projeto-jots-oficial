import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Trash2, Search, PackagePlus, PackageSearch, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFilial } from "@/contexts/FilialContext";
import { useFornecedores } from "@/hooks/useFornecedores";
import { ProductFormDialog } from "@/components/ProductFormDialog";
import { toast } from "sonner";

/**
 * Item da compra. Pode ser:
 * - existente: já cadastrado (tem produto_id)
 * - pendente: produto novo a ser cadastrado APÓS a compra (produto_id = null)
 */
interface ItemCompra {
  pending: boolean;
  produto_id: string | null;
  produto_code: string;
  produto_model: string;
  quantidade: number;
  valor_unitario: number;
  total: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
  fornecedorIdPreset?: string | null;
}

type AddMode = "cadastrado" | "novo";

export function NovaCompraDialog({ open, onOpenChange, onSuccess, fornecedorIdPreset }: Props) {
  const { profile } = useAuth();
  const { selectedFilial } = useFilial();
  const { data: fornecedores } = useFornecedores();

  const fornecedoresAtivos = useMemo(
    () => fornecedores.filter((f) => (f.status ?? "active") === "active"),
    [fornecedores]
  );

  const [fornecedorId, setFornecedorId] = useState("");
  const [dataCompra, setDataCompra] = useState(() => new Date().toISOString().slice(0, 10));
  const [descricao, setDescricao] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("dinheiro");
  const [items, setItems] = useState<ItemCompra[]>([]);
  const [saving, setSaving] = useState(false);

  // Modo de adição de produto
  const [addMode, setAddMode] = useState<AddMode>("cadastrado");

  // Busca de produto cadastrado
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // Form de produto novo (temporário)
  const [novoNome, setNovoNome] = useState("");
  const [novoQtd, setNovoQtd] = useState(1);
  const [novoCusto, setNovoCusto] = useState(0);

  // Pós-venda: fila de cadastro de produtos pendentes
  const [pendingQueue, setPendingQueue] = useState<ItemCompra[]>([]);
  const [currentPending, setCurrentPending] = useState<ItemCompra | null>(null);
  const [compraIdSalva, setCompraIdSalva] = useState<string | null>(null);

  const selectedFornecedor = useMemo(
    () => fornecedores.find((fornecedor) => fornecedor.id === fornecedorId) ?? null,
    [fornecedorId, fornecedores]
  );

  const isFornecedorGlobal = selectedFornecedor?.filial_id === "all";

  // Filial onde a compra é registrada (e onde o estoque é atualizado).
  // Para fornecedor global, usa a filial selecionada no contexto (ou exige seleção).
  const compraFilialId = isFornecedorGlobal
    ? (selectedFilial !== "all" ? selectedFilial : null)
    : selectedFornecedor?.filial_id ?? (selectedFilial !== "all" ? selectedFilial : null);

  // Filial onde o produto NOVO será cadastrado:
  // - Fornecedor local → filial do fornecedor
  // - Fornecedor global → "all" (cadastra em todas as filiais)
  const cadastroFilialId = isFornecedorGlobal ? "all" : selectedFornecedor?.filial_id ?? null;

  useEffect(() => {
    if (!open) {
      setFornecedorId("");
      setDataCompra(new Date().toISOString().slice(0, 10));
      setDescricao("");
      setObservacoes("");
      setFormaPagamento("dinheiro");
      setItems([]);
      setSearchTerm("");
      setSearchResults([]);
      setAddMode("cadastrado");
      setNovoNome("");
      setNovoQtd(1);
      setNovoCusto(0);
      setPendingQueue([]);
      setCurrentPending(null);
      setCompraIdSalva(null);
    } else if (fornecedorIdPreset) {
      setFornecedorId(fornecedorIdPreset);
    }
  }, [open, fornecedorIdPreset]);

  const searchProducts = async () => {
    if (!searchTerm.trim()) return;
    if (!compraFilialId) {
      toast.error("Selecione um fornecedor para definir a filial da compra.");
      return;
    }

    setSearching(true);
    const term = searchTerm.trim().toUpperCase();
    const { data } = await supabase
      .from("produtos")
      .select("id, code, model, retail_price, custo, barcode")
      .eq("filial_id", compraFilialId)
      .or(`code.ilike.%${term}%,model.ilike.%${term}%,barcode.ilike.%${term}%`)
      .limit(10);
    setSearchResults(data || []);
    setSearching(false);
  };

  const addExistingProduct = (p: any) => {
    if (items.some(i => i.produto_id === p.id)) {
      toast.info("Produto já adicionado");
      return;
    }
    setItems(prev => [...prev, {
      pending: false,
      produto_id: p.id,
      produto_code: p.code,
      produto_model: p.model,
      quantidade: 1,
      valor_unitario: p.custo || 0,
      total: p.custo || 0,
    }]);
    setSearchTerm("");
    setSearchResults([]);
  };

  const addPendingProduct = () => {
    if (!novoNome.trim()) {
      toast.error("Informe um nome/descrição para o novo produto.");
      return;
    }
    if (novoQtd < 1) {
      toast.error("Quantidade deve ser maior que zero.");
      return;
    }
    setItems(prev => [...prev, {
      pending: true,
      produto_id: null,
      produto_code: "— A CADASTRAR —",
      produto_model: novoNome.trim(),
      quantidade: novoQtd,
      valor_unitario: novoCusto,
      total: novoCusto * novoQtd,
    }]);
    setNovoNome("");
    setNovoQtd(1);
    setNovoCusto(0);
    toast.success("Produto adicionado. Será cadastrado após salvar a compra.");
  };

  const updateItem = (idx: number, field: keyof ItemCompra, value: number) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value } as ItemCompra;
      if (field === "quantidade" || field === "valor_unitario") {
        updated.total = updated.quantidade * updated.valor_unitario;
      }
      return updated;
    }));
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const valorTotal = items.reduce((sum, i) => sum + i.total, 0);
  const pendingCount = items.filter(i => i.pending).length;

  /** Vincula um produto a um fornecedor (idempotente). */
  const vincularProdutoFornecedor = async (produtoId: string, fId: string) => {
    const { data: vincExistente } = await (supabase as any)
      .from("fornecedor_produtos")
      .select("id")
      .eq("fornecedor_id", fId)
      .eq("produto_id", produtoId)
      .maybeSingle();

    if (!vincExistente) {
      await (supabase as any)
        .from("fornecedor_produtos")
        .insert({ fornecedor_id: fId, produto_id: produtoId });
    }
  };

  /** Atualiza/cria estoque do produto na filial e espelha em produtos.stock. */
  const atualizarEstoque = async (produtoId: string, filialId: string, deltaQtd: number) => {
    await (supabase as any).rpc("reconcile_inventory_for_product", {
      _produto_id: produtoId,
      _filial_id: filialId,
    });

    const { data: estoqueRow } = await (supabase as any)
      .from("estoque")
      .select("id, quantidade")
      .eq("produto_id", produtoId)
      .eq("filial_id", filialId)
      .maybeSingle();

    const novaQtd = (estoqueRow?.quantidade ?? 0) + deltaQtd;

    if (estoqueRow?.id) {
      await (supabase as any)
        .from("estoque")
        .update({ quantidade: novaQtd })
        .eq("id", estoqueRow.id);
    } else {
      await (supabase as any)
        .from("estoque")
        .insert({ produto_id: produtoId, filial_id: filialId, quantidade: novaQtd });
    }

    await (supabase as any)
      .from("produtos")
      .update({ stock: novaQtd })
      .eq("id", produtoId);
  };

  const handleSave = async () => {
    if (!fornecedorId) {
      toast.error("Selecione um fornecedor");
      return;
    }
    if (!selectedFornecedor || (selectedFornecedor.status ?? "active") !== "active") {
      toast.error("Fornecedor inativo: não é possível registrar compras.");
      return;
    }
    if (!compraFilialId) {
      toast.error("Selecione uma filial específica para registrar a compra.");
      return;
    }
    if (items.length === 0) {
      toast.error("Adicione pelo menos um produto");
      return;
    }
    if (!profile) return;

    setSaving(true);
    try {
      // Verifica caixa aberto
      const { data: caixaAberto } = await (supabase as any)
        .from("caixas")
        .select("id")
        .eq("filial_id", compraFilialId)
        .eq("status", "aberto")
        .maybeSingle();

      if (!caixaAberto) {
        toast.error("O caixa da filial precisa estar aberto para registrar compras.");
        setSaving(false);
        return;
      }

      // Cria compra
      const { data: compra, error: compraError } = await (supabase as any)
        .from("compras_fornecedor")
        .insert({
          fornecedor_id: fornecedorId,
          descricao,
          valor_total: valorTotal,
          data_compra: dataCompra || new Date().toISOString(),
          observacoes,
          filial_id: compraFilialId,
          usuario_id: profile.id,
          usuario_nome: profile.nome,
        })
        .select("id")
        .single();

      if (compraError) throw compraError;

      // Itens existentes: insere compra_items, atualiza estoque e vincula ao fornecedor
      const existentes = items.filter(i => !i.pending && i.produto_id);
      if (existentes.length > 0) {
        const itemsToInsert = existentes.map(item => ({
          compra_id: compra.id,
          produto_id: item.produto_id!,
          produto_code: item.produto_code,
          produto_model: item.produto_model,
          quantidade: item.quantidade,
          valor_unitario: item.valor_unitario,
          total: item.total,
        }));

        const { error: itemsError } = await (supabase as any)
          .from("compra_items")
          .insert(itemsToInsert);
        if (itemsError) throw itemsError;

        for (const item of existentes) {
          await atualizarEstoque(item.produto_id!, compraFilialId, item.quantidade);
          await vincularProdutoFornecedor(item.produto_id!, fornecedorId);
        }
      }

      // Despesa no caixa
      const fornNome = selectedFornecedor?.nome || "";
      await (supabase as any).from("caixa_movimentacoes").insert({
        caixa_id: caixaAberto.id,
        tipo: "despesa",
        valor: valorTotal,
        forma_pagamento: formaPagamento,
        descricao: `Compra Fornecedor: ${fornNome}${descricao ? " — " + descricao : ""}`,
        usuario_id: profile.id,
        usuario_nome: profile.nome,
      });

      // Pendentes: enfileira para cadastro
      const pendentes = items.filter(i => i.pending);
      setCompraIdSalva(compra.id);

      if (pendentes.length > 0) {
        toast.success(`Compra registrada. Vamos cadastrar ${pendentes.length} produto(s) novo(s).`);
        setPendingQueue(pendentes);
        setCurrentPending(pendentes[0]);
        setSaving(false);
        return; // mantém diálogo aberto; o ProductFormDialog cuida do resto
      }

      toast.success("Compra registrada e estoque atualizado");
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao registrar compra: " + (err.message || ""));
    }
    setSaving(false);
  };

  /** Chamado pelo ProductFormDialog após cadastrar um produto pendente. */
  const handlePendingSaved = async (produtoIds: string[]) => {
    if (!currentPending || !compraIdSalva) return;

    try {
      // Para cada produto criado (1 ou múltiplas filiais), vincula ao fornecedor.
      // O compra_item registra o produto da filial onde a compra foi feita.
      let produtoCompraId = produtoIds[0];

      if (isFornecedorGlobal && compraFilialId) {
        // Encontrar o produto criado na filial da compra
        const { data: prodNaFilial } = await (supabase as any)
          .from("produtos")
          .select("id")
          .in("id", produtoIds)
          .eq("filial_id", compraFilialId)
          .maybeSingle();
        if (prodNaFilial?.id) produtoCompraId = prodNaFilial.id;
      }

      // Buscar code/model real
      const { data: prodInfo } = await (supabase as any)
        .from("produtos")
        .select("code, model")
        .eq("id", produtoCompraId)
        .maybeSingle();

      // Insere compra_item
      await (supabase as any).from("compra_items").insert({
        compra_id: compraIdSalva,
        produto_id: produtoCompraId,
        produto_code: prodInfo?.code || "",
        produto_model: prodInfo?.model || currentPending.produto_model,
        quantidade: currentPending.quantidade,
        valor_unitario: currentPending.valor_unitario,
        total: currentPending.total,
      });

      // O ProductFormDialog já criou o estoque com a quantidade preset, então
      // NÃO chamamos atualizarEstoque aqui (evita dobrar).
      // Apenas vincula o(s) produto(s) ao fornecedor.
      for (const pid of produtoIds) {
        await vincularProdutoFornecedor(pid, fornecedorId);
      }

      // Próximo da fila
      const restante = pendingQueue.slice(1);
      setPendingQueue(restante);

      if (restante.length > 0) {
        setCurrentPending(restante[0]);
      } else {
        setCurrentPending(null);
        toast.success("Todos os produtos foram cadastrados e vinculados ao fornecedor.");
        onSuccess();
        onOpenChange(false);
      }
    } catch (err: any) {
      toast.error("Erro ao processar produto cadastrado: " + (err.message || ""));
    }
  };

  const handleSkipPending = () => {
    // Usuário fechou o cadastro sem salvar — pula este pendente
    const restante = pendingQueue.slice(1);
    setPendingQueue(restante);
    if (restante.length > 0) {
      setCurrentPending(restante[0]);
    } else {
      setCurrentPending(null);
      toast.warning("Compra finalizada com produtos pendentes não cadastrados.");
      onSuccess();
      onOpenChange(false);
    }
  };

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <>
      <Dialog open={open && !currentPending} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Compra</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fornecedor *</Label>
                <Select value={fornecedorId} onValueChange={setFornecedorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {fornecedoresAtivos.length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum fornecedor ativo</div>
                    )}
                    {fornecedoresAtivos.map(f => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.codigo} — {f.nome} {f.filial_id === "all" ? "🌐" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data da Compra *</Label>
                <Input type="date" value={dataCompra} onChange={e => setDataCompra(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Forma de Pagamento *</Label>
                <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="debito">Cartão de Débito</SelectItem>
                    <SelectItem value="credito">Cartão de Crédito</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="transferencia">Transferência</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Descrição</Label>
                <Input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descrição da compra..." />
              </div>
            </div>

            {/* Bloco: identificar produto */}
            <div className="border rounded-md p-3 bg-muted/30 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <Label className="font-semibold">O produto já está cadastrado?</Label>
              </div>

              <RadioGroup
                value={addMode}
                onValueChange={(v) => setAddMode(v as AddMode)}
                className="flex gap-4"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="cadastrado" id="mode-cad" />
                  <Label htmlFor="mode-cad" className="cursor-pointer flex items-center gap-1">
                    <PackageSearch className="h-4 w-4" /> Sim — buscar
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="novo" id="mode-novo" />
                  <Label htmlFor="mode-novo" className="cursor-pointer flex items-center gap-1">
                    <PackagePlus className="h-4 w-4" /> Não — cadastrar novo
                  </Label>
                </div>
              </RadioGroup>

              {addMode === "cadastrado" ? (
                <div>
                  <div className="flex gap-2">
                    <Input
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      placeholder="Código interno, código de barras ou modelo..."
                      onKeyDown={e => e.key === "Enter" && searchProducts()}
                    />
                    <Button variant="outline" size="icon" onClick={searchProducts} disabled={searching}>
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>
                  {searchResults.length > 0 && (
                    <div className="border rounded-md mt-1 max-h-40 overflow-y-auto bg-background">
                      {searchResults.map(p => (
                        <button
                          key={p.id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex justify-between items-center"
                          onClick={() => addExistingProduct(p)}
                        >
                          <span><span className="font-mono text-xs">{p.code}</span> — {p.model}</span>
                          <span className="text-muted-foreground">{fmt(p.custo || 0)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-6">
                    <Label className="text-xs">Nome / descrição rápida</Label>
                    <Input
                      value={novoNome}
                      onChange={e => setNovoNome(e.target.value)}
                      placeholder="Ex: ARM. ACETATO PRETO REF X100"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Qtd</Label>
                    <Input
                      type="number"
                      min={1}
                      value={novoQtd}
                      onChange={e => setNovoQtd(parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div className="col-span-3">
                    <Label className="text-xs">Custo unit.</Label>
                    <CurrencyInput value={novoCusto} onValueChange={setNovoCusto} />
                  </div>
                  <div className="col-span-1">
                    <Button onClick={addPendingProduct} size="icon" className="w-full">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="col-span-12 text-xs text-muted-foreground">
                    O cadastro completo será feito automaticamente após salvar a compra
                    {isFornecedorGlobal ? " (em todas as filiais — fornecedor global)" : cadastroFilialId ? ` (filial ${cadastroFilialId})` : ""}.
                  </p>
                </div>
              )}
            </div>

            {items.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead className="w-24">Qtd</TableHead>
                    <TableHead className="w-36">Vlr. Unit.</TableHead>
                    <TableHead className="text-right w-28">Total</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => (
                    <TableRow key={`${item.produto_id ?? "pending"}-${idx}`}>
                      <TableCell className="font-mono text-xs">
                        {item.pending ? (
                          <Badge variant="outline">NOVO</Badge>
                        ) : (
                          item.produto_code
                        )}
                      </TableCell>
                      <TableCell>{item.produto_model}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          value={item.quantidade}
                          onChange={e => updateItem(idx, "quantidade", parseInt(e.target.value) || 1)}
                          className="h-8 w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <CurrencyInput
                          value={item.valor_unitario}
                          onValueChange={v => updateItem(idx, "valor_unitario", v)}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium">{fmt(item.total)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeItem(idx)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <div className="flex items-center justify-between border-t pt-3">
              <div>
                <Label>Observações</Label>
                <Textarea
                  value={observacoes}
                  onChange={e => setObservacoes(e.target.value)}
                  placeholder="Observações opcionais..."
                  className="w-64"
                  rows={2}
                />
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Valor Total</p>
                <p className="text-2xl font-bold text-primary">{fmt(valorTotal)}</p>
                <p className="text-xs text-muted-foreground">
                  {items.length} produto(s)
                  {pendingCount > 0 && ` • ${pendingCount} a cadastrar`}
                </p>
              </div>
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full">
              <Plus className="h-4 w-4 mr-1" />
              {saving ? "Registrando..." : "Registrar Compra"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cadastro automático de produtos pendentes (em fila) */}
      {currentPending && cadastroFilialId && (
        <ProductFormDialog
          open={!!currentPending}
          onOpenChange={(open) => {
            if (!open) handleSkipPending();
          }}
          presetFilialId={cadastroFilialId}
          presetQuantidade={currentPending.quantidade}
          presetCusto={currentPending.valor_unitario}
          presetName={currentPending.produto_model}
          onSaved={handlePendingSaved}
        />
      )}
    </>
  );
}
