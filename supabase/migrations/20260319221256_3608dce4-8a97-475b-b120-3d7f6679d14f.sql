
-- Caixa sessions table
CREATE TABLE public.caixas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filial_id text NOT NULL DEFAULT '1',
  status text NOT NULL DEFAULT 'aberto',
  valor_abertura numeric NOT NULL DEFAULT 0,
  valor_fechamento_informado numeric,
  valor_fechamento_esperado numeric,
  diferenca numeric,
  usuario_abertura_id uuid NOT NULL,
  usuario_abertura_nome text NOT NULL DEFAULT '',
  usuario_fechamento_id uuid,
  usuario_fechamento_nome text,
  aberto_em timestamp with time zone NOT NULL DEFAULT now(),
  fechado_em timestamp with time zone,
  observacoes_fechamento text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Caixa movements table
CREATE TABLE public.caixa_movimentacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caixa_id uuid NOT NULL REFERENCES public.caixas(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  valor numeric NOT NULL DEFAULT 0,
  forma_pagamento text NOT NULL DEFAULT 'dinheiro',
  descricao text NOT NULL DEFAULT '',
  venda_id uuid REFERENCES public.vendas(id),
  usuario_id uuid NOT NULL,
  usuario_nome text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.caixas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caixa_movimentacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_caixas" ON public.caixas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_caixa_mov" ON public.caixa_movimentacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.caixas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.caixa_movimentacoes;
