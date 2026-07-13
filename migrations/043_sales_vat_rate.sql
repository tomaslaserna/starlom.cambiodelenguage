-- Persist the real VAT rate (0 / 10.5 / 21) of each sale so Balance/Rentabilidad
-- can net out invoiced IVA using the sale's own rate instead of assuming 21%.
-- Historical sales default to 0 (net = gross) since the rate was never captured for them.

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 0;

UPDATE public.sales
SET vat_rate = 0
WHERE vat_rate IS NULL;

ALTER TABLE public.sales
  ALTER COLUMN vat_rate SET DEFAULT 0,
  ALTER COLUMN vat_rate SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_vat_rate_check'
      AND conrelid = 'public.sales'::regclass
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_vat_rate_check CHECK (vat_rate IN (0, 10.5, 21));
  END IF;
END $$;
