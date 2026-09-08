BEGIN;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS allocation_reconciled_at timestamptz;

COMMENT ON COLUMN public.payments.allocation_reconciled_at IS
  'Fecha en que una imputacion historica externa fue confirmada. Evita mostrarla como pendiente sin alterar el pago ni el mayor.';

-- Los cobros anteriores a la imputacion explicita ya fueron conciliados por
-- administracion. Solo se marca su estado de visualizacion; no se crean,
-- modifican ni eliminan movimientos de cuenta corriente.
UPDATE public.payments p
SET allocation_reconciled_at = now(),
    updated_at = now()
WHERE p.entity_type = 'cliente'
  AND p.status::text = 'registrado'
  AND p.allocation_reconciled_at IS NULL
  AND p.created_at < timestamptz '2026-09-08 19:00:00-03'
  AND ROUND(GREATEST(
    p.amount - COALESCE((
      SELECT SUM(m.credit)
      FROM public.current_account_movements m
      WHERE m.empresa_id = p.empresa_id
        AND m.payment_id = p.id
        AND m.credit > 0
    ), 0),
    0
  ), 0) > 0;

COMMIT;
