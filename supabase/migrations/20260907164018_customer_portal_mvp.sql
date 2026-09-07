CREATE TABLE public.customer_portal_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  notify_orders BOOLEAN NOT NULL DEFAULT TRUE,
  notify_invoices BOOLEAN NOT NULL DEFAULT TRUE,
  notify_offers BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, email)
);

CREATE TABLE public.customer_portal_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  portal_account_id UUID NOT NULL REFERENCES public.customer_portal_accounts(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (portal_account_id, client_id)
);

CREATE INDEX customer_portal_memberships_client_idx
  ON public.customer_portal_memberships (empresa_id, client_id);

ALTER TABLE public.customer_portal_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_portal_memberships ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.customer_portal_accounts FROM anon, authenticated;
REVOKE ALL ON public.customer_portal_memberships FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_portal_accounts TO starlim_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_portal_memberships TO starlim_app;

CREATE POLICY customer_portal_accounts_runtime
  ON public.customer_portal_accounts FOR ALL TO starlim_app
  USING (empresa_id = current_setting('app.current_empresa_id', true)::bigint)
  WITH CHECK (empresa_id = current_setting('app.current_empresa_id', true)::bigint);

CREATE POLICY customer_portal_memberships_runtime
  ON public.customer_portal_memberships FOR ALL TO starlim_app
  USING (empresa_id = current_setting('app.current_empresa_id', true)::bigint)
  WITH CHECK (empresa_id = current_setting('app.current_empresa_id', true)::bigint);
