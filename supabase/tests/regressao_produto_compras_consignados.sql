-- Teste de regressão: produto + saldo, ajuste de estoque, compras de fornecedor e consignados.
-- Uso:  npx supabase db query --linked -f supabase/tests/regressao_produto_compras_consignados.sql
-- Termina SEMPRE com o erro 'RESULTADO_TESTE ...' (reverte tudo; não deixa rastro).
-- Pré-requisito: migração 20261011100000 aplicada; filial 2 com caixa aberto.

DO $t$
DECLARE
  v_log text := '';
  v_admin uuid; v_emp1 uuid; v_forn uuid; v_caixa uuid;
  v_r jsonb; v_pid uuid; v_pid2 uuid; v_n integer; v_x numeric; v_s numeric; v_compra uuid;
  v_csg uuid; v_csg2 uuid; v_msg text; v_venda jsonb;

BEGIN
  SELECT ur.user_id INTO v_admin FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE r.name='admin' LIMIT 1;
  SELECT f.user_id INTO v_emp1 FROM funcionarios_auth f WHERE f.filial_id='1' AND f.user_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=f.user_id AND r.name='admin') LIMIT 1;
  SELECT id INTO v_forn FROM fornecedores WHERE COALESCE(status,'active')='active' LIMIT 1;
  IF v_forn IS NULL THEN
    -- banco sem fornecedores: cria um de teste (dentro da transação, que é revertida)
    INSERT INTO fornecedores (nome, status, filial_id) VALUES ('Fornecedor Teste', 'active', '2') RETURNING id INTO v_forn;
  END IF;
  SELECT id INTO v_caixa FROM caixas WHERE filial_id='2' AND status='aberto';
  IF v_caixa IS NULL THEN
    RAISE EXCEPTION 'RESULTADO_TESTE pre-requisito nao atendido (caixa aberto na F2)';
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);

  -- ── P1: criar produto com saldo (1 transação: produto + estoque + histórico) ──
  v_r := public.salvar_produto(
    jsonb_build_object('referencia','ZZTEST-1','model','Produto Teste','classificacao','Solar','category','Solar',
      'retail_price',50,'hash_produto','zz-test-hash-1','is_acessorio',false,'ncm','90031100','custo',20),
    NULL, ARRAY['2'], 5);
  v_pid := (v_r->0->>'id')::uuid;
  RESET ROLE;
  v_log := v_log || CASE WHEN (SELECT quantidade FROM estoque WHERE produto_id=v_pid AND filial_id='2')=5
      AND (SELECT stock FROM produtos WHERE id=v_pid)=5
      AND (SELECT count(*) FROM estoque_movimentacoes WHERE produto_id=v_pid AND origem='cadastro_produto' AND delta=5)=1
      AND (v_r->0->>'code') IS NOT NULL THEN 'OK ' ELSE 'FALHOU ' END
    || format(E'P1 criar produto: saldo=%s stock=%s codigo=%s\n', (SELECT quantidade FROM estoque WHERE produto_id=v_pid AND filial_id='2'),
       (SELECT stock FROM produtos WHERE id=v_pid), v_r->0->>'code');

  -- ── P2: editar produto e saldo ──────────────────────────────────────────────
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  PERFORM public.salvar_produto(jsonb_build_object('retail_price',55,'model','Produto Teste Editado','referencia','ZZTEST-1',
      'classificacao','Solar','category','Solar','hash_produto','zz-test-hash-1','is_acessorio',false,'ncm','90031100'),
    v_pid, NULL, 8);
  RESET ROLE;
  v_log := v_log || CASE WHEN (SELECT retail_price FROM produtos WHERE id=v_pid)=55
      AND (SELECT quantidade FROM estoque WHERE produto_id=v_pid AND filial_id='2')=8
      AND (SELECT count(*) FROM estoque_movimentacoes WHERE produto_id=v_pid AND origem='edicao_produto' AND delta=3)=1 THEN 'OK ' ELSE 'FALHOU ' END
    || format(E'P2 editar: preco=%s saldo=%s\n', (SELECT retail_price FROM produtos WHERE id=v_pid),
       (SELECT quantidade FROM estoque WHERE produto_id=v_pid AND filial_id='2'));

  -- ── P3: falha no meio desfaz tudo (2ª filial repete o mesmo hash) ─────────────
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
    PERFORM public.salvar_produto(
      jsonb_build_object('referencia','ZZTEST-2','model','Produto Teste 2','classificacao','Solar','category','Solar',
        'retail_price',10,'hash_produto','zz-test-hash-2','is_acessorio',false,'ncm','90031100'),
      NULL, ARRAY['2','2'], 1);
    RESET ROLE; v_log := v_log || E'FALHOU P3 aceitou duplicidade\n';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    SELECT count(*) INTO v_n FROM produtos WHERE hash_produto='zz-test-hash-2';
    v_log := v_log || CASE WHEN v_n=0 THEN 'OK ' ELSE 'FALHOU ' END || format(E'P3 duplicidade recusada e nada ficou gravado (produtos=%s): %s\n', v_n, left(SQLERRM,70));
  END;

  -- ── P4: ajustar / definir estoque; nunca negativo ────────────────────────────
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  PERFORM public.ajustar_estoque(v_pid, '2', -2, 'quebra');
  v_x := (SELECT quantidade FROM estoque WHERE produto_id=v_pid AND filial_id='2');
  BEGIN
    PERFORM public.ajustar_estoque(v_pid, '2', -100, 'absurdo');
    v_log := v_log || E'FALHOU P4 aceitou saldo negativo\n';
  EXCEPTION WHEN OTHERS THEN v_log := v_log || format(E'OK P4 saldo negativo recusado: %s\n', SQLERRM);
  END;
  PERFORM public.definir_estoque(v_pid, '2', 10, 'contagem');
  RESET ROLE;
  v_log := v_log || CASE WHEN v_x=6 AND (SELECT quantidade FROM estoque WHERE produto_id=v_pid AND filial_id='2')=10 THEN 'OK ' ELSE 'FALHOU ' END
    || format(E'P4 ajuste: -2 => %s ; contagem => %s\n', v_x, (SELECT quantidade FROM estoque WHERE produto_id=v_pid AND filial_id='2'));

  -- ── P5..P7: compra (estoque + caixa), edição e cancelamento ──────────────────
  SELECT public.caixa_saldo(v_caixa) INTO v_s;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  v_r := public.registrar_compra(jsonb_build_object('fornecedor_id', v_forn, 'filial_id','2','descricao','Compra teste',
      'valor_total', 30, 'forma_pagamento','dinheiro',
      'items', jsonb_build_array(jsonb_build_object('produto_id', v_pid, 'quantidade', 3, 'valor_unitario', 10))));
  v_compra := (v_r->>'id')::uuid;
  RESET ROLE;
  v_log := v_log || CASE WHEN (SELECT quantidade FROM estoque WHERE produto_id=v_pid AND filial_id='2')=13
      AND public.caixa_saldo(v_caixa)=v_s-30
      AND (SELECT count(*) FROM caixa_movimentacoes WHERE compra_id=v_compra AND tipo='despesa' AND valor=30)=1
      AND (SELECT count(*) FROM compra_items WHERE compra_id=v_compra)=1 THEN 'OK ' ELSE 'FALHOU ' END
    || format(E'P5 compra: saldo estoque=%s (esperado 13), caixa %s -> %s\n', (SELECT quantidade FROM estoque WHERE produto_id=v_pid AND filial_id='2'),
       v_s, public.caixa_saldo(v_caixa));

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  PERFORM public.editar_compra(v_compra, 'Compra teste editada', 40, 'obs');
  RESET ROLE;
  v_log := v_log || CASE WHEN public.caixa_saldo(v_caixa)=v_s-40 THEN 'OK ' ELSE 'FALHOU ' END
    || format(E'P6 editar compra 30 -> 40: caixa=%s (esperado %s)\n', public.caixa_saldo(v_caixa), v_s-40);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  PERFORM public.cancelar_compra(v_compra, 'teste');
  RESET ROLE;
  v_log := v_log || CASE WHEN (SELECT quantidade FROM estoque WHERE produto_id=v_pid AND filial_id='2')=10
      AND public.caixa_saldo(v_caixa)=v_s
      AND (SELECT status FROM compras_fornecedor WHERE id=v_compra)='cancelada'
      AND (SELECT count(*) FROM compra_items WHERE compra_id=v_compra)=1 THEN 'OK ' ELSE 'FALHOU ' END
    || format(E'P7 cancelar compra: estoque=%s (esperado 10), caixa=%s (esperado %s), historico mantido\n',
       (SELECT quantidade FROM estoque WHERE produto_id=v_pid AND filial_id='2'), public.caixa_saldo(v_caixa), v_s);

  -- cancelar de novo é recusado; cancelar compra cujo estoque já foi vendido é recusado
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
    PERFORM public.cancelar_compra(v_compra, 'de novo');
    RESET ROLE; v_log := v_log || E'FALHOU P7 cancelou duas vezes\n';
  EXCEPTION WHEN OTHERS THEN RESET ROLE; v_log := v_log || format(E'OK P7 segundo cancelamento recusado: %s\n', SQLERRM);
  END;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  v_r := public.registrar_compra(jsonb_build_object('fornecedor_id', v_forn, 'filial_id','2','descricao','Compra 2',
      'valor_total', 20, 'items', jsonb_build_array(jsonb_build_object('produto_id', v_pid, 'quantidade', 2, 'valor_unitario', 10))));
  v_compra := (v_r->>'id')::uuid;
  PERFORM public.definir_estoque(v_pid, '2', 1, 'simula venda');  -- estoque atual 1 < 2 da compra
  BEGIN
    PERFORM public.cancelar_compra(v_compra, 'sem estoque');
    RESET ROLE; v_log := v_log || E'FALHOU P8 cancelou compra sem ter o estoque\n';
  EXCEPTION WHEN OTHERS THEN RESET ROLE; v_log := v_log || format(E'OK P8 cancelar compra sem estoque recusado: %s\n', SQLERRM);
  END;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  PERFORM public.definir_estoque(v_pid, '2', 10, 'volta');

  -- ── P9: consignado: criar, devolver parcial, vender manual ───────────────────
  v_r := public.criar_consignado(v_pid, NULL, '2', 4, 50, 'teste');
  v_csg := (v_r->>'id')::uuid;
  RESET ROLE;
  v_log := v_log || CASE WHEN (SELECT quantidade FROM estoque WHERE produto_id=v_pid AND filial_id='2')=6 THEN 'OK ' ELSE 'FALHOU ' END
    || format(E'P9 criar consignado qtd 4: estoque=%s (esperado 6)\n', (SELECT quantidade FROM estoque WHERE produto_id=v_pid AND filial_id='2'));
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  PERFORM public.devolver_consignado(v_csg, 1);
  RESET ROLE;
  v_log := v_log || CASE WHEN (SELECT quantidade FROM estoque WHERE produto_id=v_pid AND filial_id='2')=7
      AND (SELECT quantidade FROM consignados WHERE id=v_csg)=3
      AND (SELECT count(*) FROM consignados WHERE observacoes LIKE 'Devolução parcial de '||v_csg::text AND status='devolvido')=1 THEN 'OK ' ELSE 'FALHOU ' END
    || format(E'P9 devolucao parcial: estoque=%s (7) consignado=%s (3)\n', (SELECT quantidade FROM estoque WHERE produto_id=v_pid AND filial_id='2'),
       (SELECT quantidade FROM consignados WHERE id=v_csg));
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  BEGIN
    PERFORM public.criar_consignado(v_pid, NULL, '2', 999, 50, '');
    v_log := v_log || E'FALHOU P9 consignado sem saldo aceito\n';
  EXCEPTION WHEN OTHERS THEN v_log := v_log || format(E'OK P9 consignado acima do saldo recusado: %s\n', SQLERRM);
  END;
  PERFORM public.vender_consignado_manual(v_csg);
  RESET ROLE;
  v_log := v_log || CASE WHEN (SELECT status FROM consignados WHERE id=v_csg)='vendido'
      AND (SELECT quantidade FROM estoque WHERE produto_id=v_pid AND filial_id='2')=7 THEN 'OK ' ELSE 'FALHOU ' END
    || format(E'P9 vendido manual: status=%s estoque=%s (sem mexer)\n', (SELECT status FROM consignados WHERE id=v_csg),
       (SELECT quantidade FROM estoque WHERE produto_id=v_pid AND filial_id='2'));

  -- ── P10: converter consignado em venda NÃO baixa o estoque duas vezes ────────
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  v_r := public.criar_consignado(v_pid, NULL, '2', 2, 55, '');   -- estoque 7 -> 5
  v_csg2 := (v_r->>'id')::uuid;
  v_venda := public.criar_venda(jsonb_build_object('client_name','Conv','payment_method','pix','origin','stock','filial_id','2',
      'total', 110, 'consignado_ids', jsonb_build_array(v_csg2),
      'items', jsonb_build_array(jsonb_build_object('produto_id', v_pid, 'quantity', 2, 'unit_price', 55))));
  RESET ROLE;
  v_log := v_log || CASE WHEN (SELECT quantidade FROM estoque WHERE produto_id=v_pid AND filial_id='2')=5
      AND (SELECT status FROM consignados WHERE id=v_csg2)='vendido'
      AND (SELECT venda_id FROM consignados WHERE id=v_csg2)=(v_venda->>'id')::uuid THEN 'OK ' ELSE 'FALHOU ' END
    || format(E'P10 consignado -> venda: estoque=%s (esperado 5, nao 3), consignado=%s\n',
       (SELECT quantidade FROM estoque WHERE produto_id=v_pid AND filial_id='2'), (SELECT status FROM consignados WHERE id=v_csg2));

  -- ── P11: permissões ───────────────────────────────────────────────────────────
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.ajustar_estoque(v_pid, '2', 1, 'anon');
    RESET ROLE; v_log := v_log || E'FALHOU P11 anon ajustou estoque\n';
  EXCEPTION WHEN OTHERS THEN RESET ROLE; v_log := v_log || format(E'OK P11 anon recusado: %s\n', SQLERRM);
  END;
  IF v_emp1 IS NOT NULL THEN
    BEGIN
      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_emp1, 'role','authenticated')::text, true);
      PERFORM public.ajustar_estoque(v_pid, '2', 1, 'filial errada');
      RESET ROLE; v_log := v_log || E'FALHOU P11 funcionario F1 ajustou estoque da F2\n';
    EXCEPTION WHEN OTHERS THEN RESET ROLE; v_log := v_log || format(E'OK P11 funcionario F1 x estoque F2 recusado: %s\n', SQLERRM);
    END;
  END IF;

  -- ── P12: integridade geral após tudo ──────────────────────────────────────────
  SELECT count(*) INTO v_n FROM public.diagnostico_vendas_caixa() d
   WHERE d.problema IN ('estoque_diferente_do_historico','movimentacao_em_caixa_de_outra_filial','venda_sem_lancamento_no_caixa');
  v_log := v_log || CASE WHEN v_n=0 THEN 'OK ' ELSE 'FALHOU ' END || format(E'P12 diagnostico (estoque x historico etc.): %s problemas\n', v_n);

  RAISE EXCEPTION E'RESULTADO_TESTE\n%', v_log;
END
$t$;
