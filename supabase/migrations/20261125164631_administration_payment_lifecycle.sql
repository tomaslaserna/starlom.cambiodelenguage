-- Additive metadata. No amounts, payments or historical movements are updated.
ALTER TABLE public.admin_cost_obligations
 ADD COLUMN source_total_cents bigint CHECK(source_total_cents>0),
 ADD COLUMN salary_note text NOT NULL DEFAULT '';

ALTER TABLE public.admin_cost_obligations ADD COLUMN cancelled_at timestamptz, ADD COLUMN cancelled_by uuid REFERENCES profiles(id), ADD COLUMN cancel_reason text;
ALTER TABLE public.admin_cost_obligations DROP CONSTRAINT admin_cost_obligations_empresa_id_cost_id_month_key;
CREATE UNIQUE INDEX admin_cost_obligation_active_month ON public.admin_cost_obligations(empresa_id,cost_id,month) WHERE cancelled_at IS NULL;
GRANT UPDATE(cancelled_at,cancelled_by,cancel_reason) ON public.admin_cost_obligations TO starlim_app;
CREATE TABLE public.admin_cost_payment_reversals (
 payment_id uuid PRIMARY KEY REFERENCES public.admin_cost_obligation_payments(id),
 empresa_id bigint NOT NULL REFERENCES public.empresas(id),
 movement_id bigint UNIQUE REFERENCES public.admin_treasury_movements(id),
 reversal_date date NOT NULL, reason text NOT NULL CHECK(length(trim(reason))>=5),
 created_by uuid NOT NULL REFERENCES public.profiles(id),created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_cost_payment_reversals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_cost_payment_reversals FROM PUBLIC,anon,authenticated,service_role,starlim_app;
GRANT SELECT,INSERT ON public.admin_cost_payment_reversals TO starlim_app;
CREATE POLICY company_scope ON public.admin_cost_payment_reversals FOR ALL TO starlim_app
 USING (empresa_id=NULLIF(current_setting('app.current_empresa_id',true),'')::bigint)
 WITH CHECK (empresa_id=NULLIF(current_setting('app.current_empresa_id',true),'')::bigint);

ALTER TABLE public.admin_cost_obligation_payments ADD COLUMN reversed_at timestamptz;
ALTER TABLE public.admin_cost_obligation_payments DROP CONSTRAINT admin_cost_obligation_payments_movement_id_key;
CREATE UNIQUE INDEX admin_cost_payment_active_movement ON public.admin_cost_obligation_payments(movement_id) WHERE reversed_at IS NULL;
GRANT UPDATE(reversed_at) ON public.admin_cost_obligation_payments TO starlim_app;
