
-- Add new accessory columns to produtos table
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS categoria_acessorio text NOT NULL DEFAULT '';
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS tipo_acessorio text NOT NULL DEFAULT '';
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS variacao_acessorio text NOT NULL DEFAULT '';
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS cor_acessorio text NOT NULL DEFAULT '';
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS material_acessorio text NOT NULL DEFAULT '';

-- Add new columns to alertas_estoque for granular matching
ALTER TABLE public.alertas_estoque ADD COLUMN IF NOT EXISTS tipo_acessorio text NOT NULL DEFAULT '';
ALTER TABLE public.alertas_estoque ADD COLUMN IF NOT EXISTS variacao_acessorio text NOT NULL DEFAULT '';
ALTER TABLE public.alertas_estoque ADD COLUMN IF NOT EXISTS material_acessorio text NOT NULL DEFAULT '';

-- Enable realtime for alertas_estoque (already enabled but ensure)
ALTER PUBLICATION supabase_realtime ADD TABLE public.alertas_estoque;
