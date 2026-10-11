-- Endurecimento de segurança (parte 3): leitura dos dados só para a equipe cadastrada.
-- NÃO APLICADA: aplicar só no banco novo, depois da parte 1 e de rodar
-- supabase/tests/regressao_seguranca.sql. Idempotente: pode ser reaplicada.
--
-- Problema: as políticas de leitura são "TO authenticated USING (true)". Qualquer pessoa com um
-- login válido do Supabase Auth — inclusive quem se cadastrou sozinho pela API pública
-- (/auth/v1/signup) se o cadastro aberto estiver ligado no painel — leria vendas, clientes,
-- produtos, caixa e notas fiscais. Também deixava ler tudo quem foi desativado, enquanto o
-- token anterior durasse.
--
-- Correção: "estar autenticado" passa a exigir ser da equipe: funcionário ativo em
-- funcionarios_auth OU administrador. Os usuários reais (criados pela auth-api) já são assim,
-- então nada muda para eles. As políticas de escrita não são tocadas aqui.

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.funcionarios_auth f
       WHERE f.user_id = _user_id AND COALESCE(f.status, 'active') = 'active'
    )
    OR public.has_role(_user_id, 'admin')
  )
$$;

REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;

-- Troca a expressão de TODAS as políticas de leitura "para authenticated, USING (true)" do
-- schema public. ALTER POLICY preserva nome, comando e papéis; o SELECT em subconsulta faz o
-- Postgres avaliar a função uma vez por consulta, não por linha.
DO $$
DECLARE
  r record;
  v_n integer := 0;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND cmd = 'SELECT'
       AND roles = '{authenticated}'
       AND qual = 'true'
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON %I.%I USING ((SELECT public.is_staff(auth.uid())))',
      r.policyname, r.schemaname, r.tablename
    );
    v_n := v_n + 1;
    RAISE NOTICE 'leitura restrita à equipe: %.% (%)', r.schemaname, r.tablename, r.policyname;
  END LOOP;
  RAISE NOTICE 'total de políticas ajustadas: %', v_n;
END
$$;
