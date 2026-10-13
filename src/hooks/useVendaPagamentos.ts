import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  buildPagamentoMaps,
  chunk,
  mergePagamentoMaps,
  type BoletoRow,
  type PagamentoMaps,
  type SplitRow,
} from "@/lib/vendaPagamentos";

/** Vendas por consulta. Boletos podem ter muitas parcelas; o lote pequeno mantém cada resposta abaixo de 1000 linhas. */
const CHUNK_SIZE = 50;
/** Agrupa eventos seguidos (várias vendas/atualizações) em uma única busca. */
const DEBOUNCE_MS = 300;

const EMPTY: PagamentoMaps = {
  splitsByVenda: {},
  boletoMetaByVenda: {},
  boletoInstallmentsByVenda: {},
};

/**
 * Formas de pagamento e parcelas de boleto das vendas informadas.
 * Busca só as vendas novas ou cujo status mudou, em vez de refazer tudo a cada evento.
 */
export function useVendaPagamentos(vendas: { id: string; status: string }[]): PagamentoMaps {
  const [maps, setMaps] = useState<PagamentoMaps>(EMPTY);
  const mapsRef = useRef<PagamentoMaps>(EMPTY);
  const loaded = useRef(new Map<string, string>());

  useEffect(() => {
    const pending = vendas.filter((v) => loaded.current.get(v.id) !== v.status);
    if (pending.length === 0) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      const ids = pending.map((v) => v.id);
      const splitRows: SplitRow[] = [];
      const boletoRows: BoletoRow[] = [];

      try {
        await Promise.all(
          chunk(ids, CHUNK_SIZE).map(async (part) => {
            const [splits, boletos] = await Promise.all([
              (supabase as any)
                .from("caixa_movimentacoes")
                .select("venda_id, forma_pagamento, valor")
                .eq("tipo", "venda")
                .in("venda_id", part),
              (supabase as any)
                .from("boleto_alertas")
                .select("venda_id, total_parcelas, intervalo_dias, parcela_numero, valor_parcela")
                .in("venda_id", part),
            ]);
            if (splits.error) throw new Error(splits.error.message);
            if (boletos.error) throw new Error(boletos.error.message);
            splitRows.push(...((splits.data ?? []) as SplitRow[]));
            boletoRows.push(...((boletos.data ?? []) as BoletoRow[]));
          }),
        );
      } catch (err) {
        // Mantém o que já estava na tela; a próxima mudança tenta de novo.
        console.error("Erro ao carregar formas de pagamento:", (err as Error).message);
        return;
      }
      if (cancelled) return;

      const next = mergePagamentoMaps(mapsRef.current, ids, buildPagamentoMaps(splitRows, boletoRows));
      for (const v of pending) loaded.current.set(v.id, v.status);
      mapsRef.current = next;
      setMaps(next);
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [vendas]);

  return maps;
}
