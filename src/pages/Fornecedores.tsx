import { useState, useMemo } from "react";
import { Truck, Search, Plus, Pencil, Trash2, Package, History } from "lucide-react";
import { FilialSelector } from "@/components/FilialSelector";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useFornecedores } from "@/hooks/useFornecedores";
import { FornecedorFormDialog } from "@/components/FornecedorFormDialog";
import { FornecedorProdutosDialog } from "@/components/FornecedorProdutosDialog";
import { FornecedorComprasDialog } from "@/components/FornecedorComprasDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Fornecedores() {
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [produtosFornecedor, setProdutosFornecedor] = useState<{ id: string; nome: string } | null>(null);
  const [comprasFornecedor, setComprasFornecedor] = useState<{ id: string; nome: string } | null>(null);

  const { data: fornecedores, loading, refetch } = useFornecedores();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("fornecedores", "create");
  const canEdit = hasPermission("fornecedores", "edit");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return fornecedores.filter(
      f => !search || f.nome.toLowerCase().includes(q) || f.codigo.toLowerCase().includes(q) || f.cnpj_cpf.includes(search)
    );
  }, [fornecedores, search]);

  const handleEdit = (f: any) => {
    setEditing(f);
    setShowForm(true);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    const { error } = await (supabase as any).from("fornecedores").delete().eq("id", deletingId);
    if (error) toast.error("Erro ao excluir");
    else { toast.success("Fornecedor excluído"); refetch(); }
    setDeletingId(null);
  };

  return (
    <div>
      <FilialSelector />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-title font-semibold tracking-tighter">Fornecedores</h1>
            <p className="text-ui text-muted-foreground">Gestão de fornecedores e compras</p>
          </div>
          {canCreate && (
            <Button onClick={() => { setEditing(null); setShowForm(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Novo Fornecedor
            </Button>
          )}
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, código ou CNPJ..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Truck className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-ui font-medium">Nenhum fornecedor encontrado</p>
            <p className="text-caption mt-1">
              {fornecedores.length === 0
                ? "Cadastre seu primeiro fornecedor."
                : "Tente ajustar o filtro de busca."}
            </p>
          </div>
        ) : (
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>CNPJ/CPF</TableHead>
                  <TableHead>Cidade/UF</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(f => (
                  <TableRow key={f.id}>
                    <TableCell className="font-mono text-xs">{f.codigo}</TableCell>
                    <TableCell className="font-medium">{f.nome}</TableCell>
                    <TableCell>{f.cnpj_cpf || "—"}</TableCell>
                    <TableCell>{f.cidade ? `${f.cidade}/${f.estado}` : "—"}</TableCell>
                    <TableCell>{f.telefone || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={f.status === "active" ? "default" : "secondary"}>
                        {f.status === "active" ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Produtos"
                          onClick={() => setProdutosFornecedor({ id: f.id, nome: f.nome })}
                        >
                          <Package className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Histórico de Compras"
                          onClick={() => setComprasFornecedor({ id: f.id, nome: f.nome })}
                        >
                          <History className="h-4 w-4" />
                        </Button>
                        {canEdit && (
                          <Button size="icon" variant="ghost" title="Editar" onClick={() => handleEdit(f)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canEdit && (
                          <Button size="icon" variant="ghost" title="Excluir" onClick={() => setDeletingId(f.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <FornecedorFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        editing={editing}
        onSaved={refetch}
      />

      <FornecedorProdutosDialog
        open={!!produtosFornecedor}
        onOpenChange={v => { if (!v) setProdutosFornecedor(null); }}
        fornecedor={produtosFornecedor}
      />

      <FornecedorComprasDialog
        open={!!comprasFornecedor}
        onOpenChange={v => { if (!v) setComprasFornecedor(null); }}
        fornecedor={comprasFornecedor}
      />

      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fornecedor?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os vínculos e histórico de compras serão removidos.
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
