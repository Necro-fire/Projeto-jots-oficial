// Hook for empresas (filiais) CRUD with realtime
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DbEmpresa {
  id: string;
  razao_social: string;
  nome_fantasia: string;
  cnpj: string;
  inscricao_estadual: string;
  regime_tributario: string;
  cnae: string;
  cep: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
  codigo_ibge: string;
  codigo_municipio: string;
  telefone: string;
  celular: string;
  email: string;
  serie_nf: string;
  ambiente: string;
  ativa: boolean;
  filial_padrao: boolean;
  filial_id: string;
  created_at: string;
}

export function useEmpresas() {
  const [data, setData] = useState<DbEmpresa[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const { data: rows, error } = await (supabase as any)
      .from("empresas")
      .select("*")
      .order("created_at", { ascending: true });
    if (!error && rows) setData(rows as DbEmpresa[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel("empresas-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "empresas" }, () => {
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  return { data, loading, refetch: fetchData };
}
