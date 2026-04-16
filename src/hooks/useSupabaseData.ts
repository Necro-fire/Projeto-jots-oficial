import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createBoletoAlertas } from "@/hooks/useBoletoAlertas";
import { useFilial } from "@/contexts/FilialContext";

export interface DbProduct {
  id: string;
  code: string;
  model: string;
  color: string;
  material: string;
  lens_size: number;
  bridge_size: number;
  temple_size: number;
  category: string;
  description: string;
  retail_price: number;
  wholesale_price: number;
  wholesale_min_qty: number;
  stock: number;
  min_stock: number;
  status: string;
  image_url: string;
  barcode: string;
  filial_id: string;
  created_at: string;
  referencia: string;
  categoria_idade: string;
  genero: string;
  estilo: string;
  cor_armacao: string;
  material_aro: string;
  material_haste: string;
  altura_lente: number;
  tipo_lente: string;
  subcategoria_acessorio: string;
  is_acessorio: boolean;
  tipo_produto_id: string | null;
  hash_produto: string;
  custo: number;
}

export interface DbClient {
  id: string;
  responsible_name: string;
  store_name: string;
  cnpj: string;
  cpf: string;
  city: string;
  state: string;
  bairro: string;
  phone: string;
  whatsapp: string;
  email: string;
  credit_limit: number;
  status: string;
  filial_id: string;
  created_at: string;
  tipo_cliente: string;
  endereco: string;
  data_nascimento: string | null;
  observacoes: string;
}

export interface DbVenda {
  id: string;
  number: number;
  sale_code: string;
  client_id: string | null;
  client_name: string;
  seller_name: string;
  total: number;
  discount: number;
  payment_method: string;
  origin: string;
  filial_id: string;
  created_at: string;
  status: string;
  cancelled_at: string | null;
  cancelled_by_id: string | null;
  cancelled_by_name: string;
  motivo_cancelamento: string;
}

export interface DbVendaItem {
  id: string;
  venda_id: string;
  produto_id: string;
  product_code: string;
  product_model: string;
  quantity: number;
  unit_price: number;
  total: number;
  custo_unitario: number;
}

export interface DbEstoque {
  id: string;
  produto_id: string;
  filial_id: string;
  quantidade: number;
  created_at: string;
}

function useRealtimeTable<T>(table: string, filterFilial: boolean = true) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const { selectedFilial } = useFilial();
  const channelRef = useRef<any>(null);

  const fetchData = useCallback(async () => {
    let query = (supabase as any).from(table).select("*");
    if (filterFilial && selectedFilial !== "all") {
      query = query.eq("filial_id", selectedFilial);
    }
    const { data: rows, error } = await query;
    if (!error && rows) setData(rows as T[]);
    setLoading(false);
  }, [table, selectedFilial, filterFilial]);

  useEffect(() => {
    fetchData();

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const topic = `${table}-rt-${selectedFilial}-${Date.now()}`;
    const channel = supabase
      .channel(topic)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => {
        fetchData();
      })
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [fetchData, table]);

  return { data, loading, refetch: fetchData };
}

export function useProducts() {
  return useRealtimeTable<DbProduct>("produtos");
}

export function useClients() {
  return useRealtimeTable<DbClient>("clientes");
}

export function useVendas() {
  return useRealtimeTable<DbVenda>("vendas");
}

export function useEstoque() {
  return useRealtimeTable<DbEstoque>("estoque");
}

export function useVendaItems() {
  return useRealtimeTable<DbVendaItem>("venda_items", false);
}

export async function generateProductCodes(): Promise<{ code: string; barcode: string }> {
  const { data, error } = await (supabase as any).rpc("generate_product_codes");
  if (error) throw new Error(error.message);
  return data as { code: string; barcode: string };
}

