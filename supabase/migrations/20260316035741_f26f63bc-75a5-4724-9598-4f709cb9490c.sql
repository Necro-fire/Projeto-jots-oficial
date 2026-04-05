
CREATE TABLE public.tipos_produto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_tipo text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.tipos_produto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to tipos_produto" ON public.tipos_produto
  FOR ALL TO public USING (true) WITH CHECK (true);

ALTER TABLE public.produtos ADD COLUMN tipo_produto_id uuid REFERENCES public.tipos_produto(id) ON DELETE SET NULL;
