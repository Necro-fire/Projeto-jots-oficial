import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Eye, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useHistoricoCompras } from "@/hooks/useHistoricoCompras";
import { useFornecedores } from "@/hooks/useFornecedores";
import { NovaCompraDialog } from "@/components/NovaCompraDialog";
import { CompraDetailDialog } from "@/components/CompraDetailDialog";
import { useAuth } from "@/contexts/AuthContext";
import type { CompraComFornecedor } from "@/hooks/useHistoricoCompras";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d: string) => new Date(d).toLocaleDateString("pt-BR");

export default function HistoricoCompras() {
  const { data: compras, loading, refetch } = useHistoricoCompras();
  const { data: fornecedores } = useFornecedores();
  const { hasPermission, isAdmin } = useAuth();

  const [search, setSearch] = useState("");
  const [fornecedorFilter, setFornecedorFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [selectedCompra, setSelectedCompra] = useState<CompraComFornecedor | null>(null);

  const canCreate = hasPermission("fornecedores", "create") || isAdmin;

  const filtered = useMemo(() => {
    return compras.filter(c => {
      const term = search.toUpperCase();
      const matchSearch = !term ||
        c.codigo?.toUpperCase().includes(term) ||
        c.descricao?.toUpperCase().includes(term) ||
        c.fornecedor?.nome?.toUpperCase().includes(term);
      const matchFornecedor = fornecedorFilter === "all" || c.fornecedor_id === fornecedorFilter;
      const matchDateFrom = !dateFrom || c.data_compra >= dateFrom;
      const matchDateTo = !dateTo || c.data_compra <= dateTo + "T23:59:59";
      return matchSearch && matchFornecedor && matchDateFrom && matchDateTo;
    });
  }, [compras, search, fornecedorFilter, dateFrom, dateTo]);

  const totalGeral = filtered.reduce((sum, c) => sum + c.valor_total, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Histórico de Compras</h1>
          <p className="text-sm text-muted-foreground">Controle de compras com fornecedores</p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nova Compra
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por código, descrição ou fornecedor..."
              value={search}
              onChange={e => setSearch(e.target.value)}
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
        <div>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" />
        </div>
        <div>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" />
        </div>
      </div>

      {/* Summary */}
      <div className="flex gap-4">
        <div className="bg-card border rounded-lg px-4 py-3">
          <p className="text-xs text-muted-foreground">Total de Compras</p>
          <p className="text-xl font-bold">{filtered.length}</p>
        </div>
        <div className="bg-card border rounded-lg px-4 py-3">
          <p className="text-xs text-muted-foreground">Valor Total</p>
          <p className="text-xl font-bold text-primary">{fmt(totalGeral)}</p>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-center text-muted-foreground py-8">Carregando...</p>
      ) : filtered.length === 0 ? (
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
              {filtered.map(compra => (
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

      <NovaCompraDialog open={showNew} onOpenChange={setShowNew} onSuccess={refetch} />
      <CompraDetailDialog open={!!selectedCompra} onOpenChange={v => { if (!v) setSelectedCompra(null); }} compra={selectedCompra} />
    </div>
  );
}
