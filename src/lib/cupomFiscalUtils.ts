import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { distribuicaoEmCentavos, normalizarCupomData, type CupomFiscalData } from "@/components/CupomFiscal";
import { parsePaymentDisplay } from "@/lib/paymentUtils";

function calcularTotaisCupom(subtotalLiquido: number, desconto: number, total: number) {
  return {
    valorOriginal: subtotalLiquido + desconto,
    valorComDesconto: subtotalLiquido,
    acrescimo: total - subtotalLiquido,
  };
}

/**
 * Build CupomFiscalData from a completed sale ID by fetching all required data.
 */
export async function buildCupomFromVendaId(vendaId: string): Promise<CupomFiscalData> {
  const [vendaRes, itemsRes, empresaRes] = await Promise.all([
    (supabase as any).from("vendas").select("*").eq("id", vendaId).single(),
    (supabase as any).from("venda_items").select("*").eq("venda_id", vendaId),
    (supabase as any).from("empresas").select("*").eq("ativa", true).limit(1).maybeSingle(),
  ]);

  const venda = vendaRes.data;
  if (!venda) throw new Error("Venda não encontrada");

  const items = (itemsRes.data || []).map((item: any) => ({
    codigo: item.product_code || "",
    descricao: item.product_model || "",
    quantidade: item.quantity,
    valorUnitario: Number(item.unit_price),
    total: Number(item.total),
  }));

  const empresa = empresaRes.data;
  const enderecoFull = empresa
    ? [empresa.endereco, empresa.numero, empresa.bairro, empresa.cidade, empresa.estado]
        .filter(Boolean)
        .join(", ")
    : undefined;

  const { data: movData } = await (supabase as any)
    .from("caixa_movimentacoes")
    .select("valor, forma_pagamento, usuario_nome")
    .eq("venda_id", vendaId)
    .eq("tipo", "venda");

  const operador = movData?.[0]?.usuario_nome || venda.seller_name || "";
  const subtotal = items.reduce((s: number, i: any) => s + i.total, 0);
  const desconto = Number(venda.discount) || 0;
  const totalMovimentacoes = (movData || []).reduce((s: number, mov: any) => s + (Number(mov.valor) || 0), 0);
  const baseTotal = Number(venda.total) || 0;
  const formasPagamento = venda.payment_method
    ? venda.payment_method.split("/").map((m: string) => m.trim()).filter(Boolean)
    : ["—"];
  const total = formasPagamento.length > 1
    ? totalMovimentacoes > 0 ? totalMovimentacoes : baseTotal
    : venda.payment_method
      ? parsePaymentDisplay(venda.payment_method, subtotal).finalTotal
      : baseTotal;
  const totais = calcularTotaisCupom(subtotal, desconto, total);

  const valoresPorForma = (movData || []).map((mov: any) => Number(mov.valor) || 0);
  const formasPagamentoValores = valoresPorForma.length === formasPagamento.length
    ? valoresPorForma
    : (formasPagamento.length > 1 ? distribuicaoEmCentavos(Math.round(total * 100), formasPagamento.length).map((cents) => cents / 100) : [total]);

  const normalized = normalizarCupomData({
    empresa: {
      nome: empresa?.nome_fantasia || empresa?.razao_social || "Empresa",
      cnpj: empresa?.cnpj,
      inscricaoEstadual: empresa?.inscricao_estadual || undefined,
      endereco: enderecoFull || undefined,
    },
    venda: {
      codigo: venda.sale_code || "",
      numero: venda.number,
      dataHora: format(new Date(venda.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }),
      operador,
    },
    items,
    subtotal: totais.valorOriginal,
    valorOriginal: totais.valorOriginal,
    desconto,
    valorComDesconto: totais.valorComDesconto,
    acrescimo: totais.acrescimo,
    total,
    formasPagamento,
    formasPagamentoValores,
  });

  return normalized;
}

/**
 * Build CupomFiscalData directly from PDV data (no extra fetch needed).
 */
export function buildCupomFromPdvData(params: {
  vendaCodigo: string;
  vendaNumero: number;
  createdAt: string;
  operador: string;
  items: { code: string; model: string; quantity: number; unitPrice: number; total: number }[];
  subtotal: number;
  desconto: number;
  total: number;
  paymentMethod: string;
  empresa?: { nome: string; cnpj?: string; ie?: string; endereco?: string };
}): CupomFiscalData {
  const formasPagamento = params.paymentMethod.split("/").map((m) => m.trim()).filter(Boolean);
  const totalBase = Number(params.total) || 0;
  const totalComJuros = formasPagamento.length === 1
    ? parsePaymentDisplay(params.paymentMethod, totalBase).finalTotal
    : totalBase;
  const totais = calcularTotaisCupom(params.subtotal, params.desconto, totalComJuros);
  const formasPagamentoValores = formasPagamento.length > 1
    ? distribuicaoEmCentavos(Math.round(totalComJuros * 100), formasPagamento.length).map((cents) => cents / 100)
    : [totalComJuros];

  return normalizarCupomData({
    empresa: {
      nome: params.empresa?.nome || "Empresa",
      cnpj: params.empresa?.cnpj,
      inscricaoEstadual: params.empresa?.ie || undefined,
      endereco: params.empresa?.endereco || undefined,
    },
    venda: {
      codigo: params.vendaCodigo,
      numero: params.vendaNumero,
      dataHora: format(new Date(params.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR }),
      operador: params.operador,
    },
    items: params.items.map((i) => ({
      codigo: i.code,
      descricao: i.model,
      quantidade: i.quantity,
      valorUnitario: i.unitPrice,
      total: i.total,
    })),
    subtotal: totais.valorOriginal,
    valorOriginal: totais.valorOriginal,
    desconto: params.desconto,
    valorComDesconto: totais.valorComDesconto,
    acrescimo: totais.acrescimo,
    total: totalComJuros,
    formasPagamento,
    formasPagamentoValores,
  });
}
