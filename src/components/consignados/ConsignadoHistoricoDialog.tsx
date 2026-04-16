import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchConsignadoHistorico, type ConsignadoHistorico } from "@/hooks/useConsignados";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  consignadoId: string;
  consignadoCodigo: string;
}

export function ConsignadoHistoricoDialog({ open, onOpenChange, consignadoId, consignadoCodigo }: Props) {
  const [historico, setHistorico] = useState<ConsignadoHistorico[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !consignadoId) return;
    setLoading(true);
    fetchConsignadoHistorico(consignadoId).then(data => {
      setHistorico(data);
      setLoading(false);
    });
  }, [open, consignadoId]);

  const acaoLabel: Record<string, string> = {
    criado: "Criado",
    status_alterado: "Status alterado",
    troca: "Troca realizada",
    criado_por_troca: "Criado por troca",
    venda_pdv: "Vendido via PDV",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Histórico — {consignadoCodigo}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-muted-foreground text-center py-6">Carregando...</p>
        ) : historico.length === 0 ? (
          <p className="text-muted-foreground text-center py-6">Nenhum registro</p>
        ) : (
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {historico.map(h => (
              <div key={h.id} className="border-b pb-2 last:border-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{acaoLabel[h.acao] || h.acao}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(h.created_at).toLocaleDateString("pt-BR")} {new Date(h.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                {h.usuario_nome && <p className="text-[11px] text-muted-foreground">Por: {h.usuario_nome}</p>}
                {h.detalhes && Object.keys(h.detalhes).length > 0 && (
                  <pre className="text-[11px] text-muted-foreground bg-muted rounded p-1 mt-1 overflow-x-auto">
                    {JSON.stringify(h.detalhes, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
