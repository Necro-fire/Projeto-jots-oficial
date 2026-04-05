import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { ShoppingBag, Calendar, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ClientHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string | null;
  clientName: string;
}

interface VendaRow {
  id: string;
  number: number;
  total: number;
  discount: number;
  payment_method: string;
  origin: string;
  created_at: string;
}

export function ClientHistoryDialog({ open, onOpenChange, clientId, clientName }: ClientHistoryDialogProps) {
  const [vendas, setVendas] = useState<VendaRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !clientId) return;
    setLoading(true);
    (supabase as any)
      .from("vendas")
      .select("id, number, total, discount, payment_method, origin, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .then(({ data, error }: any) => {
        if (!error && data) setVendas(data);
        else setVendas([]);
        setLoading(false);
      });
  }, [open, clientId]);

  const totalReceita = vendas.reduce((acc, v) => acc + Number(v.total), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Histórico — {clientName}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">Carregando...</div>
        ) : vendas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <ShoppingBag className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">Cliente sem histórico de compras</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border bg-secondary/30 p-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <ShoppingBag className="h-3.5 w-3.5" /> Total de compras
                </p>
                <p className="text-lg font-semibold mt-1">{vendas.length}</p>
              </div>
              <div className="rounded-lg border bg-secondary/30 p-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5" /> Receita total
                </p>
                <p className="text-lg font-semibold mt-1 text-primary">
                  R$ {totalReceita.toFixed(2)}
                </p>
              </div>
            </div>

            {/* List */}
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {vendas.map((venda) => (
                <div
                  key={venda.id}
                  className="flex items-center justify-between py-2.5 px-3 rounded-md hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                      <Calendar className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Venda #{venda.number}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(venda.created_at).toLocaleDateString("pt-BR")} · {venda.payment_method}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium tabular-nums text-primary">
                      R$ {Number(venda.total).toFixed(2)}
                    </p>
                    <Badge variant="secondary" className="text-[10px]">
                      {venda.origin === "bag" ? "Mala" : "Estoque"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
