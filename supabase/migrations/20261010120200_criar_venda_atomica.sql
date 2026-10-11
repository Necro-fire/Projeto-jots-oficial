-- Venda atômica (itens 5.4, 5.5, 5.6 e 5.7 do Melhorias.md).
-- Uma única transação: venda -> itens (baixa de estoque) -> caixa -> consignado -> boletos.
-- Qualquer falha desfaz tudo: não existe mais venda sem itens nem pagamento fora do caixa.
--
-- Payload (jsonb):
--   client_id, client_name, payment_method, origin ('stock' | 'consignado'), filial_id,
--   total            : total final (com juros de cartão/boleto), usado quando não há splits
--   items[]          : { produto_id, quantity, unit_price }
--   splits[]         : { method, amount, final_amount } (opcional, pagamento dividido)
--
-- O que o banco valida/calcula (o cliente não dita esses valores):
--   * usuário e nome        -> auth.uid()
--   * filial                -> admin qualquer; demais só a própria
--   * caixa                 -> precisa estar aberto na filial
--   * preço unitário        -> preço de tabela ou preço de uma regra de atacado ativa e aplicável
--   * desconto              -> soma (preço de tabela - preço vendido) x quantidade
--   * total dos itens       -> soma dos itens; pagamentos precisam fechar com ele
--   * juros                 -> final_amount limitado ao teto das tabelas de juros do sistema (12,4%)
--   * estoque               -> saldo da filial; nunca negativo
--
-- Idempotente: pode ser reaplicada.

CREATE OR REPLACE FUNCTION public.atacado_preco_regra(_preco numeric, _tipo_valor text, _valor numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _tipo_valor = 'percentual' THEN ROUND(_preco * (1 - _valor / 100), 2)
    ELSE ROUND(GREATEST(0, _preco - _valor), 2)
  END
$$;

CREATE OR REPLACE FUNCTION public.criar_venda(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_tol CONSTANT numeric := 0.011;
  c_teto_juros CONSTANT numeric := 1.13;   -- 12,40% (12x cartão) + folga de arredondamento

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
  v_caixa_id uuid;

  v_it jsonb;
  v_prod RECORD;
  v_qty integer;
  v_price numeric;
  v_match_qty integer;
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
  -- ── Autorização ───────────────────────────────────────────────────────────
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

  -- ── Caixa aberto ──────────────────────────────────────────────────────────
  SELECT id INTO v_caixa_id
  FROM public.caixas
  WHERE filial_id = v_filial AND status = 'aberto'
  ORDER BY aberto_em DESC
  LIMIT 1;
  IF v_caixa_id IS NULL THEN
    RAISE EXCEPTION 'O caixa precisa estar aberto para realizar vendas.';
  END IF;

  -- ── Itens: existência, filial, preço ──────────────────────────────────────
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

    -- Preço de tabela, ou preço de uma regra de atacado ativa que o carrinho realmente atinge.
    -- Consignado não recebe desconto.
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
            -- unidades do carrinho que casam com a regra >= quantidade mínima
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

  -- ── Pagamentos ────────────────────────────────────────────────────────────
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

  -- ── Venda ─────────────────────────────────────────────────────────────────
  INSERT INTO public.vendas
    (client_id, client_name, seller_name, total, discount, payment_method, origin, filial_id, status_boleto)
  VALUES
    (v_client_id, v_client_name, '', v_total, v_discount, v_method, v_origin, v_filial,
     CASE WHEN lower(v_method) LIKE '%boleto%' THEN 'pendente' ELSE '' END)
  RETURNING * INTO v_venda;

  v_label := 'Venda ' || COALESCE(NULLIF(v_venda.sale_code, ''), '#' || v_venda.number);

  -- ── Itens (o trigger baixa o estoque da filial; saldo insuficiente aborta tudo) ──
  FOR v_it IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_qty := (v_it->>'quantity')::integer;
    v_price := ROUND((v_it->>'unit_price')::numeric, 2);
    SELECT referencia, model, COALESCE(custo, 0) AS custo INTO v_prod
    FROM public.produtos WHERE id = (v_it->>'produto_id')::uuid;

    INSERT INTO public.venda_items
      (venda_id, produto_id, product_code, product_model, quantity, unit_price, total, custo_unitario, status)
    VALUES
      (v_venda.id, (v_it->>'produto_id')::uuid, v_prod.referencia,
       COALESCE(NULLIF(v_prod.model, ''), v_prod.referencia),
       v_qty, v_price, ROUND(v_price * v_qty, 2), v_prod.custo,
       CASE WHEN v_is_consignado THEN 'consignado' ELSE 'active' END);

    -- ── Consignado ──────────────────────────────────────────────────────────
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

  -- ── Caixa: uma movimentação por forma de pagamento ────────────────────────
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

      -- Boleto em pagamento dividido: parcelas sobre o valor sem juros (regra atual do PDV)
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

-- Mesma regra de createBoletoAlertas (src/hooks/useBoletoAlertas.ts):
-- 15d: juros de 3% a partir da 3ª parcela; 30d: juros de 6% a partir da 2ª.
CREATE OR REPLACE FUNCTION public._criar_boleto_alertas(
  _venda_id uuid, _filial_id text, _valor numeric, _parcelas integer, _intervalo integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base numeric := _valor / GREATEST(_parcelas, 1);
  v_juros numeric := CASE WHEN _intervalo <= 15 THEN 0.03 ELSE 0.06 END;
  v_primeira integer := CASE WHEN _intervalo <= 15 THEN 3 ELSE 2 END;
  i integer;
BEGIN
  FOR i IN 1.._parcelas LOOP
    INSERT INTO public.boleto_alertas
      (venda_id, filial_id, parcela_numero, total_parcelas, valor_parcela, data_vencimento, status, intervalo_dias)
    VALUES
      (_venda_id, _filial_id, i, _parcelas,
       CASE WHEN i < v_primeira THEN v_base ELSE ROUND(v_base * (1 + v_juros), 2) END,
       now() + make_interval(days => i * _intervalo), 'pendente', _intervalo);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.criar_venda(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_venda(jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public._criar_boleto_alertas(uuid, text, numeric, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._criar_boleto_alertas(uuid, text, numeric, integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.atacado_preco_regra(numeric, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atacado_preco_regra(numeric, text, numeric) TO authenticated, service_role;
