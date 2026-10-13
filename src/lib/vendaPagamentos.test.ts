import { describe, expect, it } from "vitest";
import {
  buildPagamentoMaps,
  chunk,
  mergePagamentoMaps,
  type BoletoRow,
  type SplitRow,
} from "@/lib/vendaPagamentos";

// Lógica que ficava dentro do useEffect de Vendas.tsx.
function mapasAntigos(splitRows: any[], boletoRows: any[]) {
  const splitMap: Record<string, { method: string; amount: number }[]> = {};
  splitRows.forEach((row) => {
    if (!row.venda_id) return;
    if (!splitMap[row.venda_id]) splitMap[row.venda_id] = [];
    splitMap[row.venda_id].push({ method: row.forma_pagamento, amount: Number(row.valor) });
  });
  const boletoMap: Record<string, { installments: number; intervalDays: number }> = {};
  const boletoInstallmentsMap: Record<string, { number: number; amount: number }[]> = {};
  boletoRows.forEach((row) => {
    if (!row.venda_id) return;
    if (!boletoInstallmentsMap[row.venda_id]) boletoInstallmentsMap[row.venda_id] = [];
    boletoInstallmentsMap[row.venda_id].push({ number: Number(row.parcela_numero), amount: Number(row.valor_parcela) });
    const installments = Number(row.total_parcelas || 0);
    const intervalDays = Number(row.intervalo_dias || 0);
    if (!installments || !intervalDays) return;
    const existing = boletoMap[row.venda_id];
    if (!existing || installments > existing.installments) {
      boletoMap[row.venda_id] = { installments, intervalDays };
    }
  });
  return { splitMap, boletoMap, boletoInstallmentsMap };
}

const splits: SplitRow[] = [
  { venda_id: "v1", forma_pagamento: "Pix", valor: "50.00" },
  { venda_id: "v1", forma_pagamento: "Cartão de Crédito 3x", valor: 46 },
  { venda_id: "v2", forma_pagamento: "Dinheiro", valor: 10 },
  { venda_id: null, forma_pagamento: "Pix", valor: 1 },
];

const boletos: BoletoRow[] = [
  { venda_id: "v3", total_parcelas: 3, intervalo_dias: 30, parcela_numero: 1, valor_parcela: 33.33 },
  { venda_id: "v3", total_parcelas: 3, intervalo_dias: 30, parcela_numero: 2, valor_parcela: 34.33 },
  { venda_id: "v3", total_parcelas: 3, intervalo_dias: 30, parcela_numero: 3, valor_parcela: 34.33 },
  { venda_id: "v4", total_parcelas: null, intervalo_dias: 0, parcela_numero: 1, valor_parcela: 10 },
];

describe("buildPagamentoMaps", () => {
  it("produz os mesmos mapas da lógica anterior", () => {
    const antigo = mapasAntigos(splits, boletos);
    const novo = buildPagamentoMaps(splits, boletos);
    expect(novo.splitsByVenda).toEqual(antigo.splitMap);
    expect(novo.boletoMetaByVenda).toEqual(antigo.boletoMap);
    expect(novo.boletoInstallmentsByVenda).toEqual(antigo.boletoInstallmentsMap);
  });

  it("mantém a ordem das linhas dentro da venda", () => {
    const { splitsByVenda } = buildPagamentoMaps(splits, []);
    expect(splitsByVenda.v1.map((s) => s.method)).toEqual(["Pix", "Cartão de Crédito 3x"]);
  });

  it("guarda parcelas sem metadados completos, mas não cria meta", () => {
    const { boletoMetaByVenda, boletoInstallmentsByVenda } = buildPagamentoMaps([], boletos);
    expect(boletoMetaByVenda.v4).toBeUndefined();
    expect(boletoInstallmentsByVenda.v4).toEqual([{ number: 1, amount: 10 }]);
    expect(boletoMetaByVenda.v3).toEqual({ installments: 3, intervalDays: 30 });
  });
});

describe("mergePagamentoMaps", () => {
  it("troca por completo só as vendas recarregadas", () => {
    const base = buildPagamentoMaps(splits, boletos);
    const fresh = buildPagamentoMaps([{ venda_id: "v1", forma_pagamento: "Pix", valor: 96 }], []);

    const merged = mergePagamentoMaps(base, ["v1"], fresh);

    expect(merged.splitsByVenda.v1).toEqual([{ method: "Pix", amount: 96 }]);
    expect(merged.splitsByVenda.v2).toEqual(base.splitsByVenda.v2);
    expect(merged.boletoInstallmentsByVenda.v3).toEqual(base.boletoInstallmentsByVenda.v3);
  });

  it("remove entradas de vendas que não têm mais linhas", () => {
    const base = buildPagamentoMaps(splits, boletos);
    const merged = mergePagamentoMaps(base, ["v3"], buildPagamentoMaps([], []));
    expect(merged.boletoInstallmentsByVenda.v3).toBeUndefined();
    expect(merged.boletoMetaByVenda.v3).toBeUndefined();
  });

  it("não altera o objeto base", () => {
    const base = buildPagamentoMaps(splits, boletos);
    const snapshot = JSON.stringify(base);
    mergePagamentoMaps(base, ["v1"], buildPagamentoMaps([], []));
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});

describe("chunk", () => {
  it("divide em lotes e mantém todos os itens", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 50)).toEqual([]);
  });
});
