-- VENDAS: permitir INSERT para quem tem pdv.sell ou vendas.manage
DROP POLICY IF EXISTS auth_write_vendas ON public.vendas;
CREATE POLICY auth_write_vendas ON public.vendas
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin')
  OR has_permission(auth.uid(), 'pdv', 'sell')
  OR has_permission(auth.uid(), 'vendas', 'manage')
  OR has_permission(auth.uid(), 'vendas', 'create')
);

-- VENDA_ITEMS: idem
DROP POLICY IF EXISTS auth_write_venda_items ON public.venda_items;
CREATE POLICY auth_write_venda_items ON public.venda_items
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin')
  OR has_permission(auth.uid(), 'pdv', 'sell')
  OR has_permission(auth.uid(), 'vendas', 'manage')
  OR has_permission(auth.uid(), 'vendas', 'create')
);

-- BOLETO_ALERTAS: idem
DROP POLICY IF EXISTS auth_write_boleto_alertas ON public.boleto_alertas;
CREATE POLICY auth_write_boleto_alertas ON public.boleto_alertas
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin')
  OR has_permission(auth.uid(), 'pdv', 'sell')
  OR has_permission(auth.uid(), 'vendas', 'manage')
  OR has_permission(auth.uid(), 'vendas', 'create')
);

-- CAIXA_MOVIMENTACOES: incluir pdv.sell e vendas.manage para registrar movimentação de venda
DROP POLICY IF EXISTS auth_write_caixa_mov ON public.caixa_movimentacoes;
CREATE POLICY auth_write_caixa_mov ON public.caixa_movimentacoes
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin')
  OR has_permission(auth.uid(), 'caixa', 'manage')
  OR has_permission(auth.uid(), 'pdv', 'sell')
  OR has_permission(auth.uid(), 'vendas', 'manage')
);

-- VENDA_ITEM_CANCELAMENTOS: aceitar vendas.manage também
DROP POLICY IF EXISTS auth_write_item_cancel ON public.venda_item_cancelamentos;
CREATE POLICY auth_write_item_cancel ON public.venda_item_cancelamentos
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin')
  OR has_permission(auth.uid(), 'vendas', 'cancel')
  OR has_permission(auth.uid(), 'vendas', 'manage')
);

-- CONSIGNADOS criados a partir do PDV: permitir para quem vende
DROP POLICY IF EXISTS auth_write_consignados ON public.consignados;
CREATE POLICY auth_write_consignados ON public.consignados
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin')
  OR has_permission(auth.uid(), 'fornecedores', 'create')
  OR has_permission(auth.uid(), 'pdv', 'sell')
  OR has_permission(auth.uid(), 'vendas', 'manage')
);

DROP POLICY IF EXISTS auth_write_consignado_hist ON public.consignado_historico;
CREATE POLICY auth_write_consignado_hist ON public.consignado_historico
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin')
  OR has_permission(auth.uid(), 'fornecedores', 'create')
  OR has_permission(auth.uid(), 'pdv', 'sell')
  OR has_permission(auth.uid(), 'vendas', 'manage')
);