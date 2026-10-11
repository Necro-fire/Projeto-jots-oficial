-- Endurecimento de segurança (parte 2): vendas, caixa, estoque, compras e consignados só pelas RPCs.
-- NÃO APLICADA: depende das migrações 20261010120000..20261011100000 (as RPCs) e do front novo.
-- NÃO aplicar no banco antigo em produção (o front antigo grava essas tabelas direto).
-- Idempotente: pode ser reaplicada.
--
-- Por que: as políticas de INSERT/UPDATE abaixo deixam qualquer usuário com a permissão do
-- módulo gravar nas tabelas direto pela API REST, pulando as regras das RPCs (preço, desconto,
-- estoque não negativo, caixa aberto, histórico, filial). Com as RPCs (SECURITY DEFINER, dono da
-- tabela) o front novo não precisa mais dessas políticas; sem elas, o banco recusa o atalho.
--
-- O que NÃO muda: leitura (SELECT), exclusão (admin), e as escritas diretas que o front ainda faz
-- (produtos.status, clientes, fornecedores, empresas, notas_fiscais, boleto_alertas.status etc.).

-- Vendas e itens: criar pela RPC criar_venda.
DROP POLICY IF EXISTS "auth_write_vendas" ON public.vendas;
DROP POLICY IF EXISTS "auth_write_venda_items" ON public.venda_items;

-- Cancelamento de item: cancelar_item_venda.
DROP POLICY IF EXISTS "auth_write_item_cancel" ON public.venda_item_cancelamentos;

-- Caixa: abrir_caixa, fechar_caixa, registrar_movimentacao_caixa, estornar_movimentacao_caixa.
DROP POLICY IF EXISTS "auth_write_caixas" ON public.caixas;
DROP POLICY IF EXISTS "auth_update_caixas" ON public.caixas;
DROP POLICY IF EXISTS "auth_write_caixa_mov" ON public.caixa_movimentacoes;

-- Estoque: ajustar_estoque / definir_estoque / salvar_produto.
DROP POLICY IF EXISTS "auth_write_estoque" ON public.estoque;
DROP POLICY IF EXISTS "auth_update_estoque" ON public.estoque;

-- Boletos: gerados dentro de criar_venda (_criar_boleto_alertas). A mudança de status segue
-- com a política de UPDATE existente.
DROP POLICY IF EXISTS "auth_write_boleto_alertas" ON public.boleto_alertas;

-- Compras: registrar_compra / editar_compra / cancelar_compra.
DROP POLICY IF EXISTS "auth_write_compras" ON public.compras_fornecedor;
DROP POLICY IF EXISTS "auth_update_compras" ON public.compras_fornecedor;
DROP POLICY IF EXISTS "auth_write_compra_items" ON public.compra_items;
DROP POLICY IF EXISTS "auth_update_compra_items" ON public.compra_items;

-- Consignados: criar/devolver/vender/editar/trocar/excluir por RPC.
DROP POLICY IF EXISTS "auth_write_consignados" ON public.consignados;
DROP POLICY IF EXISTS "auth_update_consignados" ON public.consignados;
DROP POLICY IF EXISTS "auth_write_consignado_hist" ON public.consignado_historico;
DROP POLICY IF EXISTS "auth_write_consignado_trocas" ON public.consignado_trocas;
