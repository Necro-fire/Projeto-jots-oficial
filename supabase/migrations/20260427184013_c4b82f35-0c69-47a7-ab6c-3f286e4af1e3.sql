-- Adicionar permissão para visualizar/gerenciar custo de produtos
INSERT INTO public.permissions (module, action, description)
VALUES ('produtos', 'view_cost', 'Visualizar e gerenciar o custo do produto')
ON CONFLICT DO NOTHING;

-- Conceder automaticamente ao cargo admin
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'admin' AND p.module = 'produtos' AND p.action = 'view_cost'
ON CONFLICT DO NOTHING;