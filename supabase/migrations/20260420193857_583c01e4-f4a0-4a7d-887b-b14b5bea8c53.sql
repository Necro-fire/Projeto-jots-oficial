-- 1. Insert new permissions
INSERT INTO public.permissions (module, action, description) VALUES
  ('produtos', 'manage_atacado', 'Gerenciar descontos atacado'),
  ('produtos', 'export_image', 'Exportar imagens (WhatsApp)'),
  ('produtos', 'view_images', 'Visualizar imagens dos produtos')
ON CONFLICT DO NOTHING;

-- 2. Grant all new permissions to admin role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'admin'
  AND p.module = 'produtos'
  AND p.action IN ('manage_atacado', 'export_image', 'view_images')
ON CONFLICT DO NOTHING;

-- 3. Update descontos_atacado RLS to allow managers with manage_atacado permission
DROP POLICY IF EXISTS auth_write_descontos_atacado ON public.descontos_atacado;
DROP POLICY IF EXISTS auth_update_descontos_atacado ON public.descontos_atacado;
DROP POLICY IF EXISTS auth_delete_descontos_atacado ON public.descontos_atacado;

CREATE POLICY auth_write_descontos_atacado
ON public.descontos_atacado
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin')
  OR has_permission(auth.uid(), 'produtos', 'manage_atacado')
);

CREATE POLICY auth_update_descontos_atacado
ON public.descontos_atacado
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  OR has_permission(auth.uid(), 'produtos', 'manage_atacado')
)
WITH CHECK (
  has_role(auth.uid(), 'admin')
  OR has_permission(auth.uid(), 'produtos', 'manage_atacado')
);

CREATE POLICY auth_delete_descontos_atacado
ON public.descontos_atacado
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  OR has_permission(auth.uid(), 'produtos', 'manage_atacado')
);