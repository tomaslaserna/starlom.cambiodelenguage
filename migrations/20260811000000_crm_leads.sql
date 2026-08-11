BEGIN;

-- CRM Leads — prospectos (aún no clientes) por vendedor.
CREATE TABLE IF NOT EXISTS public.crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id bigint NOT NULL DEFAULT 1,
  assigned_seller text,
  name text NOT NULL,
  phone text,
  email text,
  locality text,
  source text,
  stage text NOT NULL DEFAULT 'nuevo',
  next_followup date,
  notes text,
  converted_client_id uuid,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_leads_tenant_seller_stage_idx
  ON public.crm_leads (empresa_id, assigned_seller, stage);

ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_leads_starlim_app_tenant ON public.crm_leads;
CREATE POLICY crm_leads_starlim_app_tenant ON public.crm_leads
  FOR ALL TO starlim_app
  USING (empresa_id = (NULLIF(current_setting('app.current_empresa_id', true), ''))::bigint)
  WITH CHECK (empresa_id = (NULLIF(current_setting('app.current_empresa_id', true), ''))::bigint);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_leads TO starlim_app;

COMMIT;
