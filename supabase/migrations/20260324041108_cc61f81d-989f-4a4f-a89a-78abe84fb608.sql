
ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS status_boleto text NOT NULL DEFAULT '';
