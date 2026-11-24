-- Chat-only state. No changes to sales, payments, clients, prices or business permissions.
CREATE SCHEMA IF NOT EXISTS starlim_dot;
REVOKE ALL ON SCHEMA starlim_dot FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA starlim_dot TO starlim_app;
CREATE TABLE starlim_dot.oauth_clients (
  id text PRIMARY KEY, redirect_uris jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE starlim_dot.oauth_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id text NOT NULL REFERENCES starlim_dot.oauth_clients(id),
  code_hash text UNIQUE, challenge text NOT NULL, redirect_uri text NOT NULL, principal jsonb NOT NULL,
  access_hash text UNIQUE, refresh_hash text UNIQUE, code_expires_at timestamptz NOT NULL,
  access_expires_at timestamptz, expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days'
);
CREATE TABLE public.supervisor_dot_subscriptions (
  id text PRIMARY KEY, empresa_id bigint NOT NULL REFERENCES empresas(id), user_id uuid NOT NULL REFERENCES profiles(id),
  callback_url text NOT NULL, secret_cipher text NOT NULL, previous_secret_cipher text, rotated_at timestamptz,
  expires_at timestamptz, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.supervisor_dot_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id bigint NOT NULL REFERENCES empresas(id), user_id uuid NOT NULL REFERENCES profiles(id),
  user_message_id text NOT NULL, question text NOT NULL CHECK(length(question) BETWEEN 1 AND 2000),
  context jsonb NOT NULL, principal jsonb NOT NULL, answer text,
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','answered','cancelled')),
  attempts integer NOT NULL DEFAULT 0, delivered_at timestamptz, next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivery_lease_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '48 hours',
  UNIQUE(empresa_id,user_id,user_message_id)
);
CREATE UNIQUE INDEX supervisor_dot_requests_one_pending ON supervisor_dot_requests(empresa_id,user_id) WHERE state='pending';
CREATE INDEX supervisor_dot_requests_dispatch ON supervisor_dot_requests(empresa_id,next_attempt_at) WHERE state='pending';
CREATE INDEX supervisor_dot_requests_user_fk ON supervisor_dot_requests(user_id);
CREATE INDEX supervisor_dot_subscriptions_user_fk ON supervisor_dot_subscriptions(user_id);
ALTER TABLE starlim_dot.oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE starlim_dot.oauth_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY dot_clients_server ON starlim_dot.oauth_clients TO starlim_app USING(true) WITH CHECK(true);
CREATE POLICY dot_grants_server ON starlim_dot.oauth_grants TO starlim_app USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA starlim_dot TO starlim_app;
REVOKE ALL ON public.supervisor_dot_requests,public.supervisor_dot_subscriptions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.supervisor_dot_requests,public.supervisor_dot_subscriptions TO starlim_app;
ALTER TABLE public.supervisor_dot_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisor_dot_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY supervisor_dot_requests_tenant ON public.supervisor_dot_requests TO starlim_app
  USING(empresa_id=NULLIF(current_setting('app.current_empresa_id',true),'')::bigint)
  WITH CHECK(empresa_id=NULLIF(current_setting('app.current_empresa_id',true),'')::bigint);
CREATE POLICY supervisor_dot_subscriptions_tenant ON public.supervisor_dot_subscriptions TO starlim_app
  USING(empresa_id=NULLIF(current_setting('app.current_empresa_id',true),'')::bigint)
  WITH CHECK(empresa_id=NULLIF(current_setting('app.current_empresa_id',true),'')::bigint);
