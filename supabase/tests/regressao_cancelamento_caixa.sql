-- Teste de regressão: cancelamento, estorno, desfazer, caixa e sincronização vendas x caixa.
-- Uso (banco vinculado):  npx supabase db query --linked -f supabase/tests/regressao_cancelamento_caixa.sql
-- Termina SEMPRE com o erro 'RESULTADO_TESTE ...' (reverte tudo; não deixa rastro).
-- Linhas "OK" passaram; "FALHOU" indica regressão.
-- Pré-requisito: migração 20261010130000 aplicada; filial 2 com caixa aberto e >= 3 produtos com saldo >= 2.

DO $t$
DECLARE
  v_log text := '';
  v_admin uuid;
  v_p uuid[]; v_price numeric[]; v_caixa uuid;
  v_venda jsonb; v_vid uuid; v_items uuid[];
  v_stock0 integer[]; v_n integer; v_x numeric; v_msg text; v_total0 numeric;
  v_mov uuid; v_est integer; v_saldo0 numeric;
  v_res jsonb; v_cid2 uuid;
  i integer;

BEGIN
  SELECT ur.user_id INTO v_admin FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE r.name='admin' LIMIT 1;
  SELECT array_agg(id), array_agg(retail_price) INTO v_p, v_price FROM (
    SELECT p.id, p.retail_price FROM produtos p JOIN estoque e ON e.produto_id=p.id AND e.filial_id='2'
    WHERE p.filial_id='2' AND e.quantidade>=2 AND p.retail_price>0 ORDER BY p.id LIMIT 3) s;
  SELECT id INTO v_caixa FROM caixas WHERE filial_id='2' AND status='aberto';
  IF v_caixa IS NULL OR array_length(v_p,1) < 3 THEN
    RAISE EXCEPTION 'RESULTADO_TESTE pre-requisito nao atendido (caixa aberto na F2 e 3 produtos com saldo)';
  END IF;
  SELECT array_agg(quantidade ORDER BY ord) INTO v_stock0
    FROM (SELECT e.quantidade, array_position(v_p, e.produto_id) ord FROM estoque e WHERE e.filial_id='2' AND e.produto_id = ANY(v_p)) q;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);

  -- ── U1: venda com 3 itens, cancelar TUDO de uma vez ─────────────────────────
  v_venda := public.criar_venda(jsonb_build_object('client_name','Teste','payment_method','pix','origin','stock','filial_id','2',
    'total', v_price[1]+v_price[2]+v_price[3],
    'items', jsonb_build_array(
      jsonb_build_object('produto_id',v_p[1],'quantity',1,'unit_price',v_price[1]),
      jsonb_build_object('produto_id',v_p[2],'quantity',1,'unit_price',v_price[2]),
      jsonb_build_object('produto_id',v_p[3],'quantity',1,'unit_price',v_price[3]))));
  v_vid := (v_venda->>'id')::uuid;
  PERFORM public.cancelar_venda(v_vid, 'u1 cancelar tudo');
  RESET ROLE;
  SELECT count(*) INTO v_n FROM venda_items WHERE venda_id=v_vid AND status='cancelado';
  v_log := v_log || CASE WHEN v_n=3 THEN 'OK ' ELSE 'FALHOU ' END || format(E'U1 cancelar tudo: itens cancelados=%s/3\n', v_n);
  SELECT COALESCE(sum(valor),0) INTO v_x FROM caixa_movimentacoes WHERE venda_id=v_vid;
  v_log := v_log || CASE WHEN v_x=0 THEN 'OK ' ELSE 'FALHOU ' END || format(E'U1 saldo de caixa da venda=%s (esperado 0)\n', v_x);
  SELECT count(*) INTO v_n FROM estoque e WHERE e.filial_id='2' AND e.produto_id=ANY(v_p)
     AND e.quantidade = v_stock0[array_position(v_p,e.produto_id)];
  v_log := v_log || CASE WHEN v_n=3 THEN 'OK ' ELSE 'FALHOU ' END || format(E'U1 estoque restaurado em %s/3 produtos\n', v_n);
  SELECT count(*) INTO v_n FROM venda_items WHERE venda_id=v_vid AND status<>'cancelado';
  v_log := v_log || CASE WHEN v_n=0 THEN 'OK ' ELSE 'FALHOU ' END || format(E'U1 venda cancelada sem itens ativos (%s)\n', v_n);

  -- ── U2: desfazer o cancelamento ─────────────────────────────────────────────
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  PERFORM public.reverter_cancelamento_venda(v_vid, 'u2 desfazer');
  RESET ROLE;
  SELECT count(*) INTO v_n FROM venda_items WHERE venda_id=v_vid AND status='active';
  SELECT COALESCE(sum(valor),0) INTO v_x FROM caixa_movimentacoes WHERE venda_id=v_vid;
  v_log := v_log || CASE WHEN v_n=3 AND v_x=(v_price[1]+v_price[2]+v_price[3]) AND (SELECT status FROM vendas WHERE id=v_vid)='concluida' THEN 'OK ' ELSE 'FALHOU ' END
     || format(E'U2 desfazer: itens ativos=%s, caixa=%s (esperado %s), status=%s\n', v_n, v_x, v_price[1]+v_price[2]+v_price[3], (SELECT status FROM vendas WHERE id=v_vid));
  SELECT count(*) INTO v_n FROM estoque e WHERE e.filial_id='2' AND e.produto_id=ANY(v_p)
     AND e.quantidade = v_stock0[array_position(v_p,e.produto_id)] - 1;
  v_log := v_log || CASE WHEN v_n=3 THEN 'OK ' ELSE 'FALHOU ' END || format(E'U2 estoque baixado de novo em %s/3 produtos\n', v_n);

  -- ── U3: cancelar item a item; o último cancela a venda; caixa sempre = total ─
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  SELECT array_agg(id ORDER BY id) INTO v_items FROM venda_items WHERE venda_id=v_vid;
  PERFORM public.cancelar_item_venda(v_items[1], 'u3 item 1');
  RESET ROLE;
  SELECT total INTO v_x FROM vendas WHERE id=v_vid;
  SELECT COALESCE(sum(valor),0) INTO v_total0 FROM caixa_movimentacoes WHERE venda_id=v_vid;
  v_log := v_log || CASE WHEN v_x=v_total0 AND (SELECT count(*) FROM venda_items WHERE venda_id=v_vid AND status='active')=2 THEN 'OK ' ELSE 'FALHOU ' END
     || format(E'U3 apos 1 item: vendas.total=%s caixa=%s itens ativos=%s\n', v_x, v_total0, (SELECT count(*) FROM venda_items WHERE venda_id=v_vid AND status='active'));
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  PERFORM public.cancelar_item_venda(v_items[2], 'u3 item 2');
  PERFORM public.cancelar_item_venda(v_items[3], 'u3 item 3 (ultimo)');
  RESET ROLE;
  SELECT COALESCE(sum(valor),0) INTO v_x FROM caixa_movimentacoes WHERE venda_id=v_vid;
  v_log := v_log || CASE WHEN (SELECT status FROM vendas WHERE id=v_vid)='cancelada' AND v_x=0 THEN 'OK ' ELSE 'FALHOU ' END
     || format(E'U3 ultimo item: status=%s saldo caixa=%s\n', (SELECT status FROM vendas WHERE id=v_vid), v_x);
  SELECT count(*) INTO v_n FROM estoque e WHERE e.filial_id='2' AND e.produto_id=ANY(v_p)
     AND e.quantidade = v_stock0[array_position(v_p,e.produto_id)];
  v_log := v_log || CASE WHEN v_n=3 THEN 'OK ' ELSE 'FALHOU ' END || format(E'U3 estoque restaurado em %s/3\n', v_n);

  -- ── U4: desconto de atacado fica refletido: itens, vendas.discount e venda_totais ──
  INSERT INTO descontos_atacado (filial_id, tipo_desconto, categoria, quantidade_minima, tipo_valor, valor_desconto, status)
  VALUES ('2','todos','',2,'percentual',10,'active');
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  v_venda := public.criar_venda(jsonb_build_object('client_name','Atacado','payment_method','pix','origin','stock','filial_id','2',
    'total', round(v_price[1]*0.9,2)+round(v_price[2]*0.9,2),
    'items', jsonb_build_array(
      jsonb_build_object('produto_id',v_p[1],'quantity',1,'unit_price',round(v_price[1]*0.9,2)),
      jsonb_build_object('produto_id',v_p[2],'quantity',1,'unit_price',round(v_price[2]*0.9,2)))));
  RESET ROLE;
  v_vid := (v_venda->>'id')::uuid;
  SELECT * INTO v_res FROM (SELECT to_jsonb(t) FROM public.venda_totais(v_vid) t) s(j);
  v_log := v_log || CASE WHEN abs((v_res->>'valor_original')::numeric - (v_price[1]+v_price[2])) <= 0.01
       AND abs((v_res->>'valor_original')::numeric - (v_res->>'desconto')::numeric - (v_res->>'total')::numeric) <= 0.01
       AND abs((SELECT discount FROM vendas WHERE id=v_vid) - (v_res->>'desconto')::numeric) <= 0.01 THEN 'OK ' ELSE 'FALHOU ' END
     || format(E'U4 desconto: original=%s desconto=%s total=%s (vendas.discount=%s, caixa=%s)\n',
        v_res->>'valor_original', v_res->>'desconto', v_res->>'total', (SELECT discount FROM vendas WHERE id=v_vid),
        (SELECT sum(valor) FROM caixa_movimentacoes WHERE venda_id=v_vid));
  -- desconto some proporcionalmente ao cancelar um item
  SELECT id INTO v_mov FROM venda_items WHERE venda_id=v_vid ORDER BY id LIMIT 1;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  PERFORM public.cancelar_item_venda(v_mov, 'u4 item');
  RESET ROLE;
  SELECT * INTO v_res FROM (SELECT to_jsonb(t) FROM public.venda_totais(v_vid) t) s(j);
  v_log := v_log || CASE WHEN abs((v_res->>'valor_original')::numeric - (v_res->>'desconto')::numeric - (v_res->>'total')::numeric) <= 0.01
       AND abs((v_res->>'total')::numeric - (SELECT sum(valor) FROM caixa_movimentacoes WHERE venda_id=v_vid)) <= 0.01 THEN 'OK ' ELSE 'FALHOU ' END
     || format(E'U4 apos cancelar 1 item: original=%s desconto=%s total=%s caixa=%s\n',
        v_res->>'valor_original', v_res->>'desconto', v_res->>'total', (SELECT sum(valor) FROM caixa_movimentacoes WHERE venda_id=v_vid));

  -- ── U5: caixa fechado bloqueia estorno e movimentação; unicidade de caixa aberto ──
  BEGIN
    INSERT INTO caixas (filial_id,status,usuario_abertura_id,usuario_abertura_nome,valor_abertura) VALUES ('2','aberto',v_admin,'dup',0);
    v_log := v_log || E'FALHOU U5 segundo caixa aberto na mesma filial foi aceito\n';
  EXCEPTION WHEN unique_violation THEN v_log := v_log || E'OK U5 segundo caixa aberto na mesma filial recusado\n';
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
    PERFORM public.abrir_caixa('2', 0);
    RESET ROLE; v_log := v_log || E'FALHOU U5 abrir_caixa duplicado aceito\n';
  EXCEPTION WHEN OTHERS THEN RESET ROLE; v_log := v_log || format(E'OK U5 abrir_caixa duplicado recusado: %s\n', SQLERRM);
  END;

  -- movimentação de sangria + estorno da sangria
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  v_saldo0 := public.caixa_saldo(v_caixa);
  v_mov := public.registrar_movimentacao_caixa(v_caixa, 'sangria', 10, 'dinheiro', 'u5 sangria teste');
  v_x := public.caixa_saldo(v_caixa);
  PERFORM public.estornar_movimentacao_caixa(v_mov, 'u5 lancada por engano');
  RESET ROLE;
  v_log := v_log || CASE WHEN v_x = v_saldo0 - 10 AND public.caixa_saldo(v_caixa) = v_saldo0 THEN 'OK ' ELSE 'FALHOU ' END
     || format(E'U5 sangria: saldo %s -> %s -> estornada %s\n', v_saldo0, v_x, public.caixa_saldo(v_caixa));
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
    PERFORM public.estornar_movimentacao_caixa(v_mov, 'duplo');
    RESET ROLE; v_log := v_log || E'FALHOU U5 estorno duplo aceito\n';
  EXCEPTION WHEN OTHERS THEN RESET ROLE; v_log := v_log || format(E'OK U5 estorno duplo recusado: %s\n', SQLERRM);
  END;

  -- movimentação vinculada a venda não pode ser apagada
  BEGIN
    DELETE FROM caixa_movimentacoes WHERE venda_id=v_vid;
    v_log := v_log || E'FALHOU U5 apagou movimentacao de venda\n';
  EXCEPTION WHEN OTHERS THEN v_log := v_log || format(E'OK U5 apagar movimentacao de venda recusado: %s\n', SQLERRM);
  END;

  -- cancelar com caixa fechado exige abrir o caixa
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  v_res := public.fechar_caixa(v_caixa, 12345.67, 'u6 fechamento teste');
  RESET ROLE;
  v_log := v_log || CASE WHEN (v_res->>'esperado')::numeric = ROUND(v_saldo0, 2) THEN 'OK ' ELSE 'FALHOU ' END
     || format(E'U6 fechar_caixa: esperado calculado no banco=%s (saldo anterior %s) diferenca=%s\n', v_res->>'esperado', v_saldo0, v_res->>'diferenca');
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
    PERFORM public.cancelar_venda(v_vid, 'u6 caixa fechado');
    RESET ROLE; v_log := v_log || E'FALHOU U6 cancelou venda com caixa fechado\n';
  EXCEPTION WHEN OTHERS THEN RESET ROLE; v_log := v_log || format(E'OK U6 cancelar com caixa fechado recusado: %s\n', SQLERRM);
  END;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
    PERFORM public.criar_venda(jsonb_build_object('client_name','x','payment_method','pix','origin','stock','filial_id','2','total', v_price[1],
       'items', jsonb_build_array(jsonb_build_object('produto_id',v_p[1],'quantity',1,'unit_price',v_price[1]))));
    RESET ROLE; v_log := v_log || E'FALHOU U6 vendeu com caixa fechado\n';
  EXCEPTION WHEN OTHERS THEN RESET ROLE; v_log := v_log || format(E'OK U6 venda com caixa fechado recusada: %s\n', SQLERRM);
  END;
  BEGIN
    INSERT INTO caixa_movimentacoes (caixa_id,tipo,valor,forma_pagamento,descricao,usuario_id,usuario_nome)
    VALUES (v_caixa,'sangria',1,'dinheiro','direto em caixa fechado',v_admin,'x');
    v_log := v_log || E'FALHOU U6 movimentacao em caixa fechado aceita\n';
  EXCEPTION WHEN OTHERS THEN v_log := v_log || format(E'OK U6 movimentacao em caixa fechado recusada: %s\n', SQLERRM);
  END;

  -- ── U7: sincronização vendas x caixa x itens x estoque (diagnóstico) ────────
  SELECT count(*) INTO v_n FROM public.diagnostico_vendas_caixa() d WHERE d.problema='cancelada_com_item_ativo';
  v_log := v_log || CASE WHEN v_n=0 THEN 'OK ' ELSE 'FALHOU ' END || format(E'U7 vendas canceladas com item ativo: %s\n', v_n);
  SELECT count(*) INTO v_n FROM public.diagnostico_vendas_caixa() d WHERE d.problema IN
     ('movimentacao_em_caixa_de_outra_filial','venda_sem_lancamento_no_caixa','estoque_diferente_do_historico');
  v_log := v_log || CASE WHEN v_n=0 THEN 'OK ' ELSE 'FALHOU ' END || format(E'U7 movimentacao em outra filial / venda sem caixa / estoque x historico: %s\n', v_n);
  v_log := v_log || format(E'INFO legado: cancelada_com_saldo_no_caixa=%s ativa_total_diferente_do_caixa=%s ativa_itens_diferentes_do_total=%s\n',
     (SELECT count(*) FROM public.diagnostico_vendas_caixa() d WHERE d.problema='cancelada_com_saldo_no_caixa'),
     (SELECT count(*) FROM public.diagnostico_vendas_caixa() d WHERE d.problema='ativa_total_diferente_do_caixa'),
     (SELECT count(*) FROM public.diagnostico_vendas_caixa() d WHERE d.problema='ativa_itens_diferentes_do_total'));

  RAISE EXCEPTION E'RESULTADO_TESTE\n%', v_log;
END
$t$;
