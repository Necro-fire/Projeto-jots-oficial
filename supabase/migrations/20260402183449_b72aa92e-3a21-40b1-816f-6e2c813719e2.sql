
-- 1) Add CPF column to funcionarios_auth
ALTER TABLE public.funcionarios_auth ADD COLUMN IF NOT EXISTS cpf text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS funcionarios_auth_cpf_unique ON public.funcionarios_auth (cpf) WHERE cpf != '';

-- 2) Add sale_code to vendas  
ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS sale_code text NOT NULL DEFAULT '';

-- 3) Create function to generate unique sale code
CREATE OR REPLACE FUNCTION public.generate_sale_code()
RETURNS trigger
LANGUAGE plpgsql
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

-- 4) Create trigger to auto-generate sale code
DROP TRIGGER IF EXISTS trg_generate_sale_code ON public.vendas;
CREATE TRIGGER trg_generate_sale_code
  BEFORE INSERT ON public.vendas
  FOR EACH ROW
  WHEN (NEW.sale_code = '' OR NEW.sale_code IS NULL)
  EXECUTE FUNCTION public.generate_sale_code();

-- 5) Create system_settings table for recovery code
CREATE TABLE IF NOT EXISTS public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write system_settings
CREATE POLICY "admin_all_system_settings" ON public.system_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 6) Backfill existing vendas with sale_code
UPDATE public.vendas SET sale_code = 'VND-' || upper(substr(md5(id::text || created_at::text), 1, 6)) WHERE sale_code = '';
