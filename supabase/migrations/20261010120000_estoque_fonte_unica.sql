-- Estoque: a tabela `estoque` (produto x filial) passa a ser a ÚNICA fonte da verdade.
--  * `produtos.stock` vira coluna derivada (soma das linhas de `estoque`), mantida por trigger.
--  * `reconcile_inventory_for_product` deixa de copiar o número global para a filial: só cria a linha, se faltar.
--  * Toda alteração de saldo gera uma linha em `estoque_movimentacoes` (histórico/auditoria).
--  * Saldo nunca negativo.
-- Idempotente: pode ser reaplicada.

-- 1) Histórico de movimentações ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.estoque_movimentacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL,
  filial_id text NOT NULL,
  delta integer NOT NULL,
  saldo_anterior integer NOT NULL,
  saldo_novo integer NOT NULL,
  origem text NOT NULL DEFAULT 'manual',
  referencia_id uuid,
  usuario_id uuid,
  usuario_nome text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estoque_mov_produto_filial
  ON public.estoque_movimentacoes (produto_id, filial_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_estoque_mov_referencia
  ON public.estoque_movimentacoes (referencia_id);

ALTER TABLE public.estoque_movimentacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_estoque_mov" ON public.estoque_movimentacoes;
CREATE POLICY "auth_read_estoque_mov" ON public.estoque_movimentacoes
  FOR SELECT TO authenticated USING (true);
-- Sem política de escrita: só os triggers (SECURITY DEFINER) gravam.

REVOKE ALL ON public.estoque_movimentacoes FROM PUBLIC, anon;
GRANT SELECT ON public.estoque_movimentacoes TO authenticated;

-- 2) Saldo nunca negativo ------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'estoque_quantidade_nao_negativa'
      AND conrelid = 'public.estoque'::regclass
  ) THEN
    IF EXISTS (SELECT 1 FROM public.estoque WHERE quantidade < 0) THEN
      -- Não derruba a migração por causa de dado legado: cria sem validar o histórico.
      ALTER TABLE public.estoque
        ADD CONSTRAINT estoque_quantidade_nao_negativa CHECK (quantidade >= 0) NOT VALID;
    ELSE
      ALTER TABLE public.estoque
        ADD CONSTRAINT estoque_quantidade_nao_negativa CHECK (quantidade >= 0);
    END IF;
  END IF;
END
$$;

