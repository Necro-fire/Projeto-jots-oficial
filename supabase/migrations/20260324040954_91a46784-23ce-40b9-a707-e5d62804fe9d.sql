
-- Table to log individual item cancellations
CREATE TABLE public.venda_item_cancelamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL REFERENCES public.vendas(id),
  venda_item_id uuid NOT NULL REFERENCES public.venda_items(id),
  produto_id uuid NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  motivo text NOT NULL DEFAULT '',
  usuario_id uuid NOT NULL,
  usuario_nome text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.venda_item_cancelamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_item_cancel" ON public.venda_item_cancelamentos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add status column to venda_items
ALTER TABLE public.venda_items ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Function to cancel a single item from a sale
CREATE OR REPLACE FUNCTION public.cancelar_item_venda(
  _venda_item_id uuid,
  _motivo text,
  _user_id uuid,
  _user_name text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_item RECORD;
  v_venda RECORD;
  v_new_qty integer;
BEGIN
  SELECT * INTO v_item FROM public.venda_items WHERE id = _venda_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item não encontrado'; END IF;
  IF v_item.status = 'cancelado' THEN RAISE EXCEPTION 'Este item já foi cancelado'; END IF;

  SELECT * INTO v_venda FROM public.vendas WHERE id = v_item.venda_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venda não encontrada'; END IF;
  IF v_venda.status = 'cancelada' THEN RAISE EXCEPTION 'Esta venda já foi cancelada'; END IF;

  -- Mark item as cancelled
  UPDATE public.venda_items SET status = 'cancelado' WHERE id = _venda_item_id;

  -- Restore stock
  PERFORM public.reconcile_inventory_for_product(v_item.produto_id, v_venda.filial_id);

  INSERT INTO public.estoque (produto_id, filial_id, quantidade)
  VALUES (v_item.produto_id, v_venda.filial_id, v_item.quantity)
  ON CONFLICT (produto_id, filial_id)
  DO UPDATE SET quantidade = public.estoque.quantidade + EXCLUDED.quantidade
  RETURNING quantidade INTO v_new_qty;

  UPDATE public.produtos SET stock = v_new_qty WHERE id = v_item.produto_id;

  -- Update sale total
  UPDATE public.vendas
  SET total = total - v_item.total,
      discount = discount
  WHERE id = v_item.venda_id;

  -- Log cancellation
  INSERT INTO public.venda_item_cancelamentos (
    venda_id, venda_item_id, produto_id, quantity, unit_price, motivo, usuario_id, usuario_nome
  ) VALUES (
    v_item.venda_id, _venda_item_id, v_item.produto_id, v_item.quantity, v_item.unit_price, _motivo, _user_id, _user_name
  );

  -- Reverse in caixa
  DECLARE
    v_mov RECORD;
  BEGIN
    SELECT id, caixa_id INTO v_mov
    FROM public.caixa_movimentacoes
    WHERE venda_id = v_item.venda_id AND tipo = 'venda'
    ORDER BY created_at DESC LIMIT 1;

    IF FOUND THEN
      INSERT INTO public.caixa_movimentacoes (
        caixa_id, tipo, valor, forma_pagamento, descricao, venda_id, usuario_id, usuario_nome
      ) VALUES (
        v_mov.caixa_id, 'cancelamento_item', -v_item.total, v_venda.payment_method,
        'Cancel. item ' || v_item.product_code || ' — Venda #' || v_venda.number,
        v_item.venda_id, _user_id, _user_name
      );
    END IF;
  END;
END;
$$;