export async function findProductByHash(hash: string, filialId: string): Promise<DbProduct | null> {
  const { data, error } = await (supabase as any)
    .from("produtos")
    .select("*")
    .eq("hash_produto", hash)
    .eq("filial_id", filialId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function upsertEstoque(produtoId: string, filialId: string, quantidade: number) {
  // Try to find existing
  const { data: existing } = await (supabase as any)
    .from("estoque")
    .select("id, quantidade")
    .eq("produto_id", produtoId)
    .eq("filial_id", filialId)
    .maybeSingle();

  if (existing) {
    const newQty = existing.quantidade + quantidade;
    const { error } = await (supabase as any)
      .from("estoque")
      .update({ quantidade: newQty })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);

    // Sync stock column on produtos
    await (supabase as any)
      .from("produtos")
      .update({ stock: newQty })
      .eq("id", produtoId);

    return newQty;
  } else {
    const { error } = await (supabase as any)
      .from("estoque")
      .insert({ produto_id: produtoId, filial_id: filialId, quantidade });
    if (error) throw new Error(error.message);

    // Sync stock column on produtos
    await (supabase as any)
      .from("produtos")
      .update({ stock: quantidade })
      .eq("id", produtoId);

    return quantidade;
  }
}

export interface PaymentSplit {
  method: string;
  amount: number;
  finalAmount?: number;
}

export async function createVenda(
  items: { produto_id: string; product_code: string; product_model: string; quantity: number; unit_price: number; custo_unitario?: number }[],
  clientId: string | null,
  clientName: string,
  paymentMethod: string,
  origin: string,
  filialId: string,
  discount: number = 0,
  userId?: string,
  userName?: string,
  paymentSplits?: PaymentSplit[]
) {
  // Verify caixa is open
  const { data: caixaAberto, error: caixaCheckError } = await (supabase as any)
    .from("caixas")
    .select("id")
    .eq("filial_id", filialId)
    .eq("status", "aberto")
    .maybeSingle();

  if (caixaCheckError) throw new Error(caixaCheckError.message);
  if (!caixaAberto) throw new Error("O caixa precisa estar aberto para realizar vendas.");

  const total = items.reduce((acc, i) => acc + i.unit_price * i.quantity, 0) - discount;

  // Force reconciliation before validating stock
  for (const item of items) {
    const { error: reconcileError } = await (supabase as any).rpc("reconcile_inventory_for_product", {
      _produto_id: item.produto_id,
      _filial_id: filialId,
    });

    if (reconcileError) {
      throw new Error(reconcileError.message);
    }

    const { data: estoque, error: estoqueError } = await (supabase as any)
      .from("estoque")
      .select("quantidade")
      .eq("produto_id", item.produto_id)
      .eq("filial_id", filialId)
      .maybeSingle();

    if (estoqueError) {
      throw new Error(estoqueError.message);
    }

    const available = estoque?.quantidade ?? 0;
    if (available < item.quantity) {
      throw new Error(`Estoque insuficiente para ${item.product_model}. Disponível: ${available}`);
    }
  }

  const isBoleto = paymentMethod.toLowerCase().includes("boleto");

  const { data: venda, error: vendaError } = await (supabase as any)
    .from("vendas")
    .insert({
      client_id: clientId,
      client_name: clientName,
      seller_name: "",
      total,
      discount,
      payment_method: paymentMethod,
      origin,
      filial_id: filialId,
      status_boleto: isBoleto ? "pendente" : "",
    })
    .select()
    .single();

  if (vendaError || !venda) throw new Error(vendaError?.message || "Erro ao criar venda");

  const isConsignado = origin === "consignado";
  const vendaItems = items.map(i => ({
    venda_id: venda.id,
    produto_id: i.produto_id,
    product_code: i.product_code,
    product_model: i.product_model,
    quantity: i.quantity,
    unit_price: i.unit_price,
    total: i.unit_price * i.quantity,
    custo_unitario: i.custo_unitario ?? 0,
    status: isConsignado ? "consignado" : "active",
  }));

  const { error: itemsError } = await (supabase as any)
    .from("venda_items")
    .insert(vendaItems);

  if (itemsError) throw new Error(itemsError.message);

  // Use already-validated caixaAberto from above
  if (caixaAberto && userId) {
    if (paymentSplits && paymentSplits.length > 0) {
      // Register one caixa entry per split
      for (const split of paymentSplits) {
        await (supabase as any).from("caixa_movimentacoes").insert({
          caixa_id: caixaAberto.id,
          tipo: "venda",
          valor: split.finalAmount ?? split.amount,
          forma_pagamento: split.method,
          descricao: `Venda ${venda.sale_code || '#' + venda.number} — ${clientName || "Cliente avulso"} (${split.method})`,
          venda_id: venda.id,
          usuario_id: userId,
          usuario_nome: userName || "",
        });
      }
    } else {
      await (supabase as any).from("caixa_movimentacoes").insert({
        caixa_id: caixaAberto.id,
        tipo: "venda",
        valor: total,
        forma_pagamento: paymentMethod,
        descricao: `Venda ${venda.sale_code || '#' + venda.number} — ${clientName || "Cliente avulso"}`,
        venda_id: venda.id,
        usuario_id: userId,
        usuario_nome: userName || "",
      });
    }
  }

  // If consignado, create consignados records (stock already deducted by reduce_stock_on_sale trigger)
  if (isConsignado) {
    try {
      for (const item of items) {
        const { data: csg } = await (supabase as any).from("consignados").insert({
          produto_id: item.produto_id,
          cliente_id: clientId,
          filial_id: filialId,
          quantidade: item.quantity,
          valor_unitario: item.unit_price,
          valor_total: item.unit_price * item.quantity,
          vendedor_nome: userName || "",
          venda_id: venda.id,
        }).select().single();

        // Log creation history
        if (csg) {
          await (supabase as any).from("consignado_historico").insert({
            consignado_id: csg.id,
            acao: "criado",
            detalhes: {
              origem: "pdv",
              venda_id: venda.id,
              quantidade: item.quantity,
              valor_unitario: item.unit_price,
            },
            usuario_id: userId,
            usuario_nome: userName || "",
          });
        }
      }
    } catch (e) {
      console.error("Erro ao criar registros de consignação:", e);
    }
  }

  // Auto-create boleto alerts
  try {
    // Check main payment method
    const mainIsBoleto = (!paymentSplits || paymentSplits.length === 0) && paymentMethod.toLowerCase().includes("boleto");
    if (mainIsBoleto) {
      const boletoMatch = paymentMethod.match(/(\d+)x\/(\d+)d/);
      const parcelas = boletoMatch ? parseInt(boletoMatch[1]) : 1;
      const intervalo = boletoMatch ? parseInt(boletoMatch[2]) : 30;
      await createBoletoAlertas(venda.id, filialId, total, parcelas, intervalo);
    }

    // Check splits for boleto portions
    if (paymentSplits && paymentSplits.length > 0) {
      for (const split of paymentSplits) {
        if (split.method.toLowerCase().includes("boleto")) {
          const boletoMatch = split.method.match(/(\d+)x\/(\d+)d/);
          const parcelas = boletoMatch ? parseInt(boletoMatch[1]) : 1;
          const intervalo = boletoMatch ? parseInt(boletoMatch[2]) : 30;
          await createBoletoAlertas(venda.id, filialId, split.amount, parcelas, intervalo);
        }
      }
    }
  } catch (e) {
    console.error("Erro ao criar alertas de boleto:", e);
  }

  return venda;
}

export async function cancelarVenda(
  vendaId: string,
  motivo: string,
  userId: string,
  userName: string
) {
  const { error } = await (supabase as any).rpc("cancelar_venda", {
    _venda_id: vendaId,
    _motivo: motivo,
    _user_id: userId,
    _user_name: userName,
  });
  if (error) throw new Error(error.message);
}
