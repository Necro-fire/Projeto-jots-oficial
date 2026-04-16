import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { createConsignadoTroca, type Consignado } from "@/hooks/useConsignados";
import { useProducts } from "@/hooks/useSupabaseData";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: Consignado | null;
}

export function ConsignadoTrocaDialog({ open, onOpenChange, item }: Props) {
  const { data: products } = useProducts();
  const { user, profile } = useAuth();

  const [novoProdutoId, setNovoProdutoId] = useState("");
  const [novaQuantidade, setNovaQuantidade] = useState(1);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const activeProducts = products.filter(p => p.status === "active" && p.stock > 0 && p.id !== item?.produto_id);
  const filtered = search
    ? activeProducts.filter(p => matchesProductSearch(p, search))
    : activeProducts.slice(0, 30);

  const novoProduto = products.find(p => p.id === novoProdutoId);

  const novoTotal = novoProduto ? novaQuantidade * Number(novoProduto.retail_price) : 0;
  const diferenca = item ? novoTotal - Number(item.valor_total) : 0;

  const handleSubmit = async () => {
    if (!item || !novoProdutoId) { toast.error("Selecione o novo produto"); return; }

    setSubmitting(true);
    try {
      const result = await createConsignadoTroca({
        consignado_original_id: item.id,
        novo_produto_id: novoProdutoId,
        novo_quantidade: novaQuantidade,
        novo_valor_unitario: Number(novoProduto!.retail_price),
        filial_id: item.filial_id,
        cliente_id: item.cliente_id,
        vendedor_nome: item.vendedor_nome,
        usuario_id: user?.id || "",
        usuario_nome: profile?.nome || "",
        original_produto_id: item.produto_id,
        original_quantidade: item.quantidade,
        original_valor_total: Number(item.valor_total),
      });

      const msg = result.tipo_diferenca === "igual"
        ? "Troca realizada sem diferença de valor!"
        : result.tipo_diferenca === "cliente_paga"
          ? `Troca realizada. Cliente deve pagar: R$ ${result.diferenca.toFixed(2)}`
          : `Troca realizada. Crédito gerado: R$ ${Math.abs(result.diferenca).toFixed(2)}`;

      toast.success(msg);
      onOpenChange(false);
      setNovoProdutoId("");
      setSearch("");
      setNovaQuantidade(1);
    } catch (err: any) {
      toast.error(err.message || "Erro na troca");
    } finally {
      setSubmitting(false);
    }
  };

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Trocar Produto — {item.codigo}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 rounded-md bg-muted text-sm">
            <p className="font-medium">Produto atual:</p>
            <p>{item.produto_referencia || item.produto_code} — {item.produto_model}</p>
            <p>{item.quantidade} un. · R$ {Number(item.valor_total).toFixed(2)}</p>
          </div>

          <div>
            <Label>Novo Produto *</Label>
            <Input
              placeholder="Buscar por referência ou código..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="mb-2"
            />
            {search && filtered.length > 0 && !novoProdutoId && (
              <div className="max-h-40 overflow-y-auto border rounded-md">
                {filtered.map(p => (
                  <button
                    key={p.id}
                    className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b last:border-0"
                    onClick={() => {
                      setNovoProdutoId(p.id);
                      setSearch(p.referencia);
                    }}
                  >
                    <span className="font-medium">{p.referencia}</span>
                    <span className="text-muted-foreground ml-2">{p.model} · R$ {Number(p.retail_price).toFixed(2)}</span>
                  </button>
                ))}
              </div>
            )}
            {novoProduto && (
              <div className="text-sm p-2 rounded bg-muted mt-1">
                <strong>{novoProduto.referencia}</strong> — R$ {Number(novoProduto.retail_price).toFixed(2)}
                <Button variant="link" size="sm" className="ml-2 h-auto p-0" onClick={() => { setNovoProdutoId(""); setSearch(""); }}>Trocar</Button>
              </div>
            )}
          </div>

          <div>
            <Label>Quantidade</Label>
            <Input type="number" min={1} value={novaQuantidade} onChange={e => setNovaQuantidade(Number(e.target.value))} />
          </div>

          {novoProduto && (
            <div className="p-3 rounded-md border space-y-1">
              <p className="text-sm">Novo total: <strong>R$ {novoTotal.toFixed(2)}</strong></p>
              <div className="flex items-center gap-2">
                <span className="text-sm">Diferença:</span>
                {diferenca === 0 ? (
                  <Badge variant="secondary">Sem diferença</Badge>
                ) : diferenca > 0 ? (
                  <Badge variant="destructive">Cliente paga R$ {diferenca.toFixed(2)}</Badge>
                ) : (
                  <Badge variant="outline" className="text-emerald-600">Crédito R$ {Math.abs(diferenca).toFixed(2)}</Badge>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Processando..." : "Confirmar Troca"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
