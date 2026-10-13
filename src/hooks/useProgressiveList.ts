import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_PAGE_SIZE = 60;
/** Começa a trazer o próximo lote antes de o usuário chegar ao fim da lista. */
const PRELOAD_MARGIN = "800px";

/**
 * Renderiza uma lista grande aos poucos: mostra os primeiros itens e acrescenta mais conforme o
 * usuário rola. Evita montar milhares de cartões de uma vez ao trocar de filial ou de filtro.
 *
 * `resetDeps` volta ao primeiro lote quando algum valor muda (filial, busca, filtros). Mudanças nos
 * próprios itens (evento em tempo real, item no carrinho) não reiniciam a lista.
 */
export function useProgressiveList<T>(
  items: T[],
  resetDeps: readonly unknown[],
  pageSize = DEFAULT_PAGE_SIZE,
) {
  const [count, setCount] = useState(pageSize);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const supportsObserver = typeof IntersectionObserver !== "undefined";

  // Reinício durante a renderização: não chega a montar o lote antigo com os dados novos.
  const lastDeps = useRef(resetDeps);
  const changed =
    lastDeps.current.length !== resetDeps.length ||
    lastDeps.current.some((value, index) => !Object.is(value, resetDeps[index]));
  if (changed) {
    lastDeps.current = resetDeps;
    if (count !== pageSize) setCount(pageSize);
  }

  const hasMore = supportsObserver && count < items.length;
  const visible = useMemo(
    () => (supportsObserver ? items.slice(0, count) : items),
    [items, count, supportsObserver],
  );

  // Elemento no fim da lista: quando fica visível, libera o próximo lote.
  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!node || !supportsObserver) return;

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setCount((current) => current + pageSize);
          }
        },
        { rootMargin: PRELOAD_MARGIN },
      );
      observer.observe(node);
      observerRef.current = observer;
    },
    [pageSize, supportsObserver],
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { visible, hasMore, sentinelRef, total: items.length };
}
