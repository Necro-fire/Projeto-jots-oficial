import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCompraItems, CompraComFornecedor } from "@/hooks/useHistoricoCompras";
import { Badge } from "@/components/ui/badge";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  compra: CompraComFornecedor | null;
}

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d: string) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function CompraDetailDialog({ open, onOpenChange, compra }: Props) {
  const { data: items, loading } = useCompraItems(compra?.id ?? null);

  if (!compra) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Detalhes da Compra
            <Badge variant="outline" className="font-mono">{compra.codigo}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">Fornecedor:</span>
            <p className="font-medium">{compra.fornecedor?.nome ?? "—"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Data:</span>
            <p className="font-medium">{fmtDate(compra.data_compra)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Valor Total:</span>
            <p className="font-medium text-primary">{fmt(compra.valor_total)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Registrado por:</span>
            <p className="font-medium">{compra.usuario_nome}</p>
          </div>
          {compra.descricao && (
            <div className="col-span-2">
              <span className="text-muted-foreground">Descrição:</span>
              <p>{compra.descricao}</p>
            </div>
          )}
          {compra.observacoes && (
            <div className="col-span-2">
              <span className="text-muted-foreground">Observações:</span>
              <p>{compra.observacoes}</p>
            </div>
          )}
        </div>

        <h4 className="font-semibold text-sm mt-2">Produtos</h4>
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum produto registrado nesta compra.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead className="text-center">Qtd</TableHead>
                <TableHead className="text-right">Vlr. Unit.</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(item => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs">{item.produto_code}</TableCell>
                  <TableCell>{item.produto_model}</TableCell>
                  <TableCell className="text-center">{item.quantidade}</TableCell>
                  <TableCell className="text-right">{fmt(item.valor_unitario)}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(item.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
