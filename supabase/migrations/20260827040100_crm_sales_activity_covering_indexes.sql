CREATE INDEX crm_sales_activities_customer_fk_idx
  ON public.crm_sales_activities (customer_id)
  WHERE customer_id IS NOT NULL;

CREATE INDEX crm_sales_activities_lead_fk_idx
  ON public.crm_sales_activities (lead_id)
  WHERE lead_id IS NOT NULL;
