CREATE TABLE public.storefront_payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  quote_id UUID NOT NULL UNIQUE REFERENCES public.quotes(id) ON DELETE CASCADE,
  request_key UUID NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','pending','approved','rejected','cancelled')),
  mp_preference_id TEXT UNIQUE,
  mp_payment_id TEXT UNIQUE,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, request_key)
);

CREATE INDEX storefront_payment_intents_status_idx
  ON public.storefront_payment_intents (empresa_id, status, created_at DESC);

ALTER TABLE public.storefront_payment_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storefront_payment_intents FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.storefront_payment_intents TO starlim_app;
CREATE POLICY storefront_payment_intents_runtime
  ON public.storefront_payment_intents FOR ALL TO starlim_app
  USING (empresa_id = current_setting('app.current_empresa_id', true)::bigint)
  WITH CHECK (empresa_id = current_setting('app.current_empresa_id', true)::bigint);