import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShoppingCart, RotateCcw, ArrowLeftRight, History, Pencil, Trash2 } from "lucide-react";
import type { Consignado } from "@/hooks/useConsignados";

interface Props {
  items: Consignado[];
  onMarkVendido: (item: Consignado) => void;
  onMarkDevolvido: (item: Consignado) => void;
  onTrocar: (item: Consignado) => void;
  onHistorico: (item: Consignado) => void;
  onEdit?: (item: Consignado) => void;
  onDelete?: (item: Consignado) => void;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  consignado: { label: "Consignado", variant: "outline" },
  vendido: { label: "Vendido", variant: "default" },
  devolvido: { label: "Devolvido", variant: "secondary" },
};

export function ConsignadoList({ items, onMarkVendido, onMarkDevolvido, onTrocar, onHistorico, onEdit, onDelete }: Props) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <ShoppingCart className="h-12 w-12 mb-3 opacity-30" />
        <p className="text-ui font-medium">Nenhum produto consignado encontrado</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map(item => {
        const cfg = statusConfig[item.status] || statusConfig.consignado;
        const isActive = item.status === "consignado";

        return (
          <div key={item.id} className={`rounded-lg border bg-card p-3 flex items-center justify-between gap-3 ${!isActive ? "opacity-60" : ""}`}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-ui font-semibold font-mono">{item.codigo}</span>
                <Badge variant={cfg.variant} className="text-caption">{cfg.label}</Badge>
              </div>
              <p className="text-caption text-muted-foreground mt-0.5">
                {item.produto_referencia || item.produto_code} · {item.produto_model}
              </p>
              <p className="text-caption text-muted-foreground">
                {item.cliente_loja || item.cliente_nome || "Sem cliente"} · {item.quantidade} un. · R$ {Number(item.valor_total).toFixed(2)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {item.vendedor_nome && `Vendedor: ${item.vendedor_nome} · `}
                {new Date(item.created_at).toLocaleDateString("pt-BR")}
              </p>
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onHistorico(item)} title="Histórico">
                <History className="h-3.5 w-3.5" />
              </Button>
              {isActive && onEdit && (
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onEdit(item)} title="Editar">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
              {onDelete && (
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onDelete(item)} title="Excluir">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              )}
              {isActive && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                    onClick={() => onMarkVendido(item)}
                  >
                    <ShoppingCart className="h-3.5 w-3.5" />
                    Vender
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => onTrocar(item)}
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                    Trocar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-blue-600 border-blue-300 hover:bg-blue-50"
                    onClick={() => onMarkDevolvido(item)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Devolver
                  </Button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
