
-- Fix: produtos - drop public policy, add authenticated-only
DROP POLICY IF EXISTS "Allow all access to produtos" ON public.produtos;
CREATE POLICY "auth_all_produtos" ON public.produtos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Fix: estoque
DROP POLICY IF EXISTS "Allow all access to estoque" ON public.estoque;
CREATE POLICY "auth_all_estoque" ON public.estoque FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Fix: descontos_atacado
DROP POLICY IF EXISTS "Allow all access to descontos_atacado" ON public.descontos_atacado;
CREATE POLICY "auth_all_descontos_atacado" ON public.descontos_atacado FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Fix: vendas
DROP POLICY IF EXISTS "Allow all access to vendas" ON public.vendas;
CREATE POLICY "auth_all_vendas" ON public.vendas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Fix: venda_items
DROP POLICY IF EXISTS "Allow all access to venda_items" ON public.venda_items;
CREATE POLICY "auth_all_venda_items" ON public.venda_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Fix: clientes
DROP POLICY IF EXISTS "Allow all access to clientes" ON public.clientes;
CREATE POLICY "auth_all_clientes" ON public.clientes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Fix: tipos_produto
DROP POLICY IF EXISTS "Allow all access to tipos_produto" ON public.tipos_produto;
CREATE POLICY "auth_all_tipos_produto" ON public.tipos_produto FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Fix: alertas_estoque
DROP POLICY IF EXISTS "Allow all access to alertas_estoque" ON public.alertas_estoque;
CREATE POLICY "auth_all_alertas_estoque" ON public.alertas_estoque FOR ALL TO authenticated USING (true) WITH CHECK (true);
