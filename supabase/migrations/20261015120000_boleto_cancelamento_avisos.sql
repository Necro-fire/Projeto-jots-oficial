-- Boletos x cancelamento de venda + avisos de ação no banco.
-- NÃO APLICADA: depende de 20261010130000 (cancelar_venda / cancelar_item_venda / reverter_cancelamento_venda).
-- Idempotente: pode ser reaplicada.
--
-- Problemas tratados:
--  1. Venda cancelada deixava vendas.status_boleto como 'pendente'/'gerado' (filtro e selo da lista de Vendas).
--  2. Qualquer admin podia reativar uma parcela de venda cancelada pelo detalhe da venda (voltava ao sino).
--  3. Cancelar UM item não recalculava as parcelas: o boleto seguia cobrando o valor cheio.
--  4. Parcela já "gerada" (emitida no banco) sumia para "Cancelado" sem aviso de dar baixa no banco.
--  5. Desfazer o cancelamento devolvia todas as parcelas para 'pendente', perdendo as que eram "gerado".
--  6. Vendas antigas já canceladas ainda tinham parcela pendente/gerada.
--  7. Status da venda (vendas.status_boleto) e das parcelas (boleto_alertas.status) não conversavam.

-- ───────────────────────────────────────────────────────────────────────────
-- 0) Estrutura
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.boleto_alertas ADD COLUMN IF NOT EXISTS status_anterior text;
-- 'cancelar_no_banco' | 'reemitir_no_banco' | NULL (sem aviso). Aviso fica até alguém marcar como resolvido.
ALTER TABLE public.boleto_alertas ADD COLUMN IF NOT EXISTS aviso text;
ALTER TABLE public.boleto_alertas ADD COLUMN IF NOT EXISTS aviso_detalhe text;
ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS status_boleto_anterior text;

