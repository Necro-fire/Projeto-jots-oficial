
-- Sequence for purchase codes
CREATE SEQUENCE IF NOT EXISTS public.compra_code_seq START 1;

-- Function to generate purchase code
CREATE OR REPLACE FUNCTION public.generate_compra_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num bigint;
BEGIN
  next_num := nextval('public.compra_code_seq');
  RETURN 'CMP-' || LPAD(next_num::text, 6, '0');
END;
$$;

-- Add codigo to compras_fornecedor
ALTER TABLE public.compras_fornecedor
ADD COLUMN IF NOT EXISTS codigo text NOT NULL DEFAULT ('CMP-' || LPAD((nextval('compra_code_seq'))::text, 6, '0'));

-- Create compra_items table
CREATE TABLE public.compra_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  compra_id uuid NOT NULL REFERENCES public.compras_fornecedor(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.produtos(id),
  produto_code text NOT NULL DEFAULT '',
  produto_model text NOT NULL DEFAULT '',
  quantidade integer NOT NULL DEFAULT 1,
  valor_unitario numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.compra_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for compra_items
CREATE POLICY "auth_read_compra_items" ON public.compra_items
FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_write_compra_items" ON public.compra_items
FOR INSERT TO authenticated
WITH CHECK (has_permission(auth.uid(), 'fornecedores', 'create') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "auth_update_compra_items" ON public.compra_items
FOR UPDATE TO authenticated
USING (has_permission(auth.uid(), 'fornecedores', 'edit') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "auth_delete_compra_items" ON public.compra_items
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Index for performance
CREATE INDEX idx_compra_items_compra_id ON public.compra_items(compra_id);
CREATE INDEX idx_compras_fornecedor_codigo ON public.compras_fornecedor(codigo);
