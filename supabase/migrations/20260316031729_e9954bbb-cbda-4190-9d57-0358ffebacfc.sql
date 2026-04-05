ALTER TABLE public.produtos ADD COLUMN barcode text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX produtos_barcode_unique ON public.produtos (barcode) WHERE barcode != '';