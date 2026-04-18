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
  const valor_total = params.quantidade * params.valor_unitario;

  const { data, error } = await (supabase as any)
    .from("consignados")
    .insert({
      produto_id: params.produto_id,
      cliente_id: params.cliente_id || null,
      filial_id: params.filial_id,
      quantidade: params.quantidade,
      valor_unitario: params.valor_unitario,
      valor_total,
      vendedor_nome: params.vendedor_nome,
      observacoes: params.observacoes,
    })
    .select()
    .single();

  if (error) throw error;

  // Log creation in history
  await (supabase as any).from("consignado_historico").insert({
    consignado_id: data.id,
    acao: "criado",
    detalhes: { quantidade: params.quantidade, valor_unitario: params.valor_unitario },
    usuario_id: params.usuario_id,
    usuario_nome: params.usuario_nome,
  });

  // Deduct stock
  const { data: estoque } = await (supabase as any)
    .from("estoque")
    .select("id, quantidade")
    .eq("produto_id", params.produto_id)
    .eq("filial_id", params.filial_id)
    .maybeSingle();

  if (estoque) {
    const newQty = Math.max(0, estoque.quantidade - params.quantidade);
    await (supabase as any).from("estoque").update({ quantidade: newQty }).eq("id", estoque.id);
    await (supabase as any).from("produtos").update({ stock: newQty }).eq("id", params.produto_id);
  }

  return data;
}

export async function updateConsignadoStatus(
  id: string,
  newStatus: "vendido" | "devolvido",
  params: { usuario_id: string; usuario_nome: string; filial_id: string; produto_id: string; quantidade: number }
) {
  const { error } = await (supabase as any)
    .from("consignados")
    .update({ status: newStatus })
    .eq("id", id);

  if (error) throw error;

  // The DB trigger auto-logs status_alterado. Add explicit action log too.
  const acao = newStatus === "vendido" ? "venda_manual" : "devolucao";
  await (supabase as any).from("consignado_historico").insert({
    consignado_id: id,
    acao,
    detalhes: { status: newStatus, quantidade: params.quantidade },
    usuario_id: params.usuario_id,
    usuario_nome: params.usuario_nome,
  });

  // If devolvido, restore stock
  if (newStatus === "devolvido") {
    const { data: estoque } = await (supabase as any)
      .from("estoque")
      .select("id, quantidade")
      .eq("produto_id", params.produto_id)
      .eq("filial_id", params.filial_id)
      .maybeSingle();

    if (estoque) {
      const newQty = estoque.quantidade + params.quantidade;
      await (supabase as any).from("estoque").update({ quantidade: newQty }).eq("id", estoque.id);
      await (supabase as any).from("produtos").update({ stock: newQty }).eq("id", params.produto_id);
    } else {
      await (supabase as any).from("estoque").insert({
        produto_id: params.produto_id,
        filial_id: params.filial_id,
        quantidade: params.quantidade,
      });
      await (supabase as any).from("produtos").update({ stock: params.quantidade }).eq("id", params.produto_id);
    }
  }
}

