ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS tipo_cliente text NOT NULL DEFAULT 'pf',
  ADD COLUMN IF NOT EXISTS endereco text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS data_nascimento date,
  ADD COLUMN IF NOT EXISTS observacoes text NOT NULL DEFAULT '';

-- Add unique constraint on cnpj (used for both CPF and CNPJ)
CREATE UNIQUE INDEX IF NOT EXISTS clientes_cnpj_unique ON public.clientes (cnpj) WHERE cnpj <> '';