
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS tipo_haste text NOT NULL DEFAULT '';
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS cor_haste text NOT NULL DEFAULT '';
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS polarizado text NOT NULL DEFAULT '';
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS ponte_armacao text NOT NULL DEFAULT '';

ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS cpf text NOT NULL DEFAULT '';
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS telefones text[] NOT NULL DEFAULT '{}';
