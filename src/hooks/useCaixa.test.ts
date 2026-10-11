import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
const select = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: () => ({ select: (...a: unknown[]) => select(...a) }),
  },
}));
vi.mock("@/contexts/FilialContext", () => ({
  useFilial: () => ({ selectedFilial: "all" }),
}));

import { abrirCaixa, fecharCaixa, addMovimentacao, estornarMovimentacao, removeCaixaHistorico } from "./useCaixa";

describe("gestão de caixa (transações no banco)", () => {
  beforeEach(() => {
    rpc.mockReset();
    select.mockReset();
  });

  it("abrirCaixa envia só filial e valor (usuário vem do token)", async () => {
    rpc.mockResolvedValue({ data: "caixa-1", error: null });
    await abrirCaixa("2", 100);
    expect(rpc).toHaveBeenCalledWith("abrir_caixa", { _filial_id: "2", _valor_abertura: 100 });
  });

  it("fecharCaixa não envia valor esperado: o banco calcula", async () => {
    rpc.mockResolvedValue({ data: { esperado: 50, informado: 50, diferenca: 0 }, error: null });
    await fecharCaixa("c1", 50, "ok");
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe("fechar_caixa");
    expect(Object.keys(args).sort()).toEqual(["_caixa_id", "_obs", "_valor_informado"]);
  });

  it("propaga a recusa do banco (caixa duplicado / sem permissão)", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Já existe um caixa aberto para esta filial." } });
    await expect(abrirCaixa("2", 0)).rejects.toThrow(/Já existe um caixa aberto/);
  });

  it("addMovimentacao e estornarMovimentacao usam as RPCs", async () => {
    rpc.mockResolvedValue({ data: "m1", error: null });
    await addMovimentacao("c1", "sangria", 10, "dinheiro", "troco");
    expect(rpc).toHaveBeenLastCalledWith("registrar_movimentacao_caixa", {
      _caixa_id: "c1", _tipo: "sangria", _valor: 10, _forma_pagamento: "dinheiro", _descricao: "troco",
    });
    await estornarMovimentacao("m1", "engano");
    expect(rpc).toHaveBeenLastCalledWith("estornar_movimentacao_caixa", { _mov_id: "m1", _motivo: "engano" });
  });

  it("removeCaixaHistorico recusa caixa com vendas vinculadas", async () => {
    // select(...).eq(...).not(...) -> { count: 3 }
    select.mockReturnValue({ eq: () => ({ not: () => Promise.resolve({ count: 3, error: null }) }) });
    await expect(removeCaixaHistorico("c1")).rejects.toThrow(/vendas vinculadas/);
  });
});
