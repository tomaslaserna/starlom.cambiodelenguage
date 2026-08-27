CREATE INDEX IF NOT EXISTS crm_leads_followup_queue_idx
  ON public.crm_leads (empresa_id, assigned_seller, next_followup, created_at)
  WHERE stage IN ('nuevo', 'contactado', 'interesado');

CREATE INDEX IF NOT EXISTS crm_sales_activities_lead_day_idx
  ON public.crm_sales_activities (empresa_id, seller_id, lead_id, occurred_at DESC)
  WHERE lead_id IS NOT NULL;
