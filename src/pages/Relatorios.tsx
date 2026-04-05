import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Download, FileText, Users, Wallet, UserCog, Package, Receipt, TrendingUp, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFilial } from "@/contexts/FilialContext";
import { FilialSelector } from "@/components/FilialSelector";
import { DateRangeFilter, useDateRangeFilter } from "@/components/DateRangeFilter";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import { exportToExcel } from "@/lib/excelExport";

const reports = [
  { key: "vendas", title: "Todas as Vendas", desc: "Relatório completo de vendas com detalhes", icon: FileText, table: "vendas", dateCol: "created_at" },
  { key: "clientes", title: "Todos os Clientes", desc: "Relatório de todos os clientes cadastrados", icon: Users, table: "clientes", dateCol: "created_at" },
  { key: "caixa", title: "Todo o Caixa", desc: "Movimentações de caixa por período", icon: Wallet, table: "caixa_movimentacoes", dateCol: "created_at" },
  { key: "funcionarios", title: "Todos os Funcionários", desc: "Relatório de funcionários ativos", icon: UserCog, table: "funcionarios_auth", dateCol: "created_at" },
  { key: "estoque", title: "Todo o Estoque", desc: "Posição atual do estoque completa", icon: Package, table: "produtos", dateCol: null },
  { key: "nfe", title: "Todas as NF-e", desc: "Relatório de notas fiscais cadastradas", icon: Receipt, table: "notas_fiscais", dateCol: "data_emissao" },
  { key: "custo_lucro", title: "Custo e Lucro Geral", desc: "Análise de custo vs lucro das vendas", icon: TrendingUp, table: "vendas", dateCol: "created_at" },
];

export default function Relatorios() {
  const { filialLabel, selectedFilial } = useFilial();
  const { preset, range, onChange } = useDateRangeFilter();
  const [generating, setGenerating] = useState<string | null>(null);
  const { hasPermission } = useAuth();
  const canExport = hasPermission('Relatórios', 'export');

  const generateReport = async (report: typeof reports[0]) => {
    setGenerating(report.key);
    try {
      let query = (supabase as any).from(report.table).select("*");

      if (report.dateCol) {
        query = query
          .gte(report.dateCol, range.from.toISOString())
          .lte(report.dateCol, range.to.toISOString());
      }

      if (selectedFilial !== "all" && report.table !== "funcionarios_auth") {
        query = query.eq("filial_id", selectedFilial);
      }

      const { data: rows, error } = await query;
      if (error) throw error;
      if (!rows || rows.length === 0) {
        toast.info("Nenhum dado encontrado para o período selecionado");
        setGenerating(null);
        return;
      }

      let exportRows = rows;

      // For custo_lucro, enrich with venda_items
      if (report.key === "custo_lucro") {
        const vendaIds = rows.map((r: any) => r.id);
        const { data: items } = await (supabase as any)
          .from("venda_items")
          .select("venda_id, quantity, unit_price, custo_unitario")
          .in("venda_id", vendaIds);

        exportRows = rows.map((venda: any) => {
          const vendaItems = (items || []).filter((i: any) => i.venda_id === venda.id);
          const custoTotal = vendaItems.reduce((s: number, i: any) => s + (i.custo_unitario * i.quantity), 0);
          const receita = Number(venda.total);
          return {
            codigo: venda.sale_code || `#${venda.number}`,
            cliente: venda.client_name,
            data: venda.created_at,
            receita,
            custo: custoTotal,
            lucro: receita - custoTotal,
            margem: receita > 0 ? ((receita - custoTotal) / receita * 100).toFixed(1) + "%" : "0%",
            status: venda.status,
          };
        });
      }

      const fileName = `relatorio_${report.key}_${format(range.from, "ddMMyyyy")}_${format(range.to, "ddMMyyyy")}.xlsx`;
      const sheetName = report.title;

      await exportToExcel(exportRows, fileName, sheetName);
      toast.success("Relatório gerado com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao gerar relatório: " + (err.message || ""));
    }
    setGenerating(null);
  };

  return (
    <div>
      <FilialSelector />
      <div className="p-4 space-y-4">
        <div>
          <h1 className="text-title font-semibold tracking-tighter">Relatórios</h1>
          <p className="text-ui text-muted-foreground">Geração de relatórios — {filialLabel}</p>
        </div>

        <DateRangeFilter preset={preset} range={range} onChange={onChange} />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {reports.map((report) => {
            const Icon = report.icon;
            const isGenerating = generating === report.key;
            return (
              <Card key={report.key} className="shadow-card hover:shadow-md transition-shadow group">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center mb-3">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <h3 className="text-ui font-semibold">{report.title}</h3>
                      <p className="text-caption text-muted-foreground mt-1">{report.desc}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => generateReport(report)}
                      disabled={isGenerating || !canExport}
                    >
                      {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