/**
 * Partial return: returns N units of a consignado.
 * If N == total, marks it as devolvido.
 * If N < total, reduces the original quantity and creates a sibling 'devolvido' record for traceability.
 * Restores stock for N units.
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
  const { consignado_id, quantidade_devolver, quantidade_total } = params;
  if (quantidade_devolver <= 0) throw new Error("Quantidade inválida");
  if (quantidade_devolver > quantidade_total) throw new Error("Quantidade maior que o disponível");

  const isFull = quantidade_devolver === quantidade_total;

  if (isFull) {
    await (supabase as any)
      .from("consignados")
      .update({ status: "devolvido" })
      .eq("id", consignado_id);
  } else {
    const novaQty = quantidade_total - quantidade_devolver;
    const novoTotal = novaQty * params.valor_unitario;
    await (supabase as any)
      .from("consignados")
      .update({ quantidade: novaQty, valor_total: novoTotal })
      .eq("id", consignado_id);

    // Create sibling devolvido record for history/traceability
    await (supabase as any).from("consignados").insert({
      produto_id: params.produto_id,
      cliente_id: params.cliente_id,
      filial_id: params.filial_id,
      quantidade: quantidade_devolver,
      valor_unitario: params.valor_unitario,
      valor_total: quantidade_devolver * params.valor_unitario,
      status: "devolvido",
      vendedor_nome: params.vendedor_nome,
      observacoes: `Devolução parcial de ${consignado_id}`,
    });
  }

  // Restore stock
  const { data: estoque } = await (supabase as any)
    .from("estoque")
    .select("id, quantidade")
    .eq("produto_id", params.produto_id)
    .eq("filial_id", params.filial_id)
    .maybeSingle();

  if (estoque) {
    const newQty = estoque.quantidade + quantidade_devolver;
    await (supabase as any).from("estoque").update({ quantidade: newQty }).eq("id", estoque.id);
    await (supabase as any).from("produtos").update({ stock: newQty }).eq("id", params.produto_id);
  } else {
    await (supabase as any).from("estoque").insert({
      produto_id: params.produto_id,
      filial_id: params.filial_id,
      quantidade: quantidade_devolver,
    });
    await (supabase as any).from("produtos").update({ stock: quantidade_devolver }).eq("id", params.produto_id);
  }

  await (supabase as any).from("consignado_historico").insert({
    consignado_id,
    acao: isFull ? "devolucao_total" : "devolucao_parcial",
    detalhes: { quantidade_devolvida: quantidade_devolver, restante: quantidade_total - quantidade_devolver },
    usuario_id: params.usuario_id,
    usuario_nome: params.usuario_nome,
  });

  return { devolvidoQty: quantidade_devolver, restante: quantidade_total - quantidade_devolver };
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
  /** quantity of the ORIGINAL consignado being exchanged. If less than original_quantidade, the rest stays consignado. Defaults to original_quantidade. */
  troca_quantidade?: number;
  /** required when partial: original unit price to compute the remainder */
  original_valor_unitario?: number;
}) {
  const trocaQty = params.troca_quantidade ?? params.original_quantidade;
  if (trocaQty <= 0 || trocaQty > params.original_quantidade) {
    throw new Error("Quantidade a trocar inválida");
  }
  const isFull = trocaQty === params.original_quantidade;
  const valorUnitOrig = Number(params.original_valor_unitario ?? (params.original_valor_total / params.original_quantidade));

  // Value of the portion being exchanged
  const valorParcialOriginal = isFull ? Number(params.original_valor_total) : trocaQty * valorUnitOrig;

  const novo_valor_total = params.novo_quantidade * params.novo_valor_unitario;
  const diferenca = novo_valor_total - valorParcialOriginal;
  const tipo_diferenca = diferenca === 0 ? "igual" : diferenca > 0 ? "cliente_paga" : "credito";

  // Update or split original
  if (isFull) {
    await (supabase as any)
      .from("consignados")
      .update({ status: "devolvido" })
      .eq("id", params.consignado_original_id);
  } else {
    const restante = params.original_quantidade - trocaQty;
    await (supabase as any)
      .from("consignados")
      .update({ quantidade: restante, valor_total: restante * valorUnitOrig })
      .eq("id", params.consignado_original_id);
  }

  // Restore stock for the exchanged portion of the original product
  const { data: estoqueOrig } = await (supabase as any)
    .from("estoque")
    .select("id, quantidade")
    .eq("produto_id", params.original_produto_id)
    .eq("filial_id", params.filial_id)
    .maybeSingle();

  if (estoqueOrig) {
    const newQty = estoqueOrig.quantidade + trocaQty;
    await (supabase as any).from("estoque").update({ quantidade: newQty }).eq("id", estoqueOrig.id);
    await (supabase as any).from("produtos").update({ stock: newQty }).eq("id", params.original_produto_id);
  }

  // Create new consignado
  const { data: novo, error: novoErr } = await (supabase as any)
    .from("consignados")
    .insert({
      produto_id: params.novo_produto_id,
      cliente_id: params.cliente_id,
      filial_id: params.filial_id,
      quantidade: params.novo_quantidade,
      valor_unitario: params.novo_valor_unitario,
      valor_total: novo_valor_total,
      vendedor_nome: params.vendedor_nome,
    })
    .select()
    .single();

  if (novoErr) throw novoErr;

  // Deduct new product stock
  const { data: estoqueNovo } = await (supabase as any)
    .from("estoque")
    .select("id, quantidade")
    .eq("produto_id", params.novo_produto_id)
    .eq("filial_id", params.filial_id)
    .maybeSingle();

  if (estoqueNovo) {
    const newQty = Math.max(0, estoqueNovo.quantidade - params.novo_quantidade);
    await (supabase as any).from("estoque").update({ quantidade: newQty }).eq("id", estoqueNovo.id);
    await (supabase as any).from("produtos").update({ stock: newQty }).eq("id", params.novo_produto_id);
  }

  // Record exchange
  await (supabase as any).from("consignado_trocas").insert({
    consignado_original_id: params.consignado_original_id,
    consignado_novo_id: novo.id,
    diferenca_valor: Math.abs(diferenca),
    tipo_diferenca,
    usuario_id: params.usuario_id,
    usuario_nome: params.usuario_nome,
    observacoes: isFull ? "" : `Troca parcial: ${trocaQty} de ${params.original_quantidade}`,
  });

  // Log history on both
  await (supabase as any).from("consignado_historico").insert([
    {
      consignado_id: params.consignado_original_id,
      acao: isFull ? "troca" : "troca_parcial",
      detalhes: { trocado_por: novo.codigo, diferenca, tipo_diferenca, qty_trocada: trocaQty, total_original: params.original_quantidade },
      usuario_id: params.usuario_id,
      usuario_nome: params.usuario_nome,
    },
    {
      consignado_id: novo.id,
      acao: "criado_por_troca",
      detalhes: { originado_de: params.consignado_original_id, diferenca, tipo_diferenca },
      usuario_id: params.usuario_id,
      usuario_nome: params.usuario_nome,
    },
  ]);

  return { novo, diferenca, tipo_diferenca, parcial: !isFull };
}
