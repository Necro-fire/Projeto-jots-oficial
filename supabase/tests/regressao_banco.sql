-- Teste de regressão do banco (venda, estoque, cancelamento, permissões). Não deixa rastro.
-- Uso (contra o banco vinculado):
--   npx supabase db query --linked -f supabase/tests/regressao_banco.sql
-- O bloco termina SEMPRE com um erro 'RESULTADO_TESTE ...' que reverte tudo; o relatório está
-- na mensagem. Cada linha 'Tn OK' passou; qualquer 'FALHOU' indica regressão.
-- Pré-requisito: migrações 20261010120000..200 aplicadas; existir produto da filial 2 com saldo >= 3.

DO $t$
DECLARE
  v_log text := '';
  v_admin uuid; v_emp1 uuid; v_prod uuid; v_prod_model text; v_price numeric; v_caixa uuid;
  v_est0 integer; v_est1 integer; v_stock integer; v_venda jsonb; v_vid uuid; v_n integer;
  v_est_f1_before integer;
BEGIN
  SELECT ur.user_id INTO v_admin FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE r.name='admin' LIMIT 1;
  SELECT f.user_id INTO v_emp1 FROM funcionarios_auth f WHERE f.filial_id='1' AND f.user_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=f.user_id AND r.name='admin') LIMIT 1;
  SELECT p.id, p.model, p.retail_price INTO v_prod, v_prod_model, v_price
    FROM produtos p JOIN estoque e ON e.produto_id=p.id AND e.filial_id=p.filial_id
    WHERE p.filial_id='2' AND e.quantidade>=3 AND p.retail_price>0 LIMIT 1;
  SELECT id INTO v_caixa FROM caixas WHERE filial_id='2' AND status='aberto' LIMIT 1;
  IF v_caixa IS NULL THEN
    INSERT INTO caixas (filial_id,status,usuario_abertura_id,usuario_abertura_nome,valor_abertura) VALUES ('2','aberto',v_admin,'teste',0) RETURNING id INTO v_caixa;
    v_log := v_log || E'caixa de teste criado\n';
  END IF;
  v_log := v_log || format(E'admin=%s emp_f1=%s prod=%s preco=%s\n', v_admin, v_emp1, v_prod, v_price);

  SELECT quantidade INTO v_est0 FROM estoque WHERE produto_id=v_prod AND filial_id='2';
  v_log := v_log || format(E'T0 estoque F2 antes=%s\n', v_est0);

  -- T1: venda normal como admin
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  v_venda := public.criar_venda(jsonb_build_object('client_name','Cliente Teste','payment_method','pix','origin','stock','filial_id','2',
     'total', v_price*2, 'items', jsonb_build_array(jsonb_build_object('produto_id', v_prod,'quantity',2,'unit_price',v_price))));
  RESET ROLE;
  v_vid := (v_venda->>'id')::uuid;
  SELECT quantidade INTO v_est1 FROM estoque WHERE produto_id=v_prod AND filial_id='2';
  SELECT stock INTO v_stock FROM produtos WHERE id=v_prod;
  v_log := v_log || format(E'T1 venda criada code=%s total=%s | estoque F2 %s -> %s | produtos.stock=%s (esperado %s)\n', v_venda->>'sale_code', v_venda->>'total', v_est0, v_est1, v_stock, v_est0-2);
  SELECT count(*) INTO v_n FROM estoque_movimentacoes WHERE referencia_id=v_vid AND origem='venda';
  v_log := v_log || format(E'T1 ledger linhas origem=venda: %s | caixa movs: %s | itens: %s\n', v_n,
     (SELECT count(*) FROM caixa_movimentacoes WHERE venda_id=v_vid), (SELECT count(*) FROM venda_items WHERE venda_id=v_vid));

  -- T2: preco forjado deve falhar
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
    PERFORM public.criar_venda(jsonb_build_object('client_name','x','payment_method','pix','origin','stock','filial_id','2',
       'total', 1, 'items', jsonb_build_array(jsonb_build_object('produto_id', v_prod,'quantity',1,'unit_price',1))));
    RESET ROLE; v_log := v_log || E'T2 FALHOU: preco forjado aceito\n';
  EXCEPTION WHEN OTHERS THEN RESET ROLE; v_log := v_log || format(E'T2 OK preco forjado recusado: %s\n', SQLERRM);
  END;

  -- T3: estoque insuficiente nao deixa venda orfa
  SELECT count(*) INTO v_n FROM vendas;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
    PERFORM public.criar_venda(jsonb_build_object('client_name','x','payment_method','pix','origin','stock','filial_id','2',
       'total', v_price*99999, 'items', jsonb_build_array(jsonb_build_object('produto_id', v_prod,'quantity',99999,'unit_price',v_price))));
    RESET ROLE; v_log := v_log || E'T3 FALHOU: vendeu alem do estoque\n';
  EXCEPTION WHEN OTHERS THEN RESET ROLE; v_log := v_log || format(E'T3 OK recusado: %s | vendas antes=%s depois=%s\n', SQLERRM, v_n, (SELECT count(*) FROM vendas));
  END;

  -- T4: funcionario da F1 nao opera F2
  IF v_emp1 IS NOT NULL THEN
    BEGIN
      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_emp1, 'role','authenticated')::text, true);
      PERFORM public.cancelar_venda(v_vid, 'tentativa indevida');
      RESET ROLE; v_log := v_log || E'T4 FALHOU: funcionario F1 cancelou venda da F2\n';
    EXCEPTION WHEN OTHERS THEN RESET ROLE; v_log := v_log || format(E'T4 OK funcionario F1 x venda F2 recusado: %s\n', SQLERRM);
    END;
  ELSE v_log := v_log || E'T4 pulado (sem funcionario na F1)\n'; END IF;

  -- T5: anon nao executa
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.cancelar_venda(v_vid, 'anon');
    RESET ROLE; v_log := v_log || E'T5 FALHOU: anon executou cancelar_venda\n';
  EXCEPTION WHEN OTHERS THEN RESET ROLE; v_log := v_log || format(E'T5 OK anon recusado: %s\n', SQLERRM);
  END;

  -- T6: cancelamento por admin devolve saldo so a F2 e estorna caixa
  SELECT quantidade INTO v_est_f1_before FROM estoque WHERE produto_id=v_prod AND filial_id='1';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  PERFORM public.cancelar_venda(v_vid, 'teste automatizado');
  RESET ROLE;
  SELECT quantidade INTO v_est1 FROM estoque WHERE produto_id=v_prod AND filial_id='2';
  SELECT stock INTO v_stock FROM produtos WHERE id=v_prod;
  v_log := v_log || format(E'T6 cancelada: estoque F2=%s (esperado %s) stock=%s | F1 antes=%s depois=%s | saldo caixa da venda=%s | status=%s | cancelled_by=%s\n',
     v_est1, v_est0, v_stock, v_est_f1_before, (SELECT quantidade FROM estoque WHERE produto_id=v_prod AND filial_id='1'),
     (SELECT COALESCE(SUM(valor),0) FROM caixa_movimentacoes WHERE venda_id=v_vid), (SELECT status FROM vendas WHERE id=v_vid),
     (SELECT cancelled_by_name FROM vendas WHERE id=v_vid));

  -- T7: pagamento dividido com pix + boleto
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  v_venda := public.criar_venda(jsonb_build_object('client_name','Split','payment_method','Pix/Boleto 3x/30d','origin','stock','filial_id','2',
     'items', jsonb_build_array(jsonb_build_object('produto_id', v_prod,'quantity',1,'unit_price',v_price)),
     'splits', jsonb_build_array(jsonb_build_object('method','pix','amount', round(v_price/2,2),'final_amount', round(v_price/2,2)),
                                 jsonb_build_object('method','Boleto 3x/30d','amount', v_price-round(v_price/2,2),'final_amount', round((v_price-round(v_price/2,2))*1.04,2)))));
  RESET ROLE;
  v_vid := (v_venda->>'id')::uuid;
  v_log := v_log || format(E'T7 split: total=%s | movs caixa=%s | boleto_alertas=%s | soma boletos=%s\n', v_venda->>'total',
     (SELECT count(*) FROM caixa_movimentacoes WHERE venda_id=v_vid), (SELECT count(*) FROM boleto_alertas WHERE venda_id=v_vid),
     (SELECT sum(valor_parcela) FROM boleto_alertas WHERE venda_id=v_vid));

  -- T8: funcoes abertas a anon depois da migracao
  v_log := v_log || format(E'T8 funcoes public ainda executaveis por anon: %s\n',
     (SELECT string_agg(p.proname, ',') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.prokind='f' AND has_function_privilege('anon', p.oid, 'EXECUTE')));

  RAISE EXCEPTION E'RESULTADO_TESTE\n%', v_log;
END
$t$;
