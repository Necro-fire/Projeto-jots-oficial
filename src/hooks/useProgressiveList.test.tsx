import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@/test/renderHook";
import { useProgressiveList } from "./useProgressiveList";

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;

let observers: { callback: ObserverCallback; disconnect: ReturnType<typeof vi.fn> }[] = [];

class FakeIntersectionObserver {
  callback: ObserverCallback;
  disconnect = vi.fn();
  observe = vi.fn();
  constructor(callback: ObserverCallback) {
    this.callback = callback;
    observers.push(this);
  }
}

const items = Array.from({ length: 200 }, (_, i) => ({ id: String(i) }));

beforeEach(() => {
  observers = [];
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Simula o usuário rolando até o fim da lista. */
function scrollToEnd() {
  act(() => {
    observers[observers.length - 1].callback([{ isIntersecting: true }]);
  });
}

function attachSentinel(result: { current: ReturnType<typeof useProgressiveList<{ id: string }>> }) {
  act(() => {
    result.current.sentinelRef(document.createElement("div"));
  });
}

describe("useProgressiveList", () => {
  it("mostra só o primeiro lote e indica que há mais", () => {
    const { result } = renderHook(() => useProgressiveList(items, ["a"], 60));
    expect(result.current.visible).toHaveLength(60);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.total).toBe(200);
  });

  it("libera o próximo lote quando o fim da lista fica visível", () => {
    const { result } = renderHook(() => useProgressiveList(items, ["a"], 60));
    attachSentinel(result);
    scrollToEnd();
    expect(result.current.visible).toHaveLength(120);
  });

  it("não passa do total e deixa de pedir mais", () => {
    const { result } = renderHook(() => useProgressiveList(items.slice(0, 70), ["a"], 60));
    attachSentinel(result);
    scrollToEnd();
    expect(result.current.visible).toHaveLength(70);
    expect(result.current.hasMore).toBe(false);
  });

  it("volta ao primeiro lote quando a chave muda (filial, busca ou filtro)", () => {
    const { result, rerender } = renderHook(({ k }) => useProgressiveList(items, [k], 60), {
      initialProps: { k: "filial-1" },
    });
    attachSentinel(result);
    scrollToEnd();
    expect(result.current.visible).toHaveLength(120);

    rerender({ k: "filial-2" });
    expect(result.current.visible).toHaveLength(60);
  });

  it("não reinicia quando só os itens mudam (evento em tempo real)", () => {
    const { result, rerender } = renderHook(({ list }) => useProgressiveList(list, ["a"], 60), {
      initialProps: { list: items },
    });
    attachSentinel(result);
    scrollToEnd();
    expect(result.current.visible).toHaveLength(120);

    rerender({ list: [...items] });
    expect(result.current.visible).toHaveLength(120);
  });

  it("sem IntersectionObserver mostra a lista inteira", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { result } = renderHook(() => useProgressiveList(items, ["a"], 60));
    expect(result.current.visible).toHaveLength(200);
    expect(result.current.hasMore).toBe(false);
  });
});
