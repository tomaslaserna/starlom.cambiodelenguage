ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS contact_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS fiscal_condition text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS locality text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS province text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS delivery_lead_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS minimum_order_amount numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_method text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_account_type text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_account_holder text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_account_identifier text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_alias text NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.suppliers'::regclass
      AND conname = 'suppliers_delivery_lead_days_check'
  ) THEN
    ALTER TABLE public.suppliers
      ADD CONSTRAINT suppliers_delivery_lead_days_check
      CHECK (delivery_lead_days BETWEEN 0 AND 3650);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.suppliers'::regclass
      AND conname = 'suppliers_minimum_order_amount_check'
  ) THEN
    ALTER TABLE public.suppliers
      ADD CONSTRAINT suppliers_minimum_order_amount_check
      CHECK (minimum_order_amount >= 0);
  END IF;
END $$;
