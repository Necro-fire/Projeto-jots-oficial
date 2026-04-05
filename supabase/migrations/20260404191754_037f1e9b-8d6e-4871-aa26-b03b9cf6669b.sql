
-- 1. Fix funcionarios_auth: restrict SELECT to own row or admin
DROP POLICY IF EXISTS "auth_read_func" ON public.funcionarios_auth;
CREATE POLICY "read_own_or_admin_func" ON public.funcionarios_auth
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR has_role(auth.uid(), 'admin'::text)
  );

-- 2. Fix user_roles: restrict SELECT to own rows or admin
DROP POLICY IF EXISTS "auth_read_ur" ON public.user_roles;
CREATE POLICY "read_own_or_admin_ur" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR has_role(auth.uid(), 'admin'::text)
  );

-- 3. Fix mutable search_path on generate_product_codes
CREATE OR REPLACE FUNCTION public.generate_product_codes()
  RETURNS json
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $function$
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
$function$;

-- 4. Fix mutable search_path on generate_sale_code
CREATE OR REPLACE FUNCTION public.generate_sale_code()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $function$
DECLARE
  v_code text;
  v_exists boolean;
BEGIN
  LOOP
    v_code := 'VND-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    SELECT EXISTS(SELECT 1 FROM public.vendas WHERE sale_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  NEW.sale_code := v_code;
  RETURN NEW;
END;
$function$;

-- 5. Fix login_attempts: add RLS policy (RLS enabled but no policies)
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_read_login_attempts" ON public.login_attempts
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::text));
CREATE POLICY "anyone_insert_login_attempts" ON public.login_attempts
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 6. Fix storage: restrict product-images INSERT/DELETE to authenticated
DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes" ON storage.objects;
DROP POLICY IF EXISTS "Allow public upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public delete product images" ON storage.objects;
DROP POLICY IF EXISTS "public_insert_product_images" ON storage.objects;
DROP POLICY IF EXISTS "public_delete_product_images" ON storage.objects;

CREATE POLICY "auth_insert_product_images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "auth_delete_product_images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'product-images');
