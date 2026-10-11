import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import {
  createConsignado,
  updateConsignadoStatus,
  devolverConsignadoParcial,
  createConsignadoTroca,
  editarConsignado,
  excluirConsignado,
} from "./useConsignados";
import { upsertEstoque } from "./useSupabaseData";

vi.mock("@/contexts/FilialContext", () => ({ useFilial: () => ({ selectedFilial: "all" }) }));

const baseParams = {
  produto_id: "p1",
  cliente_id: "c1",
  filial_id: "2",
  quantidade: 3,
  valor_unitario: 50,
  vendedor_nome: "Fulano (ignorado)",
  observacoes: "obs",
  usuario_id: "u-forjado",
  usuario_nome: "Forjado",
};

describe("consignados: operações no banco", () => {
  beforeEach(() => rpc.mockReset());

  it("criar consignado envia só produto/cliente/filial/quantidade/valor (sem usuário do navegador)", async () => {
    rpc.mockResolvedValue({ data: { id: "k1" }, error: null });
    await createConsignado(baseParams);
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe("criar_consignado");
    expect(args).toEqual({
      _produto_id: "p1", _cliente_id: "c1", _filial_id: "2", _quantidade: 3, _valor_unitario: 50, _observacoes: "obs",
    });
    expect(JSON.stringify(args)).not.toMatch(/usuario|u-forjado|vendedor/i);
  });

  it("estoque insuficiente vira erro (não é mais engolido)", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Estoque insuficiente para X. Disponível: 1" } });
    await expect(createConsignado(baseParams)).rejects.toThrow(/Estoque insuficiente/);
  });

  it("marcar vendido e devolver usam as RPCs corretas", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const p = { usuario_id: "", usuario_nome: "", filial_id: "2", produto_id: "p1", quantidade: 3 };
    await updateConsignadoStatus("k1", "vendido", p);
    expect(rpc).toHaveBeenLastCalledWith("vender_consignado_manual", { _consignado_id: "k1" });
    await updateConsignadoStatus("k1", "devolvido", p);
    expect(rpc).toHaveBeenLastCalledWith("devolver_consignado", { _consignado_id: "k1", _quantidade: 3 });
  });

  it("devolução parcial devolve quantidade devolvida e restante do banco", async () => {
    rpc.mockResolvedValue({ data: { devolvido: 1, restante: 2 }, error: null });
    const r = await devolverConsignadoParcial({
      consignado_id: "k1", quantidade_devolver: 1, produto_id: "p1", filial_id: "2", valor_unitario: 50,
      cliente_id: null, vendedor_nome: "", usuario_id: "", usuario_nome: "", quantidade_total: 3,
    });
    expect(r).toEqual({ devolvidoQty: 1, restante: 2 });
  });

  it("devolução parcial rejeita quantidade inválida sem chamar o banco", async () => {
    await expect(devolverConsignadoParcial({
      consignado_id: "k1", quantidade_devolver: 9, produto_id: "p1", filial_id: "2", valor_unitario: 50,
      cliente_id: null, vendedor_nome: "", usuario_id: "", usuario_nome: "", quantidade_total: 3,
    })).rejects.toThrow(/maior que o disponível/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("troca mapeia o retorno do banco", async () => {
    rpc.mockResolvedValue({
      data: { novo_id: "n1", novo_codigo: "CSG-000009", diferenca: 20, tipo_diferenca: "cliente_paga", parcial: true },
      error: null,
    });
    const r = await createConsignadoTroca({
      consignado_original_id: "k1", novo_produto_id: "p2", novo_quantidade: 1, novo_valor_unitario: 70,
      filial_id: "2", cliente_id: null, vendedor_nome: "", usuario_id: "", usuario_nome: "",
      original_produto_id: "p1", original_quantidade: 3, original_valor_total: 150, troca_quantidade: 1,
    });
    expect(rpc.mock.calls[0][0]).toBe("trocar_consignado");
    expect(r).toEqual({
      novo: { id: "n1", codigo: "CSG-000009" }, diferenca: 20, tipo_diferenca: "cliente_paga", parcial: true,
    });
  });

  it("editar e excluir usam RPC", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await editarConsignado({ consignado_id: "k1", cliente_id: null, quantidade: 2, observacoes: "x" });
    expect(rpc).toHaveBeenLastCalledWith("editar_consignado", {
      _consignado_id: "k1", _cliente_id: null, _quantidade: 2, _observacoes: "x",
    });
    await excluirConsignado("k1");
    expect(rpc).toHaveBeenLastCalledWith("excluir_consignado", { _consignado_id: "k1" });
  });
});

describe("ajuste de estoque", () => {
  beforeEach(() => rpc.mockReset());

  it("upsertEstoque ajusta pelo banco (sem ler e regravar o saldo no navegador)", async () => {
    rpc.mockResolvedValue({ data: 12, error: null });
    const novo = await upsertEstoque("p1", "2", 4);
    expect(rpc).toHaveBeenCalledWith("ajustar_estoque", { _produto_id: "p1", _filial_id: "2", _delta: 4 });
    expect(novo).toBe(12);
  });
});
