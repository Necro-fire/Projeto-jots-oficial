
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
BEGIN
  -- 1. Lock and validate the venda
  SELECT * INTO v_venda FROM vendas WHERE id = _venda_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda não encontrada';
  END IF;
  IF v_venda.status = 'cancelada' THEN
    RAISE EXCEPTION 'Esta venda já foi cancelada';
  END IF;

  -- 2. Reverse stock for each item
  FOR v_item IN SELECT * FROM venda_items WHERE venda_id = _venda_id LOOP
    -- Reverse estoque
    UPDATE estoque
    SET quantidade = quantidade + v_item.quantity
    WHERE produto_id = v_item.produto_id AND filial_id = v_venda.filial_id;

    -- Reverse produtos.stock
    UPDATE produtos
    SET stock = stock + v_item.quantity
    WHERE id = v_item.produto_id;
  END LOOP;

  -- 3. Reverse caixa movimentacao if exists
  SELECT id, caixa_id, valor INTO v_mov
  FROM caixa_movimentacoes
  WHERE venda_id = _venda_id AND tipo = 'venda'
  LIMIT 1;

  IF FOUND THEN
    INSERT INTO caixa_movimentacoes (caixa_id, tipo, valor, forma_pagamento, descricao, venda_id, usuario_id, usuario_nome)
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

  -- 4. Mark venda as cancelled
  UPDATE vendas SET
    status = 'cancelada',
    cancelled_at = now(),
    cancelled_by_id = _user_id,
    cancelled_by_name = _user_name,
    motivo_cancelamento = _motivo
  WHERE id = _venda_id;
END;
$$;
