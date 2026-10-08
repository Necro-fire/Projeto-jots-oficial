-- Repair only sales whose stored total exactly matches the old double-discount
-- formula. Payment movements are used for split sales; payment rows are never
-- modified by this migration.
WITH item_totals AS (
  SELECT
    vi.venda_id,
    COUNT(*) AS item_count,
    SUM(vi.total) AS items_total,
    BOOL_AND(COALESCE(vi.status, 'active') <> 'cancelado') AS all_items_active
  FROM public.venda_items vi
  GROUP BY vi.venda_id
),
payment_totals AS (
  SELECT
    cm.venda_id,
    COUNT(*) AS payment_count,
    SUM(cm.valor) AS payments_total
  FROM public.caixa_movimentacoes cm
  WHERE cm.tipo = 'venda'
    AND cm.venda_id IS NOT NULL
  GROUP BY cm.venda_id
),
repair_candidates AS (
  SELECT
    v.id,
    CASE
      WHEN COALESCE(pt.payment_count, 0) > 1
        AND POSITION('/' IN v.payment_method) > 0
        AND pt.payments_total > 0
        AND ROUND(pt.payments_total, 2) <> ROUND(v.total, 2)
      THEN ROUND(pt.payments_total, 2)
      ELSE ROUND(it.items_total, 2)
    END AS corrected_total
  FROM public.vendas v
  JOIN item_totals it ON it.venda_id = v.id
  LEFT JOIN payment_totals pt ON pt.venda_id = v.id
  WHERE COALESCE(v.discount, 0) > 0
    AND v.status <> 'cancelada'
    AND it.item_count > 0
    AND it.all_items_active
    AND it.items_total > v.discount
    AND ROUND(v.total, 2) = ROUND(it.items_total - v.discount, 2)
    AND NOT EXISTS (
      SELECT 1
      FROM public.venda_item_cancelamentos vic
      WHERE vic.venda_id = v.id
    )
    AND (
      (
        COALESCE(pt.payment_count, 0) > 1
        AND POSITION('/' IN v.payment_method) > 0
        AND pt.payments_total > 0
        AND ROUND(pt.payments_total, 2) <> ROUND(v.total, 2)
      )
      OR
      (
        COALESCE(pt.payment_count, 0) <= 1
        AND LOWER(BTRIM(v.payment_method)) IN (
          'dinheiro',
          'pix',
          'debito',
          'débito',
          'cartão de débito',
          'cartao de debito',
          'consignado',
          'prazo'
        )
      )
    )
)
UPDATE public.vendas v
SET total = rc.corrected_total
FROM repair_candidates rc
WHERE v.id = rc.id
  AND rc.corrected_total > 0
  AND ROUND(v.total, 2) <> rc.corrected_total;
