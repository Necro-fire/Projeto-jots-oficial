import { describe, expect, it } from "vitest";

import { boletoAvisoLabel, classifyBoleto, groupByVenda } from "./boletoStatus";

const now = new Date(2026, 9, 15, 12, 0, 0); // 15/out/2026

describe("classifyBoleto", () => {
  it("parcela cancelada é cancelada", () => {
    expect(classifyBoleto({ status: "cancelado", data_vencimento: "2026-10-20T12:00:00Z" }, now)).toBe("cancelado");
  });

  it("venda cancelada cancela a parcela mesmo com status antigo", () => {
    expect(classifyBoleto({ status: "pendente", data_vencimento: "2026-10-01T12:00:00Z", venda_status: "cancelada" }, now)).toBe("cancelado");
    expect(classifyBoleto({ status: "gerado", data_vencimento: "2026-10-01T12:00:00Z", venda_status: "cancelada" }, now)).toBe("cancelado");
  });

  it("gerado continua gerado", () => {
    expect(classifyBoleto({ status: "gerado", data_vencimento: "2027-03-01T12:00:00Z" }, now)).toBe("gerado");
  });

  it("1ª parcela nunca é futuro", () => {
    expect(classifyBoleto({ status: "pendente", parcela_numero: 1, data_vencimento: "2027-03-01T12:00:00Z" }, now)).toBe("pendente");
  });

  it("vencida ou do mês corrente é pendente; mês seguinte em diante é futuro", () => {
    expect(classifyBoleto({ status: "pendente", parcela_numero: 2, data_vencimento: "2026-09-10T12:00:00Z" }, now)).toBe("pendente");
    expect(classifyBoleto({ status: "pendente", parcela_numero: 2, data_vencimento: "2026-10-28T12:00:00Z" }, now)).toBe("pendente");
    expect(classifyBoleto({ status: "pendente", parcela_numero: 2, data_vencimento: "2026-12-10T12:00:00Z" }, now)).toBe("futuro");
  });
});

describe("avisos e agrupamento", () => {
  it("rótulos dos avisos", () => {
    expect(boletoAvisoLabel("cancelar_no_banco")).toBe("Dar baixa no banco");
    expect(boletoAvisoLabel("reemitir_no_banco")).toBe("Reemitir no banco");
    expect(boletoAvisoLabel(null)).toBe("");
  });

  it("agrupa parcelas por venda mantendo a ordem", () => {
    const grupos = groupByVenda([
      { venda_id: "b", n: 1 },
      { venda_id: "a", n: 1 },
      { venda_id: "b", n: 2 },
    ]);
    expect(grupos.map(g => g.vendaId)).toEqual(["b", "a"]);
    expect(grupos[0].items.map(i => i.n)).toEqual([1, 2]);
  });
});
