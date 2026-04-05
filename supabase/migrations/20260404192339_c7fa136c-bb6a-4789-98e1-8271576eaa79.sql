
-- 1. Make nfe-files bucket private
UPDATE storage.buckets SET public = false WHERE id = 'nfe-files';

-- 2. Remove public INSERT/DELETE on product-images
DROP POLICY IF EXISTS "Public insert access for product images" ON storage.objects;
DROP POLICY IF EXISTS "Public delete access for product images" ON storage.objects;

-- 3. Create a helper function to check if user has any write role
CREATE OR REPLACE FUNCTION public.can_write(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = _user_id
  )
$$;

-- 4. Replace broad ALL policies on core tables with scoped policies

-- === vendas ===
DROP POLICY IF EXISTS "auth_all_vendas" ON public.vendas;
CREATE POLICY "auth_read_vendas" ON public.vendas FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_vendas" ON public.vendas FOR INSERT TO authenticated WITH CHECK (can_write(auth.uid()));
CREATE POLICY "auth_update_vendas" ON public.vendas FOR UPDATE TO authenticated USING (can_write(auth.uid()));
CREATE POLICY "auth_delete_vendas" ON public.vendas FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::text));

-- === venda_items ===
DROP POLICY IF EXISTS "auth_all_venda_items" ON public.venda_items;
CREATE POLICY "auth_read_venda_items" ON public.venda_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_venda_items" ON public.venda_items FOR INSERT TO authenticated WITH CHECK (can_write(auth.uid()));
CREATE POLICY "auth_update_venda_items" ON public.venda_items FOR UPDATE TO authenticated USING (can_write(auth.uid()));
CREATE POLICY "auth_delete_venda_items" ON public.venda_items FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::text));

-- === produtos ===
DROP POLICY IF EXISTS "auth_all_produtos" ON public.produtos;
CREATE POLICY "auth_read_produtos" ON public.produtos FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_produtos" ON public.produtos FOR INSERT TO authenticated WITH CHECK (can_write(auth.uid()));
CREATE POLICY "auth_update_produtos" ON public.produtos FOR UPDATE TO authenticated USING (can_write(auth.uid()));
CREATE POLICY "auth_delete_produtos" ON public.produtos FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::text));

-- === estoque ===
DROP POLICY IF EXISTS "auth_all_estoque" ON public.estoque;
CREATE POLICY "auth_read_estoque" ON public.estoque FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_estoque" ON public.estoque FOR INSERT TO authenticated WITH CHECK (can_write(auth.uid()));
CREATE POLICY "auth_update_estoque" ON public.estoque FOR UPDATE TO authenticated USING (can_write(auth.uid()));
CREATE POLICY "auth_delete_estoque" ON public.estoque FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::text));

-- === clientes ===
DROP POLICY IF EXISTS "auth_all_clientes" ON public.clientes;
CREATE POLICY "auth_read_clientes" ON public.clientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_clientes" ON public.clientes FOR INSERT TO authenticated WITH CHECK (can_write(auth.uid()));
CREATE POLICY "auth_update_clientes" ON public.clientes FOR UPDATE TO authenticated USING (can_write(auth.uid()));
CREATE POLICY "auth_delete_clientes" ON public.clientes FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::text));

-- === caixas ===
DROP POLICY IF EXISTS "auth_all_caixas" ON public.caixas;
CREATE POLICY "auth_read_caixas" ON public.caixas FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_caixas" ON public.caixas FOR INSERT TO authenticated WITH CHECK (can_write(auth.uid()));
CREATE POLICY "auth_update_caixas" ON public.caixas FOR UPDATE TO authenticated USING (can_write(auth.uid()));
CREATE POLICY "auth_delete_caixas" ON public.caixas FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::text));

-- === caixa_movimentacoes ===
DROP POLICY IF EXISTS "auth_all_caixa_mov" ON public.caixa_movimentacoes;
CREATE POLICY "auth_read_caixa_mov" ON public.caixa_movimentacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_caixa_mov" ON public.caixa_movimentacoes FOR INSERT TO authenticated WITH CHECK (can_write(auth.uid()));
CREATE POLICY "auth_update_caixa_mov" ON public.caixa_movimentacoes FOR UPDATE TO authenticated USING (can_write(auth.uid()));
CREATE POLICY "auth_delete_caixa_mov" ON public.caixa_movimentacoes FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::text));

