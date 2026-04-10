
-- 1. Remove "Visualizar clientes" (redundant)
DELETE FROM public.role_permissions WHERE permission_id = (SELECT id FROM public.permissions WHERE module = 'clientes' AND action = 'view');
DELETE FROM public.permissions WHERE module = 'clientes' AND action = 'view';

-- 2. Remove "Adicionar/Remover alerta" (estoque.edit) — covered by manage_alert
DELETE FROM public.role_permissions WHERE permission_id = (SELECT id FROM public.permissions WHERE module = 'estoque' AND action = 'edit');
DELETE FROM public.permissions WHERE module = 'estoque' AND action = 'edit';

-- 3. Rename "Corrigir NF (CC-e)" to "Remover Nota Fiscal"
UPDATE public.permissions SET action = 'delete_nf', description = 'Remover Nota Fiscal' WHERE module = 'fiscal' AND action = 'correct_nf';

-- 4. Add "Gerenciar Vendas"
INSERT INTO public.permissions (module, action, description)
VALUES ('vendas', 'manage', 'Gerenciar Vendas')
ON CONFLICT DO NOTHING;
