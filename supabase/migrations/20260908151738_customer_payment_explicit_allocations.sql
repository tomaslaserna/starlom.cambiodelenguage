-- Conserva la imputacion elegida por el operador mientras un cobro espera
-- aprobacion. Los movimientos de cuenta corriente siguen siendo el libro
-- contable definitivo; esta tabla solo registra la intencion auditable.
CREATE TABLE IF NOT EXISTS public.customer_payment_allocation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
  requested_amount NUMERIC(14,2) NOT NULL CHECK (requested_amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, payment_id, sale_id)
);

CREATE INDEX IF NOT EXISTS customer_payment_allocation_requests_payment_idx
  ON public.customer_payment_allocation_requests (empresa_id, payment_id);

CREATE INDEX IF NOT EXISTS customer_payment_allocation_requests_sale_idx
  ON public.customer_payment_allocation_requests (empresa_id, sale_id);

ALTER TABLE public.customer_payment_allocation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_payment_allocation_requests FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_payment_allocation_requests TO starlim_app;

CREATE POLICY customer_payment_allocation_requests_runtime
  ON public.customer_payment_allocation_requests FOR ALL TO starlim_app
  USING (empresa_id = current_setting('app.current_empresa_id', true)::bigint)
  WITH CHECK (empresa_id = current_setting('app.current_empresa_id', true)::bigint);

COMMENT ON TABLE public.customer_payment_allocation_requests IS
  'Imputaciones por remito seleccionadas al registrar cobros; se conservan para aprobacion y auditoria.';
