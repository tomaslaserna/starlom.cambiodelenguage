-- Freeze the payment term used by each sale so historical aging does not move
-- when the customer's current commercial terms are edited.
UPDATE public.sales s
SET source_payment_term_days = COALESCE(
  CASE
    WHEN COALESCE(s.payment_condition, '') ~ '[0-9]'
      THEN (regexp_match(s.payment_condition, '([0-9]+)'))[1]::int
    WHEN LOWER(BTRIM(COALESCE(s.payment_condition, ''))) IN ('pendiente', 'contado', 'pago al recibir') THEN 0
    ELSE NULL
  END,
  c.payment_term_days,
  0
)
FROM public.clients c
WHERE s.client_id = c.id
  AND s.empresa_id = c.empresa_id
  AND s.source_payment_term_days IS NULL;
