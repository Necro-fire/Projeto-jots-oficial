import { useMemo } from "react";
import { Package, ShoppingCart, RotateCcw, ArrowLeftRight } from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { Consignado } from "@/hooks/useConsignados";

interface Props {
  items: Consignado[];
  trocadosCount?: number;
}

const COLORS = {
  consignados: "hsl(var(--primary))",
  vendidos: "hsl(142 71% 45%)",
  devolvidos: "hsl(217 91% 60%)",
  trocados: "hsl(38 92% 50%)",
};

export function ConsignadoDashboard({ items, trocadosCount = 0 }: Props) {
  const stats = useMemo(() => {
    const consignados = items.filter(i => i.status === "consignado");
    const vendidos = items.filter(i => i.status === "vendido");
    const devolvidos = items.filter(i => i.status === "devolvido");

    // Pie data with percentage of total
    const total = consignados.length + vendidos.length + devolvidos.length + trocadosCount;
    const pieData = [
      { name: "Consignados", value: consignados.length, color: COLORS.consignados },
      { name: "Vendidos", value: vendidos.length, color: COLORS.vendidos },
      { name: "Devolvidos", value: devolvidos.length, color: COLORS.devolvidos },
      { name: "Trocados", value: trocadosCount, color: COLORS.trocados },
    ].filter(d => d.value > 0).map(d => ({ ...d, pct: total > 0 ? (d.value / total) * 100 : 0 }));

    // Bar data: quantities (sum of `quantidade`) per category
    const barData = [
      { name: "Consignados", quantidade: consignados.reduce((s, i) => s + i.quantidade, 0), color: COLORS.consignados },
      { name: "Devolvidos", quantidade: devolvidos.reduce((s, i) => s + i.quantidade, 0), color: COLORS.devolvidos },
      { name: "Trocados", quantidade: trocadosCount, color: COLORS.trocados },
    ];

    return { consignados, vendidos, devolvidos, pieData, barData };
  }, [items, trocadosCount]);

  const metrics = [
    { label: "Em Consignação", value: stats.consignados.length, icon: Package, color: "text-amber-500", bgColor: "bg-amber-500/10" },
    { label: "Vendidos", value: stats.vendidos.length, icon: ShoppingCart, color: "text-emerald-500", bgColor: "bg-emerald-500/10" },
    { label: "Devolvidos", value: stats.devolvidos.length, icon: RotateCcw, color: "text-blue-500", bgColor: "bg-blue-500/10" },
    { label: "Trocados", value: trocadosCount, icon: ArrowLeftRight, color: "text-orange-500", bgColor: "bg-orange-500/10" },
  ];

  const renderPieLabel = ({ pct }: any) => `${pct.toFixed(1)}%`;

  return (
    <div className="space-y-4">
      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
      {(items.length > 0 || trocadosCount > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Pie Chart - Distribution in % */}
          <div className="rounded-xl border bg-gradient-to-br from-card to-muted/30 p-4">
            <h3 className="text-sm font-semibold mb-3">Distribuição por Status (%)</h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={stats.pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                  label={renderPieLabel}
                  labelLine={false}
                >
                  {stats.pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string, props: any) =>
                    [`${value} itens (${props.payload.pct.toFixed(1)}%)`, name]
                  }
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Bar Chart - Quantities */}
          <div className="rounded-xl border bg-gradient-to-br from-card to-muted/30 p-4">
            <h3 className="text-sm font-semibold mb-3">Quantidade de Itens por Categoria</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={stats.barData} barSize={56}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  allowDecimals={false}
                  domain={[0, "auto"]}
                />
                <Tooltip formatter={(value: number) => [`${value} un.`, "Quantidade"]} />
                <Bar dataKey="quantidade" radius={[6, 6, 0, 0]}>
                  {stats.barData.map((entry, index) => (
                    <Cell key={`bar-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
