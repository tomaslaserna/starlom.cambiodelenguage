-- Stock is an append-only ledger. These constraints protect every writer, not
-- only the React forms, and the idempotency key makes retries safe.
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS idempotency_key text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.stock_movements'::regclass
      AND conname = 'stock_movements_quantity_positive_check'
  ) THEN
    ALTER TABLE public.stock_movements
      ADD CONSTRAINT stock_movements_quantity_positive_check
      CHECK (quantity > 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.stock_movements'::regclass
      AND conname = 'stock_movements_idempotency_key_not_blank_check'
  ) THEN
    ALTER TABLE public.stock_movements
      ADD CONSTRAINT stock_movements_idempotency_key_not_blank_check
      CHECK (idempotency_key IS NULL OR btrim(idempotency_key) <> '') NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.stock_movements
  VALIDATE CONSTRAINT stock_movements_quantity_positive_check;

ALTER TABLE public.stock_movements
  VALIDATE CONSTRAINT stock_movements_idempotency_key_not_blank_check;

CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_empresa_idempotency_uidx
  ON public.stock_movements (empresa_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS stock_movements_empresa_product_date_idx
  ON public.stock_movements (empresa_id, product_id, movement_date DESC);

CREATE INDEX IF NOT EXISTS stock_movements_empresa_date_idx
  ON public.stock_movements (empresa_id, movement_date DESC);

COMMENT ON COLUMN public.stock_movements.idempotency_key IS
  'Client-generated operation key used to prevent duplicate stock movements on retries.';
