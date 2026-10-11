import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFilial } from "@/contexts/FilialContext";

export interface Consignado {
  id: string;
  codigo: string;
  produto_id: string;
  cliente_id: string | null;
  filial_id: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  status: "consignado" | "vendido" | "devolvido";
  vendedor_nome: string;
  observacoes: string;
  venda_id: string | null;
  created_at: string;
  updated_at: string;
  // joined
  produto_code?: string;
  produto_model?: string;
  produto_referencia?: string;
  cliente_nome?: string;
  cliente_loja?: string;
}

export interface ConsignadoHistorico {
  id: string;
  consignado_id: string;
  acao: string;
  detalhes: Record<string, any>;
  usuario_nome: string;
  created_at: string;
}

let consignadoChannelCounter = 0;

export function useConsignados() {
  const { selectedFilial } = useFilial();
  const [data, setData] = useState<Consignado[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<any>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    let query = (supabase as any)
      .from("consignados")
      .select("*, produtos:produto_id(code, model, referencia), clientes:cliente_id(responsible_name, store_name)")
      .order("created_at", { ascending: false });

    if (selectedFilial !== "all") {
      query = query.eq("filial_id", selectedFilial);
    }

    const { data: rows, error } = await query;
    if (error) {
      console.error("useConsignados fetch error:", error);
      setLoading(false);
      return;
    }

    const mapped: Consignado[] = (rows || []).map((r: any) => ({
      ...r,
      produto_code: r.produtos?.code || "",
      produto_model: r.produtos?.model || "",
      produto_referencia: r.produtos?.referencia || "",
      cliente_nome: r.clientes?.responsible_name || "",
      cliente_loja: r.clientes?.store_name || "",
    }));

    setData(mapped);
    setLoading(false);
  }, [selectedFilial]);

  useEffect(() => {
    fetch();

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const topic = `consignados-rt-${++consignadoChannelCounter}`;
    const channel = supabase
      .channel(topic)
      .on("postgres_changes", { event: "*", schema: "public", table: "consignados" }, () => fetch())
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [fetch]);

  return { data, loading, refetch: fetch };
}

export async function fetchConsignadoHistorico(consignadoId: string): Promise<ConsignadoHistorico[]> {
  const { data, error } = await (supabase as any)
    .from("consignado_historico")
    .select("*")
    .eq("consignado_id", consignadoId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchConsignadoHistorico error:", error);
    return [];
  }
  return data || [];
}

export async function createConsignado(params: {
  produto_id: string;
  cliente_id: string | null;
  filial_id: string;
  quantidade: number;
  valor_unitario: number;
  vendedor_nome: string;
  observacoes: string;
  usuario_id: string;
  usuario_nome: string;
}) {
  // Uma transação no banco: baixa o estoque da filial (recusa se faltar saldo), cria o
  // consignado e registra o histórico. Usuário e vendedor vêm do token, não do navegador.
  const { data, error } = await supabase.rpc("criar_consignado", {
    _produto_id: params.produto_id,
    _cliente_id: params.cliente_id || null,
    _filial_id: params.filial_id,
    _quantidade: params.quantidade,
    _valor_unitario: params.valor_unitario,
    _observacoes: params.observacoes,
  } as never);
  if (error) throw new Error(error.message);
  return data as unknown as Record<string, unknown>;
}

export async function updateConsignadoStatus(
  id: string,
  newStatus: "vendido" | "devolvido",
  params: { usuario_id: string; usuario_nome: string; filial_id: string; produto_id: string; quantidade: number }
) {
  if (newStatus === "vendido") {
    const { error } = await supabase.rpc("vender_consignado_manual", { _consignado_id: id });
    if (error) throw new Error(error.message);
    return;
  }
  // devolvido: devolução total, com o estoque voltando para a filial
  const { error } = await supabase.rpc("devolver_consignado", {
    _consignado_id: id,
    _quantidade: params.quantidade,
  });
  if (error) throw new Error(error.message);
}

/**
 * Devolução parcial ou total (a regra e o estoque ficam no banco, numa transação).
 * Se devolver tudo, o consignado vira "devolvido"; senão reduz a quantidade e cria um
 * registro "devolvido" irmão para rastreabilidade.
 */
export async function devolverConsignadoParcial(params: {
  consignado_id: string;
  quantidade_devolver: number;
  produto_id: string;
  filial_id: string;
  valor_unitario: number;
  cliente_id: string | null;
  vendedor_nome: string;
  observacoes?: string;
  usuario_id: string;
  usuario_nome: string;
  quantidade_total: number;
}) {
  if (params.quantidade_devolver <= 0) throw new Error("Quantidade inválida");
  if (params.quantidade_devolver > params.quantidade_total) throw new Error("Quantidade maior que o disponível");

  const { data, error } = await supabase.rpc("devolver_consignado", {
    _consignado_id: params.consignado_id,
    _quantidade: params.quantidade_devolver,
  });
  if (error) throw new Error(error.message);

  const r = data as unknown as { devolvido: number; restante: number };
  return { devolvidoQty: r.devolvido, restante: r.restante };
}

export async function createConsignadoTroca(params: {
  consignado_original_id: string;
  novo_produto_id: string;
  novo_quantidade: number;
  novo_valor_unitario: number;
  filial_id: string;
  cliente_id: string | null;
  vendedor_nome: string;
  usuario_id: string;
  usuario_nome: string;
  original_produto_id: string;
  original_quantidade: number;
  original_valor_total: number;
  /** quantidade do ORIGINAL a trocar; se menor que a original, o restante continua consignado. */
  troca_quantidade?: number;
  original_valor_unitario?: number;
}) {
  const trocaQty = params.troca_quantidade ?? params.original_quantidade;
  if (trocaQty <= 0 || trocaQty > params.original_quantidade) {
    throw new Error("Quantidade a trocar inválida");
  }

  const { data, error } = await supabase.rpc("trocar_consignado", {
    _consignado_original_id: params.consignado_original_id,
    _novo_produto_id: params.novo_produto_id,
    _novo_quantidade: params.novo_quantidade,
    _novo_valor_unitario: params.novo_valor_unitario,
    _troca_quantidade: trocaQty,
  });
  if (error) throw new Error(error.message);

  const r = data as unknown as {
    novo_id: string; novo_codigo: string; diferenca: number; tipo_diferenca: string; parcial: boolean;
  };
  return {
    novo: { id: r.novo_id, codigo: r.novo_codigo },
    diferenca: r.diferenca,
    tipo_diferenca: r.tipo_diferenca,
    parcial: r.parcial,
  };
}

export async function editarConsignado(params: {
  consignado_id: string;
  cliente_id: string | null;
  quantidade: number;
  observacoes: string;
}) {
  const { error } = await supabase.rpc("editar_consignado", {
    _consignado_id: params.consignado_id,
    _cliente_id: params.cliente_id,
    _quantidade: params.quantidade,
    _observacoes: params.observacoes,
  } as never);
  if (error) throw new Error(error.message);
}

export async function excluirConsignado(consignadoId: string) {
  const { error } = await supabase.rpc("excluir_consignado", { _consignado_id: consignadoId });
  if (error) throw new Error(error.message);
}
