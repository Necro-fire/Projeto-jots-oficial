import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFilial } from "@/contexts/FilialContext";

export interface CompraComFornecedor {
  id: string;
  codigo: string;
  fornecedor_id: string;
  descricao: string;
  valor_total: number;
  data_compra: string;
  observacoes: string;
  filial_id: string;
  usuario_id: string;
  usuario_nome: string;
  created_at: string;
  fornecedor?: { id: string; nome: string; codigo: string; filial_id?: string };
}

export interface CompraItem {
  id: string;
  compra_id: string;
  produto_id: string;
  produto_code: string;
  produto_model: string;
  quantidade: number;
  valor_unitario: number;
  total: number;
}

export function useHistoricoCompras() {
  const [data, setData] = useState<CompraComFornecedor[]>([]);
  const [loading, setLoading] = useState(true);
  const { selectedFilial } = useFilial();

  const fetchData = useCallback(async () => {
    setLoading(true);

    let query = (supabase as any)
      .from("compras_fornecedor")
      .select("*, fornecedores(id, nome, codigo, filial_id)");

    if (selectedFilial !== "all") {
      query = query.eq("filial_id", selectedFilial);
    }

    const { data: rows, error } = await query.order("data_compra", { ascending: false });

    if (!error && rows) {
      setData(
        rows.map((r: any) => ({
          ...r,
          fornecedor: r.fornecedores,
        }))
      );
    }

    setLoading(false);
  }, [selectedFilial]);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel(`compras-rt-${selectedFilial}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "compras_fornecedor" }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchData, selectedFilial]);

  return { data, loading, refetch: fetchData };
}

export function useCompraItems(compraId: string | null) {
  const [data, setData] = useState<CompraItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!compraId) {
      setData([]);
      return;
    }

    setLoading(true);
    const { data: rows } = await (supabase as any)
      .from("compra_items")
      .select("*")
      .eq("compra_id", compraId)
      .order("created_at", { ascending: true });
    setData(rows || []);
    setLoading(false);
  }, [compraId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, refetch: fetchData };
}
