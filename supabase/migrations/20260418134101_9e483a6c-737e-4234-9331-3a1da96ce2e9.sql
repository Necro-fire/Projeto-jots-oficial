-- 1. Marcar fornecedores duplicados (mesmo CNPJ em filiais diferentes) como globais
-- Mantém o registro mais antigo de cada CNPJ duplicado e o converte em global, deletando os outros
WITH duplicados AS (
  SELECT cnpj_cpf
  FROM public.fornecedores
  WHERE cnpj_cpf <> '' AND cnpj_cpf IS NOT NULL
  GROUP BY cnpj_cpf
  HAVING COUNT(DISTINCT filial_id) > 1
),
manter AS (
  SELECT DISTINCT ON (f.cnpj_cpf) f.id, f.cnpj_cpf
  FROM public.fornecedores f
  JOIN duplicados d ON d.cnpj_cpf = f.cnpj_cpf
  ORDER BY f.cnpj_cpf, f.created_at ASC
)
UPDATE public.fornecedores f
SET filial_id = 'all'
FROM manter m
WHERE f.id = m.id;

-- Deletar os duplicados que não são o "manter" (atualizando refs antes)
WITH duplicados AS (
  SELECT cnpj_cpf
  FROM public.fornecedores
  WHERE cnpj_cpf <> '' AND cnpj_cpf IS NOT NULL
  GROUP BY cnpj_cpf
  HAVING COUNT(*) > 1
),
manter AS (
  SELECT DISTINCT ON (f.cnpj_cpf) f.id AS keep_id, f.cnpj_cpf
  FROM public.fornecedores f
  JOIN duplicados d ON d.cnpj_cpf = f.cnpj_cpf
  WHERE f.filial_id = 'all'
  ORDER BY f.cnpj_cpf, f.created_at ASC
),
remover AS (
  SELECT f.id AS del_id, m.keep_id
  FROM public.fornecedores f
  JOIN manter m ON m.cnpj_cpf = f.cnpj_cpf
  WHERE f.id <> m.keep_id
)
UPDATE public.compras_fornecedor c
SET fornecedor_id = r.keep_id
FROM remover r
WHERE c.fornecedor_id = r.del_id;

-- Atualizar fornecedor_produtos antes de deletar
WITH duplicados AS (
  SELECT cnpj_cpf
  FROM public.fornecedores
  WHERE cnpj_cpf <> '' AND cnpj_cpf IS NOT NULL
  GROUP BY cnpj_cpf
  HAVING COUNT(*) > 1
),
manter AS (
  SELECT DISTINCT ON (f.cnpj_cpf) f.id AS keep_id, f.cnpj_cpf
  FROM public.fornecedores f
  JOIN duplicados d ON d.cnpj_cpf = f.cnpj_cpf
  WHERE f.filial_id = 'all'
  ORDER BY f.cnpj_cpf, f.created_at ASC
),
remover AS (
  SELECT f.id AS del_id, m.keep_id
  FROM public.fornecedores f
  JOIN manter m ON m.cnpj_cpf = f.cnpj_cpf
  WHERE f.id <> m.keep_id
)
UPDATE public.fornecedor_produtos fp
SET fornecedor_id = r.keep_id
FROM remover r
WHERE fp.fornecedor_id = r.del_id
  AND NOT EXISTS (
    SELECT 1 FROM public.fornecedor_produtos fp2
    WHERE fp2.fornecedor_id = r.keep_id AND fp2.produto_id = fp.produto_id
  );

-- Deletar duplicados restantes (que ainda têm vínculos serão removidos via cascade ou ficaram órfãos)
WITH duplicados AS (
  SELECT cnpj_cpf
  FROM public.fornecedores
  WHERE cnpj_cpf <> '' AND cnpj_cpf IS NOT NULL
  GROUP BY cnpj_cpf
  HAVING COUNT(*) > 1
),
manter AS (
  SELECT DISTINCT ON (f.cnpj_cpf) f.id AS keep_id, f.cnpj_cpf
  FROM public.fornecedores f
  JOIN duplicados d ON d.cnpj_cpf = f.cnpj_cpf
  WHERE f.filial_id = 'all'
  ORDER BY f.cnpj_cpf, f.created_at ASC
)
DELETE FROM public.fornecedor_produtos fp
WHERE fp.fornecedor_id IN (
  SELECT f.id FROM public.fornecedores f
  JOIN manter m ON m.cnpj_cpf = f.cnpj_cpf
  WHERE f.id <> m.keep_id
);

WITH duplicados AS (
  SELECT cnpj_cpf
  FROM public.fornecedores
  WHERE cnpj_cpf <> '' AND cnpj_cpf IS NOT NULL
  GROUP BY cnpj_cpf
  HAVING COUNT(*) > 1
),
manter AS (
  SELECT DISTINCT ON (f.cnpj_cpf) f.id AS keep_id, f.cnpj_cpf
  FROM public.fornecedores f
  JOIN duplicados d ON d.cnpj_cpf = f.cnpj_cpf
  WHERE f.filial_id = 'all'
  ORDER BY f.cnpj_cpf, f.created_at ASC
)
DELETE FROM public.fornecedores f
USING manter m
WHERE f.cnpj_cpf = m.cnpj_cpf AND f.id <> m.keep_id;