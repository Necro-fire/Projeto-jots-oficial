import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@/test/renderHook";

const PRODUTOS = [
  { id: "p1", model: "Alfa", filial_id: "1", stock: 3 },
  { id: "p2", model: "Bravo", filial_id: "2", stock: 5 },
  { id: "p3", model: "Charlie", filial_id: "1", stock: 1 },
];

const fromCalls: { table: string; eq: [string, unknown][] }[] = [];

function makeBuilder(table: string) {
  const call = { table, eq: [] as [string, unknown][] };
  fromCalls.push(call);
  const builder: any = {
    select: () => builder,
    order: () => builder,
    gte: () => builder,
    range: () => builder,
    eq: (column: string, value: unknown) => {
      call.eq.push([column, value]);
      return builder;
    },
    then: (resolve: (value: unknown) => void) => {
      const rows = call.eq.some(([c]) => c === "filial_id")
        ? PRODUTOS.filter((p) => call.eq.some(([c, v]) => c === "filial_id" && p.filial_id === v))
        : PRODUTOS;
      resolve({ data: rows, error: null });
    },
  };
  return builder;
}

vi.mock("@/integrations/supabase/client", () => {
  const channel: any = { on: () => channel, subscribe: () => channel };
  return {
    supabase: {
      from: (table: string) => makeBuilder(table),
      channel: () => channel,
      removeChannel: () => undefined,
      auth: { onAuthStateChange: () => undefined },
    },
  };
});

const filialState = { selectedFilial: "all", isFilialRestricted: false };
vi.mock("@/contexts/FilialContext", () => ({
  useFilial: () => filialState,
}));

import { useProducts, clearDataCache } from "./useSupabaseData";

describe("useProducts: troca de filial", () => {
  beforeEach(() => {
    fromCalls.length = 0;
    clearDataCache();
    filialState.selectedFilial = "all";
    filialState.isFilialRestricted = false;
  });

  it("baixa tudo uma vez e filtra na tela ao trocar de filial, sem nova busca", async () => {
    const { result, rerender } = renderHook(() => useProducts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toHaveLength(3);
    expect(fromCalls).toHaveLength(1);

    filialState.selectedFilial = "1";
    rerender();
    expect(result.current.data.map((p) => p.id)).toEqual(["p1", "p3"]);

    filialState.selectedFilial = "2";
    rerender();
    expect(result.current.data.map((p) => p.id)).toEqual(["p2"]);

    filialState.selectedFilial = "all";
    rerender();
    expect(result.current.data).toHaveLength(3);

    expect(fromCalls).toHaveLength(1);
  });

  it("usuário preso a uma filial busca só os produtos dela", async () => {
    filialState.selectedFilial = "2";
    filialState.isFilialRestricted = true;

    const { result } = renderHook(() => useProducts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data.map((p) => p.id)).toEqual(["p2"]);
    expect(fromCalls).toHaveLength(1);
    expect(fromCalls[0].eq).toContainEqual(["filial_id", "2"]);
  });

  it("ao voltar para a tela mostra os dados na hora e revalida em segundo plano", async () => {
    const first = renderHook(() => useProducts());
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    first.unmount();

    const second = renderHook(() => useProducts());
    // Sem esperar nada: já vem do cache.
    expect(second.result.current.loading).toBe(false);
    expect(second.result.current.data).toHaveLength(3);

    await act(async () => {
      await Promise.resolve();
    });
    expect(fromCalls.length).toBeGreaterThanOrEqual(2);
  });
});