CREATE INDEX IF NOT EXISTS idx_boleto_alertas_venda ON public.boleto_alertas (venda_id);
CREATE INDEX IF NOT EXISTS idx_boleto_alertas_aviso ON public.boleto_alertas (aviso) WHERE aviso IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Guarda: parcela de venda cancelada não muda (só as RPCs, com app.boleto_override = 'on')
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.boleto_alertas_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF COALESCE(current_setting('app.boleto_override', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  SELECT status INTO v_status FROM public.vendas WHERE id = OLD.venda_id;
  IF v_status = 'cancelada' THEN
    RAISE EXCEPTION 'Venda cancelada: os boletos dela não podem ser alterados.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_boleto_alertas_guard ON public.boleto_alertas;
CREATE TRIGGER tr_boleto_alertas_guard
BEFORE UPDATE ON public.boleto_alertas
FOR EACH ROW EXECUTE FUNCTION public.boleto_alertas_guard();

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Auxiliares (uso interno das RPCs)
-- ───────────────────────────────────────────────────────────────────────────
-- Cancela todas as parcelas da venda. Parcela já gerada ganha aviso para dar baixa no banco.
CREATE OR REPLACE FUNCTION public._boleto_cancelar_venda(_venda_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.boleto_override', 'on', true);

  UPDATE public.boleto_alertas
  SET status_anterior = status,
      aviso = CASE WHEN status = 'gerado' THEN 'cancelar_no_banco' ELSE NULL END,
      aviso_detalhe = CASE WHEN status = 'gerado'
        THEN 'Boleto já emitido (R$ ' || to_char(valor_parcela, 'FM999999990.00') || '): dar baixa no banco'
        ELSE NULL END,
      status = 'cancelado',
      updated_at = now()
  WHERE venda_id = _venda_id AND status <> 'cancelado';

  UPDATE public.vendas
  SET status_boleto_anterior = CASE WHEN status_boleto <> '' THEN status_boleto ELSE status_boleto_anterior END,
      status_boleto = ''
  WHERE id = _venda_id;

  PERFORM set_config('app.boleto_override', '', true);
END;
$$;

-- Item cancelado: parcelas ainda ativas passam a refletir o novo total (mesma proporção do estorno).
-- Parcela já gerada tem o valor atualizado e ganha aviso para reemitir no banco.
CREATE OR REPLACE FUNCTION public._boleto_ajustar_parcelas(_venda_id uuid, _fator numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _fator IS NULL OR _fator < 0 OR _fator >= 1 THEN
    RETURN;
  END IF;

  UPDATE public.boleto_alertas
  SET aviso = CASE WHEN status = 'gerado' THEN 'reemitir_no_banco' ELSE aviso END,
      aviso_detalhe = CASE WHEN status = 'gerado'
        THEN 'Boleto emitido com R$ ' || to_char(valor_parcela, 'FM999999990.00')
             || '; novo valor R$ ' || to_char(ROUND(valor_parcela * _fator, 2), 'FM999999990.00')
             || ': reemitir no banco'
        ELSE aviso_detalhe END,
      valor_parcela = ROUND(valor_parcela * _fator, 2),
      updated_at = now()
  WHERE venda_id = _venda_id AND status IN ('pendente', 'gerado');
END;
$$;

-- vendas.status_boleto acompanha as parcelas: 'gerado' quando nenhuma parcela ativa está pendente.
CREATE OR REPLACE FUNCTION public._boleto_sincronizar_venda(_venda_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.vendas v
  SET status_boleto = CASE
        WHEN EXISTS (SELECT 1 FROM public.boleto_alertas a WHERE a.venda_id = v.id AND a.status = 'pendente')
        THEN 'pendente' ELSE 'gerado' END
  WHERE v.id = _venda_id
    AND v.status <> 'cancelada'
    AND v.status_boleto <> ''
    AND EXISTS (SELECT 1 FROM public.boleto_alertas a WHERE a.venda_id = v.id AND a.status <> 'cancelado');
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) cancelar_venda: igual à versão anterior + boletos tratados pelo auxiliar
-- ───────────────────────────────────────────────────────────────────────────
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
  v_caixa uuid;
  v_label text;
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

  v_label := COALESCE(NULLIF(v_venda.sale_code, ''), '#' || v_venda.number);

  SELECT id INTO v_caixa FROM public.caixas WHERE filial_id = v_venda.filial_id AND status = 'aberto';

  IF v_caixa IS NULL AND EXISTS (
    SELECT 1 FROM public.caixa_movimentacoes
    WHERE venda_id = _venda_id
    GROUP BY forma_pagamento HAVING ROUND(SUM(valor), 2) <> 0
  ) THEN
    RAISE EXCEPTION 'Abra o caixa da filial % para registrar o estorno desta venda.', v_venda.filial_id;
  END IF;

  PERFORM set_config('app.estoque_origem', 'cancelamento_venda', true);
  PERFORM set_config('app.estoque_ref', _venda_id::text, true);

  FOR v_item IN
    SELECT * FROM public.venda_items
    WHERE venda_id = _venda_id AND COALESCE(status, 'active') <> 'cancelado'
    FOR UPDATE
  LOOP
    INSERT INTO public.estoque (produto_id, filial_id, quantidade)
    VALUES (v_item.produto_id, v_venda.filial_id, v_item.quantity)
    ON CONFLICT (produto_id, filial_id)
    DO UPDATE SET quantidade = public.estoque.quantidade + EXCLUDED.quantidade;

    UPDATE public.venda_items SET status = 'cancelado' WHERE id = v_item.id;

    INSERT INTO public.venda_item_cancelamentos
      (venda_id, venda_item_id, produto_id, quantity, unit_price, motivo, usuario_id, usuario_nome, origem)
    VALUES
      (_venda_id, v_item.id, v_item.produto_id, v_item.quantity, v_item.unit_price,
       COALESCE(_motivo, ''), v_uid, v_nome, 'venda');
  END LOOP;

  FOR v_grp IN
    SELECT forma_pagamento, SUM(valor) AS saldo
    FROM public.caixa_movimentacoes
    WHERE venda_id = _venda_id
    GROUP BY forma_pagamento
    HAVING ROUND(SUM(valor), 2) <> 0
  LOOP
    INSERT INTO public.caixa_movimentacoes
      (caixa_id, tipo, valor, forma_pagamento, descricao, venda_id, usuario_id, usuario_nome)
    VALUES (
      v_caixa, 'cancelamento', -ROUND(v_grp.saldo, 2), v_grp.forma_pagamento,
      'Cancelamento Venda ' || v_label || ' — ' || COALESCE(_motivo, ''),
      _venda_id, v_uid, v_nome
    );
  END LOOP;

  PERFORM public._boleto_cancelar_venda(_venda_id);

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

-- ───────────────────────────────────────────────────────────────────────────
-- 4) cancelar_item_venda: igual à versão anterior + parcelas recalculadas / boletos cancelados
-- ───────────────────────────────────────────────────────────────────────────
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
  v_grp RECORD;
  v_caixa uuid;
  v_sum_ativos numeric;
  v_n_ativos integer;
  v_is_last boolean;
  v_refund numeric;
  v_refund_total numeric := 0;
  v_item_desc numeric;
  v_label text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_permission(v_uid, 'vendas', 'cancel')) THEN
    RAISE EXCEPTION 'Sem permissão para cancelar itens de venda' USING ERRCODE = '42501';
  END IF;
  v_nome := public.current_user_name();

  SELECT * INTO v_item FROM public.venda_items WHERE id = _venda_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item não encontrado';
  END IF;

  SELECT * INTO v_venda FROM public.vendas WHERE id = v_item.venda_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda não encontrada';
  END IF;
  PERFORM public.assert_filial_access(v_venda.filial_id);
  IF v_venda.status = 'cancelada' THEN
    RAISE EXCEPTION 'Esta venda já foi cancelada';
  END IF;

  SELECT * INTO v_item FROM public.venda_items WHERE id = _venda_item_id FOR UPDATE;
  IF COALESCE(v_item.status, 'active') = 'cancelado' THEN
    RAISE EXCEPTION 'Este item já foi cancelado';
  END IF;

  v_label := COALESCE(NULLIF(v_venda.sale_code, ''), '#' || v_venda.number);

  SELECT COALESCE(SUM(total), 0), COUNT(*) INTO v_sum_ativos, v_n_ativos
  FROM public.venda_items
  WHERE venda_id = v_item.venda_id AND COALESCE(status, 'active') <> 'cancelado';
  v_is_last := v_n_ativos <= 1;

  SELECT id INTO v_caixa FROM public.caixas WHERE filial_id = v_venda.filial_id AND status = 'aberto';
  IF v_caixa IS NULL AND EXISTS (
    SELECT 1 FROM public.caixa_movimentacoes
    WHERE venda_id = v_item.venda_id
    GROUP BY forma_pagamento HAVING ROUND(SUM(valor), 2) > 0
  ) THEN
    RAISE EXCEPTION 'Abra o caixa da filial % para registrar o estorno deste item.', v_venda.filial_id;
  END IF;

  PERFORM set_config('app.estoque_origem', 'cancelamento_item', true);
  PERFORM set_config('app.estoque_ref', v_item.venda_id::text, true);

  UPDATE public.venda_items SET status = 'cancelado' WHERE id = _venda_item_id;

  INSERT INTO public.estoque (produto_id, filial_id, quantidade)
  VALUES (v_item.produto_id, v_venda.filial_id, v_item.quantity)
  ON CONFLICT (produto_id, filial_id)
  DO UPDATE SET quantidade = public.estoque.quantidade + EXCLUDED.quantidade;

  INSERT INTO public.venda_item_cancelamentos
    (venda_id, venda_item_id, produto_id, quantity, unit_price, motivo, usuario_id, usuario_nome, origem)
  VALUES
    (v_item.venda_id, _venda_item_id, v_item.produto_id, v_item.quantity, v_item.unit_price,
     COALESCE(_motivo, ''), v_uid, v_nome, CASE WHEN v_is_last THEN 'venda' ELSE 'item' END);

  FOR v_grp IN
    SELECT forma_pagamento, SUM(valor) AS saldo
    FROM public.caixa_movimentacoes
    WHERE venda_id = v_item.venda_id
    GROUP BY forma_pagamento
    HAVING ROUND(SUM(valor), 2) > 0
  LOOP
    v_refund := CASE
      WHEN v_is_last THEN ROUND(v_grp.saldo, 2)
      ELSE ROUND(v_grp.saldo * v_item.total / NULLIF(v_sum_ativos, 0), 2)
    END;
    IF COALESCE(v_refund, 0) > 0 THEN
      INSERT INTO public.caixa_movimentacoes
        (caixa_id, tipo, valor, forma_pagamento, descricao, venda_id, usuario_id, usuario_nome)
      VALUES (
        v_caixa, CASE WHEN v_is_last THEN 'cancelamento' ELSE 'cancelamento_item' END,
        -v_refund, v_grp.forma_pagamento,
        'Cancel. item ' || COALESCE(v_item.product_code, '') || ' — Venda ' || v_label || ' — ' || COALESCE(_motivo, ''),
        v_item.venda_id, v_uid, v_nome
      );
      v_refund_total := v_refund_total + v_refund;
    END IF;
  END LOOP;

  IF v_is_last THEN
    PERFORM public._boleto_cancelar_venda(v_item.venda_id);
    UPDATE public.vendas
    SET status = 'cancelada', cancelled_at = now(), cancelled_by_id = v_uid,
        cancelled_by_name = v_nome, motivo_cancelamento = COALESCE(_motivo, '')
    WHERE id = v_item.venda_id;
  ELSE
    v_item_desc := GREATEST(COALESCE(v_item.preco_tabela, v_item.unit_price) - v_item.unit_price, 0) * v_item.quantity;
    UPDATE public.vendas
    SET total = GREATEST(total - v_refund_total, 0),
        discount = GREATEST(COALESCE(discount, 0) - v_item_desc, 0)
    WHERE id = v_item.venda_id;

    -- Boleto: as parcelas acompanham o novo total da venda.
    PERFORM public._boleto_ajustar_parcelas(
      v_item.venda_id,
      (v_sum_ativos - v_item.total) / NULLIF(v_sum_ativos, 0)
    );
  END IF;

  INSERT INTO public.audit_logs (user_id, user_name, action, module, details)
  VALUES (v_uid, v_nome, 'cancel_sale_item', 'vendas',
          jsonb_build_object('venda_id', v_item.venda_id, 'venda_item_id', _venda_item_id,
                             'motivo', COALESCE(_motivo, ''), 'filial_id', v_venda.filial_id,
                             'ultimo_item', v_is_last));
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) reverter_cancelamento_venda: parcelas voltam ao status que tinham
--    (gerada sem baixa registrada continua gerada; gerada já baixada precisa ser reemitida)
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reverter_cancelamento_venda(_venda_id uuid, _motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text;
  v_venda RECORD;
  v_canc RECORD;
  v_grp RECORD;
  v_caixa uuid;
  v_qtd integer;
  v_label text;
  v_n integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_permission(v_uid, 'vendas', 'cancel')) THEN
    RAISE EXCEPTION 'Sem permissão para desfazer cancelamentos' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(btrim(_motivo), '') = '' THEN
    RAISE EXCEPTION 'Informe o motivo para desfazer o cancelamento';
  END IF;
  v_nome := public.current_user_name();

  SELECT * INTO v_venda FROM public.vendas WHERE id = _venda_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda não encontrada';
  END IF;
  PERFORM public.assert_filial_access(v_venda.filial_id);
  IF v_venda.status <> 'cancelada' THEN
    RAISE EXCEPTION 'Só é possível desfazer o cancelamento de uma venda cancelada';
  END IF;

  v_label := COALESCE(NULLIF(v_venda.sale_code, ''), '#' || v_venda.number);

  SELECT id INTO v_caixa FROM public.caixas WHERE filial_id = v_venda.filial_id AND status = 'aberto';
  IF v_caixa IS NULL THEN
    RAISE EXCEPTION 'Abra o caixa da filial % para desfazer o cancelamento.', v_venda.filial_id;
  END IF;

  PERFORM set_config('app.estoque_origem', 'reversao_cancelamento', true);
  PERFORM set_config('app.estoque_ref', _venda_id::text, true);

  FOR v_canc IN
    SELECT c.*, i.status AS item_status
    FROM public.venda_item_cancelamentos c
    JOIN public.venda_items i ON i.id = c.venda_item_id
    WHERE c.venda_id = _venda_id AND c.origem = 'venda' AND c.revertido_em IS NULL
    FOR UPDATE OF c
  LOOP
    SELECT quantidade INTO v_qtd FROM public.estoque
    WHERE produto_id = v_canc.produto_id AND filial_id = v_venda.filial_id FOR UPDATE;

    IF COALESCE(v_qtd, 0) < v_canc.quantity THEN
      RAISE EXCEPTION 'Estoque insuficiente para desfazer o cancelamento (produto %). Disponível: %, necessário: %',
        v_canc.produto_id, COALESCE(v_qtd, 0), v_canc.quantity;
    END IF;

    UPDATE public.estoque SET quantidade = quantidade - v_canc.quantity
    WHERE produto_id = v_canc.produto_id AND filial_id = v_venda.filial_id;

    UPDATE public.venda_items
    SET status = CASE WHEN v_venda.origin = 'consignado' THEN 'consignado' ELSE 'active' END
    WHERE id = v_canc.venda_item_id;

    UPDATE public.venda_item_cancelamentos SET revertido_em = now() WHERE id = v_canc.id;
    v_n := v_n + 1;
  END LOOP;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'Não há itens cancelados desta venda para restaurar';
  END IF;

  FOR v_grp IN
    SELECT forma_pagamento, -SUM(valor) AS valor
    FROM public.caixa_movimentacoes
    WHERE venda_id = _venda_id AND tipo = 'cancelamento'
    GROUP BY forma_pagamento
    HAVING ROUND(-SUM(valor), 2) <> 0
  LOOP
    INSERT INTO public.caixa_movimentacoes
      (caixa_id, tipo, valor, forma_pagamento, descricao, venda_id, usuario_id, usuario_nome)
    VALUES (
      v_caixa, 'reversao_cancelamento', ROUND(v_grp.valor, 2), v_grp.forma_pagamento,
      'Cancelamento desfeito — Venda ' || v_label || ' — ' || btrim(_motivo),
      _venda_id, v_uid, v_nome
    );
  END LOOP;

  PERFORM set_config('app.boleto_override', 'on', true);
  UPDATE public.boleto_alertas
  SET status = CASE
        WHEN status_anterior = 'gerado' AND aviso IS NULL THEN 'pendente'   -- já baixado no banco: gerar de novo
        WHEN status_anterior = 'gerado' THEN 'gerado'                       -- baixa ainda não feita: boleto segue valendo
        ELSE COALESCE(NULLIF(status_anterior, ''), 'pendente') END,
      aviso = CASE WHEN status_anterior = 'gerado' AND aviso IS NULL THEN 'reemitir_no_banco' ELSE NULL END,
      aviso_detalhe = CASE WHEN status_anterior = 'gerado' AND aviso IS NULL
        THEN 'Boleto foi baixado no cancelamento da venda: gerar novamente' ELSE NULL END,
      status_anterior = NULL,
      updated_at = now()
  WHERE venda_id = _venda_id AND status = 'cancelado';

  UPDATE public.vendas
  SET status_boleto = COALESCE(status_boleto_anterior, status_boleto),
      status_boleto_anterior = NULL
  WHERE id = _venda_id;
  PERFORM set_config('app.boleto_override', '', true);

  UPDATE public.vendas
  SET status = 'concluida', cancelled_at = NULL, cancelled_by_id = NULL,
      cancelled_by_name = NULL, motivo_cancelamento = NULL
  WHERE id = _venda_id;

  INSERT INTO public.audit_logs (user_id, user_name, action, module, details)
  VALUES (v_uid, v_nome, 'undo_cancel_sale', 'vendas',
          jsonb_build_object('venda_id', _venda_id, 'motivo', btrim(_motivo),
                             'filial_id', v_venda.filial_id, 'itens_restaurados', v_n));
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 6) Alterar status do boleto (parcela ou venda inteira) e resolver avisos
--    Só admin altera status (mesma regra das políticas de UPDATE de vendas e boleto_alertas).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.alterar_status_boleto(_alerta_id uuid, _status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text;
  v_alerta RECORD;
  v_venda RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores alteram o status de boletos' USING ERRCODE = '42501';
  END IF;
  IF _status NOT IN ('pendente', 'gerado') THEN
    RAISE EXCEPTION 'Status de boleto inválido';
  END IF;
  v_nome := public.current_user_name();

  SELECT * INTO v_alerta FROM public.boleto_alertas WHERE id = _alerta_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Boleto não encontrado';
  END IF;
  SELECT * INTO v_venda FROM public.vendas WHERE id = v_alerta.venda_id;
  PERFORM public.assert_filial_access(v_venda.filial_id);
  IF v_venda.status = 'cancelada' OR v_alerta.status = 'cancelado' THEN
    RAISE EXCEPTION 'Este boleto está cancelado e não pode ser alterado';
  END IF;

  UPDATE public.boleto_alertas SET status = _status, updated_at = now() WHERE id = _alerta_id;
  PERFORM public._boleto_sincronizar_venda(v_alerta.venda_id);

  INSERT INTO public.audit_logs (user_id, user_name, action, module, details)
  VALUES (v_uid, v_nome, 'boleto_status', 'vendas',
          jsonb_build_object('alerta_id', _alerta_id, 'venda_id', v_alerta.venda_id,
                             'de', v_alerta.status, 'para', _status));
END;
$$;

CREATE OR REPLACE FUNCTION public.definir_status_boleto_venda(_venda_id uuid, _status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text;
  v_venda RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores alteram o status de boletos' USING ERRCODE = '42501';
  END IF;
  IF _status NOT IN ('pendente', 'gerado') THEN
    RAISE EXCEPTION 'Status de boleto inválido';
  END IF;
  v_nome := public.current_user_name();

  SELECT * INTO v_venda FROM public.vendas WHERE id = _venda_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda não encontrada';
  END IF;
  PERFORM public.assert_filial_access(v_venda.filial_id);
  IF v_venda.status = 'cancelada' THEN
    RAISE EXCEPTION 'Venda cancelada: os boletos dela não podem ser alterados.';
  END IF;

  UPDATE public.boleto_alertas SET status = _status, updated_at = now()
  WHERE venda_id = _venda_id AND status <> 'cancelado';
  UPDATE public.vendas SET status_boleto = _status WHERE id = _venda_id;

  INSERT INTO public.audit_logs (user_id, user_name, action, module, details)
  VALUES (v_uid, v_nome, 'boleto_status_venda', 'vendas',
          jsonb_build_object('venda_id', _venda_id, 'para', _status));
END;
$$;

CREATE OR REPLACE FUNCTION public.resolver_aviso_boleto(_alerta_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text;
  v_alerta RECORD;
  v_filial text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin')
       OR public.has_permission(v_uid, 'vendas', 'cancel')
       OR public.has_permission(v_uid, 'vendas', 'manage')) THEN
    RAISE EXCEPTION 'Sem permissão para resolver avisos de boleto' USING ERRCODE = '42501';
  END IF;
  v_nome := public.current_user_name();

  SELECT * INTO v_alerta FROM public.boleto_alertas WHERE id = _alerta_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Boleto não encontrado';
  END IF;
  SELECT filial_id INTO v_filial FROM public.vendas WHERE id = v_alerta.venda_id;
  PERFORM public.assert_filial_access(v_filial);

  PERFORM set_config('app.boleto_override', 'on', true);
  UPDATE public.boleto_alertas
  SET aviso = NULL, aviso_detalhe = NULL, updated_at = now()
  WHERE id = _alerta_id;
  PERFORM set_config('app.boleto_override', '', true);

  INSERT INTO public.audit_logs (user_id, user_name, action, module, details)
  VALUES (v_uid, v_nome, 'boleto_aviso_resolvido', 'vendas',
          jsonb_build_object('alerta_id', _alerta_id, 'venda_id', v_alerta.venda_id, 'aviso', v_alerta.aviso));
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 7) Reparo de dados: vendas JÁ canceladas com parcela viva
--    Nenhum valor financeiro é alterado; parcela já gerada ganha o aviso de baixa.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM set_config('app.boleto_override', 'on', true);

  UPDATE public.boleto_alertas a
  SET status_anterior = a.status,
      aviso = CASE WHEN a.status = 'gerado' THEN 'cancelar_no_banco' ELSE NULL END,
      aviso_detalhe = CASE WHEN a.status = 'gerado'
        THEN 'Boleto já emitido (R$ ' || to_char(a.valor_parcela, 'FM999999990.00') || '): dar baixa no banco'
        ELSE NULL END,
      status = 'cancelado',
      updated_at = now()
  FROM public.vendas v
  WHERE v.id = a.venda_id AND v.status = 'cancelada' AND a.status <> 'cancelado';

  UPDATE public.vendas
  SET status_boleto_anterior = status_boleto,
      status_boleto = ''
  WHERE status = 'cancelada' AND status_boleto <> '';

  PERFORM set_config('app.boleto_override', '', true);
END
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 8) Diagnóstico de boletos (somente leitura)
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.diagnostico_boletos()
RETURNS TABLE (problema text, venda_id uuid, sale_code text, filial_id text, detalhe text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (
       public.has_role(auth.uid(), 'admin')
    OR public.has_permission(auth.uid(), 'caixa', 'manage')) THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT 'cancelada_com_boleto_ativo'::text, v.id, v.sale_code, v.filial_id,
         COUNT(*)::text || ' parcela(s) ainda ' || string_agg(DISTINCT a.status, '/')
  FROM public.vendas v JOIN public.boleto_alertas a ON a.venda_id = v.id
  WHERE v.status = 'cancelada' AND a.status <> 'cancelado'
  GROUP BY v.id, v.sale_code, v.filial_id
  UNION ALL
  SELECT 'cancelada_com_status_boleto', v.id, v.sale_code, v.filial_id, 'status_boleto=' || v.status_boleto
  FROM public.vendas v
  WHERE v.status = 'cancelada' AND v.status_boleto <> ''
  UNION ALL
  SELECT 'venda_ativa_com_parcela_cancelada', v.id, v.sale_code, v.filial_id,
         COUNT(*)::text || ' parcela(s) canceladas'
  FROM public.vendas v JOIN public.boleto_alertas a ON a.venda_id = v.id
  WHERE v.status <> 'cancelada' AND a.status = 'cancelado'
  GROUP BY v.id, v.sale_code, v.filial_id
  UNION ALL
  SELECT 'aviso_de_baixa_pendente', v.id, v.sale_code, v.filial_id,
         COUNT(*)::text || ' boleto(s) aguardando baixa/reemissão no banco'
  FROM public.vendas v JOIN public.boleto_alertas a ON a.venda_id = v.id
  WHERE a.aviso IS NOT NULL
  GROUP BY v.id, v.sale_code, v.filial_id;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 9) Permissões de execução
-- ───────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.cancelar_venda(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancelar_item_venda(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reverter_cancelamento_venda(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.alterar_status_boleto(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.definir_status_boleto_venda(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolver_aviso_boleto(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.diagnostico_boletos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_venda(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancelar_item_venda(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reverter_cancelamento_venda(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.alterar_status_boleto(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.definir_status_boleto_venda(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolver_aviso_boleto(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.diagnostico_boletos() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.boleto_alertas_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._boleto_cancelar_venda(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._boleto_ajustar_parcelas(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._boleto_sincronizar_venda(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._boleto_cancelar_venda(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._boleto_ajustar_parcelas(uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public._boleto_sincronizar_venda(uuid) TO service_role;
