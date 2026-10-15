import { isPast, isSameMonth, isToday } from "date-fns";

export type BoletoDisplayStatus = "pendente" | "gerado" | "futuro" | "cancelado";

export interface BoletoParcelaLike {
  status: string;
  data_vencimento: string;
  parcela_numero?: number;
  /** Status da venda dona da parcela (vendas.status). Venda cancelada cancela qualquer parcela. */
  venda_status?: string | null;
}

/**
 * Regra única de classificação de parcela de boleto (sino e detalhe da venda).
 * - venda cancelada ou parcela cancelada: "cancelado", sem exceção (mesmo que o dado esteja desatualizado);
 * - "gerado" fica gerado;
 * - 1ª parcela nunca é "futuro";
 * - vencida, de hoje ou do mês corrente: "pendente"; demais: "futuro".
 */
export function classifyBoleto(parcela: BoletoParcelaLike, now: Date = new Date()): BoletoDisplayStatus {
  if (parcela.venda_status === "cancelada" || parcela.status === "cancelado") return "cancelado";
  if (parcela.status === "gerado") return "gerado";
  if (parcela.parcela_numero === 1) return "pendente";
  const venc = new Date(parcela.data_vencimento);
  if (isPast(venc) || isToday(venc) || isSameMonth(venc, now)) return "pendente";
  return "futuro";
}

export const BOLETO_AVISO_LABEL: Record<string, string> = {
  cancelar_no_banco: "Dar baixa no banco",
  reemitir_no_banco: "Reemitir no banco",
};

export function boletoAvisoLabel(aviso?: string | null): string {
  if (!aviso) return "";
  return BOLETO_AVISO_LABEL[aviso] ?? "Ação pendente no banco";
}

export interface BoletoGrupo<T> {
  vendaId: string;
  items: T[];
}

/** Agrupa parcelas por venda mantendo a ordem em que cada venda aparece primeiro e a ordem das parcelas. */
export function groupByVenda<T extends { venda_id: string }>(items: T[]): BoletoGrupo<T>[] {
  const map = new Map<string, BoletoGrupo<T>>();
  for (const item of items) {
    let grupo = map.get(item.venda_id);
    if (!grupo) {
      grupo = { vendaId: item.venda_id, items: [] };
      map.set(item.venda_id, grupo);
    }
    grupo.items.push(item);
  }
  return [...map.values()];
}
