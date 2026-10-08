CREATE OR REPLACE FUNCTION public.cancelar_venda(_venda_id uuid, _motivo text, _user_id uuid, _user_name text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_venda RECORD; v_item RECORD; v_grp RECORD; v_new_qty integer;
BEGIN
  SELECT * INTO v_venda FROM public.vendas WHERE id = _venda_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venda não encontrada'; END IF;
  IF v_venda.status = 'cancelada' THEN RAISE EXCEPTION 'Esta venda já foi cancelada'; END IF;

  FOR v_item IN SELECT * FROM public.venda_items WHERE venda_id = _venda_id AND status <> 'cancelado' LOOP
    PERFORM public.reconcile_inventory_for_product(v_item.produto_id, v_venda.filial_id);
    INSERT INTO public.estoque (produto_id, filial_id, quantidade)
    VALUES (v_item.produto_id, v_venda.filial_id, v_item.quantity)
    ON CONFLICT (produto_id, filial_id)
    DO UPDATE SET quantidade = public.estoque.quantidade + EXCLUDED.quantidade
    RETURNING quantidade INTO v_new_qty;
    UPDATE public.produtos SET stock = v_new_qty WHERE id = v_item.produto_id;
  END LOOP;

  -- Estorna o saldo líquido de TODAS as entradas da venda (todas as formas de pagamento)
  FOR v_grp IN
    SELECT caixa_id, forma_pagamento, SUM(valor) AS saldo
    FROM public.caixa_movimentacoes WHERE venda_id = _venda_id
    GROUP BY caixa_id, forma_pagamento
    HAVING ROUND(SUM(valor), 2) <> 0
  LOOP
    INSERT INTO public.caixa_movimentacoes (caixa_id, tipo, valor, forma_pagamento, descricao, venda_id, usuario_id, usuario_nome)
    VALUES (v_grp.caixa_id, 'cancelamento', -v_grp.saldo, v_grp.forma_pagamento,
      'Cancelamento Venda ' || COALESCE(NULLIF(v_venda.sale_code, ''), '#' || v_venda.number) || ' — ' || _motivo,
      _venda_id, _user_id, _user_name);
  END LOOP;

  UPDATE public.boleto_alertas SET status = 'cancelado', updated_at = now() WHERE venda_id = _venda_id;

  UPDATE public.vendas SET status = 'cancelada', cancelled_at = now(), cancelled_by_id = _user_id,
    cancelled_by_name = _user_name, motivo_cancelamento = _motivo
  WHERE id = _venda_id;
END;
$function$;