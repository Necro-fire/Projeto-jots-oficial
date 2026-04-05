
ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'concluida',
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by_id uuid,
  ADD COLUMN IF NOT EXISTS cancelled_by_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS motivo_cancelamento text DEFAULT '';
