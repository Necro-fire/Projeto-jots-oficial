
-- Sequence for auto-generated supplier codes
CREATE SEQUENCE IF NOT EXISTS public.fornecedor_code_seq START 1;

-- Fornecedores table
CREATE TABLE public.fornecedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE DEFAULT 'FORN-' || LPAD(nextval('public.fornecedor_code_seq')::text, 6, '0'),
  nome text NOT NULL,
  cnpj_cpf text NOT NULL DEFAULT '',
  telefone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  endereco text NOT NULL DEFAULT '',
  cidade text NOT NULL DEFAULT '',
  estado text NOT NULL DEFAULT '',
  observacoes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  filial_id text NOT NULL DEFAULT '1',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_fornecedores" ON public.fornecedores FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_fornecedores" ON public.fornecedores FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(), 'fornecedores', 'create') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "auth_update_fornecedores" ON public.fornecedores FOR UPDATE TO authenticated USING (has_permission(auth.uid(), 'fornecedores', 'edit') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "auth_delete_fornecedores" ON public.fornecedores FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- Fornecedor-Produto link table (many-to-many)
CREATE TABLE public.fornecedor_produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id uuid NOT NULL REFERENCES public.fornecedores(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(fornecedor_id, produto_id)
);

ALTER TABLE public.fornecedor_produtos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_fp" ON public.fornecedor_produtos FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_fp" ON public.fornecedor_produtos FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(), 'fornecedores', 'edit') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "auth_delete_fp" ON public.fornecedor_produtos FOR DELETE TO authenticated USING (has_permission(auth.uid(), 'fornecedores', 'edit') OR has_role(auth.uid(), 'admin'));

-- Compras (purchase history)
CREATE TABLE public.compras_fornecedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id uuid NOT NULL REFERENCES public.fornecedores(id) ON DELETE CASCADE,
  descricao text NOT NULL DEFAULT '',
  valor_total numeric NOT NULL DEFAULT 0,
  data_compra timestamptz NOT NULL DEFAULT now(),
  observacoes text NOT NULL DEFAULT '',
  filial_id text NOT NULL DEFAULT '1',
  usuario_id uuid NOT NULL,
  usuario_nome text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.compras_fornecedor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_compras" ON public.compras_fornecedor FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_compras" ON public.compras_fornecedor FOR INSERT TO authenticated WITH CHECK (has_permission(auth.uid(), 'fornecedores', 'create') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "auth_update_compras" ON public.compras_fornecedor FOR UPDATE TO authenticated USING (has_permission(auth.uid(), 'fornecedores', 'edit') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "auth_delete_compras" ON public.compras_fornecedor FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- Function to generate supplier code (similar to product codes)
CREATE OR REPLACE FUNCTION public.generate_fornecedor_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num bigint;
BEGIN
  next_num := nextval('public.fornecedor_code_seq');
  RETURN 'FORN-' || LPAD(next_num::text, 6, '0');
END;
$$;
