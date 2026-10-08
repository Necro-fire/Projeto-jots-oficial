import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { distribuicaoEmCentavos, normalizarCupomData, type CupomFiscalData, type PagamentoCupom } from "@/components/CupomFiscal";
import { parsePaymentDisplay, PAYMENT_LABELS, INTEREST_RATES, getBoletoInstallmentValues } from "@/lib/paymentUtils";

function calcularTotaisCupom(subtotalLiquido: number, desconto: number, total: number) {
  return {
    valorOriginal: subtotalLiquido + desconto,
    valorComDesconto: subtotalLiquido,
    acrescimo: total - subtotalLiquido,
  };
}

const toC = (v: number) => Math.round((Number(v) || 0) * 100);

/**
 * Monta uma forma de pagamento a partir do valor FINAL registrado (sem recalcular o total).
 * Parcelas e juros são derivados do próprio pagamento; a soma das parcelas é sempre igual ao valor registrado.
 */
function montarPagamento(formaRaw: string, valorFinal: number, baseConhecida?: number): PagamentoCupom {
  const forma = PAYMENT_LABELS[formaRaw] || formaRaw || "Pagamento";
  const lower = forma.toLowerCase();
  const finalC = toC(valorFinal);

  const boleto = forma.match(/boleto\s+(\d+)x\/(\d+)d/i);
  if (boleto) {
    const n = parseInt(boleto[1], 10);
    const intervalo = parseInt(boleto[2], 10);
    const firstInt = intervalo <= 15 ? 3 : 2;
    const comJuros = Math.max(0, n - firstInt + 1);
    const fator = (n - comJuros + comJuros * 1.06) / n;
    const baseTotal = valorFinal / fator;
    const { values } = getBoletoInstallmentValues(n, intervalo, baseTotal);
    const cents = values.map(toC);
    const diff = finalC - cents.reduce((a, b) => a + b, 0);
    cents[cents.length - 1] += diff;
    const baseC = baseConhecida !== undefined ? Math.min(finalC, toC(baseConhecida)) : Math.min(finalC, toC(baseTotal));
    return {
      forma, tipo: "BOLETO", valorBase: baseC / 100, acrescimo: (finalC - baseC) / 100, valorFinal: finalC / 100,
      parcelas: cents.map((v, i) => ({ numero: i + 1, prazoDias: intervalo * (i + 1), valor: v / 100 })),
    };
  }

  const isCredito = lower.includes("crédito") || lower.includes("credito") || (lower.includes("cartão") && !lower.includes("débito")) || lower.includes("cartao");
  if (isCredito) {
    const m = forma.match(/(\d+)x/);
    const n = m ? parseInt(m[1], 10) : 1;
    const rate = m && INTEREST_RATES[n] ? INTEREST_RATES[n] : 0;
    const baseC = baseConhecida !== undefined ? Math.min(finalC, toC(baseConhecida)) : Math.min(finalC, Math.round(finalC / (1 + rate / 100)));
    return {
      forma, tipo: "CREDITO", valorBase: baseC / 100, acrescimo: (finalC - baseC) / 100, valorFinal: finalC / 100,
      parcelas: distribuicaoEmCentavos(finalC, n).map((v, i) => ({ numero: i + 1, valor: v / 100 })),
    };
  }

  const tipo = lower.includes("pix") ? "PIX" : lower.includes("dinheiro") ? "DINHEIRO" : lower.includes("débito") || lower.includes("debito") ? "DEBITO" : "OUTRO";
  return { forma, tipo, valorBase: finalC / 100, acrescimo: 0, valorFinal: finalC / 100, parcelas: [{ numero: 1, valor: finalC / 100 }] };
}

/**
 * Build CupomFiscalData from a completed sale ID.
 * O total impresso é exatamente o total registrado na venda; cada forma de pagamento usa seu valor registrado no caixa.
 */
export async function buildCupomFromVendaId(vendaId: string): Promise<CupomFiscalData> {
  const [vendaRes, itemsRes, empresaRes] = await Promise.all([
    (supabase as any).from("vendas").select("*").eq("id", vendaId).single(),
    (supabase as any).from("venda_items").select("*").eq("venda_id", vendaId),
    (supabase as any).from("empresas").select("*").eq("ativa", true).limit(1).maybeSingle(),
  ]);

  const venda = vendaRes.data;
  if (!venda) throw new Error("Venda não encontrada");

  const items = (itemsRes.data || [])
    .filter((item: any) => item.status !== "cancelado")
    .map((item: any) => ({
      codigo: item.product_code || "",
      descricao: item.product_model || "",
      quantidade: item.quantity,
      valorUnitario: Number(item.unit_price),
      total: Number(item.total),
    }));

  const empresa = empresaRes.data;
  const enderecoFull = empresa
    ? [empresa.endereco, empresa.numero, empresa.bairro, empresa.cidade, empresa.estado].filter(Boolean).join(", ")
    : undefined;

  const { data: movData } = await (supabase as any)
    .from("caixa_movimentacoes")
    .select("valor, forma_pagamento, usuario_nome, created_at")
    .eq("venda_id", vendaId)
    .eq("tipo", "venda")
    .order("created_at", { ascending: true });

  const operador = movData?.[0]?.usuario_nome || venda.seller_name || "";
  const desconto = Number(venda.discount) || 0;
  const totalC = toC(venda.total);
  const movs = (movData || []) as any[];

  let pagamentos: PagamentoCupom[];
  const itensC = items.reduce((s: number, i: any) => s + toC(i.total), 0);
  if (movs.length > 1 && movs.reduce((s, m) => s + toC(m.valor), 0) === totalC) {
    pagamentos = movs.map((m) => montarPagamento(m.forma_pagamento || venda.payment_method, Number(m.valor)));
  } else {
    // Pagamento único: o acréscimo é a diferença real entre o total registrado e os itens
    const forma = movs.length === 1 ? (movs[0].forma_pagamento || venda.payment_method) : (venda.payment_method || "Pagamento");
    pagamentos = [montarPagamento(forma, totalC / 100, itensC > 0 && itensC <= totalC ? itensC / 100 : totalC / 100)];
  }

  const acrescimoC = pagamentos.reduce((s, p) => s + toC(p.acrescimo), 0);
  const valorComDescontoC = totalC - acrescimoC;
  const valorOriginalC = valorComDescontoC + toC(desconto);

  return normalizarCupomData({
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
    subtotal: valorOriginalC / 100,
    valorOriginal: valorOriginalC / 100,
    desconto,
    valorComDesconto: valorComDescontoC / 100,
    acrescimo: acrescimoC / 100,
    total: totalC / 100,
    pagamentos,
  });
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
