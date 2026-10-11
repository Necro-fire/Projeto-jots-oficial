-- Integridade entre PDV, produtos, estoque e caixa.
--
-- Causas raiz tratadas aqui:
--  1. cancelar_venda devolvia estoque e estornava caixa, mas NÃO marcava os itens como
--     cancelados: a venda "cancelada" continuava exibindo todos os produtos ativos.
--  2. O estorno de caixa usava o caixa original (mesmo fechado) e o cancelamento de item
--     estornava só a última movimentação, deixando saldo diferente de zero.
--  3. Não havia como desfazer um cancelamento (nem estornar uma sangria/despesa lançada errada).
--  4. Nada impedia dois caixas abertos na mesma filial (consulta .maybeSingle() falhava e o
--     PDV dizia "caixa fechado"), nem movimentação em caixa fechado, nem apagar o caixa
--     de uma venda (venda sem rastro financeiro).
--  5. O preço de tabela do item não era guardado: o desconto só existia como um número solto
--     em vendas.discount e a nota recalculava por dedução.
-- Idempotente: pode ser reaplicada.

-- ───────────────────────────────────────────────────────────────────────────
-- 0) Estrutura
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.venda_items ADD COLUMN IF NOT EXISTS preco_tabela numeric;

ALTER TABLE public.venda_item_cancelamentos ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'item';
ALTER TABLE public.venda_item_cancelamentos ADD COLUMN IF NOT EXISTS revertido_em timestamptz;

ALTER TABLE public.caixa_movimentacoes ADD COLUMN IF NOT EXISTS estorno_de uuid REFERENCES public.caixa_movimentacoes(id);
CREATE UNIQUE INDEX IF NOT EXISTS caixa_mov_um_estorno_por_mov
  ON public.caixa_movimentacoes (estorno_de) WHERE estorno_de IS NOT NULL;

-- Um único caixa aberto por filial.
CREATE UNIQUE INDEX IF NOT EXISTS caixas_um_aberto_por_filial
  ON public.caixas (filial_id) WHERE status = 'aberto';

CREATE INDEX IF NOT EXISTS idx_caixa_mov_venda ON public.caixa_movimentacoes (venda_id);
CREATE INDEX IF NOT EXISTS idx_venda_items_venda ON public.venda_items (venda_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Guarda de integridade das movimentações de caixa
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.caixa_mov_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_cx_filial text;
  v_venda_filial text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT status, filial_id INTO v_status, v_cx_filial FROM public.caixas WHERE id = NEW.caixa_id;
    IF v_status IS DISTINCT FROM 'aberto' THEN
      RAISE EXCEPTION 'O caixa está fechado: não é possível registrar movimentações.';
    END IF;
    IF NEW.venda_id IS NOT NULL THEN
      SELECT filial_id INTO v_venda_filial FROM public.vendas WHERE id = NEW.venda_id;
      IF v_venda_filial IS DISTINCT FROM v_cx_filial THEN
        RAISE EXCEPTION 'A movimentação da venda pertence à filial %, mas o caixa é da filial %.', v_venda_filial, v_cx_filial;
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.venda_id IS NOT NULL AND (
         NEW.venda_id IS DISTINCT FROM OLD.venda_id
      OR NEW.caixa_id IS DISTINCT FROM OLD.caixa_id
      OR NEW.valor IS DISTINCT FROM OLD.valor
      OR NEW.tipo IS DISTINCT FROM OLD.tipo
      OR NEW.forma_pagamento IS DISTINCT FROM OLD.forma_pagamento) THEN
      RAISE EXCEPTION 'Movimentações vinculadas a vendas não podem ser alteradas; use o estorno.';
    END IF;
    RETURN NEW;
  ELSE
    IF OLD.venda_id IS NOT NULL THEN
      RAISE EXCEPTION 'Movimentações vinculadas a vendas não podem ser excluídas; use o estorno.';
    END IF;
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS tr_caixa_mov_guard ON public.caixa_movimentacoes;
CREATE TRIGGER tr_caixa_mov_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.caixa_movimentacoes
FOR EACH ROW EXECUTE FUNCTION public.caixa_mov_guard();

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Preço de tabela guardado no item (regra única do desconto)
--    vendas.discount = SUM((preco_tabela - unit_price) * quantity) dos itens ativos.
--    Itens antigos (preco_tabela NULL) seguem com o valor já gravado.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.venda_totais(_venda_id uuid)
RETURNS TABLE (
  valor_original numeric,   -- itens ativos a preço de tabela
  desconto numeric,         -- economia (atacado etc.)
  subtotal_itens numeric,   -- itens ativos ao preço vendido
  acrescimo numeric,        -- juros de cartão/boleto
  total numeric             -- total registrado da venda
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(COALESCE(i.preco_tabela, i.unit_price) * i.quantity), 0)::numeric,
    COALESCE(SUM((COALESCE(i.preco_tabela, i.unit_price) - i.unit_price) * i.quantity), 0)::numeric,
    COALESCE(SUM(i.total), 0)::numeric,
    GREATEST(v.total - COALESCE(SUM(i.total), 0), 0)::numeric,
    v.total::numeric
  FROM public.vendas v
  LEFT JOIN public.venda_items i
    ON i.venda_id = v.id AND COALESCE(i.status, 'active') <> 'cancelado'
  WHERE v.id = _venda_id
  GROUP BY v.id, v.total
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) criar_venda: igual à versão anterior, guardando preco_tabela por item
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
  v_caixa_id uuid;

  v_it jsonb;
  v_prod RECORD;
  v_qty integer;
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
-- 4) Cancelamento da venda inteira (atômico)
--    itens -> cancelado, estoque devolvido à filial da venda, estorno do saldo líquido
--    de cada forma de pagamento no caixa ABERTO da filial.
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

  -- Há saldo a estornar? Então o caixa da filial precisa estar aberto.
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

