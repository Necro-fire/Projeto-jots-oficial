import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFilial } from "@/contexts/FilialContext";

export interface DescontoAtacado {
  id: string;
  tipo_desconto: string; // 'produto' | 'categoria' | 'todas'
  produto_id: string | null;
  categoria: string;
  quantidade_minima: number;
  tipo_valor: string; // 'percentual' | 'fixo'
  valor_desconto: number;
  filial_id: string;
  status: string;
  created_at: string;
}

export function useDescontosAtacado() {
  const [data, setData] = useState<DescontoAtacado[]>([]);
  const [loading, setLoading] = useState(true);
  const { selectedFilial } = useFilial();

  const fetch = useCallback(async () => {
    let query = (supabase as any).from("descontos_atacado").select("*").order("created_at", { ascending: false });
    if (selectedFilial !== "all") {
      query = query.eq("filial_id", selectedFilial);
    }
    const { data: rows, error } = await query;
    if (!error && rows) setData(rows);
    setLoading(false);
  }, [selectedFilial]);

  useEffect(() => {
    fetch();
    const channel = supabase
      .channel("descontos_atacado-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "descontos_atacado" }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetch]);

  return { data, loading, refetch: fetch };
}
