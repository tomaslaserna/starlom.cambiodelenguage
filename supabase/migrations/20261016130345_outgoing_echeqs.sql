-- E-cheqs emitidos: compromisos de pago que cancelan la cuenta del proveedor
-- pero recién reducen el saldo bancario cuando se debitan.

CREATE TABLE public.admin_outgoing_echeqs (
  id bigserial PRIMARY KEY,
  empresa_id bigint NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  cheque_number text NOT NULL,
  beneficiary text NOT NULL,
  beneficiary_cuit text NOT NULL DEFAULT '',
  account_id bigint NOT NULL REFERENCES public.admin_treasury_accounts(id) ON DELETE RESTRICT,
  due_date date NOT NULL,
  amount numeric(16,2) NOT NULL,
  status text NOT NULL DEFAULT 'issued',
  cleared_on date NULL,
  notes text NOT NULL DEFAULT '',
  created_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_outgoing_echeqs_number_check CHECK (cheque_number ~ '^[0-9]{1,20}$'),
  CONSTRAINT admin_outgoing_echeqs_amount_check CHECK (amount > 0),
  CONSTRAINT admin_outgoing_echeqs_status_check CHECK (status IN ('issued', 'accepted', 'cleared', 'cancelled', 'returned')),
  CONSTRAINT admin_outgoing_echeqs_settlement_check CHECK (
    (status IN ('issued', 'accepted') AND cleared_on IS NULL)
    OR (status = 'cleared' AND cleared_on IS NOT NULL)
    OR status IN ('cancelled', 'returned')
  ),
  CONSTRAINT admin_outgoing_echeqs_company_number_unique UNIQUE (empresa_id, cheque_number)
);

CREATE INDEX idx_admin_outgoing_echeqs_pending_due
  ON public.admin_outgoing_echeqs (empresa_id, due_date, id)
  WHERE status IN ('issued', 'accepted');

ALTER TABLE public.admin_outgoing_echeqs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_outgoing_echeqs FROM anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.admin_outgoing_echeqs_id_seq FROM anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'starlim_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.admin_outgoing_echeqs TO starlim_app';
    EXECUTE 'GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.admin_outgoing_echeqs_id_seq TO starlim_app';
  END IF;
END $$;

CREATE POLICY admin_outgoing_echeqs_company_context
  ON public.admin_outgoing_echeqs FOR ALL TO starlim_app
  USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint);

COMMENT ON TABLE public.admin_outgoing_echeqs IS
  'E-cheqs emitidos a proveedores. Permanecen como salidas futuras hasta que el banco los debita.';

