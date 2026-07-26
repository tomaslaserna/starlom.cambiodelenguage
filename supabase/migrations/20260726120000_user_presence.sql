-- Online presence for staff. Each authenticated tab heartbeats every ~30s and
-- upserts its row; "online" is derived from last_seen being recent. One row per
-- (empresa_id, username), so the table stays tiny (bounded by staff count).

CREATE TABLE IF NOT EXISTS public.user_presence (
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  display_name TEXT,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, username)
);

CREATE INDEX IF NOT EXISTS idx_user_presence_empresa_last_seen
  ON public.user_presence (empresa_id, last_seen DESC);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

-- Internal to the authenticated Node application; never read through the
-- browser-facing Supabase Data API roles.
REVOKE ALL ON TABLE public.user_presence FROM anon, authenticated;

-- The least-privilege Node runtime connects as starlim_app and sets
-- app.current_empresa_id at the start of every transaction.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'starlim_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_presence TO starlim_app';

    EXECUTE 'DROP POLICY IF EXISTS user_presence_starlim_app_tenant ON public.user_presence';
    EXECUTE $policy$
      CREATE POLICY user_presence_starlim_app_tenant
      ON public.user_presence
      FOR ALL
      TO starlim_app
      USING (
        empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint
      )
      WITH CHECK (
        empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint
      )
    $policy$;
  END IF;
END
$$;
