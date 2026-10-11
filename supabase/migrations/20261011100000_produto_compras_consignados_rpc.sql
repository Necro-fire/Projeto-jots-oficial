-- Operações de produto/estoque, compras de fornecedor e consignados como transações no banco.
--
-- Antes, cada tela fazia vários passos soltos pelo navegador (gravar produto, depois estoque,
-- depois caixa...). Uma falha no meio deixava dado pela metade. Agora cada operação é uma única
-- função: tudo é gravado ou nada é. Usuário, permissão e filial são determinados no banco.
--
-- Defeitos corrigidos junto:
--  * Compra/ajuste/cancelamento de compra lançavam o caixa como 'saida'/'entrada', tipos que o saldo
--    do caixa ignorava; cancelar a compra apagava o registro sem devolver o estoque que ela havia
--    colocado; o lançamento não tinha vínculo com a compra (agora há compra_id).
--  * Estoque de consignado era baixado com Math.max(0, ...) (estoque insuficiente passava em silêncio).
--  * Converter um consignado em venda baixava o estoque uma SEGUNDA vez (a baixa já havia sido feita
--    quando o consignado foi criado).
-- Idempotente: pode ser reaplicada.

-- ───────────────────────────────────────────────────────────────────────────
-- 0) Estrutura
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.compras_fornecedor ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativa';
ALTER TABLE public.compras_fornecedor ADD COLUMN IF NOT EXISTS cancelada_em timestamptz;
ALTER TABLE public.compras_fornecedor ADD COLUMN IF NOT EXISTS cancelada_por text;
ALTER TABLE public.compras_fornecedor ADD COLUMN IF NOT EXISTS motivo_cancelamento text;

