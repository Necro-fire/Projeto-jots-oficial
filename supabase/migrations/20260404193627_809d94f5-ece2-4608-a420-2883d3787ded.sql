
-- Replace broad can_write() with table-specific permission-based policies
-- This ensures employees can only write to tables matching their assigned permissions

-- Helper: check if user has permission for a specific module action
-- (has_permission already exists, we'll use it directly)

-- 1. PRODUTOS: require produtos.create for INSERT, produtos.edit for UPDATE
DROP POLICY IF EXISTS "auth_write_produtos" ON public.produtos;
DROP POLICY IF EXISTS "auth_update_produtos" ON public.produtos;

CREATE POLICY "auth_write_produtos" ON public.produtos
  FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'produtos', 'create') OR has_role(auth.uid(), 'admin'::text));

CREATE POLICY "auth_update_produtos" ON public.produtos
  FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'produtos', 'edit') OR has_role(auth.uid(), 'admin'::text));

-- 2. VENDAS: require vendas.create for INSERT, admin for UPDATE
DROP POLICY IF EXISTS "auth_write_vendas" ON public.vendas;
DROP POLICY IF EXISTS "auth_update_vendas" ON public.vendas;

CREATE POLICY "auth_write_vendas" ON public.vendas
  FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'vendas', 'create') OR has_role(auth.uid(), 'admin'::text));

CREATE POLICY "auth_update_vendas" ON public.vendas
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::text));

-- 3. VENDA_ITEMS: require vendas.create for INSERT, admin for UPDATE
DROP POLICY IF EXISTS "auth_write_venda_items" ON public.venda_items;
DROP POLICY IF EXISTS "auth_update_venda_items" ON public.venda_items;

CREATE POLICY "auth_write_venda_items" ON public.venda_items
  FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'vendas', 'create') OR has_role(auth.uid(), 'admin'::text));

CREATE POLICY "auth_update_venda_items" ON public.venda_items
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::text));

-- 4. CLIENTES: require clientes.create for INSERT, clientes.edit for UPDATE
DROP POLICY IF EXISTS "auth_write_clientes" ON public.clientes;
DROP POLICY IF EXISTS "auth_update_clientes" ON public.clientes;

CREATE POLICY "auth_write_clientes" ON public.clientes
  FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'clientes', 'create') OR has_role(auth.uid(), 'admin'::text));

CREATE POLICY "auth_update_clientes" ON public.clientes
  FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'clientes', 'edit') OR has_role(auth.uid(), 'admin'::text));

-- 5. CAIXAS: require caixa.manage for INSERT/UPDATE
DROP POLICY IF EXISTS "auth_write_caixas" ON public.caixas;
DROP POLICY IF EXISTS "auth_update_caixas" ON public.caixas;

CREATE POLICY "auth_write_caixas" ON public.caixas
  FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'caixa', 'manage') OR has_role(auth.uid(), 'admin'::text));

CREATE POLICY "auth_update_caixas" ON public.caixas
  FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'caixa', 'manage') OR has_role(auth.uid(), 'admin'::text));

-- 6. CAIXA_MOVIMENTACOES: require caixa.manage for INSERT/UPDATE
DROP POLICY IF EXISTS "auth_write_caixa_mov" ON public.caixa_movimentacoes;
DROP POLICY IF EXISTS "auth_update_caixa_mov" ON public.caixa_movimentacoes;

CREATE POLICY "auth_write_caixa_mov" ON public.caixa_movimentacoes
  FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'caixa', 'manage') OR has_role(auth.uid(), 'admin'::text));

CREATE POLICY "auth_update_caixa_mov" ON public.caixa_movimentacoes
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::text));

-- 7. ESTOQUE: require estoque.manage for INSERT/UPDATE
DROP POLICY IF EXISTS "auth_write_estoque" ON public.estoque;
DROP POLICY IF EXISTS "auth_update_estoque" ON public.estoque;

CREATE POLICY "auth_write_estoque" ON public.estoque
  FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'estoque', 'manage') OR has_role(auth.uid(), 'admin'::text));

CREATE POLICY "auth_update_estoque" ON public.estoque
  FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'estoque', 'manage') OR has_role(auth.uid(), 'admin'::text));

-- 8. NOTAS_FISCAIS: require fiscal.emit for INSERT, admin for UPDATE
DROP POLICY IF EXISTS "auth_write_notas_fiscais" ON public.notas_fiscais;
DROP POLICY IF EXISTS "auth_update_notas_fiscais" ON public.notas_fiscais;

CREATE POLICY "auth_write_notas_fiscais" ON public.notas_fiscais
  FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'fiscal', 'emit') OR has_role(auth.uid(), 'admin'::text));

CREATE POLICY "auth_update_notas_fiscais" ON public.notas_fiscais
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::text));

-- 9. BOLETO_ALERTAS: require vendas.create for INSERT (created during sales), admin for UPDATE
DROP POLICY IF EXISTS "auth_write_boleto_alertas" ON public.boleto_alertas;
DROP POLICY IF EXISTS "auth_update_boleto_alertas" ON public.boleto_alertas;

CREATE POLICY "auth_write_boleto_alertas" ON public.boleto_alertas
  FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'vendas', 'create') OR has_role(auth.uid(), 'admin'::text));

CREATE POLICY "auth_update_boleto_alertas" ON public.boleto_alertas
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::text));

-- 10. DESCONTOS_ATACADO: require admin (pricing control)
DROP POLICY IF EXISTS "auth_write_descontos_atacado" ON public.descontos_atacado;
DROP POLICY IF EXISTS "auth_update_descontos_atacado" ON public.descontos_atacado;

CREATE POLICY "auth_write_descontos_atacado" ON public.descontos_atacado
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::text));

CREATE POLICY "auth_update_descontos_atacado" ON public.descontos_atacado
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::text));

-- 11. ALERTAS_ESTOQUE: require estoque.manage
DROP POLICY IF EXISTS "auth_write_alertas_estoque" ON public.alertas_estoque;
DROP POLICY IF EXISTS "auth_update_alertas_estoque" ON public.alertas_estoque;

CREATE POLICY "auth_write_alertas_estoque" ON public.alertas_estoque
  FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'estoque', 'manage') OR has_role(auth.uid(), 'admin'::text));

CREATE POLICY "auth_update_alertas_estoque" ON public.alertas_estoque
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::text));

-- 12. VENDA_ITEM_CANCELAMENTOS: require vendas.cancel
DROP POLICY IF EXISTS "auth_write_item_cancel" ON public.venda_item_cancelamentos;

CREATE POLICY "auth_write_item_cancel" ON public.venda_item_cancelamentos
  FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'vendas', 'cancel') OR has_role(auth.uid(), 'admin'::text));
