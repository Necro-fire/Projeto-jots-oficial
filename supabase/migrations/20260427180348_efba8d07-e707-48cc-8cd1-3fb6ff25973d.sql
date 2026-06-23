INSERT INTO public.permissions (module, action, description)
VALUES ('clientes', 'view', 'Visualizar clientes')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r, public.permissions p
WHERE r.name = 'admin' AND p.module = 'clientes' AND p.action = 'view'
ON CONFLICT DO NOTHING;