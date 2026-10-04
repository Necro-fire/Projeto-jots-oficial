ALTER TABLE public.produtos DROP CONSTRAINT IF EXISTS produtos_referencia_classificacao_filial_unique;
CREATE INDEX IF NOT EXISTS idx_produtos_ncm ON public.produtos (ncm);
CREATE INDEX IF NOT EXISTS idx_produtos_referencia ON public.produtos (referencia, classificacao, filial_id);