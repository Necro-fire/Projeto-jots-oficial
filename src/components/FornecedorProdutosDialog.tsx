import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useFornecedorProdutos } from "@/hooks/useFornecedores";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { matchesProductSearch } from "@/lib/productSearch";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fornecedor: { id: string; nome: string; filial_id: string } | null;
}

export function FornecedorProdutosDialog({ open, onOpenChange, fornecedor }: Props) {
  const { data: links, refetch } = useFornecedorProdutos(fornecedor?.id ?? null);
  const [search, setSearch] = useState("");
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!open || !fornecedor) return;

    (async () => {
      const { data } = await (supabase as any)
        .from("produtos")
        .select("id, code, model, category, retail_price, filial_id")
        .eq("filial_id", fornecedor.filial_id)
        .eq("status", "active")
        .order("model");
      setAllProducts(data || []);
    })();
  }, [open, fornecedor]);

  const linkedIds = useMemo(() => new Set(links.map((l: any) => l.produto_id)), [links]);

  const filteredProducts = useMemo(() => {
    return allProducts.filter(p =>
      !linkedIds.has(p.id) && matchesProductSearch(p, search)
    );
  }, [allProducts, search, linkedIds]);

  const handleLink = async (produtoId: string) => {
    if (!fornecedor) return;
    setAdding(true);
    const { error } = await (supabase as any)
      .from("fornecedor_produtos")
      .insert({ fornecedor_id: fornecedor.id, produto_id: produtoId });
    if (error) toast.error(error.message || "Erro ao vincular");
    else {
      toast.success("Produto vinculado");
      refetch();
    }
    setAdding(false);
  };

  const handleUnlink = async (linkId: string) => {
    const { error } = await (supabase as any)
      .from("fornecedor_produtos")
      .delete()
      .eq("id", linkId);
    if (error) toast.error("Erro ao desvincular");
    else {
      toast.success("Produto desvinculado");
      refetch();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Produtos de {fornecedor?.nome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Produtos vinculados ({links.length})</h4>
          {links.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum produto vinculado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((link: any) => (
                  <TableRow key={link.id}>
                    <TableCell className="font-mono text-xs">{link.produtos?.code}</TableCell>
                    <TableCell>{link.produtos?.model}</TableCell>
                    <TableCell><Badge variant="outline">{link.produtos?.category}</Badge></TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => handleUnlink(link.id)}>
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="space-y-2 border-t pt-3">
          <h4 className="text-sm font-medium text-muted-foreground">Adicionar produto</h4>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por código ou modelo..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {search.length >= 2 && (
            <div className="max-h-48 overflow-y-auto border rounded-md">
              {filteredProducts.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">Nenhum produto encontrado</p>
              ) : (
                filteredProducts.slice(0, 20).map(p => (
                  <div key={p.id} className="flex items-center justify-between p-2 hover:bg-muted/50 border-b last:border-0">
                    <div>
                      <span className="font-mono text-xs mr-2">{p.code}</span>
                      <span className="text-sm">{p.model}</span>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => handleLink(p.id)} disabled={adding}>
                      <Plus className="h-3 w-3 mr-1" /> Vincular
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
