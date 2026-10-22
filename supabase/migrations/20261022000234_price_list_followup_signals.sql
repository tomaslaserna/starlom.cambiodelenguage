CREATE TABLE public.price_list_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  price_list_id BIGINT NOT NULL,
  price_list_name TEXT NOT NULL,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('cliente', 'prospecto')),
  customer_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL,
  follow_up_on DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'revisado', 'cerrado')),
  shared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT price_list_shares_recipient_check CHECK (
    (recipient_type = 'cliente' AND customer_id IS NOT NULL)
    OR (recipient_type = 'prospecto' AND customer_id IS NULL)
  )
);

CREATE INDEX price_list_shares_followup_idx
  ON public.price_list_shares (empresa_id, seller_id, status, follow_up_on, shared_at DESC);

CREATE INDEX price_list_shares_customer_idx
  ON public.price_list_shares (empresa_id, customer_id, shared_at DESC)
  WHERE customer_id IS NOT NULL;

ALTER TABLE public.price_list_shares ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.price_list_shares FROM anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.price_list_shares TO starlim_app;

CREATE POLICY price_list_shares_starlim_app_tenant
  ON public.price_list_shares
  FOR ALL
  TO starlim_app
  USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint);
