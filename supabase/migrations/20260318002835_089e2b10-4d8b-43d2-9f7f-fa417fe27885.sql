
CREATE TABLE public.alertas_estoque (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo TEXT NOT NULL DEFAULT 'produto',
  categoria TEXT NOT NULL,
  cor TEXT DEFAULT NULL,
  quantidade_minima INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (tipo, categoria, cor)
);

ALTER TABLE public.alertas_estoque ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to alertas_estoque"
ON public.alertas_estoque
FOR ALL
TO public
USING (true)
WITH CHECK (true);
