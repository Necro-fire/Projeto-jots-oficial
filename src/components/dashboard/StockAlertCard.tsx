import { AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type StockLevel } from "@/components/ProductFilters";
import { type DbProduct } from "@/hooks/useSupabaseData";
import { type AlertaEstoque } from "@/hooks/useStockAlerts";
import { cn } from "@/lib/utils";
import { type FilialId } from "@/contexts/FilialContext";

interface StockAlert {
  message: string;
  level: "out_of_stock" | "critical" | "low";
  totalStock: number;
  minimo: number;
  navigateTo: string;
}

function computeAlertsForFilial(
  products: DbProduct[],
  alertConfigs: AlertaEstoque[],
  filialId: string,
  filialList: { id: string; name: string }[]
): StockAlert[] {
  const alerts: StockAlert[] = [];
  const active = products.filter(p => p.status !== "inativo" && p.filial_id === filialId);
  const filialAlertConfigs = alertConfigs.filter(c => c.filial_id === filialId);
  const filialLabel = filialList.find(f => f.id === filialId)?.name || `Filial ${filialId}`;

  for (const config of filialAlertConfigs) {
    let matching: DbProduct[];
    let label: string;
    let navParams: string;

    if (config.tipo === "produto") {
      matching = active.filter(p => !p.is_acessorio && p.estilo === config.categoria);
      label = config.categoria;
      navParams = `?estilo=${encodeURIComponent(config.categoria)}`;
    } else {
      matching = active.filter(p => {
        if (!p.is_acessorio) return false;
        const pCat = (p as any).categoria_acessorio || "";
        const pTipo = (p as any).tipo_acessorio || "";
        const pVar = (p as any).variacao_acessorio || "";
        const pCor = (p as any).cor_acessorio || "";
        const pMat = (p as any).material_acessorio || "";

        if (pCat !== config.categoria) return false;
        if (config.tipo_acessorio && pTipo !== config.tipo_acessorio) return false;
        if (config.variacao_acessorio && pVar !== config.variacao_acessorio) return false;
        if (config.material_acessorio && pMat !== config.material_acessorio) return false;
        if (config.cor && config.cor !== "Nenhuma" && pCor !== config.cor) return false;
        return true;
      });

      const parts = [config.categoria];
      if (config.tipo_acessorio) parts.push(config.tipo_acessorio);
      if (config.variacao_acessorio) parts.push(config.variacao_acessorio);
      if (config.material_acessorio) parts.push(config.material_acessorio);
      if (config.cor && config.cor !== "Nenhuma") parts.push(config.cor);
      label = parts.join(" › ");

      navParams = `?catAcessorio=${encodeURIComponent(config.categoria)}`;
      if (config.tipo_acessorio) navParams += `&tipoAcessorio=${encodeURIComponent(config.tipo_acessorio)}`;
      if (config.cor) navParams += `&cor=${encodeURIComponent(config.cor)}`;
    }

    const totalStock = matching.reduce((sum, p) => sum + p.stock, 0);

    if (totalStock <= config.quantidade_minima) {
      let level: "out_of_stock" | "critical" | "low";
      if (totalStock === 0) {
        level = "out_of_stock";
      } else if (totalStock <= Math.floor(config.quantidade_minima / 2)) {
        level = "critical";
      } else {
        level = "low";
      }

      const msg = config.tipo === "produto"
        ? `[${filialLabel}] Armação ${label.toLowerCase()} com estoque baixo`
        : `[${filialLabel}] ${label} com estoque baixo`;

      alerts.push({ message: msg, level, totalStock, minimo: config.quantidade_minima, navigateTo: `/estoque${navParams}` });
    }
  }

  return alerts;
}

export function buildConfigAlerts(
  products: DbProduct[],
  alertConfigs: AlertaEstoque[],
  selectedFilial: FilialId = "all",
  filialList: { id: string; name: string }[] = []
): StockAlert[] {
  const alerts: StockAlert[] = [];

  if (selectedFilial === "all") {
    const filialIds = new Set(products.map(p => p.filial_id));
    for (const fid of filialIds) {
      alerts.push(...computeAlertsForFilial(products, alertConfigs, fid, filialList));
    }
  } else {
    alerts.push(...computeAlertsForFilial(products, alertConfigs, selectedFilial, filialList));
  }

  const order: Record<string, number> = { out_of_stock: 0, critical: 1, low: 2 };
  alerts.sort((a, b) => (order[a.level] ?? 3) - (order[b.level] ?? 3));
  return alerts;
}

function alertBadge(level: StockLevel, stock: number) {
  switch (level) {
    case "out_of_stock":
      return <Badge variant="destructive" className="text-caption">Esgotado</Badge>;
    case "critical":
      return <Badge className="text-caption bg-orange-600 text-white hover:bg-orange-700">Crítico</Badge>;
    case "low":
      return <Badge variant="outline" className="text-caption tabular-nums border-warning text-warning">{stock} un. ⚠</Badge>;
    default:
      return null;
  }
}

function alertBgClass(level: StockLevel) {
  switch (level) {
    case "out_of_stock": return "bg-destructive/5";
    case "critical": return "bg-orange-500/5";
    case "low": return "bg-warning/5";
    default: return "";
  }
}

interface StockAlertCardProps {
  alerts: StockAlert[];
  alertConfigsCount: number;
}

export function StockAlertCard({ alerts, alertConfigsCount }: StockAlertCardProps) {
  const navigate = useNavigate();
  const hasAlerts = alerts.length > 0;
  const outAlerts = alerts.filter(a => a.level === "out_of_stock");
  const critAlerts = alerts.filter(a => a.level === "critical");
  const lowAlerts = alerts.filter(a => a.level === "low");

  return (
    <Card className="shadow-card transition-all duration-300 hover:shadow-lg">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-ui font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          Alerta de Estoque
          {hasAlerts && (
            <Badge variant="outline" className="text-caption ml-auto tabular-nums">
              {alerts.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        {hasAlerts && (
          <div className="flex flex-wrap gap-2">
            {outAlerts.length > 0 && (
              <Badge variant="outline" className="text-caption border-destructive text-destructive gap-1">
                🔴 {outAlerts.length} esgotado{outAlerts.length > 1 ? "s" : ""}
              </Badge>
            )}
            {critAlerts.length > 0 && (
              <Badge variant="outline" className="text-caption border-orange-500 text-orange-600 gap-1">
                🟠 {critAlerts.length} crítico{critAlerts.length > 1 ? "s" : ""}
              </Badge>
            )}
            {lowAlerts.length > 0 && (
              <Badge variant="outline" className="text-caption border-warning text-warning gap-1">
                ⚠ {lowAlerts.length} baixo{lowAlerts.length > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        )}
        <div className="space-y-1 max-h-[300px] overflow-y-auto">
          {alerts.slice(0, 8).map((alert, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center justify-between py-2 px-3 rounded-md cursor-pointer transition-colors duration-200",
                "hover:ring-1 hover:ring-primary/30",
                alertBgClass(alert.level)
              )}
              onClick={() => navigate(alert.navigateTo)}
            >
              <div>
                <p className="text-ui font-medium">{alert.message}</p>
                <p className="text-caption text-muted-foreground">
                  {alert.totalStock} un. · mín: {alert.minimo}
                </p>
              </div>
              {alertBadge(alert.level, alert.totalStock)}
            </div>
          ))}
          {!hasAlerts && (
            <p className="text-ui text-muted-foreground py-4 text-center">
              {alertConfigsCount === 0
                ? "Configure alertas em Estoque → Configurações de Alerta"
                : "Todos os produtos com estoque adequado ✓"}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
