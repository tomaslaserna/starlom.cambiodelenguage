CREATE TABLE public.customer_portal_payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  portal_account_id UUID NOT NULL REFERENCES public.customer_portal_accounts(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  sale_ids UUID[] NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','pending','approved','rejected','cancelled')),
  mp_preference_id TEXT UNIQUE,
  mp_payment_id TEXT UNIQUE,
  portal_user_id UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX customer_portal_payment_intents_account_idx
  ON public.customer_portal_payment_intents (empresa_id, portal_account_id, created_at DESC);

ALTER TABLE public.customer_portal_payment_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_portal_payment_intents FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_portal_payment_intents TO starlim_app;
CREATE POLICY customer_portal_payment_intents_runtime
  ON public.customer_portal_payment_intents FOR ALL TO starlim_app
  USING (empresa_id = current_setting('app.current_empresa_id', true)::bigint)
  WITH CHECK (empresa_id = current_setting('app.current_empresa_id', true)::bigint);
