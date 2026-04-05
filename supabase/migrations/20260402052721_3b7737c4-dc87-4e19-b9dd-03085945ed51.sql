
ALTER TABLE public.notas_fiscais 
  ADD COLUMN IF NOT EXISTS tipo_operacao text NOT NULL DEFAULT 'saida',
  ADD COLUMN IF NOT EXISTS observacoes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS xml_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pdf_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS fornecedor_nome text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS fornecedor_cnpj text NOT NULL DEFAULT '';

INSERT INTO storage.buckets (id, name, public) VALUES ('nfe-files', 'nfe-files', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "auth_all_nfe_files" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'nfe-files') WITH CHECK (bucket_id = 'nfe-files');
