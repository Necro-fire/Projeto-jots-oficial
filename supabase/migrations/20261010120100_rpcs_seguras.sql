-- RPCs financeiras seguras (itens 4.2 e 5.3 do Melhorias.md).
--  * Usuário vem de auth.uid(), nunca do cliente.
--  * Exige permissão `vendas.cancel` (ou admin) e acesso à filial da venda.
--  * EXECUTE retirado de PUBLIC/anon em todas as funções do schema public.
-- Idempotente: pode ser reaplicada.

-- 1) Helpers --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_name()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT nome FROM public.profiles WHERE id = auth.uid()), '')
$$;

-- Admin opera qualquer filial; os demais só a própria (funcionarios_auth.filial_id).
CREATE OR REPLACE FUNCTION public.assert_filial_access(_filial_id text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_filial text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;

  IF public.has_role(v_uid, 'admin') THEN
    RETURN;
  END IF;

  SELECT filial_id INTO v_filial
  FROM public.funcionarios_auth
  WHERE user_id = v_uid AND COALESCE(status, 'active') = 'active'
  LIMIT 1;

  IF v_filial IS NULL OR v_filial <> _filial_id THEN
    RAISE EXCEPTION 'Sem acesso a esta filial' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- 2) cancelar_venda -----------------------------------------------------------
-- A assinatura antiga recebia _user_id/_user_name do cliente (forjável).
DROP FUNCTION IF EXISTS public.cancelar_venda(uuid, text, uuid, text);

CREATE OR REPLACE FUNCTION public.cancelar_venda(_venda_id uuid, _motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text;
  v_venda RECORD;
  v_item RECORD;
  v_grp RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_permission(v_uid, 'vendas', 'cancel')) THEN
    RAISE EXCEPTION 'Sem permissão para cancelar vendas' USING ERRCODE = '42501';
  END IF;
  v_nome := public.current_user_name();

  SELECT * INTO v_venda FROM public.vendas WHERE id = _venda_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda não encontrada';
  END IF;
  PERFORM public.assert_filial_access(v_venda.filial_id);

  IF v_venda.status = 'cancelada' THEN
    RAISE EXCEPTION 'Esta venda já foi cancelada';
  END IF;

  PERFORM set_config('app.estoque_origem', 'cancelamento_venda', true);
  PERFORM set_config('app.estoque_ref', _venda_id::text, true);

  -- Devolve o saldo só à filial da venda
  FOR v_item IN
    SELECT * FROM public.venda_items
    WHERE venda_id = _venda_id AND COALESCE(status, 'active') <> 'cancelado'
  LOOP
    INSERT INTO public.estoque (produto_id, filial_id, quantidade)
    VALUES (v_item.produto_id, v_venda.filial_id, v_item.quantity)
    ON CONFLICT (produto_id, filial_id)
    DO UPDATE SET quantidade = public.estoque.quantidade + EXCLUDED.quantidade;
  END LOOP;

  -- Estorna o saldo líquido de cada forma de pagamento da venda
  FOR v_grp IN
    SELECT caixa_id, forma_pagamento, SUM(valor) AS saldo
    FROM public.caixa_movimentacoes
    WHERE venda_id = _venda_id
    GROUP BY caixa_id, forma_pagamento
    HAVING ROUND(SUM(valor), 2) <> 0
  LOOP
    INSERT INTO public.caixa_movimentacoes
      (caixa_id, tipo, valor, forma_pagamento, descricao, venda_id, usuario_id, usuario_nome)
    VALUES (
      v_grp.caixa_id, 'cancelamento', -v_grp.saldo, v_grp.forma_pagamento,
      'Cancelamento Venda ' || COALESCE(NULLIF(v_venda.sale_code, ''), '#' || v_venda.number) || ' — ' || COALESCE(_motivo, ''),
      _venda_id, v_uid, v_nome
    );
  END LOOP;

  UPDATE public.boleto_alertas SET status = 'cancelado', updated_at = now() WHERE venda_id = _venda_id;

  UPDATE public.vendas
  SET status = 'cancelada',
      cancelled_at = now(),
      cancelled_by_id = v_uid,
      cancelled_by_name = v_nome,
      motivo_cancelamento = COALESCE(_motivo, '')
  WHERE id = _venda_id;

  INSERT INTO public.audit_logs (user_id, user_name, action, module, details)
  VALUES (v_uid, v_nome, 'cancel_sale', 'vendas',
          jsonb_build_object('venda_id', _venda_id, 'motivo', COALESCE(_motivo, ''), 'filial_id', v_venda.filial_id));
