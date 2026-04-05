
-- Produtos table
CREATE TABLE public.produtos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL,
  model TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '',
  material TEXT NOT NULL DEFAULT '',
  lens_size INTEGER NOT NULL DEFAULT 0,
  bridge_size INTEGER NOT NULL DEFAULT 0,
  temple_size INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  retail_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  wholesale_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  wholesale_min_qty INTEGER NOT NULL DEFAULT 5,
  stock INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  image_url TEXT NOT NULL DEFAULT '',
  filial_id TEXT NOT NULL DEFAULT '1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Clientes table
CREATE TABLE public.clientes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  responsible_name TEXT NOT NULL,
  store_name TEXT NOT NULL,
  cnpj TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  whatsapp TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  credit_limit NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  filial_id TEXT NOT NULL DEFAULT '1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Vendas table
CREATE TABLE public.vendas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  number SERIAL,
  client_id UUID REFERENCES public.clientes(id),
  client_name TEXT NOT NULL DEFAULT '',
  seller_name TEXT NOT NULL DEFAULT '',
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT '',
  origin TEXT NOT NULL DEFAULT 'stock',
  filial_id TEXT NOT NULL DEFAULT '1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Venda items table
CREATE TABLE public.venda_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venda_id UUID NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  produto_id UUID NOT NULL REFERENCES public.produtos(id),
  product_code TEXT NOT NULL DEFAULT '',
  product_model TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venda_items ENABLE ROW LEVEL SECURITY;

-- Public read/write policies (no auth required for now)
CREATE POLICY "Allow all access to produtos" ON public.produtos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to clientes" ON public.clientes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to vendas" ON public.vendas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to venda_items" ON public.venda_items FOR ALL USING (true) WITH CHECK (true);

-- Trigger function: reduce stock after venda_item insert
CREATE OR REPLACE FUNCTION public.reduce_stock_on_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.produtos
  SET stock = stock - NEW.quantity
  WHERE id = NEW.produto_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_reduce_stock
AFTER INSERT ON public.venda_items
FOR EACH ROW
EXECUTE FUNCTION public.reduce_stock_on_sale();

-- Enable realtime for relevant tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.produtos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vendas;