ALTER TABLE public.caixa_movimentacoes
  ADD COLUMN IF NOT EXISTS compra_id uuid REFERENCES public.compras_fornecedor(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_caixa_mov_compra ON public.caixa_movimentacoes (compra_id);

-- 'saida' (legado das compras) reduz o saldo; 'entrada' aumenta.
CREATE OR REPLACE FUNCTION public.caixa_efeito_saldo(_tipo text, _valor numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN _tipo IN ('sangria', 'despesa', 'saida') THEN -_valor ELSE _valor END
$$;

-- Atalho: o usuário atual é admin ou tem a permissão (módulo, ação).
CREATE OR REPLACE FUNCTION public.pode(_module text, _action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (public.has_role(auth.uid(), 'admin') OR public.has_permission(auth.uid(), _module, _action))
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Movimento de estoque (interno): trava a linha, nunca deixa negativo, registra histórico
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._estoque_mover(
  _produto_id uuid, _filial_id text, _delta integer, _origem text, _ref uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qtd integer;
  v_model text;
BEGIN
  PERFORM public.reconcile_inventory_for_product(_produto_id, _filial_id);

  SELECT quantidade INTO v_qtd FROM public.estoque
  WHERE produto_id = _produto_id AND filial_id = _filial_id FOR UPDATE;

  IF _delta = 0 THEN
    RETURN v_qtd;
  END IF;

  IF v_qtd + _delta < 0 THEN
    SELECT COALESCE(NULLIF(model, ''), referencia) INTO v_model FROM public.produtos WHERE id = _produto_id;
    RAISE EXCEPTION 'Estoque insuficiente para %. Disponível: %', COALESCE(v_model, _produto_id::text), v_qtd;
  END IF;

  PERFORM set_config('app.estoque_origem', _origem, true);
  PERFORM set_config('app.estoque_ref', COALESCE(_ref::text, ''), true);

  UPDATE public.estoque SET quantidade = v_qtd + _delta
  WHERE produto_id = _produto_id AND filial_id = _filial_id;

  RETURN v_qtd + _delta;
END;
$$;

-- Ajuste relativo (+/-) de estoque.
CREATE OR REPLACE FUNCTION public.ajustar_estoque(_produto_id uuid, _filial_id text, _delta integer, _motivo text DEFAULT '')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_novo integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.pode('produtos', 'edit') OR public.pode('estoque', 'manage_alert') OR public.pode('produtos', 'create')) THEN
    RAISE EXCEPTION 'Sem permissão para ajustar estoque' USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_filial_access(_filial_id);

  v_novo := public._estoque_mover(_produto_id, _filial_id, _delta, 'ajuste_manual', NULL);

  INSERT INTO public.audit_logs (user_id, user_name, action, module, details)
  VALUES (auth.uid(), public.current_user_name(), 'adjust_stock', 'estoque',
          jsonb_build_object('produto_id', _produto_id, 'filial_id', _filial_id, 'delta', _delta, 'motivo', COALESCE(_motivo, '')));
  RETURN v_novo;
END;
$$;

-- Define o saldo absoluto (contagem física).
CREATE OR REPLACE FUNCTION public.definir_estoque(_produto_id uuid, _filial_id text, _quantidade integer, _motivo text DEFAULT '')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_atual integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.pode('produtos', 'edit') OR public.pode('estoque', 'manage_alert') OR public.pode('produtos', 'create')) THEN
    RAISE EXCEPTION 'Sem permissão para ajustar estoque' USING ERRCODE = '42501';
  END IF;
  IF _quantidade IS NULL OR _quantidade < 0 THEN
    RAISE EXCEPTION 'Quantidade inválida';
  END IF;
  PERFORM public.assert_filial_access(_filial_id);

  PERFORM public.reconcile_inventory_for_product(_produto_id, _filial_id);
  SELECT quantidade INTO v_atual FROM public.estoque
  WHERE produto_id = _produto_id AND filial_id = _filial_id FOR UPDATE;

  PERFORM public._estoque_mover(_produto_id, _filial_id, _quantidade - v_atual, 'contagem', NULL);

  INSERT INTO public.audit_logs (user_id, user_name, action, module, details)
  VALUES (auth.uid(), public.current_user_name(), 'set_stock', 'estoque',
          jsonb_build_object('produto_id', _produto_id, 'filial_id', _filial_id,
                             'de', v_atual, 'para', _quantidade, 'motivo', COALESCE(_motivo, '')));
  RETURN _quantidade;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Produto + saldo na mesma transação (criar em 1..N filiais ou editar)
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.salvar_produto(
  _dados jsonb, _produto_id uuid DEFAULT NULL, _filiais text[] DEFAULT NULL, _quantidade integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_permitidas CONSTANT text[] := ARRAY[
    'referencia','model','classificacao','category','retail_price','custo','description','image_url',
    'is_acessorio','categoria_idade','genero','estilo','cor_armacao','cor_haste','color','material_aro',
    'material_haste','lens_size','altura_lente','bridge_size','temple_size','tipo_lente','polarizado',
    'tipo_haste','ponte_armacao','subcategoria_acessorio','hash_produto','ncm','categoria_acessorio',
    'tipo_acessorio','variacao_acessorio','cor_acessorio','material_acessorio','tipo_venda'];
  v_dados jsonb := '{}'::jsonb;
  v_key text;
  v_cols text;
  v_codes jsonb;
  v_row jsonb;
  v_id uuid;
  v_filial text;
  v_atual integer;
  v_result jsonb := '[]'::jsonb;
  v_qtd integer := GREATEST(COALESCE(_quantidade, 0), 0);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;

  -- só colunas conhecidas; custo só para quem pode ver custo
  FOR v_key IN SELECT jsonb_object_keys(_dados) LOOP
    CONTINUE WHEN NOT (v_key = ANY (c_permitidas));
    CONTINUE WHEN v_key = 'custo' AND NOT public.pode('produtos', 'view_cost');
    v_dados := v_dados || jsonb_build_object(v_key, _dados->v_key);
  END LOOP;

  SELECT string_agg(quote_ident(k), ', ') INTO v_cols FROM jsonb_object_keys(v_dados) k;
  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'Nenhum dado de produto informado';
  END IF;

  IF _produto_id IS NULL THEN
    -- ── criação ──
    IF NOT public.pode('produtos', 'create') THEN
      RAISE EXCEPTION 'Sem permissão para cadastrar produtos' USING ERRCODE = '42501';
    END IF;
    IF _filiais IS NULL OR array_length(_filiais, 1) IS NULL THEN
      RAISE EXCEPTION 'Informe ao menos uma filial';
    END IF;

    FOREACH v_filial IN ARRAY _filiais LOOP
      PERFORM public.assert_filial_access(v_filial);
      v_codes := public.generate_product_codes();
      v_row := v_dados || jsonb_build_object('filial_id', v_filial, 'code', v_codes->>'code', 'barcode', v_codes->>'barcode');

      EXECUTE format(
        'INSERT INTO public.produtos (%1$s, filial_id, code, barcode) '
        'SELECT %1$s, filial_id, code, barcode FROM jsonb_populate_record(NULL::public.produtos, $1) RETURNING id',
        v_cols)
      INTO v_id USING v_row;

      PERFORM set_config('app.estoque_origem', 'cadastro_produto', true);
      PERFORM set_config('app.estoque_ref', v_id::text, true);
      INSERT INTO public.estoque (produto_id, filial_id, quantidade) VALUES (v_id, v_filial, v_qtd)
      ON CONFLICT (produto_id, filial_id) DO UPDATE SET quantidade = EXCLUDED.quantidade;

      v_result := v_result || jsonb_build_object(
        'id', v_id, 'filial_id', v_filial, 'code', v_codes->>'code', 'barcode', v_codes->>'barcode');
    END LOOP;

    INSERT INTO public.audit_logs (user_id, user_name, action, module, details)
    VALUES (auth.uid(), public.current_user_name(), 'create_product', 'produtos',
            jsonb_build_object('produtos', v_result, 'quantidade', v_qtd));
    RETURN v_result;
  END IF;

  -- ── edição ──
  IF NOT public.pode('produtos', 'edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar produtos' USING ERRCODE = '42501';
  END IF;
  SELECT filial_id INTO v_filial FROM public.produtos WHERE id = _produto_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado';
  END IF;
  PERFORM public.assert_filial_access(v_filial);

  EXECUTE format(
    'UPDATE public.produtos SET (%1$s) = (SELECT %1$s FROM jsonb_populate_record(NULL::public.produtos, $1)) WHERE id = $2',
    v_cols)
  USING v_dados, _produto_id;

  PERFORM public.reconcile_inventory_for_product(_produto_id, v_filial);
  SELECT quantidade INTO v_atual FROM public.estoque
  WHERE produto_id = _produto_id AND filial_id = v_filial FOR UPDATE;
  PERFORM public._estoque_mover(_produto_id, v_filial, v_qtd - v_atual, 'edicao_produto', _produto_id);

  INSERT INTO public.audit_logs (user_id, user_name, action, module, details)
  VALUES (auth.uid(), public.current_user_name(), 'edit_product', 'produtos',
          jsonb_build_object('produto_id', _produto_id, 'estoque_de', v_atual, 'estoque_para', v_qtd));

  RETURN jsonb_build_array(jsonb_build_object('id', _produto_id, 'filial_id', v_filial));
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Compras de fornecedor
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registrar_compra(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_tol CONSTANT numeric := 0.011;
  v_uid uuid := auth.uid();
  v_nome text;
  v_filial text := NULLIF(btrim(_payload->>'filial_id'), '');
  v_forn uuid := NULLIF(_payload->>'fornecedor_id', '')::uuid;
  v_forn_nome text;
  v_forn_status text;
  v_total numeric := ROUND(COALESCE((_payload->>'valor_total')::numeric, 0), 2);
  v_desc text := COALESCE(_payload->>'descricao', '');
  v_forma text := COALESCE(NULLIF(btrim(_payload->>'forma_pagamento'), ''), 'dinheiro');
  v_items jsonb := COALESCE(_payload->'items', '[]'::jsonb);
  v_it jsonb;
  v_prod RECORD;
  v_qtd integer;
  v_unit numeric;
  v_soma_itens numeric := 0;
  v_caixa uuid;
  v_compra public.compras_fornecedor%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;
  IF NOT public.pode('fornecedores', 'create') THEN
    RAISE EXCEPTION 'Sem permissão para registrar compras' USING ERRCODE = '42501';
  END IF;
  v_nome := public.current_user_name();

  IF v_filial IS NULL THEN
    RAISE EXCEPTION 'Selecione uma filial específica para registrar a compra.';
  END IF;
  PERFORM public.assert_filial_access(v_filial);
  IF v_total < 0 THEN
    RAISE EXCEPTION 'Valor total inválido';
  END IF;

  SELECT nome, COALESCE(status, 'active') INTO v_forn_nome, v_forn_status FROM public.fornecedores WHERE id = v_forn;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fornecedor não encontrado';
  END IF;
  IF v_forn_status <> 'active' THEN
    RAISE EXCEPTION 'Fornecedor inativo: não é possível registrar compras.';
  END IF;

  SELECT id INTO v_caixa FROM public.caixas WHERE filial_id = v_filial AND status = 'aberto';
  IF v_caixa IS NULL THEN
    RAISE EXCEPTION 'O caixa da filial precisa estar aberto para registrar compras.';
  END IF;

  IF jsonb_typeof(v_items) <> 'array' THEN
    RAISE EXCEPTION 'Itens inválidos';
  END IF;
  FOR v_it IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_qtd := (v_it->>'quantidade')::integer;
    v_unit := ROUND((v_it->>'valor_unitario')::numeric, 2);
    IF v_qtd IS NULL OR v_qtd <= 0 OR v_unit IS NULL OR v_unit < 0 THEN
      RAISE EXCEPTION 'Item de compra inválido';
    END IF;
    PERFORM 1 FROM public.produtos WHERE id = (v_it->>'produto_id')::uuid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto da compra não encontrado';
    END IF;
    v_soma_itens := v_soma_itens + ROUND(v_qtd * v_unit, 2);
  END LOOP;
  IF v_soma_itens > v_total + c_tol THEN
    RAISE EXCEPTION 'O valor total (R$ %) é menor que a soma dos itens (R$ %)',
      to_char(v_total, 'FM999999990.00'), to_char(v_soma_itens, 'FM999999990.00');
  END IF;

  INSERT INTO public.compras_fornecedor
    (fornecedor_id, descricao, valor_total, data_compra, observacoes, filial_id, usuario_id, usuario_nome)
  VALUES
    (v_forn, v_desc, v_total, COALESCE(NULLIF(_payload->>'data_compra', '')::timestamptz, now()),
     COALESCE(_payload->>'observacoes', ''), v_filial, v_uid, v_nome)
  RETURNING * INTO v_compra;

  FOR v_it IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_qtd := (v_it->>'quantidade')::integer;
    v_unit := ROUND((v_it->>'valor_unitario')::numeric, 2);
    SELECT id, referencia, code, model INTO v_prod FROM public.produtos WHERE id = (v_it->>'produto_id')::uuid;

    INSERT INTO public.compra_items (compra_id, produto_id, produto_code, produto_model, quantidade, valor_unitario, total)
    VALUES (v_compra.id, v_prod.id, COALESCE(NULLIF(v_prod.code, ''), v_prod.referencia),
            COALESCE(v_prod.model, ''), v_qtd, v_unit, ROUND(v_qtd * v_unit, 2));

    PERFORM public._estoque_mover(v_prod.id, v_filial, v_qtd, 'compra', v_compra.id);

    INSERT INTO public.fornecedor_produtos (fornecedor_id, produto_id)
    VALUES (v_forn, v_prod.id) ON CONFLICT DO NOTHING;
  END LOOP;

  IF v_total > 0 THEN
    INSERT INTO public.caixa_movimentacoes
      (caixa_id, tipo, valor, forma_pagamento, descricao, usuario_id, usuario_nome, compra_id)
    VALUES (v_caixa, 'despesa', v_total, v_forma,
            'Compra Fornecedor: ' || v_forn_nome || CASE WHEN v_desc <> '' THEN ' — ' || v_desc ELSE '' END,
            v_uid, v_nome, v_compra.id);
  END IF;

  INSERT INTO public.audit_logs (user_id, user_name, action, module, details)
  VALUES (v_uid, v_nome, 'create_purchase', 'fornecedores',
          jsonb_build_object('compra_id', v_compra.id, 'codigo', v_compra.codigo, 'valor_total', v_total, 'filial_id', v_filial));

  RETURN jsonb_build_object('id', v_compra.id, 'codigo', v_compra.codigo);
END;
$$;

-- Item de compra cujo produto foi cadastrado depois (o cadastro já criou o saldo).
CREATE OR REPLACE FUNCTION public.registrar_item_compra_pendente(
  _compra_id uuid, _produto_id uuid, _quantidade integer, _valor_unitario numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_compra RECORD;
  v_prod RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;
  IF NOT public.pode('fornecedores', 'create') THEN
    RAISE EXCEPTION 'Sem permissão para registrar compras' USING ERRCODE = '42501';
  END IF;
  IF _quantidade IS NULL OR _quantidade <= 0 OR _valor_unitario IS NULL OR _valor_unitario < 0 THEN
    RAISE EXCEPTION 'Item de compra inválido';
  END IF;

  SELECT * INTO v_compra FROM public.compras_fornecedor WHERE id = _compra_id FOR UPDATE;
  IF NOT FOUND OR v_compra.status <> 'ativa' THEN
    RAISE EXCEPTION 'Compra não encontrada ou cancelada';
  END IF;
  PERFORM public.assert_filial_access(v_compra.filial_id);

  SELECT id, referencia, code, model INTO v_prod FROM public.produtos WHERE id = _produto_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado';
  END IF;

  INSERT INTO public.compra_items (compra_id, produto_id, produto_code, produto_model, quantidade, valor_unitario, total)
  VALUES (_compra_id, _produto_id, COALESCE(NULLIF(v_prod.code, ''), v_prod.referencia),
          COALESCE(v_prod.model, ''), _quantidade, ROUND(_valor_unitario, 2), ROUND(_quantidade * _valor_unitario, 2));

  INSERT INTO public.fornecedor_produtos (fornecedor_id, produto_id)
  VALUES (v_compra.fornecedor_id, _produto_id) ON CONFLICT DO NOTHING;
END;
$$;

-- Edição de descrição/valor/observação; a diferença de valor vai para o caixa aberto.
CREATE OR REPLACE FUNCTION public.editar_compra(_compra_id uuid, _descricao text, _valor_total numeric, _observacoes text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text;
  v_compra RECORD;
  v_dif numeric;
  v_caixa uuid;
  v_forma text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;
  IF NOT public.pode('fornecedores', 'edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar compras' USING ERRCODE = '42501';
  END IF;
  IF _valor_total IS NULL OR _valor_total < 0 THEN
    RAISE EXCEPTION 'Valor total inválido';
  END IF;
  v_nome := public.current_user_name();

  SELECT * INTO v_compra FROM public.compras_fornecedor WHERE id = _compra_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra não encontrada';
  END IF;
  IF v_compra.status <> 'ativa' THEN
    RAISE EXCEPTION 'Esta compra foi cancelada e não pode ser alterada';
  END IF;
  PERFORM public.assert_filial_access(v_compra.filial_id);

  v_dif := ROUND(_valor_total, 2) - ROUND(v_compra.valor_total, 2);

  IF v_dif <> 0 THEN
    SELECT id INTO v_caixa FROM public.caixas WHERE filial_id = v_compra.filial_id AND status = 'aberto';
    IF v_caixa IS NULL THEN
      RAISE EXCEPTION 'Abra o caixa da filial % para registrar o ajuste de valor da compra.', v_compra.filial_id;
    END IF;
    SELECT forma_pagamento INTO v_forma FROM public.caixa_movimentacoes
    WHERE compra_id = _compra_id ORDER BY created_at LIMIT 1;

    INSERT INTO public.caixa_movimentacoes
      (caixa_id, tipo, valor, forma_pagamento, descricao, usuario_id, usuario_nome, compra_id)
    VALUES (v_caixa, CASE WHEN v_dif > 0 THEN 'despesa' ELSE 'reforco' END, ABS(v_dif),
            COALESCE(v_forma, 'dinheiro'),
            'Ajuste compra ' || v_compra.codigo || ': ' || CASE WHEN v_dif > 0 THEN 'acréscimo' ELSE 'redução' END,
            v_uid, v_nome, _compra_id);
  END IF;

  UPDATE public.compras_fornecedor
  SET descricao = COALESCE(_descricao, ''), valor_total = ROUND(_valor_total, 2), observacoes = COALESCE(_observacoes, '')
  WHERE id = _compra_id;

  INSERT INTO public.audit_logs (user_id, user_name, action, module, details)
  VALUES (v_uid, v_nome, 'edit_purchase', 'fornecedores',
          jsonb_build_object('compra_id', _compra_id, 'valor_anterior', v_compra.valor_total, 'valor_novo', ROUND(_valor_total, 2)));
END;
$$;

-- Cancelamento: devolve o estoque que a compra colocou, estorna o caixa e mantém o histórico.
CREATE OR REPLACE FUNCTION public.cancelar_compra(_compra_id uuid, _motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text;
  v_compra RECORD;
  v_item RECORD;
  v_ligados integer;
  v_saida numeric;
  v_caixa uuid;
  v_forma text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Somente administradores podem cancelar compras' USING ERRCODE = '42501';
  END IF;
  v_nome := public.current_user_name();

  SELECT * INTO v_compra FROM public.compras_fornecedor WHERE id = _compra_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra não encontrada';
  END IF;
  IF v_compra.status <> 'ativa' THEN
    RAISE EXCEPTION 'Esta compra já foi cancelada';
  END IF;
  PERFORM public.assert_filial_access(v_compra.filial_id);

  -- Quanto saiu do caixa por esta compra (lançamentos vinculados; compras antigas usam o valor total).
  SELECT COUNT(*),
         COALESCE(SUM(CASE WHEN tipo IN ('despesa', 'saida') THEN valor
                           WHEN tipo IN ('reforco', 'entrada') THEN -valor ELSE 0 END), 0)
  INTO v_ligados, v_saida
  FROM public.caixa_movimentacoes WHERE compra_id = _compra_id;
  IF v_ligados = 0 THEN
    v_saida := v_compra.valor_total;
  END IF;

  IF v_saida > 0 THEN
    SELECT id INTO v_caixa FROM public.caixas WHERE filial_id = v_compra.filial_id AND status = 'aberto';
    IF v_caixa IS NULL THEN
      RAISE EXCEPTION 'Abra o caixa da filial % para registrar o estorno da compra.', v_compra.filial_id;
    END IF;
  END IF;

  -- Estoque: tira o que a compra colocou (falha se já foi vendido)
  FOR v_item IN SELECT * FROM public.compra_items WHERE compra_id = _compra_id LOOP
    PERFORM public._estoque_mover(v_item.produto_id, v_compra.filial_id, -v_item.quantidade, 'cancelamento_compra', _compra_id);
  END LOOP;

  IF v_saida > 0 THEN
    SELECT forma_pagamento INTO v_forma FROM public.caixa_movimentacoes
    WHERE compra_id = _compra_id ORDER BY created_at LIMIT 1;
    INSERT INTO public.caixa_movimentacoes
      (caixa_id, tipo, valor, forma_pagamento, descricao, usuario_id, usuario_nome, compra_id)
    VALUES (v_caixa, 'reforco', ROUND(v_saida, 2), COALESCE(v_forma, 'dinheiro'),
            'Estorno compra cancelada ' || v_compra.codigo || ' — ' || COALESCE(_motivo, ''),
            v_uid, v_nome, _compra_id);
  END IF;

  UPDATE public.compras_fornecedor
  SET status = 'cancelada', cancelada_em = now(), cancelada_por = v_nome, motivo_cancelamento = COALESCE(_motivo, '')
  WHERE id = _compra_id;

  INSERT INTO public.audit_logs (user_id, user_name, action, module, details)
  VALUES (v_uid, v_nome, 'cancel_purchase', 'fornecedores',
          jsonb_build_object('compra_id', _compra_id, 'codigo', v_compra.codigo, 'estornado', ROUND(v_saida, 2),
                             'motivo', COALESCE(_motivo, '')));
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Consignados
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._consignado_hist(
  _id uuid, _acao text, _detalhes jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.consignado_historico (consignado_id, acao, detalhes, usuario_id, usuario_nome)
  VALUES (_id, _acao, COALESCE(_detalhes, '{}'::jsonb), auth.uid(), public.current_user_name())
$$;

CREATE OR REPLACE FUNCTION public.criar_consignado(
  _produto_id uuid, _cliente_id uuid, _filial_id text, _quantidade integer,
  _valor_unitario numeric, _observacoes text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prod RECORD;
  v_row public.consignados%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.pode('fornecedores', 'create') OR public.pode('pdv', 'sell') OR public.pode('vendas', 'manage')) THEN
    RAISE EXCEPTION 'Sem permissão para criar consignados' USING ERRCODE = '42501';
  END IF;
  IF _quantidade IS NULL OR _quantidade <= 0 THEN
    RAISE EXCEPTION 'Quantidade inválida';
  END IF;
  IF _valor_unitario IS NULL OR _valor_unitario < 0 THEN
    RAISE EXCEPTION 'Valor unitário inválido';
  END IF;
  PERFORM public.assert_filial_access(_filial_id);

  SELECT id, filial_id INTO v_prod FROM public.produtos WHERE id = _produto_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado';
  END IF;
  IF v_prod.filial_id <> _filial_id THEN
    RAISE EXCEPTION 'O produto não pertence à filial do consignado';
  END IF;

  -- saída do estoque na criação (e falha se não houver saldo)
  PERFORM public._estoque_mover(_produto_id, _filial_id, -_quantidade, 'consignado_criado', NULL);

  INSERT INTO public.consignados
    (produto_id, cliente_id, filial_id, quantidade, valor_unitario, valor_total, vendedor_nome, observacoes)
  VALUES
    (_produto_id, _cliente_id, _filial_id, _quantidade, ROUND(_valor_unitario, 2),
     ROUND(_quantidade * _valor_unitario, 2), public.current_user_name(), COALESCE(_observacoes, ''))
  RETURNING * INTO v_row;

  PERFORM public._consignado_hist(v_row.id, 'criado',
    jsonb_build_object('quantidade', _quantidade, 'valor_unitario', _valor_unitario));

  RETURN to_jsonb(v_row);
END;
$$;

-- Devolução total ou parcial: o estoque volta para a filial.
CREATE OR REPLACE FUNCTION public.devolver_consignado(_consignado_id uuid, _quantidade integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c public.consignados%ROWTYPE;
  v_full boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;
  IF NOT public.pode('fornecedores', 'edit') THEN
    RAISE EXCEPTION 'Sem permissão para devolver consignados' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_c FROM public.consignados WHERE id = _consignado_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Consignado não encontrado';
  END IF;
  PERFORM public.assert_filial_access(v_c.filial_id);
  IF v_c.status <> 'consignado' THEN
    RAISE EXCEPTION 'Este consignado não está mais em aberto';
  END IF;
  IF _quantidade IS NULL OR _quantidade <= 0 THEN
    RAISE EXCEPTION 'Quantidade inválida';
  END IF;
  IF _quantidade > v_c.quantidade THEN
    RAISE EXCEPTION 'Quantidade maior que o disponível';
  END IF;

  v_full := _quantidade = v_c.quantidade;

  IF v_full THEN
    UPDATE public.consignados SET status = 'devolvido' WHERE id = _consignado_id;
  ELSE
    UPDATE public.consignados
    SET quantidade = v_c.quantidade - _quantidade,
        valor_total = ROUND((v_c.quantidade - _quantidade) * v_c.valor_unitario, 2)
    WHERE id = _consignado_id;

    INSERT INTO public.consignados
      (produto_id, cliente_id, filial_id, quantidade, valor_unitario, valor_total, status, vendedor_nome, observacoes)
    VALUES
      (v_c.produto_id, v_c.cliente_id, v_c.filial_id, _quantidade, v_c.valor_unitario,
       ROUND(_quantidade * v_c.valor_unitario, 2), 'devolvido', v_c.vendedor_nome,
       'Devolução parcial de ' || _consignado_id::text);
  END IF;

  PERFORM public._estoque_mover(v_c.produto_id, v_c.filial_id, _quantidade, 'consignado_devolvido', _consignado_id);

  PERFORM public._consignado_hist(_consignado_id,
    CASE WHEN v_full THEN 'devolucao_total' ELSE 'devolucao_parcial' END,
    jsonb_build_object('quantidade_devolvida', _quantidade, 'restante', v_c.quantidade - _quantidade));

  RETURN jsonb_build_object('devolvido', _quantidade, 'restante', v_c.quantidade - _quantidade);
END;
$$;

-- Marcar como vendido fora do PDV (o estoque já saiu quando foi consignado).
CREATE OR REPLACE FUNCTION public.vender_consignado_manual(_consignado_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c public.consignados%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;
  IF NOT public.pode('fornecedores', 'edit') THEN
    RAISE EXCEPTION 'Sem permissão para alterar consignados' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_c FROM public.consignados WHERE id = _consignado_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Consignado não encontrado';
  END IF;
  PERFORM public.assert_filial_access(v_c.filial_id);
  IF v_c.status <> 'consignado' THEN
    RAISE EXCEPTION 'Este consignado não está mais em aberto';
  END IF;

  UPDATE public.consignados SET status = 'vendido' WHERE id = _consignado_id;
  PERFORM public._consignado_hist(_consignado_id, 'venda_manual',
    jsonb_build_object('status', 'vendido', 'quantidade', v_c.quantidade));
END;
$$;

-- Edição (cliente, quantidade, observações): a diferença de quantidade move o estoque.
CREATE OR REPLACE FUNCTION public.editar_consignado(
  _consignado_id uuid, _cliente_id uuid, _quantidade integer, _observacoes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c public.consignados%ROWTYPE;
  v_dif integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;
  IF NOT public.pode('fornecedores', 'edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar consignados' USING ERRCODE = '42501';
  END IF;
  IF _quantidade IS NULL OR _quantidade < 1 THEN
    RAISE EXCEPTION 'Quantidade inválida';
  END IF;
  SELECT * INTO v_c FROM public.consignados WHERE id = _consignado_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Consignado não encontrado';
  END IF;
  PERFORM public.assert_filial_access(v_c.filial_id);

  v_dif := _quantidade - v_c.quantidade;   -- positivo: levou mais; negativo: devolveu parte

  IF v_dif <> 0 AND v_c.status = 'consignado' THEN
    PERFORM public._estoque_mover(v_c.produto_id, v_c.filial_id, -v_dif, 'consignado_editado', _consignado_id);
  END IF;

  UPDATE public.consignados
  SET cliente_id = _cliente_id,
      quantidade = _quantidade,
      valor_total = ROUND(_quantidade * v_c.valor_unitario, 2),
      observacoes = COALESCE(_observacoes, '')
  WHERE id = _consignado_id;

  PERFORM public._consignado_hist(_consignado_id, 'editado',
    jsonb_build_object('quantidade', _quantidade, 'quantidade_anterior', v_c.quantidade,
                       'observacoes', COALESCE(_observacoes, '')));
END;
$$;

-- Troca: devolve (parte de) um produto e leva outro, com diferença de valor registrada.
CREATE OR REPLACE FUNCTION public.trocar_consignado(
  _consignado_original_id uuid, _novo_produto_id uuid, _novo_quantidade integer,
  _novo_valor_unitario numeric, _troca_quantidade integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_o public.consignados%ROWTYPE;
  v_novo public.consignados%ROWTYPE;
  v_prod RECORD;
  v_troca integer;
  v_full boolean;
  v_valor_parcial numeric;
  v_novo_total numeric;
  v_dif numeric;
  v_tipo text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.pode('fornecedores', 'edit') OR public.pode('fornecedores', 'create')) THEN
    RAISE EXCEPTION 'Sem permissão para trocar consignados' USING ERRCODE = '42501';
  END IF;
  IF _novo_quantidade IS NULL OR _novo_quantidade <= 0 OR _novo_valor_unitario IS NULL OR _novo_valor_unitario < 0 THEN
    RAISE EXCEPTION 'Dados do novo produto inválidos';
  END IF;

  SELECT * INTO v_o FROM public.consignados WHERE id = _consignado_original_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Consignado não encontrado';
  END IF;
  PERFORM public.assert_filial_access(v_o.filial_id);
  IF v_o.status <> 'consignado' THEN
    RAISE EXCEPTION 'Este consignado não está mais em aberto';
  END IF;

  v_troca := COALESCE(_troca_quantidade, v_o.quantidade);
  IF v_troca <= 0 OR v_troca > v_o.quantidade THEN
    RAISE EXCEPTION 'Quantidade a trocar inválida';
  END IF;
  v_full := v_troca = v_o.quantidade;

  SELECT id, filial_id INTO v_prod FROM public.produtos WHERE id = _novo_produto_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto novo não encontrado';
  END IF;
  IF v_prod.filial_id <> v_o.filial_id THEN
    RAISE EXCEPTION 'O produto novo não pertence à filial do consignado';
  END IF;

  v_valor_parcial := CASE WHEN v_full THEN v_o.valor_total ELSE ROUND(v_troca * v_o.valor_unitario, 2) END;
  v_novo_total := ROUND(_novo_quantidade * _novo_valor_unitario, 2);
  v_dif := v_novo_total - v_valor_parcial;
  v_tipo := CASE WHEN v_dif = 0 THEN 'igual' WHEN v_dif > 0 THEN 'cliente_paga' ELSE 'credito' END;

  IF v_full THEN
    UPDATE public.consignados SET status = 'devolvido' WHERE id = v_o.id;
  ELSE
    UPDATE public.consignados
    SET quantidade = v_o.quantidade - v_troca,
        valor_total = ROUND((v_o.quantidade - v_troca) * v_o.valor_unitario, 2)
    WHERE id = v_o.id;
  END IF;

  -- estoque: volta o produto original, sai o novo
  PERFORM public._estoque_mover(v_o.produto_id, v_o.filial_id, v_troca, 'consignado_troca', v_o.id);

  INSERT INTO public.consignados
    (produto_id, cliente_id, filial_id, quantidade, valor_unitario, valor_total, vendedor_nome)
  VALUES
    (_novo_produto_id, v_o.cliente_id, v_o.filial_id, _novo_quantidade, ROUND(_novo_valor_unitario, 2),
     v_novo_total, public.current_user_name())
  RETURNING * INTO v_novo;

  PERFORM public._estoque_mover(_novo_produto_id, v_o.filial_id, -_novo_quantidade, 'consignado_troca', v_novo.id);

  INSERT INTO public.consignado_trocas
    (consignado_original_id, consignado_novo_id, diferenca_valor, tipo_diferenca, usuario_id, usuario_nome, observacoes)
  VALUES
    (v_o.id, v_novo.id, ABS(v_dif), v_tipo, auth.uid(), public.current_user_name(),
     CASE WHEN v_full THEN '' ELSE 'Troca parcial: ' || v_troca || ' de ' || v_o.quantidade END);

  PERFORM public._consignado_hist(v_o.id, CASE WHEN v_full THEN 'troca' ELSE 'troca_parcial' END,
    jsonb_build_object('trocado_por', v_novo.codigo, 'diferenca', v_dif, 'tipo_diferenca', v_tipo,
                       'qty_trocada', v_troca, 'total_original', v_o.quantidade));
  PERFORM public._consignado_hist(v_novo.id, 'criado_por_troca',
    jsonb_build_object('originado_de', v_o.id, 'diferenca', v_dif, 'tipo_diferenca', v_tipo));

  RETURN jsonb_build_object('novo_id', v_novo.id, 'novo_codigo', v_novo.codigo,
                            'diferenca', v_dif, 'tipo_diferenca', v_tipo, 'parcial', NOT v_full);
END;
$$;

-- Exclusão (somente admin): devolve o estoque se ainda estava em aberto.
CREATE OR REPLACE FUNCTION public.excluir_consignado(_consignado_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c public.consignados%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Somente administradores podem excluir consignados' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_c FROM public.consignados WHERE id = _consignado_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Consignado não encontrado';
  END IF;
  PERFORM public.assert_filial_access(v_c.filial_id);

  IF v_c.status = 'consignado' THEN
    PERFORM public._estoque_mover(v_c.produto_id, v_c.filial_id, v_c.quantidade, 'consignado_excluido', _consignado_id);
  END IF;

  DELETE FROM public.consignado_historico WHERE consignado_id = _consignado_id;
  DELETE FROM public.consignado_trocas
  WHERE consignado_original_id = _consignado_id OR consignado_novo_id = _consignado_id;
  DELETE FROM public.consignados WHERE id = _consignado_id;

  INSERT INTO public.audit_logs (user_id, user_name, action, module, details)
  VALUES (auth.uid(), public.current_user_name(), 'delete_consignado', 'consignados',
          jsonb_build_object('consignado_id', _consignado_id, 'codigo', v_c.codigo, 'status', v_c.status,
                             'quantidade', v_c.quantidade));
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) criar_venda: aceita consignado_ids (conversão do consignado em venda sem baixar
--    o estoque duas vezes). Demais regras idênticas à versão anterior.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.criar_venda(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_tol CONSTANT numeric := 0.011;
  c_teto_juros CONSTANT numeric := 1.13;

  v_uid uuid := auth.uid();
  v_nome text;
  v_filial text := NULLIF(btrim(_payload->>'filial_id'), '');
  v_origin text := COALESCE(NULLIF(btrim(_payload->>'origin'), ''), 'stock');
  v_method text := btrim(COALESCE(_payload->>'payment_method', ''));
  v_client_id uuid := NULLIF(_payload->>'client_id', '')::uuid;
  v_client_name text := COALESCE(_payload->>'client_name', '');
  v_is_consignado boolean;
  v_items jsonb := COALESCE(_payload->'items', '[]'::jsonb);
  v_splits jsonb := COALESCE(_payload->'splits', '[]'::jsonb);
  v_cids jsonb := COALESCE(_payload->'consignado_ids', '[]'::jsonb);
  v_caixa_id uuid;

  v_it jsonb;
  v_cid text;
  v_csg public.consignados%ROWTYPE;
  v_prod RECORD;
  v_qty integer;
  v_n integer;
  v_price numeric;
  v_ok boolean;
  v_items_total numeric := 0;
  v_discount numeric := 0;
  v_total numeric;
  v_sum_amount numeric := 0;
  v_split jsonb;
  v_amount numeric;
  v_final numeric;
  v_venda public.vendas%ROWTYPE;
  v_label text;
  v_csg_id uuid;
  v_parc integer;
  v_int integer;
  v_m text[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin')
       OR public.has_permission(v_uid, 'pdv', 'sell')
       OR public.has_permission(v_uid, 'vendas', 'manage')
       OR public.has_permission(v_uid, 'vendas', 'create')) THEN
    RAISE EXCEPTION 'Sem permissão para realizar vendas' USING ERRCODE = '42501';
  END IF;
  v_nome := public.current_user_name();

  IF v_filial IS NULL THEN
    RAISE EXCEPTION 'Filial é obrigatória';
  END IF;
  PERFORM public.assert_filial_access(v_filial);

  IF v_origin NOT IN ('stock', 'consignado') THEN
    RAISE EXCEPTION 'Origem de venda inválida';
  END IF;
  v_is_consignado := v_origin = 'consignado';

  IF jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Adicione ao menos um produto à venda';
  END IF;
  IF v_method = '' THEN
    RAISE EXCEPTION 'Selecione a forma de pagamento';
  END IF;

  SELECT id INTO v_caixa_id
  FROM public.caixas
  WHERE filial_id = v_filial AND status = 'aberto'
  ORDER BY aberto_em DESC
  LIMIT 1;
  IF v_caixa_id IS NULL THEN
    RAISE EXCEPTION 'O caixa da filial % está fechado. Abra o caixa para realizar vendas.', v_filial;
  END IF;

  FOR v_it IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_qty := (v_it->>'quantity')::integer;
    v_price := ROUND((v_it->>'unit_price')::numeric, 2);
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida';
    END IF;
    IF v_price IS NULL OR v_price < 0 THEN
      RAISE EXCEPTION 'Preço inválido';
    END IF;

    SELECT id, filial_id, retail_price, is_acessorio, estilo, subcategoria_acessorio,
           categoria_acessorio, status, model, referencia
    INTO v_prod
    FROM public.produtos WHERE id = (v_it->>'produto_id')::uuid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto não encontrado';
    END IF;
    IF v_prod.filial_id <> v_filial THEN
      RAISE EXCEPTION 'O produto % não pertence à filial da venda', COALESCE(NULLIF(v_prod.model, ''), v_prod.referencia);
    END IF;

    v_ok := ABS(v_price - v_prod.retail_price) <= c_tol;
    IF NOT v_ok AND NOT v_is_consignado THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.descontos_atacado r
        WHERE r.status = 'active'
          AND ABS(public.atacado_preco_regra(v_prod.retail_price, r.tipo_valor, r.valor_desconto) - v_price) <= c_tol
          AND (
            r.tipo_desconto = 'todos'
            OR (r.tipo_desconto = 'todas_armacoes' AND NOT v_prod.is_acessorio)
            OR (r.tipo_desconto = 'todos_acessorios' AND v_prod.is_acessorio)
            OR (r.tipo_desconto = 'armacao_especifica' AND NOT v_prod.is_acessorio AND v_prod.estilo = r.categoria)
            OR (r.tipo_desconto = 'acessorio_especifico' AND v_prod.is_acessorio
                AND (v_prod.subcategoria_acessorio = r.categoria OR v_prod.categoria_acessorio = r.categoria))
            OR (r.tipo_desconto = 'produto' AND r.produto_id = v_prod.id)
          )
          AND (
            SELECT COALESCE(SUM((i->>'quantity')::integer), 0)
            FROM jsonb_array_elements(v_items) i
            JOIN public.produtos pp ON pp.id = (i->>'produto_id')::uuid
            WHERE (
              r.tipo_desconto = 'todos'
              OR (r.tipo_desconto = 'todas_armacoes' AND NOT pp.is_acessorio)
              OR (r.tipo_desconto = 'todos_acessorios' AND pp.is_acessorio)
              OR (r.tipo_desconto = 'armacao_especifica' AND NOT pp.is_acessorio AND pp.estilo = r.categoria)
              OR (r.tipo_desconto = 'acessorio_especifico' AND pp.is_acessorio
                  AND (pp.subcategoria_acessorio = r.categoria OR pp.categoria_acessorio = r.categoria))
              OR (r.tipo_desconto = 'produto' AND r.produto_id = pp.id)
            )
          ) >= r.quantidade_minima
      ) INTO v_ok;
    END IF;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'Preço informado para % não confere com a tabela de preços', COALESCE(NULLIF(v_prod.model, ''), v_prod.referencia);
    END IF;

    v_items_total := v_items_total + ROUND(v_price * v_qty, 2);
    IF v_prod.retail_price > v_price THEN
      v_discount := v_discount + ROUND((v_prod.retail_price - v_price) * v_qty, 2);
    END IF;
  END LOOP;

  IF jsonb_typeof(v_splits) = 'array' AND jsonb_array_length(v_splits) > 0 THEN
    v_total := 0;
    FOR v_split IN SELECT * FROM jsonb_array_elements(v_splits) LOOP
      v_amount := ROUND((v_split->>'amount')::numeric, 2);
      v_final := ROUND(COALESCE((v_split->>'final_amount')::numeric, v_amount), 2);
      IF COALESCE(btrim(v_split->>'method'), '') = '' THEN
        RAISE EXCEPTION 'Forma de pagamento inválida';
      END IF;
      IF v_amount IS NULL OR v_amount <= 0 THEN
        RAISE EXCEPTION 'Valor de pagamento inválido';
      END IF;
      IF v_final < v_amount - c_tol OR v_final > v_amount * c_teto_juros + c_tol THEN
        RAISE EXCEPTION 'Valor com juros fora do limite permitido';
      END IF;
      v_sum_amount := v_sum_amount + v_amount;
      v_total := v_total + v_final;
    END LOOP;
    IF ABS(v_sum_amount - v_items_total) > c_tol THEN
      RAISE EXCEPTION 'A soma dos pagamentos (R$ %) não confere com o total da venda (R$ %)',
        to_char(v_sum_amount, 'FM999999990.00'), to_char(v_items_total, 'FM999999990.00');
    END IF;
  ELSE
    v_total := ROUND(COALESCE((_payload->>'total')::numeric, v_items_total), 2);
    IF lower(v_method) LIKE '%cart%' OR lower(v_method) LIKE '%boleto%' THEN
      IF v_total < v_items_total - c_tol OR v_total > v_items_total * c_teto_juros + c_tol THEN
        RAISE EXCEPTION 'Total com juros fora do limite permitido';
      END IF;
    ELSIF ABS(v_total - v_items_total) > c_tol THEN
      RAISE EXCEPTION 'O total informado (R$ %) não confere com os itens (R$ %)',
        to_char(v_total, 'FM999999990.00'), to_char(v_items_total, 'FM999999990.00');
    END IF;
  END IF;

  INSERT INTO public.vendas
    (client_id, client_name, seller_name, total, discount, payment_method, origin, filial_id, status_boleto)
  VALUES
    (v_client_id, v_client_name, '', v_total, v_discount, v_method, v_origin, v_filial,
     CASE WHEN lower(v_method) LIKE '%boleto%' THEN 'pendente' ELSE '' END)
  RETURNING * INTO v_venda;

  v_label := 'Venda ' || COALESCE(NULLIF(v_venda.sale_code, ''), '#' || v_venda.number);

  -- Conversão de consignado em venda: o estoque já saiu quando o consignado foi criado.
  -- Devolve a quantidade antes dos itens (o trigger de venda baixa de novo) => baixa líquida única.
  IF jsonb_typeof(v_cids) = 'array' AND jsonb_array_length(v_cids) > 0 THEN
    FOR v_cid IN SELECT jsonb_array_elements_text(v_cids) LOOP
      SELECT * INTO v_csg FROM public.consignados WHERE id = v_cid::uuid FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Consignado não encontrado';
      END IF;
      IF v_csg.status <> 'consignado' THEN
        RAISE EXCEPTION 'O consignado % não está mais em aberto', v_csg.codigo;
      END IF;
      IF v_csg.filial_id <> v_filial THEN
        RAISE EXCEPTION 'O consignado % pertence a outra filial', v_csg.codigo;
      END IF;

      SELECT COALESCE(SUM((i->>'quantity')::integer), 0) INTO v_n
      FROM jsonb_array_elements(v_items) i WHERE (i->>'produto_id')::uuid = v_csg.produto_id;
      IF v_n < v_csg.quantidade THEN
        RAISE EXCEPTION 'A quantidade vendida é menor que a do consignado %', v_csg.codigo;
      END IF;

      PERFORM public._estoque_mover(v_csg.produto_id, v_filial, v_csg.quantidade, 'conversao_consignado', v_csg.id);

      UPDATE public.consignados SET status = 'vendido', venda_id = v_venda.id WHERE id = v_csg.id;
      PERFORM public._consignado_hist(v_csg.id, 'venda_pdv',
        jsonb_build_object('venda_id', v_venda.id, 'sale_code', v_venda.sale_code,
                           'conversao_carrinho', jsonb_array_length(v_cids) > 1));
    END LOOP;
  END IF;

  FOR v_it IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_qty := (v_it->>'quantity')::integer;
    v_price := ROUND((v_it->>'unit_price')::numeric, 2);
    SELECT referencia, model, retail_price, COALESCE(custo, 0) AS custo INTO v_prod
    FROM public.produtos WHERE id = (v_it->>'produto_id')::uuid;

    INSERT INTO public.venda_items
      (venda_id, produto_id, product_code, product_model, quantity, unit_price, total,
       custo_unitario, status, preco_tabela)
    VALUES
      (v_venda.id, (v_it->>'produto_id')::uuid, v_prod.referencia,
       COALESCE(NULLIF(v_prod.model, ''), v_prod.referencia),
       v_qty, v_price, ROUND(v_price * v_qty, 2), v_prod.custo,
       CASE WHEN v_is_consignado THEN 'consignado' ELSE 'active' END,
       v_prod.retail_price);

    IF v_is_consignado THEN
      INSERT INTO public.consignados
        (produto_id, cliente_id, filial_id, quantidade, valor_unitario, valor_total, vendedor_nome, venda_id)
      VALUES
        ((v_it->>'produto_id')::uuid, v_client_id, v_filial, v_qty, v_price, ROUND(v_price * v_qty, 2), v_nome, v_venda.id)
      RETURNING id INTO v_csg_id;

      INSERT INTO public.consignado_historico (consignado_id, acao, detalhes, usuario_id, usuario_nome)
      VALUES (v_csg_id, 'criado',
              jsonb_build_object('origem', 'pdv', 'venda_id', v_venda.id, 'quantidade', v_qty, 'valor_unitario', v_price),
              v_uid, v_nome);
    END IF;
  END LOOP;

  IF jsonb_typeof(v_splits) = 'array' AND jsonb_array_length(v_splits) > 0 THEN
    FOR v_split IN SELECT * FROM jsonb_array_elements(v_splits) LOOP
      v_amount := ROUND((v_split->>'amount')::numeric, 2);
      v_final := ROUND(COALESCE((v_split->>'final_amount')::numeric, v_amount), 2);
      INSERT INTO public.caixa_movimentacoes
        (caixa_id, tipo, valor, forma_pagamento, descricao, venda_id, usuario_id, usuario_nome)
      VALUES
        (v_caixa_id, 'venda', v_final, btrim(v_split->>'method'),
         v_label || ' — ' || COALESCE(NULLIF(v_client_name, ''), 'Cliente avulso') || ' (' || btrim(v_split->>'method') || ')',
         v_venda.id, v_uid, v_nome);

      IF lower(v_split->>'method') LIKE '%boleto%' THEN
        v_m := regexp_match(v_split->>'method', '(\d+)x/(\d+)d');
        v_parc := COALESCE(v_m[1]::integer, 1);
        v_int := COALESCE(v_m[2]::integer, 30);
        PERFORM public._criar_boleto_alertas(v_venda.id, v_filial, v_amount, v_parc, v_int);
      END IF;
    END LOOP;
  ELSE
    INSERT INTO public.caixa_movimentacoes
      (caixa_id, tipo, valor, forma_pagamento, descricao, venda_id, usuario_id, usuario_nome)
    VALUES
      (v_caixa_id, 'venda', v_total, v_method,
       v_label || ' — ' || COALESCE(NULLIF(v_client_name, ''), 'Cliente avulso'),
       v_venda.id, v_uid, v_nome);

    IF lower(v_method) LIKE '%boleto%' THEN
      v_m := regexp_match(v_method, '(\d+)x/(\d+)d');
      v_parc := COALESCE(v_m[1]::integer, 1);
      v_int := COALESCE(v_m[2]::integer, 30);
      PERFORM public._criar_boleto_alertas(v_venda.id, v_filial, v_total, v_parc, v_int);
    END IF;
  END IF;

  INSERT INTO public.audit_logs (user_id, user_name, action, module, details)
  VALUES (v_uid, v_nome, 'create_sale', 'vendas',
          jsonb_build_object('venda_id', v_venda.id, 'total', v_total, 'filial_id', v_filial, 'origin', v_origin));

  RETURN to_jsonb(v_venda);
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 6) Permissões de execução
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END
$$;
-- Internas: só outras funções do banco as usam.
REVOKE EXECUTE ON FUNCTION public.reduce_stock_on_sale() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.estoque_registrar_movimentacao() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.estoque_sincronizar_produto() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.produtos_stock_derivado() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.caixa_mov_guard() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._criar_boleto_alertas(uuid, text, numeric, integer, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._estoque_mover(uuid, text, integer, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._consignado_hist(uuid, text, jsonb) FROM authenticated;
