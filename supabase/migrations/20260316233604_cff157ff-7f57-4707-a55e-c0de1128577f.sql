
-- 1. Create estoque table
CREATE TABLE public.estoque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  filial_id text NOT NULL DEFAULT '1',
  quantidade integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(produto_id, filial_id)
);

ALTER TABLE public.estoque ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to estoque" ON public.estoque FOR ALL TO public USING (true) WITH CHECK (true);

-- 2. Migrate existing stock data
INSERT INTO public.estoque (produto_id, filial_id, quantidade)
SELECT id, filial_id, stock FROM public.produtos
ON CONFLICT DO NOTHING;

-- 3. Product code sequence
CREATE SEQUENCE IF NOT EXISTS public.produto_code_seq START WITH 1;

DO $$
DECLARE max_num integer;
BEGIN
  SELECT COALESCE(MAX(
    CASE WHEN code ~ '^PROD-[0-9]+$' 
    THEN CAST(SUBSTRING(code FROM 6) AS integer) 
    ELSE 0 END
  ), 0) INTO max_num FROM public.produtos;
  IF max_num > 0 THEN
    PERFORM setval('public.produto_code_seq', max_num);
  END IF;
END $$;

-- 4. RPC to generate next code + barcode
CREATE OR REPLACE FUNCTION public.generate_product_codes()
RETURNS json LANGUAGE plpgsql AS $$
DECLARE
  next_num bigint;
  v_code text;
  v_barcode text;
BEGIN
  next_num := nextval('public.produto_code_seq');
  v_code := 'PROD-' || LPAD(next_num::text, 6, '0');
  v_barcode := '1' || LPAD(next_num::text, 8, '0');
  RETURN json_build_object('code', v_code, 'barcode', v_barcode);
END;
$$;

-- 5. Add hash_produto column
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS hash_produto text NOT NULL DEFAULT '';

-- 6. Populate hash for existing products
UPDATE public.produtos SET hash_produto = UPPER(
  COALESCE(NULLIF(referencia, ''), 'NA') || '-' ||
  CASE WHEN is_acessorio THEN 'ACC-' || COALESCE(NULLIF(subcategoria_acessorio, ''), 'NA')
  ELSE
    COALESCE(NULLIF(cor_armacao, ''), 'NA') || '-' ||
    COALESCE(NULLIF(genero, ''), 'NA') || '-' ||
    COALESCE(NULLIF(estilo, ''), 'NA') || '-' ||
    COALESCE(NULLIF(material_aro, ''), 'NA') || '-' ||
    lens_size::text || '-' || altura_lente::text || '-' ||
    bridge_size::text || '-' || temple_size::text
  END
);

-- 7. Unique index on hash + filial (ignore empty hashes)
CREATE UNIQUE INDEX IF NOT EXISTS idx_produtos_hash_filial ON public.produtos(hash_produto, filial_id) WHERE hash_produto != '';

-- 8. Update stock trigger to also update estoque
CREATE OR REPLACE FUNCTION public.reduce_stock_on_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
  v_filial_id text;
BEGIN
  SELECT filial_id INTO v_filial_id FROM public.vendas WHERE id = NEW.venda_id;
  
  UPDATE public.estoque
  SET quantidade = quantidade - NEW.quantity
  WHERE produto_id = NEW.produto_id AND filial_id = v_filial_id;
  
  UPDATE public.produtos
  SET stock = GREATEST(stock - NEW.quantity, 0)
  WHERE id = NEW.produto_id;
  
  RETURN NEW;
END;
$function$;

-- 9. Ensure trigger exists on venda_items
DROP TRIGGER IF EXISTS on_venda_item_insert ON public.venda_items;
CREATE TRIGGER on_venda_item_insert
  AFTER INSERT ON public.venda_items
  FOR EACH ROW
  EXECUTE FUNCTION public.reduce_stock_on_sale();

-- 10. Enable realtime for estoque
ALTER PUBLICATION supabase_realtime ADD TABLE public.estoque;
