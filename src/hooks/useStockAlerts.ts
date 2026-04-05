import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AlertaEstoque {
  id: string;
  tipo: string; // 'produto' | 'acessorio'
  categoria: string;
  cor: string | null;
  tipo_acessorio: string;
  variacao_acessorio: string;
  material_acessorio: string;
  quantidade_minima: number;
  filial_id: string;
  created_at: string;
}

export function useStockAlerts() {
  const [data, setData] = useState<AlertaEstoque[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data: rows, error } = await (supabase as any)
      .from("alertas_estoque")
      .select("*")
      .order("tipo,categoria,cor");
    if (!error && rows) setData(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch();
    const channel = supabase
      .channel("alertas_estoque-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "alertas_estoque" }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetch]);

  const upsert = async (alert: Omit<AlertaEstoque, "id" | "created_at">) => {
    // Check if exists with same combination
    let query = (supabase as any)
      .from("alertas_estoque")
      .select("id")
      .eq("tipo", alert.tipo)
      .eq("categoria", alert.categoria)
      .eq("filial_id", alert.filial_id || "1")
      .eq("tipo_acessorio", alert.tipo_acessorio || "")
      .eq("variacao_acessorio", alert.variacao_acessorio || "")
      .eq("material_acessorio", alert.material_acessorio || "");

    if (alert.cor) {
      query = query.eq("cor", alert.cor);
    } else {
      query = query.is("cor", null);
    }

    const { data: existing } = await query.maybeSingle();

    if (existing) {
      const { error } = await (supabase as any)
        .from("alertas_estoque")
        .update({ quantidade_minima: alert.quantidade_minima })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await (supabase as any)
        .from("alertas_estoque")
        .insert({
          tipo: alert.tipo,
          categoria: alert.categoria,
          cor: alert.cor,
          tipo_acessorio: alert.tipo_acessorio || "",
          variacao_acessorio: alert.variacao_acessorio || "",
          material_acessorio: alert.material_acessorio || "",
          quantidade_minima: alert.quantidade_minima,
          filial_id: alert.filial_id || "1",
        });
      if (error) throw error;
    }
  };

  const remove = async (id: string) => {
    const { error } = await (supabase as any)
      .from("alertas_estoque")
      .delete()
      .eq("id", id);
    if (error) throw error;
  };

  return { data, loading, refetch: fetch, upsert, remove };
}
