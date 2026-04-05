
CREATE TABLE public.descontos_atacado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_desconto text NOT NULL DEFAULT 'todas',
  produto_id uuid REFERENCES public.produtos(id) ON DELETE CASCADE,
  categoria text NOT NULL DEFAULT '',
  quantidade_minima integer NOT NULL DEFAULT 1,
  tipo_valor text NOT NULL DEFAULT 'percentual',
  valor_desconto numeric NOT NULL DEFAULT 0,
  filial_id text NOT NULL DEFAULT '1',
  status text NOT NULL DEFAULT 'active',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.descontos_atacado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to descontos_atacado"
  ON public.descontos_atacado
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
