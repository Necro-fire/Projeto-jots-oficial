ALTER TABLE public.tipos_produto ALTER COLUMN estoque_minimo_alerta SET DEFAULT 0;
UPDATE public.tipos_produto SET estoque_minimo_alerta = 0 WHERE estoque_minimo_alerta = 3;

ALTER TABLE public.alertas_estoque ALTER COLUMN quantidade_minima SET DEFAULT 0;