CREATE TABLE starlim_arca.invoice_attempts (
  mode text NOT NULL, issuer bigint NOT NULL, company_id integer NOT NULL, sale_id uuid NOT NULL,
  point integer NOT NULL, kind integer NOT NULL, number integer NOT NULL CHECK (number > 0),
  issued_on text NOT NULL, document text NOT NULL, cents bigint NOT NULL, vat numeric NOT NULL,
  vat_condition text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mode, issuer, company_id, sale_id), UNIQUE (mode, issuer, point, kind, number)
);
CREATE TABLE starlim_arca.reconciliation_windows (
  mode text NOT NULL, issuer bigint NOT NULL, sale_id uuid NOT NULL, point integer NOT NULL,
  kind integer NOT NULL, first_number integer NOT NULL CHECK(first_number > 0),
  PRIMARY KEY (mode, issuer, sale_id, point, kind)
);
REVOKE ALL ON starlim_arca.invoice_attempts, starlim_arca.reconciliation_windows FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON starlim_arca.invoice_attempts TO starlim_app;
GRANT SELECT ON starlim_arca.reconciliation_windows TO starlim_app;