-- ───────────────────────────────────────────────────────────────────────────
-- 5) Cancelamento de um item
--    O estorno é proporcional ao peso do item entre os itens ativos, por forma de pagamento
--    (inclui juros). Ao cancelar o ÚLTIMO item ativo a venda inteira passa a cancelada.
--    Invariante: venda ativa => vendas.total = soma das movimentações da venda.
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

  -- Estorno por forma de pagamento (proporcional; o último item leva o saldo restante)
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
    -- Não sobrou item ativo: a venda inteira fica cancelada (total original preservado).
    UPDATE public.boleto_alertas SET status = 'cancelado', updated_at = now() WHERE venda_id = v_item.venda_id;
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
  END IF;

  INSERT INTO public.audit_logs (user_id, user_name, action, module, details)
  VALUES (v_uid, v_nome, 'cancel_sale_item', 'vendas',
          jsonb_build_object('venda_id', v_item.venda_id, 'venda_item_id', _venda_item_id,
                             'motivo', COALESCE(_motivo, ''), 'filial_id', v_venda.filial_id,
                             'ultimo_item', v_is_last));
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 6) Desfazer o cancelamento da venda (estorno do estorno)
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

  -- Estoque: só os itens cancelados junto com a venda (os cancelados antes, um a um, continuam).
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

  -- Caixa: desfaz exatamente os lançamentos de cancelamento da venda inteira.
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

  UPDATE public.boleto_alertas SET status = 'pendente', updated_at = now()
  WHERE venda_id = _venda_id AND status = 'cancelado';

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
-- 7) Gestão do caixa no banco: abrir, fechar, movimentar e estornar movimentação
-- ───────────────────────────────────────────────────────────────────────────
-- Efeito de uma movimentação no saldo do caixa (única regra, usada por todos).
CREATE OR REPLACE FUNCTION public.caixa_efeito_saldo(_tipo text, _valor numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN _tipo IN ('sangria', 'despesa') THEN -_valor ELSE _valor END
$$;

CREATE OR REPLACE FUNCTION public.caixa_saldo(_caixa_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.valor_abertura + COALESCE(
    (SELECT SUM(public.caixa_efeito_saldo(m.tipo, m.valor))
     FROM public.caixa_movimentacoes m WHERE m.caixa_id = c.id), 0)
  FROM public.caixas c WHERE c.id = _caixa_id
$$;

CREATE OR REPLACE FUNCTION public.abrir_caixa(_filial_id text, _valor_abertura numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_permission(v_uid, 'caixa', 'manage')) THEN
    RAISE EXCEPTION 'Sem permissão para abrir o caixa' USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_filial_access(_filial_id);
  IF COALESCE(_valor_abertura, 0) < 0 THEN
    RAISE EXCEPTION 'Valor de abertura inválido';
  END IF;
  v_nome := public.current_user_name();

  BEGIN
    INSERT INTO public.caixas (filial_id, valor_abertura, usuario_abertura_id, usuario_abertura_nome, status)
    VALUES (_filial_id, COALESCE(_valor_abertura, 0), v_uid, v_nome, 'aberto')
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Já existe um caixa aberto para esta filial.';
  END;

  INSERT INTO public.audit_logs (user_id, user_name, action, module, details)
  VALUES (v_uid, v_nome, 'open_cash', 'caixa', jsonb_build_object('caixa_id', v_id, 'filial_id', _filial_id));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fechar_caixa(_caixa_id uuid, _valor_informado numeric, _obs text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text;
  v_cx RECORD;
  v_esperado numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_permission(v_uid, 'caixa', 'manage')) THEN
    RAISE EXCEPTION 'Sem permissão para fechar o caixa' USING ERRCODE = '42501';
  END IF;
  v_nome := public.current_user_name();

  SELECT * INTO v_cx FROM public.caixas WHERE id = _caixa_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa não encontrado';
  END IF;
  PERFORM public.assert_filial_access(v_cx.filial_id);
  IF v_cx.status <> 'aberto' THEN
    RAISE EXCEPTION 'Este caixa já está fechado';
  END IF;

  v_esperado := ROUND(public.caixa_saldo(_caixa_id), 2);

  UPDATE public.caixas
  SET status = 'fechado',
      valor_fechamento_informado = _valor_informado,
      valor_fechamento_esperado = v_esperado,
      diferenca = ROUND(_valor_informado - v_esperado, 2),
      usuario_fechamento_id = v_uid,
      usuario_fechamento_nome = v_nome,
      fechado_em = now(),
      observacoes_fechamento = COALESCE(_obs, '')
  WHERE id = _caixa_id;

  INSERT INTO public.audit_logs (user_id, user_name, action, module, details)
  VALUES (v_uid, v_nome, 'close_cash', 'caixa',
          jsonb_build_object('caixa_id', _caixa_id, 'esperado', v_esperado, 'informado', _valor_informado));

  RETURN jsonb_build_object('esperado', v_esperado, 'informado', _valor_informado,
                            'diferenca', ROUND(_valor_informado - v_esperado, 2));
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_movimentacao_caixa(
  _caixa_id uuid, _tipo text, _valor numeric, _forma_pagamento text, _descricao text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text;
  v_cx RECORD;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_permission(v_uid, 'caixa', 'manage')) THEN
    RAISE EXCEPTION 'Sem permissão para movimentar o caixa' USING ERRCODE = '42501';
  END IF;
  IF _tipo NOT IN ('sangria', 'reforco', 'despesa') THEN
    RAISE EXCEPTION 'Tipo de movimentação inválido';
  END IF;
  IF _valor IS NULL OR _valor <= 0 THEN
    RAISE EXCEPTION 'Informe um valor válido';
  END IF;
  IF COALESCE(btrim(_descricao), '') = '' THEN
    RAISE EXCEPTION 'Informe uma descrição/justificativa';
  END IF;
  v_nome := public.current_user_name();

  SELECT * INTO v_cx FROM public.caixas WHERE id = _caixa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa não encontrado';
  END IF;
  PERFORM public.assert_filial_access(v_cx.filial_id);

  INSERT INTO public.caixa_movimentacoes
    (caixa_id, tipo, valor, forma_pagamento, descricao, usuario_id, usuario_nome)
  VALUES (_caixa_id, _tipo, ROUND(_valor, 2), COALESCE(_forma_pagamento, 'dinheiro'), btrim(_descricao), v_uid, v_nome)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Estorna uma sangria/reforço/despesa lançada por engano (contra-lançamento, sem apagar nada).
CREATE OR REPLACE FUNCTION public.estornar_movimentacao_caixa(_mov_id uuid, _motivo text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nome text;
  v_mov RECORD;
  v_cx RECORD;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_permission(v_uid, 'caixa', 'manage')) THEN
    RAISE EXCEPTION 'Sem permissão para estornar movimentações' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(btrim(_motivo), '') = '' THEN
    RAISE EXCEPTION 'Informe o motivo do estorno';
  END IF;
  v_nome := public.current_user_name();

  SELECT * INTO v_mov FROM public.caixa_movimentacoes WHERE id = _mov_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimentação não encontrada';
  END IF;
  IF v_mov.tipo NOT IN ('sangria', 'reforco', 'despesa') OR v_mov.venda_id IS NOT NULL THEN
    RAISE EXCEPTION 'Só movimentações manuais (sangria, reforço, despesa) podem ser estornadas aqui. Para vendas, cancele a venda.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.caixa_movimentacoes WHERE estorno_de = _mov_id) THEN
    RAISE EXCEPTION 'Esta movimentação já foi estornada';
  END IF;

  SELECT * INTO v_cx FROM public.caixas WHERE id = v_mov.caixa_id;
  PERFORM public.assert_filial_access(v_cx.filial_id);
  IF v_cx.status <> 'aberto' THEN
    RAISE EXCEPTION 'O caixa desta movimentação está fechado; o estorno não pode ser lançado nele.';
  END IF;

  -- Efeito contrário no saldo: sangria/despesa viram entrada; reforço vira saída.
  INSERT INTO public.caixa_movimentacoes
    (caixa_id, tipo, valor, forma_pagamento, descricao, usuario_id, usuario_nome, estorno_de)
  VALUES (
    v_mov.caixa_id,
    CASE WHEN v_mov.tipo = 'reforco' THEN 'despesa' ELSE 'reforco' END,
    v_mov.valor, v_mov.forma_pagamento,
    'Estorno de ' || v_mov.tipo || ' — ' || btrim(_motivo),
    v_uid, v_nome, _mov_id
  )
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (user_id, user_name, action, module, details)
  VALUES (v_uid, v_nome, 'reverse_cash_movement', 'caixa',
          jsonb_build_object('mov_id', _mov_id, 'motivo', btrim(_motivo)));
  RETURN v_id;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 8) Diagnóstico de consistência vendas x itens x caixa x estoque
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.diagnostico_vendas_caixa()
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
  -- venda cancelada exibindo item ativo
  SELECT 'cancelada_com_item_ativo'::text, v.id, v.sale_code, v.filial_id,
         COUNT(*)::text || ' item(ns) ainda ativo(s)'
  FROM public.vendas v JOIN public.venda_items i ON i.venda_id = v.id
  WHERE v.status = 'cancelada' AND COALESCE(i.status, 'active') <> 'cancelado'
  GROUP BY v.id, v.sale_code, v.filial_id
  UNION ALL
  -- venda cancelada com saldo no caixa
  SELECT 'cancelada_com_saldo_no_caixa', v.id, v.sale_code, v.filial_id,
         'saldo líquido R$ ' || ROUND(SUM(m.valor), 2)::text
  FROM public.vendas v JOIN public.caixa_movimentacoes m ON m.venda_id = v.id
  WHERE v.status = 'cancelada'
  GROUP BY v.id, v.sale_code, v.filial_id
  HAVING ROUND(SUM(m.valor), 2) <> 0
  UNION ALL
  -- venda ativa: total diferente do que entrou no caixa
  SELECT 'ativa_total_diferente_do_caixa', v.id, v.sale_code, v.filial_id,
         'venda R$ ' || ROUND(v.total, 2)::text || ' x caixa R$ ' || ROUND(COALESCE(s.t, 0), 2)::text
  FROM public.vendas v
  LEFT JOIN (SELECT m.venda_id AS vid, SUM(m.valor) AS t FROM public.caixa_movimentacoes m GROUP BY m.venda_id) s ON s.vid = v.id
  WHERE v.status <> 'cancelada' AND ROUND(v.total, 2) <> ROUND(COALESCE(s.t, 0), 2)
  UNION ALL
  -- venda ativa: itens (sem juros) diferentes do total -> desconto aplicado em dobro / total adulterado
  SELECT 'ativa_itens_diferentes_do_total', v.id, v.sale_code, v.filial_id,
         'itens R$ ' || ROUND(s.t, 2)::text || ' x total R$ ' || ROUND(v.total, 2)::text
  FROM public.vendas v
  JOIN (SELECT i.venda_id AS vid, SUM(i.total) AS t FROM public.venda_items i
        WHERE COALESCE(i.status, 'active') <> 'cancelado' GROUP BY i.venda_id) s ON s.vid = v.id
  WHERE v.status <> 'cancelada'
    AND v.total < s.t - 0.01
  UNION ALL
  -- movimentação de venda em caixa de outra filial
  SELECT 'movimentacao_em_caixa_de_outra_filial', v.id, v.sale_code, v.filial_id,
         'caixa da filial ' || c.filial_id
  FROM public.caixa_movimentacoes m
  JOIN public.caixas c ON c.id = m.caixa_id
  JOIN public.vendas v ON v.id = m.venda_id
  WHERE c.filial_id <> v.filial_id
  UNION ALL
  -- venda concluída sem nenhum lançamento de caixa
  SELECT 'venda_sem_lancamento_no_caixa', v.id, v.sale_code, v.filial_id, 'sem caixa_movimentacoes'
  FROM public.vendas v
  WHERE v.status <> 'cancelada'
    AND NOT EXISTS (SELECT 1 FROM public.caixa_movimentacoes m WHERE m.venda_id = v.id)
  UNION ALL
  -- estoque x histórico
  SELECT 'estoque_diferente_do_historico', NULL::uuid, NULL::text, e.filial_id,
         'produto ' || e.produto_id::text || ': saldo ' || e.quantidade::text || ' x histórico ' || COALESCE(l.s, 0)::text
  FROM public.estoque e
  LEFT JOIN (SELECT h.produto_id AS pid, h.filial_id AS fid, SUM(h.delta) AS s
             FROM public.estoque_movimentacoes h GROUP BY h.produto_id, h.filial_id) l
    ON l.pid = e.produto_id AND l.fid = e.filial_id
  WHERE e.quantidade <> COALESCE(l.s, 0);
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 9) Reparo SEGURO de dados antigos: itens de vendas já canceladas passam a "cancelado"
--    (o estoque dessas vendas já foi devolvido na época; nenhum valor financeiro é alterado).
-- ───────────────────────────────────────────────────────────────────────────
WITH alvo AS (
  SELECT i.id AS item_id, i.venda_id, i.produto_id, i.quantity, i.unit_price,
         v.motivo_cancelamento, v.cancelled_by_id, v.cancelled_by_name
  FROM public.venda_items i
  JOIN public.vendas v ON v.id = i.venda_id
  WHERE v.status = 'cancelada' AND COALESCE(i.status, 'active') <> 'cancelado'
),
log AS (
  INSERT INTO public.venda_item_cancelamentos
    (venda_id, venda_item_id, produto_id, quantity, unit_price, motivo, usuario_id, usuario_nome, origem)
  SELECT a.venda_id, a.item_id, a.produto_id, a.quantity, a.unit_price,
         COALESCE(a.motivo_cancelamento, 'Cancelamento da venda (ajuste de dados)'),
         COALESCE(a.cancelled_by_id, '00000000-0000-0000-0000-000000000000'::uuid),
         COALESCE(a.cancelled_by_name, 'Sistema'), 'venda'
  FROM alvo a
  RETURNING venda_item_id
)
UPDATE public.venda_items i
SET status = 'cancelado'
WHERE i.id IN (SELECT item_id FROM alvo);

-- ───────────────────────────────────────────────────────────────────────────
-- 10) Permissões de execução
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
REVOKE EXECUTE ON FUNCTION public.reduce_stock_on_sale() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.estoque_registrar_movimentacao() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.estoque_sincronizar_produto() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.produtos_stock_derivado() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.caixa_mov_guard() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._criar_boleto_alertas(uuid, text, numeric, integer, integer) FROM authenticated;
