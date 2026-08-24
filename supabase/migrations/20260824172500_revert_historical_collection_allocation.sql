BEGIN;

CREATE TEMP TABLE tmp_fifo_affected_sales ON COMMIT DROP AS
SELECT DISTINCT cam.sale_id
FROM public.current_account_movements cam
WHERE cam.payment_id IS NOT NULL
  AND cam.sale_id IS NOT NULL
  AND (
    cam.description ILIKE '%Imputación histórica FIFO%'
    OR cam.description ILIKE '%Saldo a favor sin imputar%'
  );

-- Restore the one customer-level ledger movement that existed for each payment.
UPDATE public.current_account_movements cam
SET sale_id = NULL,
    credit = p.amount,
    description = trim(both ' |' from regexp_replace(
      regexp_replace(
        COALESCE(cam.description, ''),
        '\s*\|\s*Imputación histórica FIFO\s*$',
        '',
        'i'
      ),
      '\s*\|\s*Saldo a favor sin imputar\s*$',
      '',
      'i'
    ))
FROM public.payments p
WHERE p.id = cam.payment_id
  AND p.empresa_id = cam.empresa_id
  AND p.created_at = cam.created_at
  AND (
    cam.description ILIKE '%Imputación histórica FIFO%'
    OR cam.description ILIKE '%Saldo a favor sin imputar%'
  );

-- Remove only the allocation fragments created by the historical FIFO migration.
DELETE FROM public.current_account_movements cam
USING public.payments p
WHERE p.id = cam.payment_id
  AND p.empresa_id = cam.empresa_id
  AND p.created_at <> cam.created_at
  AND (
    cam.description ILIKE '%Imputación histórica FIFO%'
    OR cam.description ILIKE '%Saldo a favor sin imputar%'
  );

-- The retroactive allocation changed these sale statuses. Recalculate them only
-- from movements that remain genuinely linked to each sale.
WITH ledger AS (
  SELECT s.id AS sale_id,
         COALESCE(SUM(cam.credit), 0) AS total_credit,
         COALESCE(SUM(cam.debit) FILTER (
           WHERE cam.description ILIKE 'nota de debito%'
              OR cam.description ILIKE 'anulacion de cobro%'
         ), 0) AS debit_notes
  FROM public.sales s
  JOIN tmp_fifo_affected_sales affected ON affected.sale_id = s.id
  LEFT JOIN public.current_account_movements cam
    ON cam.empresa_id = s.empresa_id AND cam.sale_id = s.id
  GROUP BY s.id
)
UPDATE public.sales s
SET collection_status = CASE
      WHEN GREATEST(
        COALESCE(s.total_amount, 0)
        + COALESCE(ledger.debit_notes, 0)
        - COALESCE(ledger.total_credit, 0),
        0
      ) <= 0.005 THEN 'recibido'
      ELSE 'pendiente'
    END,
    updated_at = now()
FROM ledger
WHERE ledger.sale_id = s.id
  AND COALESCE(s.collection_status, 'pendiente') NOT IN ('pendiente_aprobacion', 'en_proceso');

COMMIT;
