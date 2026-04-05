
CREATE TABLE public.boleto_alertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id uuid NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  filial_id text NOT NULL DEFAULT '1',
  parcela_numero integer NOT NULL DEFAULT 1,
  total_parcelas integer NOT NULL DEFAULT 1,
  valor_parcela numeric NOT NULL DEFAULT 0,
  data_vencimento timestamp with time zone NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pendente',
  intervalo_dias integer NOT NULL DEFAULT 30,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.boleto_alertas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_boleto_alertas" ON public.boleto_alertas
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.boleto_alertas;
