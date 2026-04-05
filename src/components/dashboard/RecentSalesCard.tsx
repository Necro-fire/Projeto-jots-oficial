import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type DbVenda } from "@/hooks/useSupabaseData";
import { cn } from "@/lib/utils";

interface RecentSalesCardProps {
  sales: DbVenda[];
}

export function RecentSalesCard({ sales }: RecentSalesCardProps) {


  return (
    <Card className="shadow-card transition-all duration-300 hover:shadow-lg">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-ui font-semibold">Vendas Recentes</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="space-y-1">
          {sales.slice(0, 8).map((sale, i) => (
            <div
              key={sale.id}
              className={cn(
                "flex items-center justify-between py-2 px-3 rounded-md transition-all duration-200",
                "hover:bg-secondary/50 hover:scale-[1.01] active:scale-[0.99] cursor-default"
              )}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div>
                <p className="text-ui font-medium">{(sale as any).sale_code || `#${sale.number}`}</p>
                <p className="text-caption text-muted-foreground">{sale.client_name}</p>
              </div>
              <div className="text-right">
                <p className="text-ui font-medium tabular-nums text-primary">R$ {Number(sale.total).toFixed(2)}</p>
                <p className="text-caption text-muted-foreground">{sale.payment_method}</p>
              </div>
            </div>
          ))}
          {sales.length === 0 && (
            <p className="text-ui text-muted-foreground py-4 text-center">Sem vendas no período selecionado.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
