
-- Fix duplicates by appending a suffix to duplicate referencia values
DO $$
DECLARE
  rec RECORD;
  counter integer;
BEGIN
  FOR rec IN
    SELECT referencia, filial_id
    FROM public.produtos
    GROUP BY referencia, filial_id
    HAVING count(*) > 1
  LOOP
    counter := 1;
    FOR rec IN
      SELECT id FROM public.produtos
      WHERE referencia = rec.referencia AND filial_id = rec.filial_id
      ORDER BY created_at ASC
      OFFSET 1
    LOOP
      UPDATE public.produtos SET referencia = produtos.referencia || '-DUP' || counter WHERE id = rec.id;
      counter := counter + 1;
    END LOOP;
  END LOOP;
END $$;

-- Update any empty referencia values to use the code value
UPDATE public.produtos SET referencia = code WHERE referencia = '' OR referencia IS NULL;

-- Add UNIQUE constraint on referencia per filial
ALTER TABLE public.produtos ADD CONSTRAINT produtos_referencia_filial_unique UNIQUE (referencia, filial_id);
