import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFilial } from "@/contexts/FilialContext";

export interface Fornecedor {
  id: string;
  codigo: string;
  nome: string;
  cnpj_cpf: string;
  telefone: string;
  email: string;
  endereco: string;
  cidade: string;
  estado: string;
  observacoes: string;
  status: string;
  filial_id: string;
  created_at: string;
}

export interface CompraFornecedor {
  id: string;
  fornecedor_id: string;
  descricao: string;
  valor_total: number;
  data_compra: string;
  observacoes: string;
  filial_id: string;
  usuario_id: string;
  usuario_nome: string;
  created_at: string;
}

export interface FornecedorProduto {
  id: string;
  fornecedor_id: string;
  produto_id: string;
  created_at: string;
}

export function useFornecedores() {
  const [data, setData] = useState<Fornecedor[]>([]);
  const [loading, setLoading] = useState(true);
  const { selectedFilial } = useFilial();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: rows, error } = await (supabase as any)
      .from("fornecedores")
      .select("*")
      .eq("filial_id", selectedFilial)
      .order("created_at", { ascending: false });
    if (!error && rows) setData(rows as Fornecedor[]);
    setLoading(false);
  }, [selectedFilial]);

  useEffect(() => {
    fetchData();

    // Clean up previous channel before creating new one
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase.channel("fornecedores-rt-" + selectedFilial);
    channel.on("postgres_changes", { event: "*", schema: "public", table: "fornecedores" }, () => {
      fetchData();
    });
    channel.subscribe();
    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [fetchData, selectedFilial]);

  return { data, loading, refetch: fetchData };
}

export function useFornecedorProdutos(fornecedorId: string | null) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!fornecedorId) { setData([]); return; }
    setLoading(true);
    const { data: links } = await (supabase as any)
      .from("fornecedor_produtos")
      .select("*, produtos(id, code, model, category, retail_price, image_url)")
      .eq("fornecedor_id", fornecedorId);
    setData(links || []);
    setLoading(false);
  }, [fornecedorId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, refetch: fetchData };
}

export function useComprasFornecedor(fornecedorId: string | null) {
  const [data, setData] = useState<CompraFornecedor[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!fornecedorId) { setData([]); return; }
    setLoading(true);
    const { data: rows } = await (supabase as any)
      .from("compras_fornecedor")
      .select("*")
      .eq("fornecedor_id", fornecedorId)
      .order("data_compra", { ascending: false });
    setData(rows || []);
    setLoading(false);
  }, [fornecedorId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, refetch: fetchData };
}
