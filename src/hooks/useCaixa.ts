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

export async function abrirCaixa(filialId: string, valorAbertura: number, userId: string, userName: string) {
  // Check if there's already an open caixa for this filial
  const { data: existing } = await (supabase as any)
    .from("caixas").select("id").eq("filial_id", filialId).eq("status", "aberto").maybeSingle();
  if (existing) throw new Error("Já existe um caixa aberto para esta filial.");

  const { data, error } = await (supabase as any).from("caixas").insert({
    filial_id: filialId,
    valor_abertura: valorAbertura,
    usuario_abertura_id: userId,
    usuario_abertura_nome: userName,
  }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function fecharCaixa(
  caixaId: string, valorInformado: number, valorEsperado: number,
  userId: string, userName: string, obs: string
) {
  const diferenca = valorInformado - valorEsperado;
  const { error } = await (supabase as any).from("caixas").update({
    status: "fechado",
    valor_fechamento_informado: valorInformado,
    valor_fechamento_esperado: valorEsperado,
    diferenca,
    usuario_fechamento_id: userId,
    usuario_fechamento_nome: userName,
    fechado_em: new Date().toISOString(),
    observacoes_fechamento: obs,
  }).eq("id", caixaId);
  if (error) throw new Error(error.message);
}

export async function addMovimentacao(
  caixaId: string, tipo: string, valor: number, formaPagamento: string,
  descricao: string, userId: string, userName: string, vendaId?: string
) {
  const { error } = await (supabase as any).from("caixa_movimentacoes").insert({
    caixa_id: caixaId,
    tipo,
    valor,
    forma_pagamento: formaPagamento,
    descricao,
    usuario_id: userId,
    usuario_nome: userName,
    venda_id: vendaId || null,
  });
  if (error) throw new Error(error.message);
}

export async function removeCaixaHistorico(caixaId: string) {
  // First delete all movimentações
  const { error: movError } = await (supabase as any)
    .from("caixa_movimentacoes")
    .delete()
    .eq("caixa_id", caixaId);

  if (movError) throw new Error(movError.message);

  // Then delete the caixa record itself
  const { error: caixaError } = await (supabase as any)
    .from("caixas")
    .delete()
    .eq("id", caixaId);

  if (caixaError) throw new Error(caixaError.message);
}
