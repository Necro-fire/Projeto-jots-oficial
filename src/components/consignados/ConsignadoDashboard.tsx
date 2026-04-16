import { Package, ShoppingCart, RotateCcw, DollarSign, TrendingUp } from "lucide-react";
import type { Consignado } from "@/hooks/useConsignados";

interface Props {
  items: Consignado[];
}

export function ConsignadoDashboard({ items }: Props) {
  const consignados = items.filter(i => i.status === "consignado");
  const vendidos = items.filter(i => i.status === "vendido");
  const devolvidos = items.filter(i => i.status === "devolvido");

  const valorConsignado = consignados.reduce((s, i) => s + Number(i.valor_total), 0);
  const valorVendido = vendidos.reduce((s, i) => s + Number(i.valor_total), 0);

  const metrics = [
    { label: "Em Consignação", value: consignados.length, icon: Package, color: "text-amber-500", bgColor: "bg-amber-500/10" },
    { label: "Vendidos", value: vendidos.length, icon: ShoppingCart, color: "text-emerald-500", bgColor: "bg-emerald-500/10" },
    { label: "Devolvidos", value: devolvidos.length, icon: RotateCcw, color: "text-blue-500", bgColor: "bg-blue-500/10" },
    { label: "Valor em Consignação", value: `R$ ${valorConsignado.toFixed(2)}`, icon: DollarSign, color: "text-amber-500", bgColor: "bg-amber-500/10" },
    { label: "Valor Vendido", value: `R$ ${valorVendido.toFixed(2)}`, icon: TrendingUp, color: "text-emerald-500", bgColor: "bg-emerald-500/10" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {metrics.map(m => (
        <div key={m.label} className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className={`p-1.5 rounded-md ${m.bgColor}`}>
              <m.icon className={`h-3.5 w-3.5 ${m.color}`} />
            </div>
            <span className="text-caption text-muted-foreground">{m.label}</span>
          </div>
          <p className="text-lg font-semibold">{m.value}</p>
        </div>
      ))}
    </div>
  );
}
