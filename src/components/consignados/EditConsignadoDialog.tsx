import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClients } from "@/hooks/useSupabaseData";
import { useAuth } from "@/contexts/AuthContext";
import { editarConsignado, type Consignado } from "@/hooks/useConsignados";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: Consignado | null;
}

export function EditConsignadoDialog({ open, onOpenChange, item }: Props) {
  const { data: clients } = useClients();
  const { user, profile } = useAuth();

  const [clienteId, setClienteId] = useState("");
  const [quantidade, setQuantidade] = useState(0);
  const [observacoes, setObservacoes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (item) {
      setClienteId(item.cliente_id || "none");
      setQuantidade(item.quantidade);
      setObservacoes(item.observacoes || "");
    }
  }, [item]);

  const handleSubmit = async () => {
    if (!item) return;
    if (quantidade < 1) { toast.error("Quantidade inválida"); return; }

    setSubmitting(true);
    try {
      // Uma transação no banco: atualiza o consignado, ajusta o estoque pela diferença e registra o histórico.
      await editarConsignado({
        consignado_id: item.id,
        cliente_id: clienteId === "none" ? null : clienteId,
        quantidade,
        observacoes,
      });

      toast.success("Consignado atualizado!");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Consignado — {item?.codigo}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Produto</Label>
            <Input value={`${item?.produto_referencia || item?.produto_code} — ${item?.produto_model}`} disabled />
          </div>

          <div>
            <Label>Cliente</Label>
            <Select value={clienteId} onValueChange={setClienteId}>
              <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem cliente</SelectItem>
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.store_name} — {c.responsible_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Quantidade</Label>
            <Input type="number" min={1} value={quantidade} onChange={e => setQuantidade(Number(e.target.value))} />
          </div>

          {item && (
            <div className="text-sm text-muted-foreground">
              Valor total: <strong>R$ {(quantidade * Number(item.valor_unitario)).toFixed(2)}</strong>
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
            {submitting ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
