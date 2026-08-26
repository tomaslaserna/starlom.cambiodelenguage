BEGIN;

ALTER TABLE public.current_account_movements
  ADD COLUMN IF NOT EXISTS sales_internal_document_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.current_account_movements'::regclass
      AND conname = 'current_account_movements_sales_internal_document_fk'
  ) THEN
    ALTER TABLE public.current_account_movements
      ADD CONSTRAINT current_account_movements_sales_internal_document_fk
      FOREIGN KEY (sales_internal_document_id)
      REFERENCES public.sales_internal_documents(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

UPDATE public.current_account_movements movement
SET sales_internal_document_id = document.id
FROM public.sales_internal_documents document
WHERE movement.sales_internal_document_id IS NULL
  AND document.empresa_id = movement.empresa_id
  AND document.sale_id = movement.sale_id
  AND document.fiscal = false
  AND document.issue_date = movement.movement_date
  AND (
    (document.class_name = 'NC' AND movement.credit = document.amount AND movement.debit = 0)
    OR (document.class_name = 'ND' AND movement.debit = document.amount AND movement.credit = 0)
  )
  AND movement.description = CASE
    WHEN document.class_name = 'NC' THEN 'Nota de credito interna #' || document.receipt_number::text
    ELSE 'Nota de debito interna #' || document.receipt_number::text
  END;

CREATE INDEX IF NOT EXISTS current_account_movements_sales_internal_document_idx
  ON public.current_account_movements (empresa_id, sales_internal_document_id)
  WHERE sales_internal_document_id IS NOT NULL;

COMMENT ON COLUMN public.current_account_movements.sales_internal_document_id IS
  'Nota interna que originó este movimiento y permite navegar al comprobante operativo y a su comprobante fiscal vinculado.';

COMMIT;
