import type { BoletoMetaInfo } from "@/lib/paymentUtils";

export interface SplitRow {
  venda_id: string | null;
  forma_pagamento: string;
  valor: number | string;
}

export interface BoletoRow {
  venda_id: string | null;
  total_parcelas?: number | string | null;
  intervalo_dias?: number | string | null;
  parcela_numero: number | string;
  valor_parcela: number | string;
}

export interface PagamentoMaps {
  splitsByVenda: Record<string, { method: string; amount: number }[]>;
  boletoMetaByVenda: Record<string, BoletoMetaInfo>;
  boletoInstallmentsByVenda: Record<string, { number: number; amount: number }[]>;
}

/** Agrupa movimentações de caixa e parcelas de boleto por venda (mesma regra da tela de Vendas). */
export function buildPagamentoMaps(splitRows: SplitRow[], boletoRows: BoletoRow[]): PagamentoMaps {
  const splitsByVenda: PagamentoMaps["splitsByVenda"] = {};
  for (const row of splitRows) {
    if (!row.venda_id) continue;
    if (!splitsByVenda[row.venda_id]) splitsByVenda[row.venda_id] = [];
    splitsByVenda[row.venda_id].push({ method: row.forma_pagamento, amount: Number(row.valor) });
  }

  const boletoMetaByVenda: PagamentoMaps["boletoMetaByVenda"] = {};
  const boletoInstallmentsByVenda: PagamentoMaps["boletoInstallmentsByVenda"] = {};
  for (const row of boletoRows) {
    if (!row.venda_id) continue;
    if (!boletoInstallmentsByVenda[row.venda_id]) boletoInstallmentsByVenda[row.venda_id] = [];
    boletoInstallmentsByVenda[row.venda_id].push({
      number: Number(row.parcela_numero),
      amount: Number(row.valor_parcela),
    });
    const installments = Number(row.total_parcelas || 0);
    const intervalDays = Number(row.intervalo_dias || 0);
    if (!installments || !intervalDays) continue;

    const existing = boletoMetaByVenda[row.venda_id];
    if (!existing || installments > existing.installments) {
      boletoMetaByVenda[row.venda_id] = { installments, intervalDays };
    }
  }

  return { splitsByVenda, boletoMetaByVenda, boletoInstallmentsByVenda };
}

/** Junta o resultado de `fresh` ao de `base`, trocando por completo as vendas em `vendaIds`. */
export function mergePagamentoMaps(base: PagamentoMaps, vendaIds: string[], fresh: PagamentoMaps): PagamentoMaps {
  const replace = <V,>(current: Record<string, V>, incoming: Record<string, V>) => {
    const next = { ...current };
    for (const id of vendaIds) delete next[id];
    return Object.assign(next, incoming);
  };
  return {
    splitsByVenda: replace(base.splitsByVenda, fresh.splitsByVenda),
    boletoMetaByVenda: replace(base.boletoMetaByVenda, fresh.boletoMetaByVenda),
    boletoInstallmentsByVenda: replace(base.boletoInstallmentsByVenda, fresh.boletoInstallmentsByVenda),
  };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
