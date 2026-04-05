import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Package, ArrowDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFilial } from "@/contexts/FilialContext";
import { FilialSelector } from "@/components/FilialSelector";
import { useProducts } from "@/hooks/useSupabaseData";
import { ProductFilters, useProductFilters, applyProductFilters, getStockLevel, type StockLevel } from "@/components/ProductFilters";
import { StockAlertConfigDialog } from "@/components/StockAlertConfigDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function stockLevelBadge(level: StockLevel, stock: number) {
  switch (level) {
    case "out_of_stock":
      return <Badge variant="destructive" className="tabular-nums text-caption">{stock} un.</Badge>;
    case "critical":
      return <Badge className="tabular-nums text-caption bg-orange-600 text-white hover:bg-orange-700">{stock} un. 🟠</Badge>;
    case "low":
      return <Badge variant="outline" className="tabular-nums text-caption border-warning text-warning">{stock} un. ⚠</Badge>;
    default:
      return <Badge variant="secondary" className="tabular-nums text-caption">{stock} un.</Badge>;
  }
}

export default function Estoque() {
  const { selectedFilial, filiais } = useFilial();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: products } = useProducts();
  const { filters, setFilters } = useProductFilters();
  const { hasPermission } = useAuth();
  const canManageAlerts = hasPermission('Estoque', 'manage_alerts');

  // Pre-apply filters from URL params
  useEffect(() => {
    const tipoParam = searchParams.get("tipo");
    const estiloParam = searchParams.get("estilo");
    const catAcessorioParam = searchParams.get("catAcessorio");
    const tipoAcessorioParam = searchParams.get("tipoAcessorio");
    const corParam = searchParams.get("cor");
    // Legacy params
    const subcategoriaParam = searchParams.get("subcategoria");

    let changed = false;


    if (estiloParam) {
      setFilters(prev => ({ ...prev, estilo: estiloParam, tipoItem: "normal" }));
      changed = true;
    }

    if (catAcessorioParam) {
      setFilters(prev => ({
        ...prev,
        tipoItem: "acessorio",
        catAcessorio: catAcessorioParam,
        ...(tipoAcessorioParam ? { tipoAcessorio: tipoAcessorioParam } : {}),
        ...(corParam ? { corAcessorio: corParam } : {}),
      }));
      changed = true;
    }

    // Legacy: subcategoria param → search
    if (subcategoriaParam && !catAcessorioParam) {
      setFilters(prev => ({
        ...prev,
        tipoItem: "acessorio",
        search: subcategoriaParam,
        ...(corParam ? { corAcessorio: corParam } : {}),
      }));
      changed = true;
    }

    if (changed) {
      searchParams.delete("estilo");
      searchParams.delete("catAcessorio");
      searchParams.delete("tipoAcessorio");
      searchParams.delete("cor");
      searchParams.delete("subcategoria");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams]);

  const filtered = useMemo(() => applyProductFilters(products, filters), [products, filters]);

  const totalStock = filtered.reduce((acc, p) => acc + p.stock, 0);
  const counts = useMemo(() => {
    let low = 0, critical = 0, out = 0;
    filtered.forEach(p => {
      const level = getStockLevel(p.stock, p.min_stock || 0);
      if (level === "low") low++;
      else if (level === "critical") critical++;
      else if (level === "out_of_stock") out++;
    });
    return { low, critical, out };
  }, [filtered]);


  return (
    <div>
      <FilialSelector />
      <div className="p-4 space-y-4">
        <div>
          <h1 className="text-title font-semibold tracking-tighter">Estoque</h1>
          <p className="text-ui text-muted-foreground">Controle de estoque · {filtered.length} produtos</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {products.length > 0 && <ProductFilters filters={filters} onChange={setFilters} />}
          {canManageAlerts && <StockAlertConfigDialog />}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Card className="shadow-card">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-caption text-muted-foreground">Total</p>
                <p className="text-title font-semibold tabular-nums">{totalStock}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-md bg-warning/10 flex items-center justify-center">
                <ArrowDown className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-caption text-muted-foreground">Baixo</p>
                <p className="text-title font-semibold tabular-nums">{counts.low}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-md bg-orange-500/10 flex items-center justify-center">
                <ArrowDown className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-caption text-muted-foreground">Crítico</p>
                <p className="text-title font-semibold tabular-nums">{counts.critical}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-md bg-destructive/10 flex items-center justify-center">
                <ArrowDown className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-caption text-muted-foreground">Esgotado</p>
                <p className="text-title font-semibold tabular-nums">{counts.out}</p>
              </div>
            </CardContent>
          </Card>
        </div>


        {/* Inventory list */}
        <Card className="shadow-card">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-ui font-semibold">Inventário</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {filtered.length > 0 ? (
              <div className="space-y-1">
                {filtered.map(p => {
                  const level = getStockLevel(p.stock, p.min_stock || 0);
                  const accCat = (p as any).categoria_acessorio || "";
                  return (
                    <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-secondary/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="text-ui font-medium">{p.referencia}</p>
                          <div className="flex items-center gap-2">
                            <p className="text-caption text-muted-foreground">
                              {p.is_acessorio && accCat ? accCat : p.color}
                              {p.material_aro ? ` · ${p.material_aro}` : ""}
                            </p>
                            
                            {p.is_acessorio && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-accent text-accent-foreground">Acessório</Badge>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {selectedFilial === "all" && (
                          <Badge variant="outline" className="text-caption">{filiais.find(f => f.id === p.filial_id)?.name}</Badge>
                        )}
                        {stockLevelBadge(level, p.stock)}
                        <span className="text-caption text-muted-foreground tabular-nums min-w-[60px] text-right">mín: {p.min_stock || 0}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-ui font-medium">Nenhum produto encontrado</p>
                <p className="text-caption mt-1">Tente ajustar os filtros</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
