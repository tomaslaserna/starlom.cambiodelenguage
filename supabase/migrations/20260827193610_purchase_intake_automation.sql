ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS payment_term_days INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS due_date DATE;

UPDATE public.purchases
SET due_date = purchase_date
WHERE due_date IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.suppliers'::regclass
      AND conname = 'suppliers_payment_term_days_check'
  ) THEN
    ALTER TABLE public.suppliers
      ADD CONSTRAINT suppliers_payment_term_days_check
      CHECK (payment_term_days BETWEEN 0 AND 3650);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS purchases_empresa_due_date_idx
  ON public.purchases (empresa_id, due_date)
  WHERE status = 'recibida';
