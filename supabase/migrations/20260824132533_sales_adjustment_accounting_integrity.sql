BEGIN;

ALTER TABLE public.sales_internal_documents
  ADD COLUMN IF NOT EXISTS issue_date date,
  ADD COLUMN IF NOT EXISTS operational_document_id uuid,
  ADD COLUMN IF NOT EXISTS account_adjusted boolean NOT NULL DEFAULT false;

UPDATE public.sales_internal_documents
SET issue_date = COALESCE(
  fiscal_issue_date,
  (created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
)
WHERE issue_date IS NULL;

ALTER TABLE public.sales_internal_documents
  ALTER COLUMN issue_date SET DEFAULT ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date),
  ALTER COLUMN issue_date SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.sales_internal_documents'::regclass
      AND conname = 'sales_internal_documents_operational_document_fk'
  ) THEN
    ALTER TABLE public.sales_internal_documents
      ADD CONSTRAINT sales_internal_documents_operational_document_fk
      FOREIGN KEY (operational_document_id)
      REFERENCES public.sales_internal_documents(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

-- Existing operational notes already posted their customer-account movement.
-- Existing approved fiscal notes are marked as posted as well; this migration
-- deliberately does not try to infer and reverse historical duplicates.
UPDATE public.sales_internal_documents
SET account_adjusted = true
WHERE sale_id IS NOT NULL
  AND (
    fiscal = false
    OR (fiscal = true AND COALESCE(fiscal_status, '') = 'aprobado')
  );

-- Historical documents remain deliberately unlinked: an amount coincidence is
-- not enough evidence to rewrite accounting relationships. New fiscal notes
-- receive the explicit link when they are prepared by the application.

CREATE INDEX IF NOT EXISTS sales_internal_documents_empresa_issue_date_idx
  ON public.sales_internal_documents (empresa_id, issue_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS sales_internal_documents_operational_fiscal_uidx
  ON public.sales_internal_documents (empresa_id, operational_document_id)
  WHERE operational_document_id IS NOT NULL AND fiscal = true;

COMMENT ON COLUMN public.sales_internal_documents.issue_date IS
  'Fecha comercial y contable propia de la nota; determina el periodo de metricas.';

COMMENT ON COLUMN public.sales_internal_documents.operational_document_id IS
  'Nota interna que origino esta nota fiscal. Evita volver a impactar cuenta corriente.';

COMMENT ON COLUMN public.sales_internal_documents.account_adjusted IS
  'Indica que el efecto financiero de la nota ya fue registrado en cuenta corriente.';

COMMIT;