-- === notas_fiscais ===
DROP POLICY IF EXISTS "auth_all_notas_fiscais" ON public.notas_fiscais;
CREATE POLICY "auth_read_notas_fiscais" ON public.notas_fiscais FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_notas_fiscais" ON public.notas_fiscais FOR INSERT TO authenticated WITH CHECK (can_write(auth.uid()));
CREATE POLICY "auth_update_notas_fiscais" ON public.notas_fiscais FOR UPDATE TO authenticated USING (can_write(auth.uid()));
CREATE POLICY "auth_delete_notas_fiscais" ON public.notas_fiscais FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::text));

-- === empresas ===
DROP POLICY IF EXISTS "auth_all_empresas" ON public.empresas;
CREATE POLICY "auth_read_empresas" ON public.empresas FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_empresas" ON public.empresas FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::text));
CREATE POLICY "auth_update_empresas" ON public.empresas FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::text));
CREATE POLICY "auth_delete_empresas" ON public.empresas FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::text));

-- === descontos_atacado ===
DROP POLICY IF EXISTS "auth_all_descontos_atacado" ON public.descontos_atacado;
CREATE POLICY "auth_read_descontos_atacado" ON public.descontos_atacado FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_descontos_atacado" ON public.descontos_atacado FOR INSERT TO authenticated WITH CHECK (can_write(auth.uid()));
CREATE POLICY "auth_update_descontos_atacado" ON public.descontos_atacado FOR UPDATE TO authenticated USING (can_write(auth.uid()));
CREATE POLICY "auth_delete_descontos_atacado" ON public.descontos_atacado FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::text));

-- === tipos_produto ===
DROP POLICY IF EXISTS "auth_all_tipos_produto" ON public.tipos_produto;
CREATE POLICY "auth_read_tipos_produto" ON public.tipos_produto FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_tipos_produto" ON public.tipos_produto FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::text));
CREATE POLICY "auth_update_tipos_produto" ON public.tipos_produto FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::text));
CREATE POLICY "auth_delete_tipos_produto" ON public.tipos_produto FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::text));

-- === alertas_estoque ===
DROP POLICY IF EXISTS "auth_all_alertas_estoque" ON public.alertas_estoque;
CREATE POLICY "auth_read_alertas_estoque" ON public.alertas_estoque FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_alertas_estoque" ON public.alertas_estoque FOR INSERT TO authenticated WITH CHECK (can_write(auth.uid()));
CREATE POLICY "auth_update_alertas_estoque" ON public.alertas_estoque FOR UPDATE TO authenticated USING (can_write(auth.uid()));
CREATE POLICY "auth_delete_alertas_estoque" ON public.alertas_estoque FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::text));

-- === boleto_alertas ===
DROP POLICY IF EXISTS "auth_all_boleto_alertas" ON public.boleto_alertas;
CREATE POLICY "auth_read_boleto_alertas" ON public.boleto_alertas FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_boleto_alertas" ON public.boleto_alertas FOR INSERT TO authenticated WITH CHECK (can_write(auth.uid()));
CREATE POLICY "auth_update_boleto_alertas" ON public.boleto_alertas FOR UPDATE TO authenticated USING (can_write(auth.uid()));
CREATE POLICY "auth_delete_boleto_alertas" ON public.boleto_alertas FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::text));

-- === venda_item_cancelamentos ===
DROP POLICY IF EXISTS "auth_all_item_cancel" ON public.venda_item_cancelamentos;
CREATE POLICY "auth_read_item_cancel" ON public.venda_item_cancelamentos FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_item_cancel" ON public.venda_item_cancelamentos FOR INSERT TO authenticated WITH CHECK (can_write(auth.uid()));
CREATE POLICY "auth_delete_item_cancel" ON public.venda_item_cancelamentos FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::text));
