import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import type { CupomFiscalData } from "@/components/CupomFiscal";

/**
 * Build CupomFiscalData from a completed sale ID by fetching all required data.
 */
export async function buildCupomFromVendaId(vendaId: string): Promise<CupomFiscalData> {
  // Fetch venda, items, and empresa in parallel
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

  // Try to get seller name from caixa_movimentacoes
  const { data: movData } = await (supabase as any)
    .from("caixa_movimentacoes")
    .select("usuario_nome")
    .eq("venda_id", vendaId)
    .eq("tipo", "venda")
    .limit(1)
    .maybeSingle();

  const operador = movData?.usuario_nome || venda.seller_name || "";

  const subtotal = items.reduce((s: number, i: any) => s + i.total, 0);

  // Parse payment methods
  const formasPagamento = venda.payment_method
    ? venda.payment_method.split("/").map((m: string) => m.trim())
    : ["—"];

  return {
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
    subtotal,
    desconto: Number(venda.discount) || 0,
    total: Number(venda.total),
    formasPagamento,
  };
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
  return {
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
    subtotal: params.subtotal,
    desconto: params.desconto,
    total: params.total,
    formasPagamento: params.paymentMethod.split("/").map((m) => m.trim()),
  };
}
