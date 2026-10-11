import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));
vi.mock("@/contexts/FilialContext", () => ({
  useFilial: () => ({ selectedFilial: "all" }),
}));

import { createVenda, cancelarVenda, historyDaysFor, DEFAULT_HISTORY_DAYS } from "./useSupabaseData";

const item = {
  produto_id: "p1",
  product_code: "REF-1",
  product_model: "Modelo",
  quantity: 2,
  unit_price: 48,
  custo_unitario: 20,
};

describe("createVenda", () => {
  beforeEach(() => rpc.mockReset());

  it("chama só a RPC criar_venda e não envia usuário, desconto nem custo", async () => {
    rpc.mockResolvedValue({ data: { id: "v1", sale_code: "VND-1" }, error: null });

    const venda = await createVenda([item], "c1", "Cliente", "pix", "stock", "2", undefined, 96);

    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe("criar_venda");
    expect(args._payload).toEqual({
      client_id: "c1",
      client_name: "Cliente",
      payment_method: "pix",
      origin: "stock",
      filial_id: "2",
      total: 96,
      items: [{ produto_id: "p1", quantity: 2, unit_price: 48 }],
      splits: undefined,
    });
    expect(JSON.stringify(args)).not.toMatch(/user|usuario|discount|custo/i);
    expect(venda).toMatchObject({ id: "v1" });
  });

  it("converte pagamento dividido para amount/final_amount", async () => {
    rpc.mockResolvedValue({ data: { id: "v2" }, error: null });

    await createVenda(
      [item], null, "", "Pix/Cartão 3x", "stock", "1",
      [
        { method: "pix", amount: 50 },
        { method: "Cartão 3x", amount: 46, finalAmount: 49.1 },
      ],
      99.1,
    );

    expect(rpc.mock.calls[0][1]._payload.splits).toEqual([
      { method: "pix", amount: 50, final_amount: 50 },
      { method: "Cartão 3x", amount: 46, final_amount: 49.1 },
    ]);
  });

  it("envia consignado_ids para o banco converter o consignado na mesma transação", async () => {
    rpc.mockResolvedValue({ data: { id: "v3" }, error: null });
    await createVenda([item], "c1", "Cliente", "pix", "stock", "2", undefined, 96, ["k1", "k2"]);
    expect(rpc.mock.calls[0][1]._payload.consignado_ids).toEqual(["k1", "k2"]);
  });

  it("sem consignados não envia a chave", async () => {
    rpc.mockResolvedValue({ data: { id: "v4" }, error: null });
    await createVenda([item], "c1", "Cliente", "pix", "stock", "2", undefined, 96, []);
    expect(rpc.mock.calls[0][1]._payload.consignado_ids).toBeUndefined();
  });

  it("propaga o erro do banco (venda recusada não vira sucesso)", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Estoque insuficiente para Modelo. Disponível: 1" } });
    await expect(createVenda([item], null, "", "pix", "stock", "2")).rejects.toThrow(/Estoque insuficiente/);
  });
});

describe("cancelarVenda", () => {
  beforeEach(() => rpc.mockReset());

  it("envia apenas venda e motivo (o usuário vem do token no banco)", async () => {
    rpc.mockResolvedValue({ error: null });
    await cancelarVenda("v1", "cliente desistiu");
    expect(rpc).toHaveBeenCalledWith("cancelar_venda", { _venda_id: "v1", _motivo: "cliente desistiu" });
  });

  it("propaga erro de permissão", async () => {
    rpc.mockResolvedValue({ error: { message: "Sem permissão para cancelar vendas" } });
    await expect(cancelarVenda("v1", "x")).rejects.toThrow(/Sem permissão/);
  });
});

describe("historyDaysFor", () => {
  it("usa a janela padrão para períodos recentes", () => {
    expect(historyDaysFor(new Date())).toBe(DEFAULT_HISTORY_DAYS);
  });

  it("amplia a janela quando o período começa antes dela", () => {
    const from = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
    expect(historyDaysFor(from)).toBeGreaterThanOrEqual(200);
  });
});
