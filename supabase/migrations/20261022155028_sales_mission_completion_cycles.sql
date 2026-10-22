CREATE TABLE public.sales_mission_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mission_key TEXT NOT NULL,
  mission_kind TEXT NOT NULL
    CHECK (mission_kind IN ('lead', 'cliente', 'presupuesto', 'lista')),
  entity_id UUID NOT NULL,
  customer_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  next_followup_on DATE NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sales_mission_completions_key_check
    CHECK (mission_key ~ '^(lead|client|quote|price-list)-[0-9a-f-]{36}$'),
  CONSTRAINT sales_mission_completions_notes_length_check
    CHECK (char_length(notes) <= 500)
);

CREATE INDEX sales_mission_completions_latest_idx
  ON public.sales_mission_completions
  (empresa_id, seller_id, mission_key, completed_at DESC, id DESC);

CREATE INDEX sales_mission_completions_customer_idx
  ON public.sales_mission_completions
  (empresa_id, customer_id, completed_at DESC)
  WHERE customer_id IS NOT NULL;

CREATE INDEX sales_mission_completions_next_followup_idx
  ON public.sales_mission_completions
  (empresa_id, seller_id, next_followup_on)
  WHERE next_followup_on IS NOT NULL;

ALTER TABLE public.sales_mission_completions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.sales_mission_completions FROM anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sales_mission_completions TO starlim_app;

CREATE POLICY sales_mission_completions_starlim_app_tenant
  ON public.sales_mission_completions
  FOR ALL
  TO starlim_app
  USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint);

COMMENT ON TABLE public.sales_mission_completions IS
  'Append-only history of completed sales missions and their operator-selected next contact date.';
