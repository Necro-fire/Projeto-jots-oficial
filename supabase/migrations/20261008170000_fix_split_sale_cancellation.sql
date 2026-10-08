-- Reconcile split-sale cancellations produced by the previous function,
-- which recorded a single reversal for only the latest payment movement.
WITH split_sales AS (
  SELECT v.id, v.payment_method
  FROM public.vendas v
  JOIN public.caixa_movimentacoes cm
    ON cm.venda_id = v.id
   AND cm.tipo = 'venda'
  WHERE v.status = 'cancelada'
  GROUP BY v.id, v.payment_method
  HAVING COUNT(*) > 1
     AND POSITION('/' IN v.payment_method) > 0
),
legacy_reversals AS (
  SELECT cm.id, cm.caixa_id, cm.venda_id, cm.valor, cm.forma_pagamento, cm.usuario_id, cm.usuario_nome, cm.descricao
  FROM public.caixa_movimentacoes cm
  JOIN split_sales ss ON ss.id = cm.venda_id
  WHERE cm.tipo = 'cancelamento'
    AND cm.forma_pagamento = ss.payment_method
    AND cm.descricao LIKE 'Cancelamento Venda #%'
)
INSERT INTO public.caixa_movimentacoes (
  caixa_id, tipo, valor, forma_pagamento, descricao, venda_id, usuario_id, usuario_nome
)
SELECT
  lr.caixa_id,
  'cancelamento',
  ABS(lr.valor),
  lr.forma_pagamento,
  'Estorno de cancelamento agregado legado — ' || lr.descricao,
  lr.venda_id,
  lr.usuario_id,
  lr.usuario_nome
FROM legacy_reversals lr
WHERE NOT EXISTS (
  SELECT 1
  FROM public.caixa_movimentacoes adjustment
  WHERE adjustment.venda_id = lr.venda_id
    AND adjustment.tipo = 'cancelamento'
    AND adjustment.forma_pagamento = lr.forma_pagamento
    AND ROUND(adjustment.valor, 2) = ROUND(ABS(lr.valor), 2)
    AND adjustment.descricao = 'Estorno de cancelamento agregado legado — ' || lr.descricao
);

INSERT INTO public.caixa_movimentacoes (
  caixa_id, tipo, valor, forma_pagamento, descricao, venda_id, usuario_id, usuario_nome
)
SELECT
  cm.caixa_id,
  'cancelamento',
  -cm.valor,
  cm.forma_pagamento,
  'Cancelamento de forma de pagamento da venda #' || v.number || ' — ' || COALESCE(v.motivo_cancelamento, ''),
  v.id,
  cm.usuario_id,
  COALESCE(v.cancelled_by_name, cm.usuario_nome, '')
FROM public.vendas v
JOIN public.caixa_movimentacoes cm
  ON cm.venda_id = v.id
 AND cm.tipo = 'venda'
WHERE v.status = 'cancelada'
  AND POSITION('/' IN v.payment_method) > 0
  AND (
    SELECT COUNT(*)
    FROM public.caixa_movimentacoes original
    WHERE original.venda_id = v.id
      AND original.tipo = 'venda'
  ) > 1
  AND NOT EXISTS (
    SELECT 1
    FROM public.caixa_movimentacoes reversal
    WHERE reversal.venda_id = v.id
      AND reversal.tipo = 'cancelamento'
      AND reversal.forma_pagamento = cm.forma_pagamento
      AND ROUND(reversal.valor, 2) = ROUND(-cm.valor, 2)
      AND reversal.descricao LIKE 'Cancelamento de forma de pagamento da venda #%'
  );

CREATE OR REPLACE FUNCTION public.cancelar_venda(
  _venda_id uuid,
  _motivo text,
  _user_id uuid,
  _user_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venda RECORD;
  v_item RECORD;
  v_mov RECORD;
  v_new_qty integer;
BEGIN
  SELECT * INTO v_venda
  FROM public.vendas
  WHERE id = _venda_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda não encontrada';
  END IF;

  IF v_venda.status = 'cancelada' THEN
    RAISE EXCEPTION 'Esta venda já foi cancelada';
  END IF;

  FOR v_item IN
    SELECT *
    FROM public.venda_items
    WHERE venda_id = _venda_id
      AND COALESCE(status, 'active') <> 'cancelado'
  LOOP
    PERFORM public.reconcile_inventory_for_product(v_item.produto_id, v_venda.filial_id);

    INSERT INTO public.estoque (produto_id, filial_id, quantidade)
    VALUES (v_item.produto_id, v_venda.filial_id, v_item.quantity)
    ON CONFLICT (produto_id, filial_id)
    DO UPDATE SET quantidade = public.estoque.quantidade + EXCLUDED.quantidade
    RETURNING quantidade INTO v_new_qty;

    UPDATE public.produtos
    SET stock = v_new_qty
    WHERE id = v_item.produto_id;
  END LOOP;

  FOR v_mov IN
    SELECT caixa_id, valor, forma_pagamento
    FROM public.caixa_movimentacoes
    WHERE venda_id = _venda_id
      AND tipo = 'venda'
    ORDER BY created_at, id
  LOOP
    INSERT INTO public.caixa_movimentacoes (
      caixa_id, tipo, valor, forma_pagamento, descricao, venda_id, usuario_id, usuario_nome
    )
    VALUES (
      v_mov.caixa_id,
      'cancelamento',
      -v_mov.valor,
      v_mov.forma_pagamento,
      'Cancelamento Venda #' || v_venda.number || ' — ' || _motivo || ' (' || v_mov.forma_pagamento || ')',
      _venda_id,
      _user_id,
      _user_name
    );
  END LOOP;

  UPDATE public.boleto_alertas
  SET status = 'cancelado', updated_at = now()
  WHERE venda_id = _venda_id;

  UPDATE public.vendas
  SET
    status = 'cancelada',
    cancelled_at = now(),
    cancelled_by_id = _user_id,
    cancelled_by_name = _user_name,
    motivo_cancelamento = _motivo
  WHERE id = _venda_id;
END;
$$;
