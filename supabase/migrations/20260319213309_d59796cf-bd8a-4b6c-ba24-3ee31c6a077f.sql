
CREATE TABLE public.empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social text NOT NULL,
  nome_fantasia text NOT NULL DEFAULT '',
  cnpj text NOT NULL,
  inscricao_estadual text NOT NULL DEFAULT '',
  regime_tributario text NOT NULL DEFAULT '',
  cnae text NOT NULL DEFAULT '',
  cep text NOT NULL DEFAULT '',
  endereco text NOT NULL DEFAULT '',
  numero text NOT NULL DEFAULT '',
  bairro text NOT NULL DEFAULT '',
  cidade text NOT NULL DEFAULT '',
  estado text NOT NULL DEFAULT '',
  codigo_ibge text NOT NULL DEFAULT '',
  codigo_municipio text NOT NULL DEFAULT '',
  telefone text NOT NULL DEFAULT '',
  celular text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  serie_nf text NOT NULL DEFAULT '1',
  ambiente text NOT NULL DEFAULT 'homologacao',
  ativa boolean NOT NULL DEFAULT true,
  filial_padrao boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT empresas_cnpj_unique UNIQUE (cnpj)
);

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_empresas" ON public.empresas
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS inscricao_estadual text NOT NULL DEFAULT '';

ALTER PUBLICATION supabase_realtime ADD TABLE public.empresas;
