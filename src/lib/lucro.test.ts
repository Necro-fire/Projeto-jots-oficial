import { describe, expect, it } from "vitest";
import { calcularLucro, type ItemLucro } from "@/lib/lucro";

// Fórmula que o Dashboard usava antes de buscar só os itens do período.
function lucroAntigo(items: ItemLucro[], activeSaleIds: Set<string>) {
  return items
    .filter((vi) => activeSaleIds.has(vi.venda_id))
    .reduce((acc, vi) => {
      const custo = Number(vi.custo_unitario) || 0;
      return acc + (Number(vi.unit_price) - custo) * vi.quantity;
    }, 0);
}

const itens: ItemLucro[] = [
  { venda_id: "v1", quantity: 2, unit_price: 100, custo_unitario: 40 },
  { venda_id: "v1", quantity: 1, unit_price: 50, custo_unitario: 0 },
  { venda_id: "v2", quantity: 3, unit_price: 80, custo_unitario: 30 },
  { venda_id: "v3", quantity: 1, unit_price: 999, custo_unitario: 1 },
  // numeric do Postgres chega como string
  { venda_id: "v2", quantity: 1, unit_price: "25.50" as unknown as number, custo_unitario: "10.25" as unknown as number },
  { venda_id: "v1", quantity: 1, unit_price: 70, custo_unitario: null as unknown as number },
];

describe("calcularLucro", () => {
  it("dá o mesmo resultado da fórmula anterior", () => {
    const ativas = new Set(["v1", "v2"]);
    expect(calcularLucro(itens, ativas)).toBeCloseTo(lucroAntigo(itens, ativas), 10);
  });

  it("soma (preço - custo) × quantidade só das vendas ativas", () => {
    // v1: 2×60 + 1×50 + 1×70 = 240 | v2: 3×50 + 1×15.25 = 165.25
    expect(calcularLucro(itens, new Set(["v1", "v2"]))).toBeCloseTo(405.25, 10);
  });

  it("ignora itens de vendas canceladas ou fora do período", () => {
    expect(calcularLucro(itens, new Set(["v2"]))).toBeCloseTo(165.25, 10);
    expect(calcularLucro(itens, new Set())).toBe(0);
  });

  it("itens extras do servidor (margem de 1 dia) não alteram o total", () => {
    const ativas = new Set(["v1"]);
    const comMargem = [...itens, { venda_id: "fora", quantity: 5, unit_price: 10, custo_unitario: 1 }];
    expect(calcularLucro(comMargem, ativas)).toBe(calcularLucro(itens, ativas));
  });
});
