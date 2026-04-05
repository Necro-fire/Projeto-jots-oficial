import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DbNotaFiscal {
  id: string;
  numero: number;
  filial_id: string;
  venda_id: string | null;
  empresa_id: string | null;
  client_name: string;
  client_cnpj: string;
  valor_total: number;
  status: string;
  chave_acesso: string;
  data_emissao: string;
  created_at: string;
  tipo_operacao: string;
  observacoes: string;
  xml_url: string;
  pdf_url: string;
  fornecedor_nome: string;
  fornecedor_cnpj: string;
}

export function useNotasFiscais() {
  const [data, setData] = useState<DbNotaFiscal[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const { data: rows, error } = await (supabase as any)
      .from("notas_fiscais")
      .select("*")
      .order("data_emissao", { ascending: false });
    if (!error && rows) setData(rows as DbNotaFiscal[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel("notas_fiscais-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "notas_fiscais" }, () => {
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const create = async (nf: Omit<DbNotaFiscal, "id" | "created_at">) => {
    const { data: result, error } = await (supabase as any)
      .from("notas_fiscais")
      .insert(nf)
      .select()
      .single();
    if (error) throw error;
    return result as DbNotaFiscal;
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await (supabase as any)
      .from("notas_fiscais")
      .update({ status })
      .eq("id", id);
    if (error) throw error;
  };

  const updateNF = async (id: string, updates: Partial<DbNotaFiscal>) => {
    const { error } = await (supabase as any)
      .from("notas_fiscais")
      .update(updates)
      .eq("id", id);
    if (error) throw error;
  };

  const deleteNF = async (id: string) => {
    const { error } = await (supabase as any)
      .from("notas_fiscais")
      .delete()
      .eq("id", id);
    if (error) throw error;
  };

  return { data, loading, refetch: fetchData, create, updateStatus, updateNF, deleteNF };
}
