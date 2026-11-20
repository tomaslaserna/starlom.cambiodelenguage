export const SALE_DUE_DATE_SQL = `(s.sale_date::date + COALESCE(
    s.source_payment_term_days,
    CASE
      WHEN COALESCE(s.payment_condition, '') ~ '[0-9]'
        THEN (regexp_match(s.payment_condition, '([0-9]+)'))[1]::int
      WHEN LOWER(BTRIM(COALESCE(s.payment_condition, ''))) IN ('pendiente', 'contado', 'pago al recibir') THEN 0
      ELSE c.payment_term_days
    END,
    0
  ))`;
