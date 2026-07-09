-- Operational audit log used by purchases, approvals, stock and finance flows.
-- Additive migration: keeps existing rows if the table already exists.

CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  action TEXT NOT NULL DEFAULT '',
  entity_table TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  old_data JSONB,
  new_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  empresa_id BIGINT NOT NULL DEFAULT 1 REFERENCES public.empresas(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS actor_id UUID,
  ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS entity_table TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS entity_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS old_data JSONB,
  ADD COLUMN IF NOT EXISTS new_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.audit_log
  ALTER COLUMN entity_id TYPE TEXT USING COALESCE(entity_id::text, ''),
  ALTER COLUMN entity_id SET DEFAULT '',
  ALTER COLUMN entity_id SET NOT NULL,
  ALTER COLUMN new_data SET DEFAULT '{}'::jsonb;

UPDATE public.audit_log
SET new_data = '{}'::jsonb
WHERE new_data IS NULL;

ALTER TABLE public.audit_log
  ALTER COLUMN new_data SET NOT NULL;

CREATE INDEX IF NOT EXISTS audit_log_empresa_created_idx
  ON public.audit_log (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_log_empresa_action_idx
  ON public.audit_log (empresa_id, action, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_log_empresa_actor_idx
  ON public.audit_log (empresa_id, actor_id, created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
