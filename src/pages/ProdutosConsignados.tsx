import { useState, useMemo, useEffect } from "react";
import { Plus, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FilialSelector } from "@/components/FilialSelector";
import { useConsignados, updateConsignadoStatus, type Consignado } from "@/hooks/useConsignados";
import { useClients } from "@/hooks/useSupabaseData";
import { useAuth } from "@/contexts/AuthContext";
import { useFilial } from "@/contexts/FilialContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ConsignadoDashboard } from "@/components/consignados/ConsignadoDashboard";
import { ConsignadoList } from "@/components/consignados/ConsignadoList";
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
  const { data: clients } = useClients();
  const { user, profile } = useAuth();
  const { selectedFilial, setSelectedFilial, filiais, isFilialRestricted } = useFilial();
  const navigate = useNavigate();

  // Force a single-filial selection: consignment cannot run on "all"
  useEffect(() => {
    if (selectedFilial === "all" && !isFilialRestricted && filiais.length > 0) {
      setSelectedFilial(filiais[0].id);
    }
  }, [selectedFilial, isFilialRestricted, filiais, setSelectedFilial]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clienteFilter, setClienteFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [trocadosCount, setTrocadosCount] = useState(0);

  const [editingItem, setEditingItem] = useState<Consignado | null>(null);
  const [historicoItem, setHistoricoItem] = useState<Consignado | null>(null);
  const [trocaItem, setTrocaItem] = useState<Consignado | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ item: Consignado; action: "vendido" | "devolvido" } | null>(null);
  const [deletingItem, setDeletingItem] = useState<Consignado | null>(null);

  const handleNovoConsignado = () => {
    if (selectedFilial === "all") {
      toast.error("Selecione uma filial específica antes de iniciar uma consignação");
      return;
    }
    navigate("/pdv", { state: { consignacaoMode: true, filialId: selectedFilial } });
  };

  // Fetch trocas count for chart
  useEffect(() => {
    (async () => {
      const { count } = await (supabase as any)
        .from("consignado_trocas")
        .select("id", { count: "exact", head: true });
      setTrocadosCount(count || 0);
    })();
  }, [items.length]);

  const filtered = useMemo(() => {
    let result = items;
    if (statusFilter !== "all") {
      result = result.filter(i => i.status === statusFilter);
    }
    if (clienteFilter !== "all") {
      result = result.filter(i => i.cliente_id === clienteFilter);
    }
    if (dateFrom) {
      result = result.filter(i => i.created_at >= dateFrom);
    }
    if (dateTo) {
      result = result.filter(i => i.created_at <= dateTo + "T23:59:59");
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
  }, [items, search, statusFilter, clienteFilter, dateFrom, dateTo]);

  const handleVender = (item: Consignado) => {
    // Navigate to PDV with consignado pre-loaded
    navigate("/pdv", {
      state: {
        fromConsignado: {
          consignadoId: item.id,
          produtoId: item.produto_id,
          quantidade: item.quantidade,
          clienteId: item.cliente_id,
          filialId: item.filial_id,
        },
      },
    });
  };

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
      await (supabase as any).from("consignado_historico").delete().eq("consignado_id", deletingItem.id);
      await (supabase as any).from("consignado_trocas").delete().eq("consignado_original_id", deletingItem.id);
      await (supabase as any).from("consignado_trocas").delete().eq("consignado_novo_id", deletingItem.id);
      const { error } = await (supabase as any).from("consignados").delete().eq("id", deletingItem.id);
      if (error) throw error;

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

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setClienteFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const hasActiveFilters = search || statusFilter !== "all" || clienteFilter !== "all" || dateFrom || dateTo;

  return (
    <div>
      <FilialSelector hideAll />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-title font-semibold tracking-tighter">Produtos Consignados</h1>
            <p className="text-ui text-muted-foreground">{items.length} registros · Filial selecionada</p>
          </div>
          <Button onClick={handleNovoConsignado} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Novo Consignado
          </Button>
        </div>

        <ConsignadoDashboard items={items} trocadosCount={trocadosCount} />

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-end">
          <div className="relative flex-1 min-w-[200px]">
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
          <Select value={clienteFilter} onValueChange={setClienteFilter}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {clients.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.store_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" title="De" />
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" title="Até" />
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>Limpar</Button>
          )}
        </div>

        {loading ? (
          <p className="text-muted-foreground text-center py-8">Carregando...</p>
        ) : (
          <ConsignadoList
            items={filtered}
            onMarkVendido={handleVender}
            onMarkDevolvido={item => setConfirmAction({ item, action: "devolvido" })}
            onTrocar={item => setTrocaItem(item)}
            onHistorico={item => setHistoricoItem(item)}
            onEdit={item => setEditingItem(item)}
            onDelete={item => setDeletingItem(item)}
          />
        )}
      </div>

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