-- 3) Trigger: registra cada mudança de saldo ----------------------------------
CREATE OR REPLACE FUNCTION public.estoque_registrar_movimentacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old integer := 0;
  v_new integer := 0;
  v_prod uuid;
  v_filial text;
  v_origem text;
  v_ref uuid;
  v_uid uuid := auth.uid();
  v_nome text := '';
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new := NEW.quantidade; v_prod := NEW.produto_id; v_filial := NEW.filial_id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := OLD.quantidade; v_new := NEW.quantidade; v_prod := NEW.produto_id; v_filial := NEW.filial_id;
  ELSE
    v_old := OLD.quantidade; v_prod := OLD.produto_id; v_filial := OLD.filial_id;
  END IF;

  IF v_new = v_old THEN
    RETURN NULL;
  END IF;

  v_origem := COALESCE(NULLIF(current_setting('app.estoque_origem', true), ''), 'manual');
  BEGIN
    v_ref := NULLIF(current_setting('app.estoque_ref', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_ref := NULL;
  END;

  IF v_uid IS NOT NULL THEN
    SELECT COALESCE(nome, '') INTO v_nome FROM public.profiles WHERE id = v_uid;
  END IF;

  INSERT INTO public.estoque_movimentacoes
    (produto_id, filial_id, delta, saldo_anterior, saldo_novo, origem, referencia_id, usuario_id, usuario_nome)
  VALUES
    (v_prod, v_filial, v_new - v_old, v_old, v_new, v_origem, v_ref, v_uid, COALESCE(v_nome, ''));

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tr_estoque_movimentacao ON public.estoque;
CREATE TRIGGER tr_estoque_movimentacao
AFTER INSERT OR UPDATE OF quantidade OR DELETE ON public.estoque
FOR EACH ROW EXECUTE FUNCTION public.estoque_registrar_movimentacao();

-- 4) Trigger: produtos.stock = soma do estoque por filial ----------------------
CREATE OR REPLACE FUNCTION public.estoque_sincronizar_produto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prod uuid := COALESCE(NEW.produto_id, OLD.produto_id);
BEGIN
  UPDATE public.produtos p
  SET stock = s.total
  FROM (SELECT COALESCE(SUM(quantidade), 0)::integer AS total
        FROM public.estoque WHERE produto_id = v_prod) s
  WHERE p.id = v_prod AND p.stock IS DISTINCT FROM s.total;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tr_estoque_sync_produto ON public.estoque;
CREATE TRIGGER tr_estoque_sync_produto
AFTER INSERT OR UPDATE OF quantidade OR DELETE ON public.estoque
FOR EACH ROW EXECUTE FUNCTION public.estoque_sincronizar_produto();

-- Escritas diretas em produtos.stock (código legado do cliente) não podem
-- sobrescrever o saldo: enquanto houver linhas em `estoque`, o valor é derivado.
CREATE OR REPLACE FUNCTION public.produtos_stock_derivado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer;
BEGIN
  IF NEW.stock IS DISTINCT FROM OLD.stock THEN
    SELECT SUM(quantidade)::integer INTO v_total FROM public.estoque WHERE produto_id = NEW.id;
    IF v_total IS NOT NULL THEN
      NEW.stock := v_total;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_produtos_stock_derivado ON public.produtos;
CREATE TRIGGER tr_produtos_stock_derivado
BEFORE UPDATE OF stock ON public.produtos
FOR EACH ROW EXECUTE FUNCTION public.produtos_stock_derivado();

-- 5) reconcile: só garante a linha (nunca sobrescreve saldo existente) ---------
CREATE OR REPLACE FUNCTION public.reconcile_inventory_for_product(_produto_id uuid, _filial_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prod RECORD;
BEGIN
  SELECT id, filial_id, stock INTO v_prod FROM public.produtos WHERE id = _produto_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado';
  END IF;

  -- Semeia a linha só quando ela não existe: o produto pertence a uma filial; para
  -- as demais o saldo inicial é zero. Saldo existente nunca é sobrescrito.
  INSERT INTO public.estoque (produto_id, filial_id, quantidade)
  VALUES (
    _produto_id,
    _filial_id,
    CASE WHEN v_prod.filial_id = _filial_id THEN GREATEST(COALESCE(v_prod.stock, 0), 0) ELSE 0 END
  )
  ON CONFLICT (produto_id, filial_id) DO NOTHING;
END;
$$;

-- 6) Baixa de estoque na venda: usa o saldo da filial, sem copiar o global -----
CREATE OR REPLACE FUNCTION public.reduce_stock_on_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filial_id text;
  v_current_qty integer;
  v_model text;
BEGIN
  SELECT filial_id INTO v_filial_id FROM public.vendas WHERE id = NEW.venda_id;
  IF v_filial_id IS NULL THEN
    RAISE EXCEPTION 'Venda inválida para redução de estoque';
  END IF;

  PERFORM public.reconcile_inventory_for_product(NEW.produto_id, v_filial_id);

  SELECT quantidade INTO v_current_qty
  FROM public.estoque
  WHERE produto_id = NEW.produto_id AND filial_id = v_filial_id
  FOR UPDATE;

  IF COALESCE(v_current_qty, 0) < NEW.quantity THEN
    SELECT COALESCE(NULLIF(model, ''), referencia) INTO v_model FROM public.produtos WHERE id = NEW.produto_id;
    RAISE EXCEPTION 'Estoque insuficiente para %. Disponível: %', COALESCE(v_model, NEW.produto_id::text), COALESCE(v_current_qty, 0);
  END IF;

  PERFORM set_config('app.estoque_origem', 'venda', true);
  PERFORM set_config('app.estoque_ref', NEW.venda_id::text, true);

  UPDATE public.estoque
  SET quantidade = v_current_qty - NEW.quantity
  WHERE produto_id = NEW.produto_id AND filial_id = v_filial_id;

  RETURN NEW;
END;
$$;

-- 7) Saldo inicial no histórico (uma linha por saldo já existente) -------------
INSERT INTO public.estoque_movimentacoes
  (produto_id, filial_id, delta, saldo_anterior, saldo_novo, origem, usuario_nome)
SELECT e.produto_id, e.filial_id, e.quantidade, 0, e.quantidade, 'saldo_inicial', 'Sistema'
FROM public.estoque e
WHERE e.quantidade <> 0
  AND NOT EXISTS (
    SELECT 1 FROM public.estoque_movimentacoes m
    WHERE m.produto_id = e.produto_id AND m.filial_id = e.filial_id
  );
