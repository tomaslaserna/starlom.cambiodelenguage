-- Vincula cada cobro de cuenta corriente con su destino real en Tesoreria.
-- Las columnas son opcionales para conservar la compatibilidad con cobros historicos.

ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'pendiente_aprobacion';
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'rechazado';

ALTER TABLE public.payments
  ADD COLUMN treasury_account_id bigint NULL
    REFERENCES public.admin_treasury_accounts(id) ON DELETE RESTRICT,
  ADD COLUMN treasury_reference text NOT NULL DEFAULT '',
  ADD COLUMN cheque_due_date date NULL;

CREATE INDEX idx_payments_treasury_account
  ON public.payments (empresa_id, treasury_account_id, payment_date DESC)
  WHERE treasury_account_id IS NOT NULL;

COMMENT ON COLUMN public.payments.treasury_account_id IS
  'Cuenta de Tesoreria que recibe el efectivo o la transferencia. Los E-cheqs permanecen en cartera.';
COMMENT ON COLUMN public.payments.treasury_reference IS
  'Numero de operacion bancaria o numero de E-cheq informado al registrar el cobro.';
COMMENT ON COLUMN public.payments.cheque_due_date IS
  'Fecha de cobro del E-cheq; nula para efectivo y transferencias.';
