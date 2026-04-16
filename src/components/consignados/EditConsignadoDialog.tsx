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
import type { Consignado } from "@/hooks/useConsignados";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: Consignado | null;
}

export function EditConsignadoDialog({ open, onOpenChange, item }: Props) {
  const { data: clients } = useClients();
  const { user, profile } = useAuth();

  const [clienteId, setClienteId] = useState("");
  const [quantidade, setQuantidade] = useState(1);
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
      const valor_total = quantidade * Number(item.valor_unitario);
      const qtdDiff = quantidade - item.quantidade; // positive = more taken, negative = some returned

      const { error } = await (supabase as any)
        .from("consignados")
        .update({
          cliente_id: clienteId === "none" ? null : clienteId,
          quantidade,
          valor_total,
          observacoes,
        })
        .eq("id", item.id);

      if (error) throw error;

      // Adjust stock if quantity changed and item is still consignado
      if (qtdDiff !== 0 && item.status === "consignado") {
        const { data: estoque } = await (supabase as any)
          .from("estoque")
          .select("id, quantidade")
          .eq("produto_id", item.produto_id)
          .eq("filial_id", item.filial_id)
          .maybeSingle();

        if (estoque) {
          const newQty = Math.max(0, estoque.quantidade - qtdDiff);
          await (supabase as any).from("estoque").update({ quantidade: newQty }).eq("id", estoque.id);
          await (supabase as any).from("produtos").update({ stock: newQty }).eq("id", item.produto_id);
        }
      }

      // Log history
      await (supabase as any).from("consignado_historico").insert({
        consignado_id: item.id,
        acao: "editado",
        detalhes: { quantidade, observacoes, quantidade_anterior: item.quantidade },
        usuario_id: user?.id || null,
        usuario_nome: profile?.nome || "",
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
