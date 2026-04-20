DROP POLICY IF EXISTS auth_write_estoque ON public.estoque;
DROP POLICY IF EXISTS auth_update_estoque ON public.estoque;
DROP POLICY IF EXISTS auth_write_alertas_estoque ON public.alertas_estoque;
DROP POLICY IF EXISTS auth_update_alertas_estoque ON public.alertas_estoque;

CREATE POLICY auth_write_estoque
ON public.estoque
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin')
  OR has_permission(auth.uid(), 'estoque', 'manage_alert')
  OR has_permission(auth.uid(), 'produtos', 'create')
  OR has_permission(auth.uid(), 'produtos', 'edit')
);

CREATE POLICY auth_update_estoque
ON public.estoque
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  OR has_permission(auth.uid(), 'estoque', 'manage_alert')
  OR has_permission(auth.uid(), 'produtos', 'create')
  OR has_permission(auth.uid(), 'produtos', 'edit')
)
WITH CHECK (
  has_role(auth.uid(), 'admin')
  OR has_permission(auth.uid(), 'estoque', 'manage_alert')
  OR has_permission(auth.uid(), 'produtos', 'create')
  OR has_permission(auth.uid(), 'produtos', 'edit')
);

CREATE POLICY auth_write_alertas_estoque
ON public.alertas_estoque
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin')
  OR has_permission(auth.uid(), 'estoque', 'manage_alert')
);

CREATE POLICY auth_update_alertas_estoque
ON public.alertas_estoque
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  OR has_permission(auth.uid(), 'estoque', 'manage_alert')
)
WITH CHECK (
  has_role(auth.uid(), 'admin')
  OR has_permission(auth.uid(), 'estoque', 'manage_alert')
);