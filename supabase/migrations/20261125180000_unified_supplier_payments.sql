-- Local preview migration; no backfill or changes to existing payments.
CREATE TABLE public.admin_supplier_payment_operations (
 id uuid PRIMARY KEY, empresa_id bigint NOT NULL REFERENCES empresas(id),
 purchase_id uuid NOT NULL REFERENCES purchases(id), intent text NOT NULL CHECK(intent IN ('schedule','pay')),
 request_payload jsonb NOT NULL, amount_cents bigint NOT NULL CHECK(amount_cents>0),
 paid_cents bigint NOT NULL DEFAULT 0 CHECK(paid_cents>=0 AND paid_cents<=amount_cents),
 due_date date NOT NULL, payment_id uuid UNIQUE REFERENCES payments(id),
 movement_id bigint UNIQUE REFERENCES admin_treasury_movements(id),
 created_by uuid NOT NULL REFERENCES profiles(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX admin_supplier_one_schedule ON public.admin_supplier_payment_operations(empresa_id,purchase_id) WHERE intent='schedule' AND paid_cents<amount_cents;
ALTER TABLE public.admin_supplier_payment_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_supplier_payment_operations FROM PUBLIC,anon,authenticated,service_role,starlim_app;
GRANT SELECT,INSERT ON public.admin_supplier_payment_operations TO starlim_app;
GRANT UPDATE(paid_cents) ON public.admin_supplier_payment_operations TO starlim_app;
CREATE POLICY company_scope ON public.admin_supplier_payment_operations FOR ALL TO starlim_app USING(empresa_id=NULLIF(current_setting('app.current_empresa_id',true),'')::bigint) WITH CHECK(empresa_id=NULLIF(current_setting('app.current_empresa_id',true),'')::bigint);
