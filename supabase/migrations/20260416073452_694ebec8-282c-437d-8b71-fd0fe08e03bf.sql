
-- Add FK from consignados to produtos
ALTER TABLE public.consignados
  ADD CONSTRAINT consignados_produto_id_fkey
  FOREIGN KEY (produto_id) REFERENCES public.produtos(id);

-- Add FK from consignados to clientes
ALTER TABLE public.consignados
  ADD CONSTRAINT consignados_cliente_id_fkey
  FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);
