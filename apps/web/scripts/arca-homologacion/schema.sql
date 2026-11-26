CREATE TABLE clients (id uuid, empresa_id int, display_name text, tax_id text, fiscal_condition text);
CREATE TABLE sales (
  id uuid PRIMARY KEY, empresa_id int, client_id uuid, total_amount numeric, vat_rate numeric,
  client_name text, client_document text, desired_document text, order_status text, status text,
  receipt_type int, receipt_number bigint, fiscal_status text DEFAULT 'no_enviado', tracking_status text,
  fiscal_provider text, fiscal_mode text, fiscal_document_source text, fiscal_document_kind text,
  fiscal_error_code text, fiscal_error_message text, fiscal_last_attempt_at timestamptz,
  fiscal_authorized_at timestamptz, fiscal_observations jsonb, updated_at timestamptz,
  fiscal_point_of_sale int, fiscal_receipt_type int, fiscal_receipt_number int,
  fiscal_vat_rate numeric, fiscal_issue_date date, cae text, cae_expires_at date
);
CREATE TABLE sale_items (sale_id uuid, empresa_id int, quantity numeric, unit_price numeric,
                         total_amount numeric, product_id uuid, description text);
CREATE TABLE eventos_integracion (tipo text, datos jsonb, empresa_id int);
CREATE TABLE audit_log (actor_id uuid, action text, entity_table text, entity_id text, new_data jsonb, empresa_id int);
CREATE TABLE attempts (
  sale_id uuid PRIMARY KEY, point_of_sale int NOT NULL, receipt_type int NOT NULL, number int NOT NULL,
  doc text NOT NULL, gross numeric NOT NULL, issue_date text NOT NULL,
  UNIQUE(point_of_sale, receipt_type, number)
);
