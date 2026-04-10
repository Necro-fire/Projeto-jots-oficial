
-- 1. Remove Malas permissions and role associations
DELETE FROM role_permissions WHERE permission_id IN (
  SELECT id FROM permissions WHERE module = 'malas'
);
DELETE FROM permissions WHERE module = 'malas';

-- 2. Add missing permissions
INSERT INTO permissions (module, action, description)
SELECT module, action, description FROM (
  VALUES
    ('caixa', 'view_history', 'Visualizar histórico do caixa'),
    ('clientes', 'view_history', 'Visualizar histórico do cliente'),
    ('funcionarios', 'edit_password', 'Editar senha do funcionário'),
    ('fornecedores', 'view', 'Visualizar fornecedores'),
    ('trafego_filiais', 'view', 'Visualizar tráfego de filiais'),
    ('produtos_consignados', 'view', 'Visualizar produtos consignados'),
    ('fiscal', 'view_nf', 'Visualizar notas fiscais'),
    ('fiscal', 'add_nf', 'Adicionar NF'),
    ('fiscal', 'cancel_nf', 'Cancelar NF'),
    ('fiscal', 'correct_nf', 'Corrigir NF (CC-e)'),
    ('relatorios', 'export', 'Exportar relatórios'),
    ('boleto', 'block_bell', 'Bloquear sino de boleto'),
    ('estoque', 'manage_alert', 'Gerenciar alerta de estoque'),
    ('admin', 'manage_users', 'Gerenciar usuários')
) AS new_perms(module, action, description)
WHERE NOT EXISTS (
  SELECT 1 FROM permissions p
  WHERE p.module = new_perms.module AND p.action = new_perms.action
);
