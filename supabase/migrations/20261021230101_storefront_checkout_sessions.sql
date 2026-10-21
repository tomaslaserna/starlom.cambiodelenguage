CREATE TABLE public.storefront_checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id bigint NOT NULL,
  session_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('tienda', 'desafio', 'portal')),
  status text NOT NULL DEFAULT 'iniciada' CHECK (status IN ('iniciada', 'en_progreso', 'enviada', 'descartada')),
  contact_name text NOT NULL DEFAULT '',
  contact_phone text NOT NULL DEFAULT '',
  contact_email text NOT NULL DEFAULT '',
  business_name text NOT NULL DEFAULT '',
  business_type text NOT NULL DEFAULT '',
  delivery_address text NOT NULL DEFAULT '',
  item_count integer NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  estimated_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (estimated_amount >= 0),
  cart_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  request_id uuid REFERENCES public.order_requests(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  CONSTRAINT storefront_checkout_sessions_company_session_unique UNIQUE (empresa_id, session_id)
);

CREATE INDEX storefront_checkout_sessions_company_status_activity_idx
  ON public.storefront_checkout_sessions (empresa_id, status, last_activity_at DESC);
CREATE INDEX storefront_checkout_sessions_company_channel_activity_idx
  ON public.storefront_checkout_sessions (empresa_id, channel, last_activity_at DESC);

ALTER TABLE public.storefront_checkout_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storefront_checkout_sessions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.storefront_checkout_sessions TO starlim_app;
CREATE POLICY storefront_checkout_sessions_runtime ON public.storefront_checkout_sessions
  FOR ALL TO starlim_app USING (true) WITH CHECK (true);
