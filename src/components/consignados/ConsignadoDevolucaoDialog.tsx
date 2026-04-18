import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumericStepper } from "@/components/ui/numeric-stepper";
import { toast } from "sonner";
import { devolverConsignadoParcial, type Consignado } from "@/hooks/useConsignados";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: Consignado | null;
}

export function ConsignadoDevolucaoDialog({ open, onOpenChange, item }: Props) {
  const { user, profile } = useAuth();
  const [qty, setQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (item) setQty(item.quantidade);
  }, [item?.id, item?.quantidade]);

  if (!item) return null;

  const valorUnit = Number(item.valor_unitario);
  const valorDevolvido = qty * valorUnit;
  const restante = item.quantidade - qty;
  const valorRestante = restante * valorUnit;

  const handleSubmit = async () => {
    if (qty <= 0 || qty > item.quantidade) {
      toast.error(`Quantidade deve estar entre 1 e ${item.quantidade}`);
      return;
    }
    setSubmitting(true);
    try {
      const result = await devolverConsignadoParcial({
        consignado_id: item.id,
        quantidade_devolver: qty,
        produto_id: item.produto_id,
        filial_id: item.filial_id,
        valor_unitario: valorUnit,
        cliente_id: item.cliente_id,
        vendedor_nome: item.vendedor_nome,
        usuario_id: user?.id || "",
        usuario_nome: profile?.nome || "",
        quantidade_total: item.quantidade,
      });
      toast.success(
        result.restante > 0
          ? `Devolução parcial: ${result.devolvidoQty} un. devolvidas, ${result.restante} continuam consignadas.`
          : `Devolução total: ${result.devolvidoQty} un. devolvidas ao estoque.`
      );
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao devolver");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Devolver — {item.codigo}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 rounded-md bg-muted text-sm space-y-1">
            <p className="font-medium">{item.produto_referencia || item.produto_code} — {item.produto_model}</p>
            <p className="tabular-nums text-muted-foreground">{item.quantidade} un. · R$ {valorUnit.toFixed(2)} cada</p>
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <Label>Quantidade a devolver</Label>
            <div className="flex items-center justify-between">
              <NumericStepper value={qty} onChange={setQty} min={1} max={item.quantidade} />
              <span className="text-caption text-muted-foreground">de {item.quantidade}</span>
            </div>
          </div>

          <div className="rounded-md border p-3 text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor devolvido (estorno):</span>
              <span className="font-semibold tabular-nums text-blue-600">R$ {valorDevolvido.toFixed(2)}</span>
            </div>
            {restante > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Restante consignado:</span>
                <span className="tabular-nums">{restante} un. · R$ {valorRestante.toFixed(2)}</span>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground pt-1">
              {qty} un. retornarão ao estoque. {restante > 0 ? "O restante continua sob consignação do cliente." : "O registro será marcado como devolvido."}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Processando..." : "Confirmar Devolução"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
