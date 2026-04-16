import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Plus, Trash2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFilial } from "@/contexts/FilialContext";
import { useFornecedores } from "@/hooks/useFornecedores";
import { toast } from "sonner";

interface ItemCompra {
  produto_id: string;
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

export function NovaCompraDialog({ open, onOpenChange, onSuccess, fornecedorIdPreset }: Props) {
  const { profile } = useAuth();
  const { selectedFilial } = useFilial();
  const { data: fornecedores } = useFornecedores();

  const [fornecedorId, setFornecedorId] = useState("");
  const [dataCompra, setDataCompra] = useState(() => new Date().toISOString().slice(0, 10));
  const [descricao, setDescricao] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [items, setItems] = useState<ItemCompra[]>([]);
  const [saving, setSaving] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const selectedFornecedor = useMemo(
    () => fornecedores.find((fornecedor) => fornecedor.id === fornecedorId) ?? null,
    [fornecedorId, fornecedores]
  );

  const compraFilialId = selectedFornecedor?.filial_id ?? (selectedFilial !== "all" ? selectedFilial : null);

  useEffect(() => {
    if (!open) {
      setFornecedorId("");
      setDataCompra(new Date().toISOString().slice(0, 10));
      setDescricao("");
      setObservacoes("");
      setItems([]);
      setSearchTerm("");
      setSearchResults([]);
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
      .select("id, code, model, retail_price, custo")
      .eq("filial_id", compraFilialId)
      .or(`code.ilike.%${term}%,model.ilike.%${term}%,barcode.ilike.%${term}%`)
      .limit(10);
    setSearchResults(data || []);
    setSearching(false);
  };

  const addProduct = (p: any) => {
    if (items.some(i => i.produto_id === p.id)) {
      toast.info("Produto já adicionado");
      return;
    }
    setItems(prev => [...prev, {
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

  const updateItem = (idx: number, field: keyof ItemCompra, value: number) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
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

  const handleSave = async () => {
    if (!fornecedorId) {
      toast.error("Selecione um fornecedor");
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
      // Verify caixa is open
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

      const itemsToInsert = items.map(item => ({
        compra_id: compra.id,
        produto_id: item.produto_id,
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

      // Register purchase as expense (despesa) in the open caixa
      const fornNome = fornecedores.find(f => f.id === fornecedorId)?.nome || "";
      await (supabase as any).from("caixa_movimentacoes").insert({
        caixa_id: caixaAberto.id,
        tipo: "despesa",
        valor: valorTotal,
        forma_pagamento: "dinheiro",
        descricao: `Compra Fornecedor: ${fornNome}${descricao ? " — " + descricao : ""}`,
        usuario_id: profile.id,
        usuario_nome: profile.nome,
      });

      toast.success("Compra registrada com sucesso");
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao registrar compra: " + (err.message || ""));
    }
    setSaving(false);
  };

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                  {fornecedores.map(f => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.codigo} — {f.nome}
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

          <div>
            <Label>Descrição</Label>
            <Input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descrição da compra..." />
          </div>

          <div>
            <Label>Adicionar Produto</Label>
            <div className="flex gap-2">
              <Input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar por código, modelo ou barcode..."
                onKeyDown={e => e.key === "Enter" && searchProducts()}
              />
              <Button variant="outline" size="icon" onClick={searchProducts} disabled={searching}>
                <Search className="h-4 w-4" />
              </Button>
            </div>
            {searchResults.length > 0 && (
              <div className="border rounded-md mt-1 max-h-40 overflow-y-auto">
                {searchResults.map(p => (
                  <button
                    key={p.id}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex justify-between items-center"
                    onClick={() => addProduct(p)}
                  >
                    <span><span className="font-mono text-xs">{p.code}</span> — {p.model}</span>
                    <span className="text-muted-foreground">{fmt(p.custo)}</span>
                  </button>
                ))}
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
                  <TableRow key={item.produto_id}>
                    <TableCell className="font-mono text-xs">{item.produto_code}</TableCell>
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
              <p className="text-xs text-muted-foreground">{items.length} produto(s)</p>
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            <Plus className="h-4 w-4 mr-1" />
            {saving ? "Registrando..." : "Registrar Compra"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
