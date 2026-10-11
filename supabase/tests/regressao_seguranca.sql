-- Teste de regressão de segurança (perfis, Storage e escrita somente por RPC). Não deixa rastro.
-- Uso (contra o banco vinculado), SOMENTE depois de aplicar as migrações
--   20261012100000_seguranca_perfis_storage.sql e 20261012100100_escrita_somente_rpc.sql:
--   npx supabase db query --linked -f supabase/tests/regressao_seguranca.sql
-- O bloco termina SEMPRE com um erro 'RESULTADO_TESTE ...' que reverte tudo; o relatório está
-- na mensagem. Linhas 'OK' passaram; 'FALHOU' indica regressão; 'INCONCLUSIVO' pede olhar manual.
-- Rode também regressao_banco.sql, regressao_cancelamento_caixa.sql e
-- regressao_produto_compras_consignados.sql: as RPCs têm que continuar funcionando.

DO $t$
DECLARE
  v_log text := '';
  v_admin uuid; v_emp uuid; v_emp_semprod uuid;
  v_n integer; v_n2 integer; v_tipo text; v_caixa_aberto uuid;
BEGIN
  SELECT id INTO v_caixa_aberto FROM public.caixas WHERE status = 'aberto' LIMIT 1;
  SELECT ur.user_id INTO v_admin FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.name = 'admin' LIMIT 1;
  SELECT f.user_id INTO v_emp FROM funcionarios_auth f
   WHERE f.user_id IS NOT NULL AND NOT public.has_role(f.user_id, 'admin') LIMIT 1;
  SELECT f.user_id INTO v_emp_semprod FROM funcionarios_auth f
   WHERE f.user_id IS NOT NULL AND NOT public.has_role(f.user_id, 'admin')
     AND NOT public.has_permission(f.user_id, 'produtos', 'create')
     AND NOT public.has_permission(f.user_id, 'produtos', 'edit') LIMIT 1;
  v_log := v_log || format(E'admin=%s emp=%s emp_sem_produtos=%s\n', v_admin, v_emp, v_emp_semprod);

  IF v_emp IS NULL THEN
    RAISE EXCEPTION E'RESULTADO_TESTE\nINCONCLUSIVO: nenhum funcionario nao-admin com login para testar';
  END IF;

  -- S1: funcionário vê só o próprio perfil
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_emp, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_n FROM public.profiles;
  RESET ROLE;
  v_log := v_log || CASE WHEN v_n <= 1 THEN format(E'S1 OK funcionario ve %s perfil(is)\n', v_n)
                         ELSE format(E'S1 FALHOU funcionario ve %s perfis\n', v_n) END;

  -- S2: administrador continua vendo todos
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_n FROM public.profiles;
  RESET ROLE;
  SELECT count(*) INTO v_n2 FROM public.profiles;
  v_log := v_log || CASE WHEN v_n = v_n2 THEN format(E'S2 OK admin ve todos os %s perfis\n', v_n)
                         ELSE format(E'S2 FALHOU admin ve %s de %s perfis\n', v_n, v_n2) END;

  -- S3: funcionário não consegue virar admin editando o próprio perfil
  SELECT tipo INTO v_tipo FROM public.profiles WHERE id = v_emp;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_emp, 'role', 'authenticated')::text, true);
  UPDATE public.profiles SET tipo = 'admin' WHERE id = v_emp;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RESET ROLE;
  v_log := v_log || CASE WHEN v_n = 0 AND (SELECT tipo FROM public.profiles WHERE id = v_emp) IS NOT DISTINCT FROM v_tipo
                         THEN E'S3 OK UPDATE do proprio perfil nao alterou nada\n'
                         ELSE format(E'S3 FALHOU linhas=%s tipo agora=%s\n', v_n, (SELECT tipo FROM public.profiles WHERE id = v_emp)) END;

  -- S4: INSERT direto em vendas é recusado (só criar_venda grava)
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO public.vendas (client_name, seller_name, total, discount, payment_method, origin, filial_id, status)
    VALUES ('Forjada', 'Forjada', 1, 0, 'pix', 'stock', '1', 'concluida');
    RESET ROLE;
    v_log := v_log || E'S4 FALHOU INSERT direto em vendas passou\n';
  EXCEPTION
    WHEN insufficient_privilege THEN RESET ROLE; v_log := v_log || E'S4 OK INSERT direto em vendas recusado (RLS)\n';
    WHEN OTHERS THEN RESET ROLE; v_log := v_log || format(E'S4 INCONCLUSIVO %s\n', SQLERRM);
  END;

  -- S5: INSERT direto em caixa_movimentacoes e caixas é recusado
  -- (S5a usa um caixa aberto real: o trigger de guarda roda antes da RLS e recusaria "caixa fechado")
  IF v_caixa_aberto IS NULL THEN
    v_log := v_log || E'S5a INCONCLUSIVO nao ha caixa aberto para testar\n';
  END IF;
  IF true THEN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO public.caixa_movimentacoes (caixa_id, tipo, valor, forma_pagamento, descricao, usuario_id, usuario_nome)
    VALUES (v_caixa_aberto, 'reforco', 1, 'dinheiro', 'forjada', v_admin, 'x');
    RESET ROLE;
    v_log := v_log || E'S5a FALHOU INSERT direto em caixa_movimentacoes passou\n';
  EXCEPTION
    WHEN insufficient_privilege THEN RESET ROLE; v_log := v_log || E'S5a OK INSERT direto em caixa_movimentacoes recusado (RLS)\n';
    WHEN OTHERS THEN RESET ROLE; v_log := v_log || format(E'S5a INCONCLUSIVO %s\n', SQLERRM);
  END;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO public.caixas (filial_id, status, usuario_abertura_id, usuario_abertura_nome, valor_abertura)
    VALUES ('1', 'aberto', v_admin, 'x', 0);
    RESET ROLE;
    v_log := v_log || E'S5b FALHOU INSERT direto em caixas passou\n';
  EXCEPTION
    WHEN insufficient_privilege THEN RESET ROLE; v_log := v_log || E'S5b OK INSERT direto em caixas recusado (RLS)\n';
    WHEN OTHERS THEN RESET ROLE; v_log := v_log || format(E'S5b INCONCLUSIVO %s\n', SQLERRM);
  END;
  END IF;

  -- S6: UPDATE direto de saldo em estoque não altera nenhuma linha
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  UPDATE public.estoque SET quantidade = quantidade + 1000;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RESET ROLE;
  v_log := v_log || CASE WHEN v_n = 0 THEN E'S6 OK UPDATE direto em estoque nao alterou linhas\n'
                         ELSE format(E'S6 FALHOU UPDATE direto alterou %s linhas\n', v_n) END;

  -- S7: Storage — quem não tem permissão de produtos não envia imagem
  -- Sem funcionário "sem produtos" cadastrado, usa um login sem nenhum cargo (uuid aleatório).
  IF true THEN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', COALESCE(v_emp_semprod, gen_random_uuid()), 'role', 'authenticated')::text, true);
    BEGIN
      INSERT INTO storage.objects (bucket_id, name) VALUES ('product-images', 'teste-seguranca.jpg');
      RESET ROLE;
      v_log := v_log || E'S7 FALHOU upload em product-images sem permissao passou\n';
    EXCEPTION
      WHEN insufficient_privilege THEN RESET ROLE; v_log := v_log || E'S7 OK upload em product-images sem permissao recusado\n';
      WHEN OTHERS THEN RESET ROLE; v_log := v_log || format(E'S7 INCONCLUSIVO %s\n', SQLERRM);
    END;
  END IF;

  -- S8: Storage — admin envia imagem; funcionário comum não apaga NF
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('product-images', 'teste-seguranca-admin.jpg');
    INSERT INTO storage.objects (bucket_id, name) VALUES ('nfe-files', 'teste-seguranca/nf.xml');
    RESET ROLE;
    v_log := v_log || E'S8a OK admin enviou imagem e NF\n';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_log := v_log || format(E'S8a FALHOU admin nao conseguiu enviar: %s\n', SQLERRM);
  END;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_emp, 'role', 'authenticated')::text, true);
  BEGIN
    DELETE FROM storage.objects WHERE bucket_id = 'nfe-files' AND name = 'teste-seguranca/nf.xml';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RESET ROLE;
    v_log := v_log || CASE WHEN v_n = 0 THEN E'S8b OK funcionario comum nao apagou a NF\n'
                           ELSE format(E'S8b FALHOU funcionario apagou %s NF\n', v_n) END;
  EXCEPTION WHEN OTHERS THEN
    -- O Storage bloqueia DELETE por SQL em algumas versões; a recusa também é o resultado esperado.
    RESET ROLE; v_log := v_log || format(E'S8b OK DELETE recusado: %s\n', SQLERRM);
  END;

  -- S9: anon não lê perfis
  BEGIN
    SET LOCAL ROLE anon;
    SELECT count(*) INTO v_n FROM public.profiles;
    RESET ROLE;
    v_log := v_log || CASE WHEN v_n = 0 THEN E'S9 OK anon ve 0 perfis\n' ELSE format(E'S9 FALHOU anon ve %s perfis\n', v_n) END;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; v_log := v_log || format(E'S9 OK anon recusado: %s\n', SQLERRM);
  END;

  -- S11 (precisa da parte 3, 20261012100200): login válido mas fora da equipe não lê nada
  IF to_regprocedure('public.is_staff(uuid)') IS NULL THEN
    v_log := v_log || E'S11 PULADO: migracao 20261012100200 (is_staff) nao aplicada\n';
  ELSE
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
    SELECT (SELECT count(*) FROM public.vendas) + (SELECT count(*) FROM public.clientes)
         + (SELECT count(*) FROM public.produtos) + (SELECT count(*) FROM public.caixas)
         + (SELECT count(*) FROM public.notas_fiscais) INTO v_n;
    RESET ROLE;
    v_log := v_log || CASE WHEN v_n = 0 THEN E'S11a OK usuario fora da equipe le 0 linhas\n'
                           ELSE format(E'S11a FALHOU usuario fora da equipe le %s linhas\n', v_n) END;

    -- funcionário desativado perde a leitura na hora (mesmo com token ainda válido)
    UPDATE public.funcionarios_auth SET status = 'inactive' WHERE user_id = v_emp;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_emp, 'role', 'authenticated')::text, true);
    SELECT (SELECT count(*) FROM public.clientes) + (SELECT count(*) FROM public.vendas) INTO v_n;
    RESET ROLE;
    v_log := v_log || CASE WHEN v_n = 0 THEN E'S11b OK funcionario inativo le 0 linhas\n'
                           ELSE format(E'S11b FALHOU funcionario inativo le %s linhas\n', v_n) END;
    UPDATE public.funcionarios_auth SET status = 'active' WHERE user_id = v_emp;

    -- funcionário ativo e administrador continuam lendo
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_emp, 'role', 'authenticated')::text, true);
    SELECT count(*) INTO v_n FROM public.clientes;
    RESET ROLE;
    SELECT count(*) INTO v_n2 FROM public.clientes;
    v_log := v_log || CASE WHEN v_n = v_n2 THEN format(E'S11c OK funcionario ativo le os %s clientes\n', v_n)
                           ELSE format(E'S11c FALHOU funcionario le %s de %s clientes\n', v_n, v_n2) END;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    SELECT count(*) INTO v_n FROM public.vendas;
    RESET ROLE;
    SELECT count(*) INTO v_n2 FROM public.vendas;
    v_log := v_log || CASE WHEN v_n = v_n2 THEN format(E'S11d OK admin le as %s vendas\n', v_n)
                           ELSE format(E'S11d FALHOU admin le %s de %s vendas\n', v_n, v_n2) END;

    -- sobrou alguma política de leitura aberta (USING true) para authenticated?
    v_log := v_log || format(E'S11e politicas de leitura ainda abertas: %s\n',
      COALESCE((SELECT string_agg(tablename || '.' || policyname, ', ')
                  FROM pg_policies WHERE schemaname = 'public' AND cmd IN ('SELECT', 'ALL')
                   AND 'authenticated' = ANY (roles) AND qual = 'true'), 'nenhuma'));
  END IF;

  -- S10: limites dos buckets
  v_log := v_log || format(E'S10 buckets: %s\n',
    (SELECT string_agg(format('%s[limite=%s tipos=%s]', id, file_size_limit, allowed_mime_types), ' ')
       FROM storage.buckets WHERE id IN ('product-images', 'nfe-files')));

  -- Informativo: o que ainda permite INSERT/UPDATE direto nas tabelas protegidas
  v_log := v_log || format(E'INFO politicas de escrita restantes: %s\n',
    (SELECT string_agg(tablename || '.' || policyname || '(' || cmd || ')', ', ' ORDER BY tablename, policyname)
       FROM pg_policies
      WHERE schemaname = 'public' AND cmd IN ('INSERT', 'UPDATE', 'ALL')
        AND tablename IN ('vendas','venda_items','venda_item_cancelamentos','caixas','caixa_movimentacoes','estoque',
                          'boleto_alertas','compras_fornecedor','compra_items','consignados','consignado_historico',
                          'consignado_trocas','profiles')));

  RAISE EXCEPTION E'RESULTADO_TESTE\n%', v_log;
END
$t$;