END;
$$;

-- 3) cancelar_item_venda ------------------------------------------------------
DROP FUNCTION IF EXISTS public.cancelar_item_venda(uuid, text, uuid, text);

CREATE OR REPLACE FUNCTION public.cancelar_item_venda(_venda_item_id uuid, _motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text;
  v_item RECORD;
  v_venda RECORD;
  v_mov RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_permission(v_uid, 'vendas', 'cancel')) THEN
    RAISE EXCEPTION 'Sem permissão para cancelar itens de venda' USING ERRCODE = '42501';
  END IF;
  v_nome := public.current_user_name();

  SELECT * INTO v_item FROM public.venda_items WHERE id = _venda_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item não encontrado';
  END IF;
  IF v_item.status = 'cancelado' THEN
    RAISE EXCEPTION 'Este item já foi cancelado';
  END IF;

  SELECT * INTO v_venda FROM public.vendas WHERE id = v_item.venda_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda não encontrada';
  END IF;
  PERFORM public.assert_filial_access(v_venda.filial_id);

  IF v_venda.status = 'cancelada' THEN
    RAISE EXCEPTION 'Esta venda já foi cancelada';
  END IF;

  UPDATE public.venda_items SET status = 'cancelado' WHERE id = _venda_item_id;

  PERFORM set_config('app.estoque_origem', 'cancelamento_item', true);
  PERFORM set_config('app.estoque_ref', v_item.venda_id::text, true);

  INSERT INTO public.estoque (produto_id, filial_id, quantidade)
  VALUES (v_item.produto_id, v_venda.filial_id, v_item.quantity)
  ON CONFLICT (produto_id, filial_id)
  DO UPDATE SET quantidade = public.estoque.quantidade + EXCLUDED.quantidade;

  UPDATE public.vendas SET total = total - v_item.total WHERE id = v_item.venda_id;

  INSERT INTO public.venda_item_cancelamentos
    (venda_id, venda_item_id, produto_id, quantity, unit_price, motivo, usuario_id, usuario_nome)
  VALUES
    (v_item.venda_id, _venda_item_id, v_item.produto_id, v_item.quantity, v_item.unit_price,
     COALESCE(_motivo, ''), v_uid, v_nome);

  SELECT id, caixa_id INTO v_mov
  FROM public.caixa_movimentacoes
  WHERE venda_id = v_item.venda_id AND tipo = 'venda'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.caixa_movimentacoes
      (caixa_id, tipo, valor, forma_pagamento, descricao, venda_id, usuario_id, usuario_nome)
    VALUES (
      v_mov.caixa_id, 'cancelamento_item', -v_item.total, v_venda.payment_method,
      'Cancel. item ' || v_item.product_code || ' — Venda #' || v_venda.number,
      v_item.venda_id, v_uid, v_nome
    );
  END IF;

  INSERT INTO public.audit_logs (user_id, user_name, action, module, details)
  VALUES (v_uid, v_nome, 'cancel_sale_item', 'vendas',
          jsonb_build_object('venda_id', v_item.venda_id, 'venda_item_id', _venda_item_id,
                             'motivo', COALESCE(_motivo, ''), 'filial_id', v_venda.filial_id));
END;
$$;

-- 4) Ninguém forja tentativas de login para bloquear terceiros -----------------
-- A auth-api grava em login_attempts com service_role; o cliente não precisa inserir.
DROP POLICY IF EXISTS "anyone_insert_login_attempts" ON public.login_attempts;

-- 5) EXECUTE: nada para PUBLIC/anon; authenticated e service_role mantêm acesso ---
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END
$$;

-- Funções que só os triggers/RPCs internos usam: o cliente não chama direto.
REVOKE EXECUTE ON FUNCTION public.reduce_stock_on_sale() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.estoque_registrar_movimentacao() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.estoque_sincronizar_produto() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.produtos_stock_derivado() FROM authenticated;

-- Novas funções criadas daqui em diante já nascem sem EXECUTE para PUBLIC/anon.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

-- 6) O código de recuperação mestre foi descontinuado (a redefinição de senha agora é feita
-- por um administrador): não deixa o valor em texto puro no banco.
DELETE FROM public.system_settings WHERE key = 'recovery_code';
