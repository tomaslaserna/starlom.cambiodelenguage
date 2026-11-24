-- Additive: existing costs, payroll and treasury are not changed.
CREATE TABLE public.admin_cost_obligations (
 id uuid PRIMARY KEY, empresa_id bigint NOT NULL REFERENCES public.empresas(id), cost_id text NOT NULL,
 month text NOT NULL CHECK(month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'), concept text NOT NULL,
 amount_cents bigint NOT NULL CHECK(amount_cents>0), due_date date NOT NULL, source_revision integer NOT NULL,
 created_by uuid REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(empresa_id,cost_id,month), UNIQUE(empresa_id,id));
CREATE TABLE public.admin_cost_obligation_payments (
 id uuid PRIMARY KEY, empresa_id bigint NOT NULL REFERENCES public.empresas(id), obligation_id uuid NOT NULL,
 request_id uuid NOT NULL, request_payload jsonb NOT NULL, movement_id bigint NOT NULL REFERENCES public.admin_treasury_movements(id),
 amount_cents bigint NOT NULL CHECK(amount_cents>0), created_by uuid REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(empresa_id,obligation_id) REFERENCES public.admin_cost_obligations(empresa_id,id), UNIQUE(empresa_id,request_id), UNIQUE(movement_id));
ALTER TABLE public.admin_cost_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_cost_obligation_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_cost_obligations,public.admin_cost_obligation_payments FROM PUBLIC,anon,authenticated,service_role,starlim_app;
GRANT SELECT,INSERT ON public.admin_cost_obligations,public.admin_cost_obligation_payments TO starlim_app;
CREATE POLICY company_scope ON public.admin_cost_obligations FOR ALL TO starlim_app
 USING (empresa_id=NULLIF(current_setting('app.current_empresa_id',true),'')::bigint)
 WITH CHECK (empresa_id=NULLIF(current_setting('app.current_empresa_id',true),'')::bigint);
CREATE POLICY company_scope ON public.admin_cost_obligation_payments FOR ALL TO starlim_app
 USING (empresa_id=NULLIF(current_setting('app.current_empresa_id',true),'')::bigint)
 WITH CHECK (empresa_id=NULLIF(current_setting('app.current_empresa_id',true),'')::bigint);
