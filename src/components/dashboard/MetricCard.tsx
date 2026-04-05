import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ElementType;
  trend?: "up" | "down";
  accentColor?: "primary" | "success" | "destructive" | "warning";
}

const accentMap = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  destructive: "bg-destructive/10 text-destructive",
  warning: "bg-warning/10 text-warning",
};

export function MetricCard({ title, value, subtitle, icon: Icon, trend, accentColor = "primary" }: MetricCardProps) {
  return (
    <Card className="shadow-card group transition-all duration-300 hover:shadow-lg hover:scale-[1.02] hover:border-primary/20 cursor-default">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-caption text-muted-foreground">{title}</p>
            <p className="text-title font-semibold tracking-tighter tabular-nums mt-1 transition-colors duration-200 group-hover:text-primary">{value}</p>
            <div className="flex items-center gap-1 mt-1">
              {trend === "up" && <ArrowUpRight className="h-3 w-3 text-success" />}
              {trend === "down" && <ArrowDownRight className="h-3 w-3 text-destructive" />}
              <p className="text-caption text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <div className={cn(
            "h-10 w-10 rounded-md flex items-center justify-center transition-transform duration-300 group-hover:scale-110",
            accentMap[accentColor]
          )}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
