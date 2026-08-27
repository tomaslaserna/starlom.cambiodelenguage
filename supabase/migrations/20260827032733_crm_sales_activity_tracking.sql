CREATE TABLE public.crm_sales_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL DEFAULT 'contacto'
    CHECK (activity_type IN ('contacto', 'seguimiento', 'recuperacion')),
  outcome TEXT NOT NULL
    CHECK (outcome IN ('sin_respuesta', 'contactado', 'interesado', 'pedido_probable', 'recuperado', 'no_interesado')),
  source_bucket TEXT
    CHECK (source_bucket IS NULL OR source_bucket IN ('contactar', 'riesgo', 'perdido', 'lead')),
  notes TEXT NOT NULL DEFAULT '',
  next_followup DATE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_sales_activities_one_target_check CHECK (
    (customer_id IS NOT NULL AND lead_id IS NULL)
    OR (customer_id IS NULL AND lead_id IS NOT NULL)
  )
);

CREATE INDEX crm_sales_activities_seller_day_idx
  ON public.crm_sales_activities (empresa_id, seller_id, occurred_at DESC);

CREATE INDEX crm_sales_activities_customer_idx
  ON public.crm_sales_activities (empresa_id, customer_id, occurred_at DESC)
  WHERE customer_id IS NOT NULL;

CREATE INDEX crm_sales_activities_followup_idx
  ON public.crm_sales_activities (empresa_id, seller_id, next_followup)
  WHERE next_followup IS NOT NULL;

ALTER TABLE public.crm_sales_activities ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.crm_sales_activities FROM anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crm_sales_activities TO starlim_app;

CREATE POLICY crm_sales_activities_starlim_app_tenant
  ON public.crm_sales_activities
  FOR ALL
  TO starlim_app
  USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint);
