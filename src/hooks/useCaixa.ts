import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFilial } from "@/contexts/FilialContext";

export interface DbCaixa {
  id: string;
  filial_id: string;
  status: string;
  valor_abertura: number;
  valor_fechamento_informado: number | null;
  valor_fechamento_esperado: number | null;
  diferenca: number | null;
  usuario_abertura_id: string;
  usuario_abertura_nome: string;
  usuario_fechamento_id: string | null;
  usuario_fechamento_nome: string | null;
  aberto_em: string;
  fechado_em: string | null;
  observacoes_fechamento: string;
  created_at: string;
}

export interface DbCaixaMovimentacao {
  id: string;
  estorno_de?: string | null;
  caixa_id: string;
  tipo: string;
  valor: number;
  forma_pagamento: string;
  descricao: string;
  venda_id: string | null;
  usuario_id: string;
  usuario_nome: string;
  created_at: string;
}

export function useCaixas() {
  const [caixas, setCaixas] = useState<DbCaixa[]>([]);
  const [loading, setLoading] = useState(true);
  const { selectedFilial } = useFilial();

  const fetch = useCallback(async () => {
    let query = (supabase as any).from("caixas").select("*").order("created_at", { ascending: false });
    if (selectedFilial !== "all") query = query.eq("filial_id", selectedFilial);
    const { data } = await query;
    if (data) setCaixas(data);
    setLoading(false);
  }, [selectedFilial]);

  useEffect(() => {
    fetch();
    const ch = supabase.channel("caixas-rt").on("postgres_changes", { event: "*", schema: "public", table: "caixas" }, () => fetch()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetch]);

  return { caixas, loading, refetch: fetch };
}

export function useMovimentacoes(caixaId: string | null) {
  const [movs, setMovs] = useState<DbCaixaMovimentacao[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!caixaId) { setMovs([]); setLoading(false); return; }
    const { data } = await (supabase as any).from("caixa_movimentacoes").select("*").eq("caixa_id", caixaId).order("created_at", { ascending: false });
    if (data) setMovs(data);
    setLoading(false);
  }, [caixaId]);

  useEffect(() => {
    fetch();
    if (!caixaId) return;
    const ch = supabase.channel(`mov-${caixaId}`).on("postgres_changes", { event: "*", schema: "public", table: "caixa_movimentacoes" }, () => fetch()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetch, caixaId]);

  return { movs, loading, refetch: fetch };
}

/** Caixa aberto da filial, em tempo real. `null` = fechado (estado real do banco). */
export function useCaixaAberto(filialId: string | null) {
  const [caixa, setCaixa] = useState<DbCaixa | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCaixa = useCallback(async () => {
    if (!filialId || filialId === "all") {
      setCaixa(null);
      setLoading(false);
      return;
    }
    // limit(1) em vez de maybeSingle(): nunca falha por haver mais de uma linha.
    const { data, error } = await (supabase as any)
      .from("caixas")
      .select("*")
      .eq("filial_id", filialId)
      .eq("status", "aberto")
      .order("aberto_em", { ascending: false })
      .limit(1);
    if (!error) setCaixa((data && data[0]) || null);
    setLoading(false);
  }, [filialId]);

  useEffect(() => {
    setLoading(true);
    fetchCaixa();
    const ch = supabase
      .channel(`caixa-aberto-${filialId ?? "none"}-${Math.random().toString(36).slice(2, 7)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "caixas" }, () => fetchCaixa())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchCaixa, filialId]);

  return { caixa, loading, refetch: fetchCaixa };
}

// As operações abaixo são transações no banco: usuário, permissão, filial e saldo
// são determinados lá (nunca pelo navegador).

export async function abrirCaixa(filialId: string, valorAbertura: number) {
  const { data, error } = await supabase.rpc("abrir_caixa", {
    _filial_id: filialId,
    _valor_abertura: valorAbertura,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** O valor esperado é calculado no banco, a partir das movimentações do caixa. */
export async function fecharCaixa(caixaId: string, valorInformado: number, obs: string) {
  const { data, error } = await supabase.rpc("fechar_caixa", {
    _caixa_id: caixaId,
    _valor_informado: valorInformado,
    _obs: obs,
  });
  if (error) throw new Error(error.message);
  return data as unknown as { esperado: number; informado: number; diferenca: number };
}

export async function addMovimentacao(
  caixaId: string, tipo: "sangria" | "reforco" | "despesa", valor: number,
  formaPagamento: string, descricao: string
) {
  const { data, error } = await supabase.rpc("registrar_movimentacao_caixa", {
    _caixa_id: caixaId,
    _tipo: tipo,
    _valor: valor,
    _forma_pagamento: formaPagamento,
    _descricao: descricao,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Estorna (contra-lançamento) uma sangria, reforço ou despesa lançada por engano. */
export async function estornarMovimentacao(movId: string, motivo: string) {
  const { data, error } = await supabase.rpc("estornar_movimentacao_caixa", {
    _mov_id: movId,
    _motivo: motivo,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/**
 * Remove um caixa do histórico. Recusa se houver vendas vinculadas
 * (apagar o caixa deixaria a venda sem lançamento financeiro); o banco também impede.
 */
export async function removeCaixaHistorico(caixaId: string) {
  const { count, error: countError } = await (supabase as any)
    .from("caixa_movimentacoes")
    .select("id", { count: "exact", head: true })
    .eq("caixa_id", caixaId)
    .not("venda_id", "is", null);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) > 0) {
    throw new Error("Este caixa tem vendas vinculadas e não pode ser excluído. Para corrigir uma venda, cancele-a ou desfaça o cancelamento.");
  }

  const { error: movError } = await (supabase as any)
    .from("caixa_movimentacoes")
    .delete()
    .eq("caixa_id", caixaId);
  if (movError) throw new Error(movError.message);

  const { error: caixaError } = await (supabase as any)
    .from("caixas")
    .delete()
    .eq("id", caixaId);
  if (caixaError) throw new Error(caixaError.message);
}
