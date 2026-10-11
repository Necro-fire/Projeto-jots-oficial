import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { calcularDescontoDosItens } from "./cupomFiscalUtils";

describe("desconto da nota: regra única", () => {
  it("usa o preço de tabela gravado nos itens (o que o PDV mostrou)", () => {
    // 3 itens de R$ 48 vendidos a R$ 38: PDV mostrava desconto de R$ 30
    const desconto = calcularDescontoDosItens(
      [
        { quantity: 1, unit_price: 38, preco_tabela: 48 },
        { quantity: 1, unit_price: 38, preco_tabela: 48 },
        { quantity: 1, unit_price: 38, preco_tabela: 48 },
      ],
      999, // valor gravado na venda é ignorado quando há preço de tabela
    );
    expect(desconto).toBe(30);
  });

  it("respeita a quantidade do item", () => {
    expect(calcularDescontoDosItens([{ quantity: 4, unit_price: 45, preco_tabela: 50 }], 0)).toBe(20);
  });

  it("item cancelado não entra: só os ativos são passados", () => {
    const ativos = [{ quantity: 1, unit_price: 90, preco_tabela: 100 }];
    expect(calcularDescontoDosItens(ativos, 25)).toBe(10);
  });

  it("vendas antigas (sem preço de tabela) mantêm o desconto gravado", () => {
    expect(calcularDescontoDosItens([{ quantity: 1, unit_price: 55, preco_tabela: null }], 10)).toBe(10);
    expect(calcularDescontoDosItens([{ quantity: 1, unit_price: 55 }], 10)).toBe(10);
  });

  it("preço vendido acima da tabela não gera desconto negativo", () => {
    expect(calcularDescontoDosItens([{ quantity: 1, unit_price: 60, preco_tabela: 50 }], 0)).toBe(0);
  });
});
