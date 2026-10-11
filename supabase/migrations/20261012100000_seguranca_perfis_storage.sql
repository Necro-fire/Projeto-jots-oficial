-- Endurecimento de segurança (parte 1): perfis e arquivos (Storage).
-- NÃO APLICADA: aplicar só no banco novo, depois de revisar e testar
-- (supabase/tests/regressao_seguranca.sql). Idempotente: pode ser reaplicada.
--
-- Problemas tratados:
--  1. profiles era legível por qualquer usuário logado. O e-mail interno é func_<CPF>@jots.interno,
--     então qualquer funcionário enxergava o CPF (= login) de todos os colegas.
--  2. profiles aceitava UPDATE do próprio perfil sem limite de colunas (tipo, email). O front só
--     LÊ o próprio perfil; criação/edição é feita pela função auth-api (service role).
--  3. Storage: qualquer usuário logado enviava/apagava imagens de produto e lia/gravava/apagava
--     as notas fiscais (nfe-files), sem checar permissão. Também não havia limite de tamanho/tipo.

-- ───────────────────────────────────────────────────────────────────────────
-- 1) profiles: cada um vê só o próprio perfil; administrador vê todos
-- ───────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_read_profiles" ON public.profiles;
DROP POLICY IF EXISTS "read_own_or_admin_profiles" ON public.profiles;
CREATE POLICY "read_own_or_admin_profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Sem política de INSERT/UPDATE para o usuário comum: perfis só mudam pela auth-api.
DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "insert_own_profile" ON public.profiles;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Storage: product-images (leitura pública continua: as vitrines usam a URL pública)
-- ───────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_insert_product_images" ON storage.objects;
DROP POLICY IF EXISTS "auth_delete_product_images" ON storage.objects;
DROP POLICY IF EXISTS "perm_insert_product_images" ON storage.objects;
DROP POLICY IF EXISTS "perm_delete_product_images" ON storage.objects;

CREATE POLICY "perm_insert_product_images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_permission(auth.uid(), 'produtos', 'create')
      OR public.has_permission(auth.uid(), 'produtos', 'edit')
    )
  );

CREATE POLICY "perm_delete_product_images" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_permission(auth.uid(), 'produtos', 'edit')
      OR public.has_permission(auth.uid(), 'produtos', 'delete')
    )
  );

-- Só imagens, até 10 MB (o front re-renderiza em canvas e envia jpeg/png).
UPDATE storage.buckets
   SET file_size_limit = 10485760,
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
 WHERE id = 'product-images';

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Storage: nfe-files (bucket privado; o front usa URLs assinadas)
--    Ler: qualquer usuário logado (Vendas e Notas Fiscais mostram o XML/PDF).
--    Enviar: administrador ou quem emite/adiciona NF. Alterar/apagar: só administrador.
-- ───────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all_nfe_files" ON storage.objects;
DROP POLICY IF EXISTS "auth_read_nfe_files" ON storage.objects;
DROP POLICY IF EXISTS "perm_insert_nfe_files" ON storage.objects;
DROP POLICY IF EXISTS "admin_update_nfe_files" ON storage.objects;
DROP POLICY IF EXISTS "admin_delete_nfe_files" ON storage.objects;

CREATE POLICY "auth_read_nfe_files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'nfe-files');

CREATE POLICY "perm_insert_nfe_files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'nfe-files'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_permission(auth.uid(), 'fiscal', 'add_nf')
      OR public.has_permission(auth.uid(), 'fiscal', 'manage')
      OR public.has_permission(auth.uid(), 'fiscal', 'emit')
    )
  );

CREATE POLICY "admin_update_nfe_files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'nfe-files' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'nfe-files' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin_delete_nfe_files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'nfe-files' AND public.has_role(auth.uid(), 'admin'));

-- XML/PDF de NF: até 20 MB (sem filtro de tipo: navegadores informam tipos variados para .xml).
UPDATE storage.buckets
   SET file_size_limit = 20971520
 WHERE id = 'nfe-files';
