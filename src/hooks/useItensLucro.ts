import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFilial } from "@/contexts/FilialContext";
import type { ItemLucro } from "@/lib/lucro";

const PAGE_SIZE = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Espera para agrupar várias alterações de venda seguidas em uma única busca. */
const REFRESH_DEBOUNCE_MS = 400;
const EMPTY_ITEMS: ItemLucro[] = [];

/**
 * Itens de venda do período, só com as colunas usadas no lucro.
 *
 * O servidor devolve um conjunto um pouco maior que o necessário (margem de 1 dia nas pontas);
 * quem chama filtra pelas vendas ativas, então o resultado final é o mesmo de antes, sem baixar
 * a tabela inteira. `refreshKey` muda quando as vendas mudam (nova venda, cancelamento…).
 */
export function useItensLucro(
  range: { from: Date; to: Date },
  refreshKey: string,
  enabled: boolean,
) {
  const { selectedFilial, isFilialRestricted } = useFilial();
  const fromMs = range.from.getTime();
  const toMs = range.to.getTime();
  // Quem vê várias filiais baixa os itens de todas uma vez e a tela separa pela filial das vendas ativas;
  // assim trocar de filial não refaz a busca.
  const filialId = isFilialRestricted && selectedFilial !== "all" ? selectedFilial : null;
  const scopeKey = `${fromMs}|${toMs}|${filialId ?? "-"}`;

  const [state, setState] = useState<{ key: string; items: ItemLucro[] } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const timer = setTimeout(async () => {
      const fromIso = new Date(fromMs - DAY_MS).toISOString();
      const toIso = new Date(toMs + DAY_MS).toISOString();
      const all: ItemLucro[] = [];

      for (let page = 0; page < 1000; page++) {
        let query = (supabase as any)
          .from("venda_items")
          .select("id, venda_id, quantity, unit_price, custo_unitario, vendas!inner(created_at, filial_id)")
          .gte("vendas.created_at", fromIso)
          .lte("vendas.created_at", toIso);
        if (filialId) query = query.eq("vendas.filial_id", filialId);
        query = query.order("id", { ascending: true }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        const { data, error } = await query;
        if (cancelled) return;
        if (error) {
          console.error("Erro ao carregar itens para o lucro:", error.message);
          return;
        }
        const batch = (data ?? []) as ItemLucro[];
        all.push(...batch);
        if (batch.length < PAGE_SIZE) break;
      }

      if (!cancelled) setState({ key: scopeKey, items: all });
    }, REFRESH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, fromMs, toMs, filialId, scopeKey, refreshKey]);

  // Itens de outro período/filial nunca entram na conta.
  return state?.key === scopeKey ? state.items : EMPTY_ITEMS;
}
