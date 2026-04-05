import { useState, useMemo } from "react";
import { Package, RotateCcw, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFilial } from "@/contexts/FilialContext";
import { FilialSelector } from "@/components/FilialSelector";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect, useCallback } from "react";
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

interface ConsignedItem {
  id: string;
  venda_id: string;
  venda_number: number;
  client_name: string;
  produto_id: string;
  product_code: string;
  product_model: string;
  quantity: number;
  unit_price: number;
  total: number;
  created_at: string;
  status_consignado: "consignado" | "retornou" | "nao_retornou";
}

export default function ProdutosConsignados() {
  const { selectedFilial } = useFilial();
  const [items, setItems] = useState<ConsignedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState<{ item: ConsignedItem; action: "retornou" | "nao_retornou" } | null>(null);

  const fetchConsigned = useCallback(async () => {
    setLoading(true);
    let query = (supabase as any)
      .from("venda_items")
      .select("*, vendas!inner(number, client_name, filial_id, origin, created_at)")
      .eq("vendas.origin", "consignado");

    if (selectedFilial !== "all") {
      query = query.eq("vendas.filial_id", selectedFilial);
    }

    const { data, error } = await query;
    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    const mapped: ConsignedItem[] = (data || []).map((row: any) => ({
      id: row.id,
      venda_id: row.venda_id,
      venda_number: row.vendas?.number || 0,
      client_name: row.vendas?.client_name || "",
      produto_id: row.produto_id,
      product_code: row.product_code,
      product_model: row.product_model,
      quantity: row.quantity,
      unit_price: row.unit_price,
      total: row.total,
      created_at: row.vendas?.created_at || row.created_at || "",
      status_consignado: row.status === "consignado_retornou"
        ? "retornou"
        : row.status === "consignado_nao_retornou"
          ? "nao_retornou"
          : "consignado",
    }));

    setItems(mapped);
    setLoading(false);
  }, [selectedFilial]);

  useEffect(() => {
    fetchConsigned();
    const channel = supabase
      .channel("consignados-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "venda_items" }, () => fetchConsigned())
      .on("postgres_changes", { event: "*", schema: "public", table: "vendas" }, () => fetchConsigned())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchConsigned]);

  const handleAction = async () => {
    if (!confirmAction) return;
    const { item, action } = confirmAction;

    try {
      if (action === "retornou") {
        // Mark as returned and restore stock
        await (supabase as any)
          .from("venda_items")
          .update({ status: "consignado_retornou" })
          .eq("id", item.id);

        // Restore stock
        const { data: venda } = await (supabase as any)
          .from("vendas")
          .select("filial_id")
          .eq("id", item.venda_id)
          .single();

        if (venda) {
          const { data: estoque } = await (supabase as any)
            .from("estoque")
            .select("id, quantidade")
            .eq("produto_id", item.produto_id)
            .eq("filial_id", venda.filial_id)
            .maybeSingle();

          if (estoque) {
            const newQty = estoque.quantidade + item.quantity;
            await (supabase as any).from("estoque").update({ quantidade: newQty }).eq("id", estoque.id);
            await (supabase as any).from("produtos").update({ stock: newQty }).eq("id", item.produto_id);
          } else {
            await (supabase as any).from("estoque").insert({
              produto_id: item.produto_id,
              filial_id: venda.filial_id,
              quantidade: item.quantity,
            });
            await (supabase as any).from("produtos").update({ stock: item.quantity }).eq("id", item.produto_id);
          }
        }

        toast.success("Produto marcado como retornado e estoque atualizado!");
      } else {
        await (supabase as any)
          .from("venda_items")
          .update({ status: "consignado_nao_retornou" })
          .eq("id", item.id);
        toast.success("Produto marcado como não retornado.");
      }

      setConfirmAction(null);
      fetchConsigned();
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar status");
      setConfirmAction(null);
    }
  };

  const pending = items.filter(i => i.status_consignado === "consignado");
  const resolved = items.filter(i => i.status_consignado !== "consignado");

  return (
    <div>
      <FilialSelector />
      <div className="p-4 space-y-4">
        <div>
          <h1 className="text-title font-semibold tracking-tighter">Produtos Consignados</h1>
          <p className="text-ui text-muted-foreground">{pending.length} pendentes · {resolved.length} resolvidos</p>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-center py-8">Carregando...</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Package className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-ui font-medium">Nenhum produto consignado</p>
            <p className="text-caption mt-1">Produtos consignados aparecerão aqui</p>
          </div>
        ) : (
          <div className="space-y-6">
            {pending.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-ui font-semibold">Pendentes</h2>
                <div className="space-y-2">
                  {pending.map(item => (
                    <div key={item.id} className="rounded-lg border bg-card p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-ui font-medium">{item.product_code}</span>
                          <Badge variant="outline" className="text-caption">Venda #{item.venda_number}</Badge>
                        </div>
                        <p className="text-caption text-muted-foreground">{item.product_model} · {item.client_name}</p>
                        <p className="text-caption text-muted-foreground">
                          {item.quantity} un. · R$ {Number(item.total).toFixed(2)} · {new Date(item.created_at).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                          onClick={() => setConfirmAction({ item, action: "retornou" })}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Retornou
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => setConfirmAction({ item, action: "nao_retornou" })}
                        >
                          <X className="h-3.5 w-3.5" />
                          Não retornou
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {resolved.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-ui font-semibold">Resolvidos</h2>
                <div className="space-y-2">
                  {resolved.map(item => (
                    <div key={item.id} className="rounded-lg border bg-card p-3 flex items-center justify-between gap-3 opacity-70">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-ui font-medium">{item.product_code}</span>
                          <Badge variant="outline" className="text-caption">Venda #{item.venda_number}</Badge>
                        </div>
                        <p className="text-caption text-muted-foreground">{item.product_model} · {item.client_name}</p>
                      </div>
                      <Badge variant={item.status_consignado === "retornou" ? "secondary" : "destructive"} className="text-caption">
                        {item.status_consignado === "retornou" ? (
                          <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Retornou</span>
                        ) : (
                          "Não retornou"
                        )}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <AlertDialog open={!!confirmAction} onOpenChange={(o) => { if (!o) setConfirmAction(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmAction?.action === "retornou" ? "Confirmar retorno?" : "Confirmar não retorno?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmAction?.action === "retornou"
                  ? `O produto "${confirmAction.item.product_code}" será marcado como retornado e o estoque será restaurado automaticamente.`
                  : `O produto "${confirmAction?.item.product_code}" será marcado como não retornado. O estoque NÃO será alterado.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleAction}>
                Confirmar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
