import { describe, expect, it } from "vitest";

import {
  distribuicaoEmCentavos,
  validarCupom,
  type CupomFiscalData,
} from "@/components/CupomFiscal";
import { buildCupomFromPdvData } from "@/lib/cupomFiscalUtils";

describe("cupom fiscal", () => {
  it("distribui centavos de forma determinística sem perder valor", () => {
    expect(distribuicaoEmCentavos(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(distribuicaoEmCentavos(10000, 4)).toEqual([2500, 2500, 2500, 2500]);
  });

  it("valida um cupom com pagamento dividido e somando o total", () => {
    const cupom: CupomFiscalData = {
      empresa: { nome: "Loja Teste" },
      venda: { codigo: "0001", numero: 1, dataHora: "05/10/2026 10:00", operador: "Operador" },
      items: [],
      valorOriginal: 1500,
      desconto: 0,
      valorComDesconto: 1500,
      acrescimo: 0,
      total: 1500,
      pagamentos: [
        { forma: "Dinheiro", tipo: "DINHEIRO", valorBase: 500, acrescimo: 0, valorFinal: 500, parcelas: [{ numero: 1, valor: 500 }] },
        { forma: "Cartão de crédito", tipo: "CREDITO", valorBase: 600, acrescimo: 0, valorFinal: 600, parcelas: [{ numero: 1, valor: 300 }, { numero: 2, valor: 300 }] },
        { forma: "Boleto", tipo: "BOLETO", valorBase: 400, acrescimo: 0, valorFinal: 400, parcelas: [{ numero: 1, prazoDias: 15, valor: 200 }, { numero: 2, prazoDias: 30, valor: 200 }] },
      ],
    };

    expect(validarCupom(cupom)).toEqual({ ok: true, erros: [] });
  });

  it("rejeita boleto sem prazo informado", () => {
    const cupom: CupomFiscalData = {
      empresa: { nome: "Loja Teste" },
      venda: { codigo: "0002", numero: 2, dataHora: "05/10/2026 10:00", operador: "Operador" },
      items: [],
      valorOriginal: 200,
      desconto: 0,
      valorComDesconto: 200,
      acrescimo: 0,
      total: 200,
      pagamentos: [
        { forma: "Boleto", tipo: "BOLETO", valorBase: 200, acrescimo: 0, valorFinal: 200, parcelas: [{ numero: 1, valor: 200 }] },
      ],
    };

    expect(validarCupom(cupom).ok).toBe(false);
    expect(validarCupom(cupom).erros.some((msg) => msg.includes("prazoDias"))).toBe(true);
  });

  it("calcula o valor final do cupom quando há juros em cartão parcelado", () => {
    const cupom = buildCupomFromPdvData({
      vendaCodigo: "0003",
      vendaNumero: 3,
      createdAt: "2026-10-05T10:00:00",
      operador: "Operador",
      items: [{ code: "P1", model: "Produto 1", quantity: 1, unitPrice: 174, total: 174 }],
      subtotal: 174,
      desconto: 0,
      total: 174,
      paymentMethod: "Cartão de Crédito 3x",
      empresa: { nome: "Loja Teste" },
    });

    expect(cupom.total).toBeCloseTo(185.69, 2);
    expect(cupom.acrescimo).toBeCloseTo(11.69, 2);
    expect(validarCupom(cupom).ok).toBe(true);
  });

  it("considera uma única vez o desconto já refletido no subtotal dos itens", () => {
    const cupom = buildCupomFromPdvData({
      vendaCodigo: "0004",
      vendaNumero: 4,
      createdAt: "2026-10-05T10:00:00",
      operador: "Operador",
      items: [{ code: "P1", model: "Produto 1", quantity: 1, unitPrice: 95, total: 95 }],
      subtotal: 95,
      desconto: 5,
      total: 95,
      paymentMethod: "Pix",
      empresa: { nome: "Loja Teste" },
    });

    expect(cupom.valorOriginal).toBe(100);
    expect(cupom.desconto).toBe(5);
    expect(cupom.valorComDesconto).toBe(95);
    expect(cupom.acrescimo).toBe(0);
    expect(cupom.total).toBe(95);
    expect(validarCupom(cupom)).toEqual({ ok: true, erros: [] });
  });
});
