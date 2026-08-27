-- Persistent supervisor tasks. The browser never accesses these tables directly;
-- the Node runtime enforces the ERP session and sets app.current_empresa_id.

CREATE TABLE public.supervisor_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  assignee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('order_approval', 'delivery_confirmation', 'fiscal_decision', 'customer_contact')),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'snoozed', 'done', 'dismissed')),
  dedupe_key TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  due_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX supervisor_tasks_active_dedupe_idx
  ON public.supervisor_tasks (empresa_id, assignee_id, dedupe_key)
  WHERE status IN ('open', 'snoozed');

CREATE INDEX supervisor_tasks_inbox_idx
  ON public.supervisor_tasks (empresa_id, assignee_id, status, due_at, created_at DESC);

CREATE TABLE public.supervisor_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  rule_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  counters JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX supervisor_runs_company_started_idx
  ON public.supervisor_runs (empresa_id, started_at DESC);

ALTER TABLE public.supervisor_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisor_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.supervisor_tasks, public.supervisor_runs FROM anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.supervisor_tasks TO starlim_app;
GRANT SELECT, INSERT, UPDATE ON TABLE public.supervisor_runs TO starlim_app;

CREATE POLICY supervisor_tasks_starlim_app_tenant
  ON public.supervisor_tasks
  FOR ALL
  TO starlim_app
  USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint);

CREATE POLICY supervisor_runs_starlim_app_tenant
  ON public.supervisor_runs
  FOR ALL
  TO starlim_app
  USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint);
