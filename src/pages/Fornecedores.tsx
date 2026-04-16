import { useState, useMemo } from "react";
import { Truck, Search, Plus, Pencil, Trash2, Package, ShoppingCart, Eye, Receipt } from "lucide-react";
import { FilialSelector } from "@/components/FilialSelector";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useFornecedores } from "@/hooks/useFornecedores";
import { useHistoricoCompras } from "@/hooks/useHistoricoCompras";
import { FornecedorFormDialog } from "@/components/FornecedorFormDialog";
import { FornecedorProdutosDialog } from "@/components/FornecedorProdutosDialog";
import { FornecedorComprasDialog } from "@/components/FornecedorComprasDialog";
import { NovaCompraDialog } from "@/components/NovaCompraDialog";
import { CompraDetailDialog } from "@/components/CompraDetailDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { CompraComFornecedor } from "@/hooks/useHistoricoCompras";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d: string) => new Date(d).toLocaleDateString("pt-BR");

export default function Fornecedores() {
  const [activeTab, setActiveTab] = useState("fornecedores");

  // --- Fornecedores state ---
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [produtosFornecedor, setProdutosFornecedor] = useState<{ id: string; nome: string; filial_id: string } | null>(null);
  const [novaCompraFornecedorId, setNovaCompraFornecedorId] = useState<string | null>(null);

  // --- Compras state ---
  const [compraSearch, setCompraSearch] = useState("");
  const [fornecedorFilter, setFornecedorFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showNewCompra, setShowNewCompra] = useState(false);
  const [selectedCompra, setSelectedCompra] = useState<CompraComFornecedor | null>(null);

  const { data: fornecedores, loading, refetch } = useFornecedores();
  const { data: compras, loading: comprasLoading, refetch: refetchCompras } = useHistoricoCompras();
  const { hasPermission, isAdmin } = useAuth();
  const canCreate = hasPermission("fornecedores", "create");
  const canEdit = hasPermission("fornecedores", "edit");
  const canCreateCompra = hasPermission("fornecedores", "create") || isAdmin;

  // --- Fornecedores filtered ---
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return fornecedores.filter(
      f => !search || f.nome.toLowerCase().includes(q) || f.codigo.toLowerCase().includes(q) || f.cnpj_cpf.includes(search)
    );
  }, [fornecedores, search]);

  // --- Compras filtered ---
  const filteredCompras = useMemo(() => {
    return compras.filter(c => {
      const term = compraSearch.toUpperCase();
      const matchSearch = !term ||
        c.codigo?.toUpperCase().includes(term) ||
        c.descricao?.toUpperCase().includes(term) ||
        c.fornecedor?.nome?.toUpperCase().includes(term);
      const matchFornecedor = fornecedorFilter === "all" || c.fornecedor_id === fornecedorFilter;
      const matchDateFrom = !dateFrom || c.data_compra >= dateFrom;
      const matchDateTo = !dateTo || c.data_compra <= dateTo + "T23:59:59";
      return matchSearch && matchFornecedor && matchDateFrom && matchDateTo;
    });
  }, [compras, compraSearch, fornecedorFilter, dateFrom, dateTo]);

  const totalGeral = filteredCompras.reduce((sum, c) => sum + c.valor_total, 0);

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
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="fornecedores" className="gap-1.5">
              <Truck className="h-4 w-4" /> Fornecedores
            </TabsTrigger>
            <TabsTrigger value="compras" className="gap-1.5">
              <Receipt className="h-4 w-4" /> Histórico de Compras
            </TabsTrigger>
          </TabsList>

          {/* ===== TAB: FORNECEDORES ===== */}
          <TabsContent value="fornecedores" className="space-y-4 mt-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="relative max-w-sm flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, código ou CNPJ..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              {canCreate && (
                <Button onClick={() => { setEditing(null); setShowForm(true); }}>
                  <Plus className="h-4 w-4 mr-1" /> Novo Fornecedor
                </Button>
              )}
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
                              onClick={() => setProdutosFornecedor({ id: f.id, nome: f.nome, filial_id: f.filial_id })}
                            >
                              <Package className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Nova Compra"
                              onClick={() => setNovaCompraFornecedorId(f.id)}
                            >
                              <ShoppingCart className="h-4 w-4" />
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
          </TabsContent>

          {/* ===== TAB: HISTÓRICO DE COMPRAS ===== */}
          <TabsContent value="compras" className="space-y-4 mt-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex flex-wrap gap-3 items-end flex-1">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por código, descrição ou fornecedor..."
                      value={compraSearch}
                      onChange={e => setCompraSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="w-48">
                  <Select value={fornecedorFilter} onValueChange={setFornecedorFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Fornecedor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos Fornecedores</SelectItem>
                      {fornecedores.map(f => (
                        <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" />
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" />
              </div>
              {canCreateCompra && (
                <Button onClick={() => setShowNewCompra(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Nova Compra
                </Button>
              )}
            </div>

            <div className="flex gap-4">
              <div className="bg-card border rounded-lg px-4 py-3">
                <p className="text-xs text-muted-foreground">Total de Compras</p>
                <p className="text-xl font-bold">{filteredCompras.length}</p>
              </div>
              <div className="bg-card border rounded-lg px-4 py-3">
                <p className="text-xs text-muted-foreground">Valor Total</p>
                <p className="text-xl font-bold text-primary">{fmt(totalGeral)}</p>
              </div>
            </div>

            {comprasLoading ? (
              <p className="text-center text-muted-foreground py-8">Carregando...</p>
            ) : filteredCompras.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhuma compra encontrada.</p>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Fornecedor</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Valor Total</TableHead>
                      <TableHead>Registrado por</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCompras.map(compra => (
                      <TableRow key={compra.id} className="cursor-pointer" onClick={() => setSelectedCompra(compra)}>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">{compra.codigo}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{fmtDate(compra.data_compra)}</TableCell>
                        <TableCell className="font-medium">{compra.fornecedor?.nome ?? "—"}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{compra.descricao || "—"}</TableCell>
                        <TableCell className="text-right font-medium whitespace-nowrap">{fmt(compra.valor_total)}</TableCell>
                        <TableCell className="text-muted-foreground">{compra.usuario_nome}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); setSelectedCompra(compra); }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      <FornecedorFormDialog open={showForm} onOpenChange={setShowForm} editing={editing} onSaved={refetch} />
      <FornecedorProdutosDialog open={!!produtosFornecedor} onOpenChange={v => { if (!v) setProdutosFornecedor(null); }} fornecedor={produtosFornecedor} />
      <FornecedorComprasDialog open={!!comprasFornecedor} onOpenChange={v => { if (!v) setComprasFornecedor(null); }} fornecedor={comprasFornecedor} />
      <NovaCompraDialog open={showNewCompra} onOpenChange={setShowNewCompra} onSuccess={refetchCompras} />
      <CompraDetailDialog open={!!selectedCompra} onOpenChange={v => { if (!v) setSelectedCompra(null); }} compra={selectedCompra} onRefetch={refetchCompras} />

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
