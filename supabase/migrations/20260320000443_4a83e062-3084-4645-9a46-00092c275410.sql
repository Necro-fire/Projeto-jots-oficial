-- 1) Deduplicate estoque rows by produto+filial (keep oldest row with summed quantity)
WITH ranked AS (
  SELECT
    id,
    produto_id,
    filial_id,
    SUM(quantidade) OVER (PARTITION BY produto_id, filial_id) AS total_qtd,
    ROW_NUMBER() OVER (PARTITION BY produto_id, filial_id ORDER BY created_at, id) AS rn
  FROM public.estoque
), upd AS (
  UPDATE public.estoque e
  SET quantidade = r.total_qtd
  FROM ranked r
  WHERE e.id = r.id AND r.rn = 1
  RETURNING e.id
)
DELETE FROM public.estoque e
USING ranked r
WHERE e.id = r.id
  AND r.rn > 1;

-- 2) Enforce one estoque row per produto+filial
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'estoque_produto_filial_unique'
      AND conrelid = 'public.estoque'::regclass
  ) THEN
    ALTER TABLE public.estoque
      ADD CONSTRAINT estoque_produto_filial_unique UNIQUE (produto_id, filial_id);
  END IF;
END $$;

-- 3) Reconciliation helper: keep estoque/produtos synchronized and non-negative
CREATE OR REPLACE FUNCTION public.reconcile_inventory_for_product(
  _produto_id uuid,
  _filial_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock integer;
BEGIN
  SELECT stock INTO v_stock
  FROM public.produtos
  WHERE id = _produto_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado';
  END IF;

  v_stock := GREATEST(COALESCE(v_stock, 0), 0);

  INSERT INTO public.estoque (produto_id, filial_id, quantidade)
  VALUES (_produto_id, _filial_id, v_stock)
  ON CONFLICT (produto_id, filial_id)
  DO UPDATE SET quantidade = EXCLUDED.quantidade;

  UPDATE public.produtos
  SET stock = v_stock
  WHERE id = _produto_id;
END;
$$;

-- 4) Safe stock reduction on sale item insert (prevents negative stock)
CREATE OR REPLACE FUNCTION public.reduce_stock_on_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filial_id text;
  v_current_qty integer;
  v_new_qty integer;
BEGIN
  SELECT filial_id INTO v_filial_id
  FROM public.vendas
  WHERE id = NEW.venda_id;

  IF v_filial_id IS NULL THEN
    RAISE EXCEPTION 'Venda inválida para redução de estoque';
  END IF;

  PERFORM public.reconcile_inventory_for_product(NEW.produto_id, v_filial_id);

  SELECT quantidade INTO v_current_qty
  FROM public.estoque
  WHERE produto_id = NEW.produto_id
    AND filial_id = v_filial_id
  FOR UPDATE;

  IF v_current_qty < NEW.quantity THEN
    RAISE EXCEPTION 'Estoque insuficiente para produto % (disponível: %, solicitado: %)',
      NEW.produto_id, v_current_qty, NEW.quantity;
  END IF;

  v_new_qty := v_current_qty - NEW.quantity;

  UPDATE public.estoque
  SET quantidade = v_new_qty
  WHERE produto_id = NEW.produto_id
    AND filial_id = v_filial_id;

  UPDATE public.produtos
  SET stock = v_new_qty
  WHERE id = NEW.produto_id;

  RETURN NEW;
END;
$$;

-- 5) Atomic cancellation with required order: estoque -> produtos -> caixa -> venda status
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

  -- A) Estoque e produtos primeiro
  FOR v_item IN
    SELECT * FROM public.venda_items WHERE venda_id = _venda_id
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

  -- B) Caixa
  SELECT id, caixa_id, valor INTO v_mov
  FROM public.caixa_movimentacoes
  WHERE venda_id = _venda_id
    AND tipo = 'venda'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.caixa_movimentacoes (
      caixa_id, tipo, valor, forma_pagamento, descricao, venda_id, usuario_id, usuario_nome
    )
    VALUES (
      v_mov.caixa_id,
      'cancelamento',
      -v_mov.valor,
      v_venda.payment_method,
      'Cancelamento Venda #' || v_venda.number || ' — ' || _motivo,
      _venda_id,
      _user_id,
      _user_name
    );
  END IF;

  -- C) Status da venda por último (PDV/relatórios passam a ignorar)
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

-- 6) Ensure only one active trigger for stock reduction
DROP TRIGGER IF EXISTS on_venda_item_insert ON public.venda_items;
DROP TRIGGER IF EXISTS tr_reduce_stock ON public.venda_items;
DROP TRIGGER IF EXISTS tr_reduce_stock_once ON public.venda_items;

CREATE TRIGGER tr_reduce_stock_once
AFTER INSERT ON public.venda_items
FOR EACH ROW
EXECUTE FUNCTION public.reduce_stock_on_sale();

-- 7) One-time normalization of existing data to avoid stale validation errors
UPDATE public.estoque e
SET quantidade = GREATEST(COALESCE(p.stock, 0), 0)
FROM public.produtos p
WHERE p.id = e.produto_id
  AND p.filial_id = e.filial_id
  AND e.quantidade <> GREATEST(COALESCE(p.stock, 0), 0);

INSERT INTO public.estoque (produto_id, filial_id, quantidade)
SELECT p.id, p.filial_id, GREATEST(COALESCE(p.stock, 0), 0)
FROM public.produtos p
LEFT JOIN public.estoque e
  ON e.produto_id = p.id
 AND e.filial_id = p.filial_id
WHERE e.id IS NULL;
