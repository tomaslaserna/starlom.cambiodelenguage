-- Administración V2: cierres mensuales versionados e inmutables.
-- Un mes reabierto conserva su fotografía anterior y el próximo cierre crea una versión nueva.

CREATE TABLE IF NOT EXISTS public.admin_finance_monthly_closures (
  id bigserial PRIMARY KEY,
  empresa_id bigint NOT NULL,
  month date NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'closed',
  snapshot jsonb NOT NULL,
  notes text NOT NULL DEFAULT '',
  closed_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_by_username text NOT NULL DEFAULT '',
  closed_at timestamptz NOT NULL DEFAULT now(),
  reopened_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  reopened_at timestamptz NULL,
  reopen_reason text NOT NULL DEFAULT '',
  CONSTRAINT admin_finance_monthly_closures_month_check
    CHECK (month = date_trunc('month', month)::date),
  CONSTRAINT admin_finance_monthly_closures_version_check
    CHECK (version > 0),
  CONSTRAINT admin_finance_monthly_closures_status_check
    CHECK (status IN ('closed', 'reopened')),
  CONSTRAINT admin_finance_monthly_closures_snapshot_check
    CHECK (jsonb_typeof(snapshot) = 'object'),
  CONSTRAINT admin_finance_monthly_closures_unique_version
    UNIQUE (empresa_id, month, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_finance_monthly_closures_current
  ON public.admin_finance_monthly_closures (empresa_id, month)
  WHERE status = 'closed';

CREATE INDEX IF NOT EXISTS idx_admin_finance_monthly_closures_history
  ON public.admin_finance_monthly_closures (empresa_id, month DESC, version DESC);

ALTER TABLE public.admin_finance_monthly_closures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_finance_monthly_closures FROM anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.admin_finance_monthly_closures_id_seq FROM anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'starlim_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.admin_finance_monthly_closures TO starlim_app';
    EXECUTE 'GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.admin_finance_monthly_closures_id_seq TO starlim_app';
  END IF;
END $$;

DROP POLICY IF EXISTS admin_finance_monthly_closures_company_context
  ON public.admin_finance_monthly_closures;
CREATE POLICY admin_finance_monthly_closures_company_context
  ON public.admin_finance_monthly_closures
  FOR ALL TO starlim_app
  USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint);

COMMENT ON TABLE public.admin_finance_monthly_closures IS
  'Fotografías gerenciales versionadas. Nunca se eliminan; una reapertura conserva el cierre anterior.';
