-- Tesorería operativa: cuentas conciliables, movimientos trazables y E-cheqs en cartera.
-- Los E-cheqs ya registrados como cobros no vuelven a impactar cuentas corrientes.

CREATE TABLE public.admin_treasury_accounts (
  id bigserial PRIMARY KEY,
  empresa_id bigint NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  name text NOT NULL,
  account_type text NOT NULL,
  currency text NOT NULL DEFAULT 'ARS',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_treasury_accounts_name_check CHECK (length(trim(name)) BETWEEN 1 AND 120),
  CONSTRAINT admin_treasury_accounts_type_check CHECK (account_type IN ('cash', 'bank', 'wallet', 'other')),
  CONSTRAINT admin_treasury_accounts_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT admin_treasury_accounts_company_name_unique UNIQUE (empresa_id, name)
);

CREATE INDEX idx_admin_treasury_accounts_company_active
  ON public.admin_treasury_accounts (empresa_id, active, account_type);

CREATE TABLE public.admin_treasury_reconciliations (
  id bigserial PRIMARY KEY,
  empresa_id bigint NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  account_id bigint NOT NULL REFERENCES public.admin_treasury_accounts(id) ON DELETE RESTRICT,
  statement_date date NOT NULL,
  statement_balance numeric(16,2) NOT NULL,
  notes text NOT NULL DEFAULT '',
  created_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  reconciled_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_treasury_reconciliations_latest
  ON public.admin_treasury_reconciliations (empresa_id, account_id, reconciled_at DESC, id DESC);

CREATE TABLE public.admin_treasury_movements (
  id bigserial PRIMARY KEY,
  empresa_id bigint NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  account_id bigint NOT NULL REFERENCES public.admin_treasury_accounts(id) ON DELETE RESTRICT,
  movement_date date NOT NULL,
  direction text NOT NULL,
  amount numeric(16,2) NOT NULL,
  concept text NOT NULL,
  source_type text NOT NULL DEFAULT 'manual',
  source_id text NOT NULL DEFAULT '',
  reference text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_treasury_movements_direction_check CHECK (direction IN ('inflow', 'outflow')),
  CONSTRAINT admin_treasury_movements_amount_check CHECK (amount > 0),
  CONSTRAINT admin_treasury_movements_concept_check CHECK (length(trim(concept)) BETWEEN 1 AND 240)
);

CREATE INDEX idx_admin_treasury_movements_account_date
  ON public.admin_treasury_movements (empresa_id, account_id, movement_date DESC, id DESC);

CREATE UNIQUE INDEX idx_admin_treasury_movements_source_unique
  ON public.admin_treasury_movements (empresa_id, source_type, source_id)
  WHERE source_id <> '';

CREATE TABLE public.admin_echeqs (
  id bigserial PRIMARY KEY,
  empresa_id bigint NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  cheque_number text NOT NULL,
  received_from text NOT NULL,
  received_from_cuit text NOT NULL DEFAULT '',
  issuer text NOT NULL,
  issuer_cuit text NOT NULL DEFAULT '',
  due_date date NOT NULL,
  amount numeric(16,2) NOT NULL,
  status text NOT NULL DEFAULT 'accepted',
  payment_id uuid NULL REFERENCES public.payments(id) ON DELETE SET NULL,
  deposited_to_account_id bigint NULL REFERENCES public.admin_treasury_accounts(id) ON DELETE RESTRICT,
  settled_on date NULL,
  notes text NOT NULL DEFAULT '',
  created_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_echeqs_number_check CHECK (cheque_number ~ '^[0-9]{1,20}$'),
  CONSTRAINT admin_echeqs_amount_check CHECK (amount > 0),
  CONSTRAINT admin_echeqs_status_check CHECK (status IN ('accepted', 'deposited', 'cleared', 'rejected', 'cancelled')),
  CONSTRAINT admin_echeqs_settlement_check CHECK (
    (status IN ('accepted', 'deposited') AND settled_on IS NULL AND deposited_to_account_id IS NULL)
    OR (status = 'cleared' AND settled_on IS NOT NULL AND deposited_to_account_id IS NOT NULL)
    OR (status IN ('rejected', 'cancelled') AND settled_on IS NOT NULL)
  ),
  CONSTRAINT admin_echeqs_company_number_issuer_unique UNIQUE (empresa_id, cheque_number, issuer_cuit)
);

CREATE INDEX idx_admin_echeqs_portfolio_due
  ON public.admin_echeqs (empresa_id, status, due_date, id)
  WHERE status IN ('accepted', 'deposited');

CREATE INDEX idx_admin_echeqs_payment
  ON public.admin_echeqs (empresa_id, payment_id)
  WHERE payment_id IS NOT NULL;

ALTER TABLE public.admin_treasury_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_treasury_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_treasury_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_echeqs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_treasury_accounts FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE public.admin_treasury_reconciliations FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE public.admin_treasury_movements FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE public.admin_echeqs FROM anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.admin_treasury_accounts_id_seq FROM anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.admin_treasury_reconciliations_id_seq FROM anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.admin_treasury_movements_id_seq FROM anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.admin_echeqs_id_seq FROM anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'starlim_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.admin_treasury_accounts TO starlim_app';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE public.admin_treasury_reconciliations TO starlim_app';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE public.admin_treasury_movements TO starlim_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.admin_echeqs TO starlim_app';
    EXECUTE 'GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.admin_treasury_accounts_id_seq TO starlim_app';
    EXECUTE 'GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.admin_treasury_reconciliations_id_seq TO starlim_app';
    EXECUTE 'GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.admin_treasury_movements_id_seq TO starlim_app';
    EXECUTE 'GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.admin_echeqs_id_seq TO starlim_app';
  END IF;
END $$;

CREATE POLICY admin_treasury_accounts_company_context
  ON public.admin_treasury_accounts FOR ALL TO starlim_app
  USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint);

