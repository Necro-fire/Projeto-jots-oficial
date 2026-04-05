import { useMemo } from "react";
import { format, eachDayOfInterval, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type DbVenda } from "@/hooks/useSupabaseData";
import { type DateRange } from "@/components/DateRangeFilter";

interface SalesChartProps {
  sales: DbVenda[];
  range: DateRange;
}

export function SalesChart({ sales, range }: SalesChartProps) {
  const chartData = useMemo(() => {
    const days = eachDayOfInterval({ start: range.from, end: range.to });
    return days.map(day => {
      const dayStart = startOfDay(day);
      const daySales = sales.filter(s => {
        const sDate = startOfDay(new Date(s.created_at));
        return sDate.getTime() === dayStart.getTime() && s.status !== "cancelada";
      });
      return {
        date: format(day, "dd/MM", { locale: ptBR }),
        total: daySales.reduce((sum, s) => sum + Number(s.total), 0),
        count: daySales.length,
      };
    });
  }, [sales, range]);

  return (
    <Card className="shadow-card transition-all duration-300 hover:shadow-lg">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-ui font-semibold">Vendas por Dia</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickFormatter={(v) => `R$${v}`} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value: number) => [`R$ ${value.toFixed(2)}`, "Total"]}
                labelFormatter={(label) => `Dia ${label}`}
              />
              <Bar
                dataKey="total"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
                animationDuration={800}
                animationBegin={100}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-ui text-muted-foreground py-8 text-center">Sem dados no período.</p>
        )}
      </CardContent>
    </Card>
  );
}
