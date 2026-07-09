-- Structured fields for supplier rubrics and purchase VAT.
-- Keeps existing UI data by migrating legacy text markers out of notes/description.

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS rubric TEXT NOT NULL DEFAULT '';

UPDATE public.suppliers
SET rubric = ''
WHERE rubric IS NULL;

ALTER TABLE public.suppliers
  ALTER COLUMN rubric SET DEFAULT '',
  ALTER COLUMN rubric SET NOT NULL;

UPDATE public.suppliers
SET rubric = COALESCE(
      NULLIF(TRIM((regexp_match(COALESCE(notes, ''), '^\[Rubro:\s*([^\]]+)\]\s*', 'i'))[1]), ''),
      rubric
    ),
    notes = TRIM(regexp_replace(COALESCE(notes, ''), '^\[Rubro:\s*[^\]]+\]\s*', '', 'i'))
WHERE COALESCE(rubric, '') = ''
  AND COALESCE(notes, '') ~* '^\[Rubro:\s*[^\]]+\]\s*';

CREATE INDEX IF NOT EXISTS suppliers_empresa_rubric_idx
  ON public.suppliers (empresa_id, rubric)
  WHERE active = true;

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS tax_mode TEXT NOT NULL DEFAULT 'con_iva',
  ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 21;

UPDATE public.purchases
SET tax_mode = 'con_iva'
WHERE tax_mode IS NULL OR tax_mode = '';

UPDATE public.purchases
SET vat_rate = 21
WHERE vat_rate IS NULL;

UPDATE public.purchases
SET tax_mode = CASE
      WHEN description ILIKE '%IVA compra: Sin IVA%' THEN 'sin_iva'
      ELSE 'con_iva'
    END,
    vat_rate = CASE
      WHEN description ILIKE '%IVA compra:%10.5%' OR description ILIKE '%IVA compra:%10,5%' THEN 10.5
      WHEN description ILIKE '%IVA compra:%0%' THEN 0
      WHEN description ILIKE '%IVA compra:%Con IVA%' THEN 21
      ELSE vat_rate
    END,
    description = NULLIF(
      TRIM(BOTH ' |' FROM regexp_replace(
        COALESCE(description, ''),
        '(^|\s*\|\s*)IVA compra:\s*(Sin IVA|Con IVA\s*[0-9]+([,.][0-9]+)?%)\s*',
        '',
        'gi'
      )),
      ''
    )
WHERE COALESCE(description, '') ILIKE '%IVA compra:%';

ALTER TABLE public.purchases
  ALTER COLUMN tax_mode SET DEFAULT 'con_iva',
  ALTER COLUMN tax_mode SET NOT NULL,
  ALTER COLUMN vat_rate SET DEFAULT 21,
  ALTER COLUMN vat_rate SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchases_tax_mode_check'
      AND conrelid = 'public.purchases'::regclass
  ) THEN
    ALTER TABLE public.purchases
      ADD CONSTRAINT purchases_tax_mode_check CHECK (tax_mode IN ('con_iva', 'sin_iva'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchases_vat_rate_check'
      AND conrelid = 'public.purchases'::regclass
  ) THEN
    ALTER TABLE public.purchases
      ADD CONSTRAINT purchases_vat_rate_check CHECK (vat_rate >= 0 AND vat_rate <= 100);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS purchases_empresa_tax_idx
  ON public.purchases (empresa_id, tax_mode, vat_rate);
