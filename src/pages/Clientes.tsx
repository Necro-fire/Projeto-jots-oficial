import { useState, useMemo } from "react";
import { Search, Plus, Users, Pencil, Trash2, History } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFilial } from "@/contexts/FilialContext";
import { FilialSelector } from "@/components/FilialSelector";
import { useClients } from "@/hooks/useSupabaseData";
import { ClientFormDialog } from "@/components/ClientFormDialog";
import { ClientHistoryDialog } from "@/components/ClientHistoryDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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

export default function Clientes() {
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteStep, setDeleteStep] = useState<"idle" | "has-purchases" | "final" | "simple">("idle");
  const [checkingPurchases, setCheckingPurchases] = useState(false);
  const [historyClient, setHistoryClient] = useState<{ id: string; name: string } | null>(null);
  const { selectedFilial } = useFilial();
  const { data: clients, refetch } = useClients();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('Clientes', 'create');
  const canEdit = hasPermission('Clientes', 'edit');
  const canDelete = hasPermission('Clientes', 'delete');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return clients.filter(
      (c) =>
        !search ||
        c.responsible_name.toLowerCase().includes(q) ||
        c.store_name.toLowerCase().includes(q) ||
        c.cnpj.includes(search) ||
        c.cpf.includes(search) ||
        c.phone.includes(search)
    );
  }, [clients, search]);

  const { filiais } = useFilial();
  const getFilialName = (filialId: string) =>
    filiais.find((f) => f.id === filialId)?.name || filialId;

  const handleEdit = (client: any) => {
    setEditingClient({
      id: client.id,
      responsible_name: client.responsible_name,
      store_name: client.store_name,
      tipo_cliente: client.tipo_cliente || "pf",
      cnpj: client.cnpj,
      inscricao_estadual: client.inscricao_estadual || "",
      phone: client.phone,
      email: client.email,
      cep: "",
      endereco: client.endereco || "",
      bairro: (client as any).bairro || "",
      cidade: client.city || "",
      estado: client.state || "",
      data_nascimento: client.data_nascimento || "",
      observacoes: client.observacoes || "",
      filial_id: client.filial_id,
    });
    setShowForm(true);
  };

  const startDelete = async (clientId: string) => {
    setDeletingId(clientId);
    setCheckingPurchases(true);
    try {
      const { count } = await (supabase as any)
        .from("vendas")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .neq("status", "cancelada");
      if ((count ?? 0) > 0) {
        setDeleteStep("has-purchases");
      } else {
        setDeleteStep("simple");
      }
    } catch {
      setDeleteStep("simple");
    } finally {
      setCheckingPurchases(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      // Desvincular vendas do cliente antes de excluir
      await (supabase as any)
        .from("vendas")
        .update({ client_id: null })
        .eq("client_id", deletingId);

      const { error } = await (supabase as any)
        .from("clientes")
        .delete()
        .eq("id", deletingId);
      if (error) throw error;
      toast.success("Cliente excluído");
      refetch();
    } catch {
      toast.error("Erro ao excluir cliente");
    }
    setDeletingId(null);
    setDeleteStep("idle");
  };

  const cancelDelete = () => {
    setDeletingId(null);
    setDeleteStep("idle");
  };

  const handleNew = () => {
    setEditingClient(null);
    setShowForm(true);
  };

  return (
    <div>
      <FilialSelector />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-title font-semibold tracking-tighter">Clientes</h1>
            <p className="text-ui text-muted-foreground">{filtered.length} clientes</p>
          </div>
          {canCreate && (
            <Button size="sm" className="gap-1.5" onClick={handleNew}>
              <Plus className="h-4 w-4" />
              Novo Cliente
            </Button>
          )}
        </div>

        {clients.length > 0 && (
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, CPF/CNPJ ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        )}

        {filtered.length > 0 ? (
          <div className="space-y-1">
            {filtered.map((client) => (
              <div
                key={client.id}
                className="flex items-center justify-between py-3 px-4 rounded-md hover:bg-secondary/50 transition-colors group"
              >
                <div className="min-w-0">
                  <p className="text-ui font-medium">{client.responsible_name}</p>
                  {client.store_name && client.store_name !== client.responsible_name && (
                    <p className="text-caption text-muted-foreground">Fantasia: {client.store_name}</p>
                  )}
                  <p className="text-caption text-muted-foreground">
                    {(client as any).tipo_cliente === "pj" ? "PJ" : "PF"} · {client.cnpj} · {client.phone}
                  </p>
                  {client.email && (
                    <p className="text-caption text-muted-foreground">{client.email}</p>
                  )}
                  {(client.endereco || (client as any).bairro || client.city || client.state) && (
                    <p className="text-caption text-muted-foreground">
                      {[client.endereco, (client as any).bairro, client.city, client.state]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {selectedFilial === "all" && (
                    <Badge variant="outline" className="text-caption">
                      {getFilialName(client.filial_id)}
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setHistoryClient({ id: client.id, name: client.responsible_name })}
                    title="Histórico"
                  >
                    <History className="h-3.5 w-3.5" />
                  </Button>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleEdit(client)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                      onClick={() => startDelete(client.id)}
                      disabled={checkingPurchases}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Users className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-ui font-medium">Nenhum cliente cadastrado</p>
            <p className="text-caption mt-1">Cadastre seu primeiro cliente para começar</p>
            {canCreate && (
              <Button size="sm" className="mt-4 gap-1.5" onClick={handleNew}>
                <Plus className="h-4 w-4" />
                Adicionar Cliente
              </Button>
            )}
          </div>
        )}
      </div>

      <ClientFormDialog
        open={showForm}
        onOpenChange={(v) => {
          setShowForm(v);
          if (!v) setEditingClient(null);
        }}
        editingClient={editingClient}
      />

      <ClientHistoryDialog
        open={!!historyClient}
        onOpenChange={(v) => !v && setHistoryClient(null)}
        clientId={historyClient?.id ?? null}
        clientName={historyClient?.name ?? ""}
      />

      {/* Step 1: Client has purchases warning */}
      <AlertDialog
        open={deleteStep === "has-purchases"}
        onOpenChange={() => {}}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cliente com compras registradas</AlertDialogTitle>
            <AlertDialogDescription>
              Este cliente possui compras registradas. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDelete}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setDeleteStep("final");
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Step 2: Final confirmation when client has purchases */}
      <AlertDialog open={deleteStep === "final"} onOpenChange={() => {}}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este cliente? Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDelete}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Simple confirmation when client has no purchases */}
      <AlertDialog open={deleteStep === "simple"} onOpenChange={() => {}}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja remover este cliente?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDelete}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
