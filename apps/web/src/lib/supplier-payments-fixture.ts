export const supplierFixtureSql = `
CREATE TABLE suppliers(id uuid primary key,empresa_id bigint,display_name text);
CREATE TABLE purchases(id uuid primary key,empresa_id bigint,supplier_id uuid,total_amount numeric(16,2),paid_amount numeric(16,2),purchase_number text,purchase_date date,due_date date,status text,updated_at timestamptz default now());
CREATE TABLE payments(id uuid primary key default gen_random_uuid(),purchase_id uuid,payment_date date,amount numeric,method text,reference text,status text,registered_by uuid,entity_type text,entity_name text,concept text,notes text,empresa_id bigint);
CREATE TABLE current_account_movements(id bigserial,purchase_id uuid,payment_id uuid,movement_date date,debit numeric,credit numeric,description text,entity_type text,entity_name text,empresa_id bigint);
CREATE TABLE app_solicitudes(id bigserial,empresa_id bigint,estado text,metadata jsonb,titulo text,monto numeric);
INSERT INTO suppliers VALUES('33333333-3333-4333-8333-333333333333',1,'Proveedor · ejemplo');
INSERT INTO purchases VALUES('44444444-4444-4444-8444-444444444444',1,'33333333-3333-4333-8333-333333333333',198741.60,99370.80,'Compra de ejemplo','2026-11-06','2026-11-28','recibida',now());
`;
