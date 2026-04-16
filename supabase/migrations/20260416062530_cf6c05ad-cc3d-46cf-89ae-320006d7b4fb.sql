-- Add foreign keys if they don't exist yet (safe with IF NOT EXISTS pattern)

-- compras_fornecedor -> fornecedores
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'compras_fornecedor_fornecedor_id_fkey' 
    AND table_name = 'compras_fornecedor'
  ) THEN
    ALTER TABLE public.compras_fornecedor
      ADD CONSTRAINT compras_fornecedor_fornecedor_id_fkey
      FOREIGN KEY (fornecedor_id) REFERENCES public.fornecedores(id) ON DELETE CASCADE;
  END IF;
END $$;

-- compra_items -> compras_fornecedor
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'compra_items_compra_id_fkey' 
    AND table_name = 'compra_items'
  ) THEN
    ALTER TABLE public.compra_items
      ADD CONSTRAINT compra_items_compra_id_fkey
      FOREIGN KEY (compra_id) REFERENCES public.compras_fornecedor(id) ON DELETE CASCADE;
  END IF;
END $$;

-- compra_items -> produtos
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'compra_items_produto_id_fkey' 
    AND table_name = 'compra_items'
  ) THEN
    ALTER TABLE public.compra_items
      ADD CONSTRAINT compra_items_produto_id_fkey
      FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- fornecedor_produtos -> fornecedores
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fornecedor_produtos_fornecedor_id_fkey' 
    AND table_name = 'fornecedor_produtos'
  ) THEN
    ALTER TABLE public.fornecedor_produtos
      ADD CONSTRAINT fornecedor_produtos_fornecedor_id_fkey
      FOREIGN KEY (fornecedor_id) REFERENCES public.fornecedores(id) ON DELETE CASCADE;
  END IF;
END $$;

-- fornecedor_produtos -> produtos
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fornecedor_produtos_produto_id_fkey' 
    AND table_name = 'fornecedor_produtos'
  ) THEN
    ALTER TABLE public.fornecedor_produtos
      ADD CONSTRAINT fornecedor_produtos_produto_id_fkey
      FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_compras_fornecedor_fornecedor_id ON public.compras_fornecedor(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_compras_fornecedor_filial_id ON public.compras_fornecedor(filial_id);
CREATE INDEX IF NOT EXISTS idx_compra_items_compra_id ON public.compra_items(compra_id);
CREATE INDEX IF NOT EXISTS idx_compra_items_produto_id ON public.compra_items(produto_id);
CREATE INDEX IF NOT EXISTS idx_fornecedor_produtos_fornecedor_id ON public.fornecedor_produtos(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_fornecedor_produtos_produto_id ON public.fornecedor_produtos(produto_id);

-- Add unique constraint to prevent duplicate product-supplier links
ALTER TABLE public.fornecedor_produtos 
  DROP CONSTRAINT IF EXISTS fornecedor_produtos_unique_link;
ALTER TABLE public.fornecedor_produtos 
  ADD CONSTRAINT fornecedor_produtos_unique_link UNIQUE (fornecedor_id, produto_id);