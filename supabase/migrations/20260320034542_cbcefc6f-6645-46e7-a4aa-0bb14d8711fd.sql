
-- Add filial_id to empresas to link with the system's filial concept
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS filial_id text UNIQUE;

-- Assign filial_id to existing empresas based on creation order
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) as rn
  FROM public.empresas
)
UPDATE public.empresas e
SET filial_id = n.rn::text
FROM numbered n
WHERE e.id = n.id AND e.filial_id IS NULL;

-- Create notas_fiscais table
CREATE TABLE IF NOT EXISTS public.notas_fiscais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero integer NOT NULL DEFAULT 0,
  filial_id text NOT NULL DEFAULT '1',
  venda_id uuid REFERENCES public.vendas(id),
  empresa_id uuid REFERENCES public.empresas(id),
  client_name text NOT NULL DEFAULT '',
  client_cnpj text NOT NULL DEFAULT '',
  valor_total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente',
  chave_acesso text NOT NULL DEFAULT '',
  data_emissao timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS for notas_fiscais
ALTER TABLE public.notas_fiscais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_notas_fiscais" ON public.notas_fiscais
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Sequence for NF numbers
CREATE SEQUENCE IF NOT EXISTS public.notas_fiscais_numero_seq;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notas_fiscais;
