import { useState, useMemo } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FilialSelector } from "@/components/FilialSelector";
import { useConsignados, updateConsignadoStatus, type Consignado } from "@/hooks/useConsignados";
import { useAuth } from "@/contexts/AuthContext";
import { useFilial } from "@/contexts/FilialContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ConsignadoDashboard } from "@/components/consignados/ConsignadoDashboard";
import { ConsignadoList } from "@/components/consignados/ConsignadoList";
import { NovoConsignadoDialog } from "@/components/consignados/NovoConsignadoDialog";
import { EditConsignadoDialog } from "@/components/consignados/EditConsignadoDialog";
import { ConsignadoHistoricoDialog } from "@/components/consignados/ConsignadoHistoricoDialog";
import { ConsignadoTrocaDialog } from "@/components/consignados/ConsignadoTrocaDialog";
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

export default function ProdutosConsignados() {
  const { data: items, loading } = useConsignados();
  const { user, profile } = useAuth();
  const { selectedFilial } = useFilial();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showNovo, setShowNovo] = useState(false);
  const [editingItem, setEditingItem] = useState<Consignado | null>(null);
  const [historicoItem, setHistoricoItem] = useState<Consignado | null>(null);
  const [trocaItem, setTrocaItem] = useState<Consignado | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ item: Consignado; action: "vendido" | "devolvido" } | null>(null);
  const [deletingItem, setDeletingItem] = useState<Consignado | null>(null);

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter !== "all") {
      result = result.filter(i => i.status === statusFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(i =>
        i.codigo.toLowerCase().includes(q) ||
        (i.produto_referencia || "").toLowerCase().includes(q) ||
        (i.produto_code || "").toLowerCase().includes(q) ||
        (i.produto_model || "").toLowerCase().includes(q) ||
        (i.cliente_nome || "").toLowerCase().includes(q) ||
        (i.cliente_loja || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [items, search, statusFilter]);

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    const { item, action } = confirmAction;
    try {
      await updateConsignadoStatus(item.id, action, {
        usuario_id: user?.id || "",
        usuario_nome: profile?.nome || "",
        filial_id: item.filial_id,
        produto_id: item.produto_id,
        quantidade: item.quantidade,
      });
      toast.success(action === "vendido" ? "Marcado como vendido!" : "Produto devolvido ao estoque!");
      setConfirmAction(null);
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar");
      setConfirmAction(null);
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    try {
      // Delete history first
      await (supabase as any).from("consignado_historico").delete().eq("consignado_id", deletingItem.id);
      // Delete trocas referencing this item
      await (supabase as any).from("consignado_trocas").delete().eq("consignado_original_id", deletingItem.id);
      await (supabase as any).from("consignado_trocas").delete().eq("consignado_novo_id", deletingItem.id);
      // Delete the consignado
      const { error } = await (supabase as any).from("consignados").delete().eq("id", deletingItem.id);
      if (error) throw error;

      // Restore stock if it was still consignado
      if (deletingItem.status === "consignado") {
        const { data: estoque } = await (supabase as any)
          .from("estoque")
          .select("id, quantidade")
          .eq("produto_id", deletingItem.produto_id)
          .eq("filial_id", deletingItem.filial_id)
          .maybeSingle();

        if (estoque) {
          const newQty = estoque.quantidade + deletingItem.quantidade;
          await (supabase as any).from("estoque").update({ quantidade: newQty }).eq("id", estoque.id);
          await (supabase as any).from("produtos").update({ stock: newQty }).eq("id", deletingItem.produto_id);
        }
      }

      toast.success("Consignado excluído!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir");
    }
    setDeletingItem(null);
  };

  return (
    <div>
      <FilialSelector />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-title font-semibold tracking-tighter">Produtos Consignados</h1>
            <p className="text-ui text-muted-foreground">{items.length} registros</p>
          </div>
          <Button onClick={() => setShowNovo(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Novo Consignado
          </Button>
        </div>

        <ConsignadoDashboard items={items} />

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por código, produto, cliente..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="consignado">Consignado</SelectItem>
              <SelectItem value="vendido">Vendido</SelectItem>
              <SelectItem value="devolvido">Devolvido</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-center py-8">Carregando...</p>
        ) : (
          <ConsignadoList
            items={filtered}
            onMarkVendido={item => setConfirmAction({ item, action: "vendido" })}
            onMarkDevolvido={item => setConfirmAction({ item, action: "devolvido" })}
            onTrocar={item => setTrocaItem(item)}
            onHistorico={item => setHistoricoItem(item)}
            onEdit={item => setEditingItem(item)}
            onDelete={item => setDeletingItem(item)}
          />
        )}
      </div>

      <NovoConsignadoDialog open={showNovo} onOpenChange={setShowNovo} />

      <EditConsignadoDialog
        open={!!editingItem}
        onOpenChange={o => { if (!o) setEditingItem(null); }}
        item={editingItem}
      />

      <ConsignadoHistoricoDialog
        open={!!historicoItem}
        onOpenChange={o => { if (!o) setHistoricoItem(null); }}
        consignadoId={historicoItem?.id || ""}
        consignadoCodigo={historicoItem?.codigo || ""}
      />

      <ConsignadoTrocaDialog
        open={!!trocaItem}
        onOpenChange={o => { if (!o) setTrocaItem(null); }}
        item={trocaItem}
      />

      {/* Confirm venda/devolução */}
      <AlertDialog open={!!confirmAction} onOpenChange={o => { if (!o) setConfirmAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.action === "vendido" ? "Confirmar venda?" : "Confirmar devolução?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.action === "vendido"
                ? `O item "${confirmAction.item.codigo}" será marcado como vendido.`
                : `O item "${confirmAction?.item.codigo}" será devolvido e o estoque restaurado.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAction}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm delete */}
      <AlertDialog open={!!deletingItem} onOpenChange={o => { if (!o) setDeletingItem(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir consignado?</AlertDialogTitle>
            <AlertDialogDescription>
              O registro "{deletingItem?.codigo}" será removido permanentemente.
              {deletingItem?.status === "consignado" && " O estoque será restaurado."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
