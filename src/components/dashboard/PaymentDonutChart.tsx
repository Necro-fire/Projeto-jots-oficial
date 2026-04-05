import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type DbVenda } from "@/hooks/useSupabaseData";

interface PaymentDonutChartProps {
  sales: DbVenda[];
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(var(--accent))",
];

function normalizePaymentMethod(method: string): string | null {
  const m = method.toLowerCase().trim();
  if (m.includes("dinheiro")) return "Dinheiro";
  if (m.includes("pix")) return "Pix";
  if (m.includes("débito") || m.includes("debito")) return "Cartão de Débito";
  if (m.includes("crédito") || m.includes("credito") || (m.includes("cartão") && !m.includes("débito") && !m.includes("debito")) || (m.includes("cartao") && !m.includes("debito"))) return "Cartão de Crédito";
  if (m.includes("boleto")) return "Boleto";
  return null;
}

function normalizeSplitMethods(paymentMethod: string): string[] {
  if (paymentMethod.includes("/")) {
    return paymentMethod.split("/").map(p => p.trim());
  }
  return [paymentMethod];
}

export function PaymentDonutChart({ sales }: PaymentDonutChartProps) {
  const data = useMemo(() => {
    const activeSales = sales.filter(s => s.status !== "cancelada");
    const map: Record<string, number> = {};
    activeSales.forEach(s => {
      const methods = normalizeSplitMethods(s.payment_method || "");
      // For split payments, distribute evenly across recognized methods
      const normalized = methods.map(m => normalizePaymentMethod(m)).filter(Boolean) as string[];
      if (normalized.length === 0) return;
      const share = Number(s.total) / normalized.length;
      normalized.forEach(nm => {
        map[nm] = (map[nm] || 0) + share;
      });
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [sales]);

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <Card className="shadow-card transition-all duration-300 hover:shadow-lg">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-ui font-semibold">Pagamentos</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {data.length > 0 ? (
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={140} height={140}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={65}
                  paddingAngle={2}
                  dataKey="value"
                  animationDuration={800}
                  animationBegin={200}
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  itemStyle={{ color: "hsl(0 0% 100%)" }}
                  labelStyle={{ color: "hsl(0 0% 100%)" }}
                  formatter={(value: number) => [<span style={{ color: "hsl(0 0% 100%)" }}>R$ {value.toFixed(2)}</span>, ""]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {data.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between text-caption">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-foreground">{d.name}</span>
                  </div>
                  <span className="tabular-nums text-muted-foreground">
                    {total > 0 ? `${((d.value / total) * 100).toFixed(0)}%` : "0%"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-ui text-muted-foreground py-8 text-center">Sem dados no período.</p>
        )}
      </CardContent>
    </Card>
  );
}
