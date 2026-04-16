
-- Sequence for unique consignment codes
CREATE SEQUENCE IF NOT EXISTS public.consignado_code_seq START 1;

-- Main consignment table
CREATE TABLE public.consignados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE DEFAULT ('CSG-' || lpad(nextval('consignado_code_seq')::text, 6, '0')),
  produto_id uuid NOT NULL,
  cliente_id uuid,
  filial_id text NOT NULL DEFAULT '1',
  quantidade integer NOT NULL DEFAULT 1,
  valor_unitario numeric NOT NULL DEFAULT 0,
  valor_total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'consignado' CHECK (status IN ('consignado', 'vendido', 'devolvido')),
  vendedor_nome text NOT NULL DEFAULT '',
  observacoes text NOT NULL DEFAULT '',
  venda_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- History table
CREATE TABLE public.consignado_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consignado_id uuid NOT NULL REFERENCES public.consignados(id) ON DELETE CASCADE,
  acao text NOT NULL,
  detalhes jsonb NOT NULL DEFAULT '{}',
  usuario_id uuid,
  usuario_nome text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Exchange table
CREATE TABLE public.consignado_trocas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consignado_original_id uuid NOT NULL REFERENCES public.consignados(id) ON DELETE CASCADE,
  consignado_novo_id uuid NOT NULL REFERENCES public.consignados(id) ON DELETE CASCADE,
  diferenca_valor numeric NOT NULL DEFAULT 0,
  tipo_diferenca text NOT NULL DEFAULT 'igual' CHECK (tipo_diferenca IN ('igual', 'cliente_paga', 'credito')),
  observacoes text NOT NULL DEFAULT '',
  usuario_id uuid,
  usuario_nome text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_consignados_produto ON public.consignados(produto_id);
CREATE INDEX idx_consignados_cliente ON public.consignados(cliente_id);
CREATE INDEX idx_consignados_filial ON public.consignados(filial_id);
CREATE INDEX idx_consignados_status ON public.consignados(status);
CREATE INDEX idx_consignado_historico_consignado ON public.consignado_historico(consignado_id);
CREATE INDEX idx_consignado_trocas_original ON public.consignado_trocas(consignado_original_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_consignados_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_consignados_updated_at
BEFORE UPDATE ON public.consignados
FOR EACH ROW EXECUTE FUNCTION public.update_consignados_updated_at();

-- Auto-log history on status change
CREATE OR REPLACE FUNCTION public.log_consignado_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.consignado_historico (consignado_id, acao, detalhes)
    VALUES (NEW.id, 'status_alterado', jsonb_build_object('de', OLD.status, 'para', NEW.status));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER log_consignado_status
AFTER UPDATE ON public.consignados
FOR EACH ROW EXECUTE FUNCTION public.log_consignado_status_change();

-- RLS: consignados
ALTER TABLE public.consignados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_consignados" ON public.consignados FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_consignados" ON public.consignados FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'fornecedores', 'create') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "auth_update_consignados" ON public.consignados FOR UPDATE TO authenticated
  USING (has_permission(auth.uid(), 'fornecedores', 'edit') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "auth_delete_consignados" ON public.consignados FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- RLS: consignado_historico
ALTER TABLE public.consignado_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_consignado_hist" ON public.consignado_historico FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_consignado_hist" ON public.consignado_historico FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'fornecedores', 'create') OR has_role(auth.uid(), 'admin'));

-- RLS: consignado_trocas
ALTER TABLE public.consignado_trocas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_consignado_trocas" ON public.consignado_trocas FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_consignado_trocas" ON public.consignado_trocas FOR INSERT TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'fornecedores', 'create') OR has_role(auth.uid(), 'admin'));
