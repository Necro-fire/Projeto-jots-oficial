-- Limpeza completa de dados operacionais e funcionários
-- Mantém: admin THIAGO PAIAO (02a58633-8d6f-44fb-b313-d9df59763710), roles, permissions, role_permissions

DO $$
DECLARE
  v_admin_id uuid := '02a58633-8d6f-44fb-b313-d9df59763710';
BEGIN
  -- 1) Dados operacionais (ordem respeita FKs)
  DELETE FROM public.consignado_trocas;
  DELETE FROM public.consignado_historico;
  DELETE FROM public.consignados;
  DELETE FROM public.boleto_alertas;
  DELETE FROM public.venda_item_cancelamentos;
  DELETE FROM public.venda_items;
  DELETE FROM public.notas_fiscais;
  DELETE FROM public.caixa_movimentacoes;
  DELETE FROM public.vendas;
  DELETE FROM public.caixas;
  DELETE FROM public.compra_items;
  DELETE FROM public.compras_fornecedor;
  DELETE FROM public.fornecedor_produtos;
  DELETE FROM public.fornecedores;
  DELETE FROM public.estoque;
  DELETE FROM public.descontos_atacado;
  DELETE FROM public.alertas_estoque;
  DELETE FROM public.produtos;
  DELETE FROM public.clientes;

  -- 2) Logs e alertas
  DELETE FROM public.audit_logs;
  DELETE FROM public.security_alerts;
  DELETE FROM public.login_attempts;

  -- 3) Funcionários (auth público) — todos
  DELETE FROM public.funcionarios_auth;

  -- 4) user_roles e profiles — manter apenas admin
  DELETE FROM public.user_roles WHERE user_id <> v_admin_id;
  DELETE FROM public.profiles WHERE id <> v_admin_id;

  -- 5) Reset de sequences para começar do zero
  PERFORM setval('public.fornecedor_code_seq', 1, false);
  PERFORM setval('public.compra_code_seq', 1, false);
  PERFORM setval('public.consignado_code_seq', 1, false);
  PERFORM setval('public.produto_code_seq', 1, false);
  PERFORM setval('public.vendas_number_seq', 1, false);
END $$;

-- 6) Remover usuários do auth.users exceto o admin (cascata removerá vínculos remanescentes)
DELETE FROM auth.users WHERE id <> '02a58633-8d6f-44fb-b313-d9df59763710';