CREATE POLICY admin_treasury_reconciliations_company_context
  ON public.admin_treasury_reconciliations FOR ALL TO starlim_app
  USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint);

CREATE POLICY admin_treasury_movements_company_context
  ON public.admin_treasury_movements FOR ALL TO starlim_app
  USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint);

CREATE POLICY admin_echeqs_company_context
  ON public.admin_echeqs FOR ALL TO starlim_app
  USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint);

WITH requested_accounts(name, account_type) AS (
  VALUES ('Efectivo', 'cash'), ('Mercado Pago', 'wallet'), ('Santander', 'bank')
)
INSERT INTO public.admin_treasury_accounts (empresa_id, name, account_type, currency)
SELECT 1, requested_accounts.name, requested_accounts.account_type, 'ARS'
FROM requested_accounts;

INSERT INTO public.admin_treasury_reconciliations (
  empresa_id, account_id, statement_date, statement_balance, notes
)
SELECT 1, account.id, DATE '2026-10-11', values.statement_balance,
       'Saldo informado por administración al iniciar la Tesorería operativa'
FROM (VALUES
  ('Efectivo', 185000.00::numeric),
  ('Mercado Pago', 891.49::numeric),
  ('Santander', 205189.75::numeric)
) AS values(name, statement_balance)
JOIN public.admin_treasury_accounts account
  ON account.empresa_id = 1 AND account.name = values.name;

INSERT INTO public.admin_echeqs (
  empresa_id, cheque_number, received_from, received_from_cuit,
  issuer, issuer_cuit, due_date, amount, status, payment_id, notes
)
VALUES
  (1, '04268832', 'Expesan SAS', '30-71734549-1', 'Expesan SAS', '30-71734549-1', DATE '2026-10-22', 167428.10, 'accepted', '839d5c9c-dc60-4ec6-8295-24244953c1fa'::uuid, 'E-cheq aceptado; cobro ya registrado en cuenta corriente.'),
  (1, '07754991', 'Servicios Para Empresas SAS', '30-71702979-4', 'Servicios Para Empresas SAS', '30-71702979-4', DATE '2026-10-29', 705496.22, 'accepted', 'bf6a7168-7ce4-48f6-905e-401aa9191625'::uuid, 'Integra el cobro agrupado del cliente junto al E-cheq 07754990.'),
  (1, '07754990', 'Servicios Para Empresas SAS', '30-71702979-4', 'Servicios Para Empresas SAS', '30-71702979-4', DATE '2026-10-30', 705496.22, 'accepted', 'bf6a7168-7ce4-48f6-905e-401aa9191625'::uuid, 'Integra el cobro agrupado del cliente junto al E-cheq 07754991.'),
  (1, '08500001', 'Alimnor SAS', '30-71690508-6', 'German Walter Ranielli', '20-22060734-9', DATE '2026-10-30', 2761500.00, 'accepted', '26418c82-b595-4a3f-8b24-9472738f2a73'::uuid, 'Integra el cobro agrupado del cliente junto al E-cheq 00000099.'),
  (1, '00000099', 'Alimnor SAS', '30-71690508-6', 'Matias Nicolas Avaca', '20-36680842-7', DATE '2026-11-04', 893250.00, 'accepted', '26418c82-b595-4a3f-8b24-9472738f2a73'::uuid, 'Integra el cobro agrupado del cliente junto al E-cheq 08500001.');

COMMENT ON TABLE public.admin_treasury_accounts IS
  'Cuentas operativas conciliables. El saldo parte de la última conciliación y suma movimientos posteriores.';
COMMENT ON TABLE public.admin_treasury_reconciliations IS
  'Anclas de saldo informado por cuenta; preservan el historial de cada conciliación.';
COMMENT ON TABLE public.admin_treasury_movements IS
  'Movimientos de tesorería inmutables posteriores a una conciliación.';
COMMENT ON TABLE public.admin_echeqs IS
  'Valores recibidos ya aplicados como cobros y conservados como activo hasta su acreditación.';
