import { useMemo } from "react";
import { Package, ShoppingCart, RotateCcw, DollarSign, TrendingUp } from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { Consignado } from "@/hooks/useConsignados";

interface Props {
  items: Consignado[];
}

const COLORS = ["#f59e0b", "#10b981", "#3b82f6"];

export function ConsignadoDashboard({ items }: Props) {
  const stats = useMemo(() => {
    const consignados = items.filter(i => i.status === "consignado");
    const vendidos = items.filter(i => i.status === "vendido");
    const devolvidos = items.filter(i => i.status === "devolvido");

    const valorConsignado = consignados.reduce((s, i) => s + Number(i.valor_total), 0);
    const valorVendido = vendidos.reduce((s, i) => s + Number(i.valor_total), 0);

    const pieData = [
      { name: "Consignados", value: consignados.length },
      { name: "Vendidos", value: vendidos.length },
      { name: "Devolvidos", value: devolvidos.length },
    ].filter(d => d.value > 0);

    const barData = [
      { name: "Em Consignação", valor: valorConsignado },
      { name: "Vendido", valor: valorVendido },
    ];

    return { consignados, vendidos, devolvidos, valorConsignado, valorVendido, pieData, barData };
  }, [items]);

  const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  const metrics = [
    { label: "Em Consignação", value: stats.consignados.length, icon: Package, color: "text-amber-500", bgColor: "bg-amber-500/10" },
    { label: "Vendidos", value: stats.vendidos.length, icon: ShoppingCart, color: "text-emerald-500", bgColor: "bg-emerald-500/10" },
    { label: "Devolvidos", value: stats.devolvidos.length, icon: RotateCcw, color: "text-blue-500", bgColor: "bg-blue-500/10" },
    { label: "Valor em Consignação", value: fmt(stats.valorConsignado), icon: DollarSign, color: "text-amber-500", bgColor: "bg-amber-500/10" },
    { label: "Valor Vendido", value: fmt(stats.valorVendido), icon: TrendingUp, color: "text-emerald-500", bgColor: "bg-emerald-500/10" },
  ];

  // Calculate a nice max value for the Y axis
  const maxBarValue = Math.max(stats.valorConsignado, stats.valorVendido, 1);

  const formatYAxis = (v: number) => {
    if (v >= 1000) return `R$ ${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
    return `R$ ${v.toFixed(0)}`;
  };

  return (
    <div className="space-y-4">
      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {metrics.map(m => (
          <div key={m.label} className="rounded-lg border bg-card p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className={`p-1.5 rounded-md ${m.bgColor}`}>
                <m.icon className={`h-3.5 w-3.5 ${m.color}`} />
              </div>
              <span className="text-xs text-muted-foreground">{m.label}</span>
            </div>
            <p className="text-lg font-semibold">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      {items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Pie Chart - Distribution */}
          <div className="rounded-xl border bg-gradient-to-br from-card to-muted/30 p-4">
            <h3 className="text-sm font-semibold mb-3">Distribuição por Status</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={stats.pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {stats.pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[
                      entry.name === "Consignados" ? 0 : entry.name === "Vendidos" ? 1 : 2
                    ]} strokeWidth={0} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number, name: string) => [`${value} itens`, name]} />
                <Legend formatter={(value: string) => value} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Bar Chart - Values */}
          <div className="rounded-xl border bg-gradient-to-br from-card to-muted/30 p-4">
            <h3 className="text-sm font-semibold mb-3">Valores (R$)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats.barData} barSize={48}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={formatYAxis}
                  domain={[0, "auto"]}
                  allowDecimals={false}
                  tickCount={5}
                />
                <Tooltip formatter={(value: number) => [fmt(value), "Valor"]} />
                <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                  <Cell fill="#f59e0b" />
                  <Cell fill="#10b981" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
