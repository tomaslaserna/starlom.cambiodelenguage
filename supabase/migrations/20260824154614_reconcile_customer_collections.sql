BEGIN;

-- Payments are linked to sales only when they are registered or approved.
-- Historical customer-level payments remain untouched: reports calculate the
-- customer balance from the ledger without creating retroactive allocations.
CREATE INDEX IF NOT EXISTS current_account_movements_payment_sale_idx
  ON public.current_account_movements (empresa_id, payment_id, sale_id)
  WHERE payment_id IS NOT NULL;

COMMIT;
