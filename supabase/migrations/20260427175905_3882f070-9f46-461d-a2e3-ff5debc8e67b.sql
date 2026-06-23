DELETE FROM public.role_permissions
WHERE permission_id IN (
  SELECT id FROM public.permissions WHERE module = 'produtos' AND action = 'view_images'
);

DELETE FROM public.permissions WHERE module = 'produtos' AND action = 'view_images';