import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { createConsignado } from "@/hooks/useConsignados";
import { useProducts, useClients } from "@/hooks/useSupabaseData";
import { useAuth } from "@/contexts/AuthContext";
import { matchesProductSearch } from "@/lib/productSearch";
import { useFilial } from "@/contexts/FilialContext";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NovoConsignadoDialog({ open, onOpenChange }: Props) {
  const { data: products } = useProducts();
  const { data: clients } = useClients();
  const { user, profile } = useAuth();
  const { selectedFilial } = useFilial();

  const [produtoId, setProdutoId] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [quantidade, setQuantidade] = useState(1);
  const [observacoes, setObservacoes] = useState("");
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const activeProducts = products.filter(p => p.status === "active" && p.stock > 0);
  const filteredProducts = search
    ? activeProducts.filter(p => matchesProductSearch(p, search))
    : activeProducts.slice(0, 50);

  const selectedProduct = products.find(p => p.id === produtoId);

  const handleSubmit = async () => {
    if (!produtoId) { toast.error("Selecione um produto"); return; }
    if (quantidade < 1) { toast.error("Quantidade inválida"); return; }
    if (selectedFilial === "all") { toast.error("Selecione uma filial específica"); return; }

    setSubmitting(true);
    try {
      await createConsignado({
        produto_id: produtoId,
        cliente_id: clienteId || null,
        filial_id: selectedFilial,
        quantidade,
        valor_unitario: Number(selectedProduct?.retail_price || 0),
        vendedor_nome: profile?.nome || "",
        observacoes,
        usuario_id: user?.id || "",
        usuario_nome: profile?.nome || "",
      });
      toast.success("Produto consignado registrado!");
      onOpenChange(false);
      setProdutoId("");
      setClienteId("");
      setQuantidade(1);
      setObservacoes("");
      setSearch("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao registrar consignado");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo Produto Consignado</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Produto *</Label>
            <Input
              placeholder="Buscar por referência, código ou modelo..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="mb-2"
            />
            {search && filteredProducts.length > 0 && !produtoId && (
              <div className="max-h-40 overflow-y-auto border rounded-md">
                {filteredProducts.map(p => (
                  <button
                    key={p.id}
                    className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b last:border-0"
                    onClick={() => {
                      setProdutoId(p.id);
                      setSearch(p.referencia);
                    }}
                  >
                    <span className="font-medium">{p.referencia}</span>
                    <span className="text-muted-foreground ml-2">{p.model} · Estoque: {p.stock} · R$ {Number(p.retail_price).toFixed(2)}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedProduct && (
              <div className="text-sm p-2 rounded bg-muted mt-1">
                <strong>{selectedProduct.referencia}</strong> — {selectedProduct.model} — R$ {Number(selectedProduct.retail_price).toFixed(2)}
                <Button variant="link" size="sm" className="ml-2 h-auto p-0" onClick={() => { setProdutoId(""); setSearch(""); }}>Trocar</Button>
              </div>
            )}
          </div>

          <div>
            <Label>Cliente</Label>
            <Select value={clienteId} onValueChange={setClienteId}>
              <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
              <SelectContent>
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.store_name} — {c.responsible_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Quantidade *</Label>
            <Input
              type="number"
              min={1}
              max={selectedProduct?.stock || 999}
              value={quantidade}
              onChange={e => setQuantidade(Number(e.target.value))}
            />
          </div>

          {selectedProduct && (
            <div className="text-sm text-muted-foreground">
              Valor total: <strong>R$ {(quantidade * Number(selectedProduct.retail_price)).toFixed(2)}</strong>
            </div>
          )}

          <div>
            <Label>Observações</Label>
            <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Registrando..." : "Registrar Consignado"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
