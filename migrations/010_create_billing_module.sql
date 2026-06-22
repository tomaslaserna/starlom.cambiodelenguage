-- Modulo de Facturacion Starlim - base fiscal/auditoria.
-- No emite comprobantes ARCA por si sola. Crea el modelo seguro para drafts,
-- snapshots, autorizaciones, reglas versionadas, links y auditoria.

CREATE SCHEMA IF NOT EXISTS app_private;

CREATE TABLE IF NOT EXISTS public.customer_fiscal_profile (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL DEFAULT 1 REFERENCES public.empresas(id),
    customer_id INTEGER REFERENCES public.clientes(id),
    identification_type VARCHAR(20) NOT NULL DEFAULT '',
    identification_number VARCHAR(30) NOT NULL DEFAULT '',
    legal_name VARCHAR(180) NOT NULL DEFAULT '',
    trade_name VARCHAR(180) NOT NULL DEFAULT '',
    vat_condition VARCHAR(80) NOT NULL DEFAULT '',
    fiscal_address TEXT NOT NULL DEFAULT '',
    province VARCHAR(80) NOT NULL DEFAULT '',
    city VARCHAR(80) NOT NULL DEFAULT '',
    postal_code VARCHAR(20) NOT NULL DEFAULT '',
    country VARCHAR(80) NOT NULL DEFAULT 'Argentina',
    gross_income_condition VARCHAR(80) NOT NULL DEFAULT '',
    gross_income_number VARCHAR(50) NOT NULL DEFAULT '',
    billing_email VARCHAR(180) NOT NULL DEFAULT '',
    validation_status VARCHAR(30) NOT NULL DEFAULT 'pending',
    last_checked_at TIMESTAMP,
    source VARCHAR(50) NOT NULL DEFAULT 'manual',
    valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_to DATE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.tax_rule_version (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL DEFAULT 1 REFERENCES public.empresas(id),
    rule_key VARCHAR(120) NOT NULL,
    rule_version VARCHAR(60) NOT NULL,
    jurisdiction VARCHAR(80) NOT NULL DEFAULT 'AR',
    taxpayer_condition VARCHAR(80) NOT NULL DEFAULT '',
    document_type VARCHAR(60) NOT NULL DEFAULT '',
    tax_type VARCHAR(40) NOT NULL DEFAULT '',
    effective_from DATE NOT NULL,
    effective_to DATE,
    rate NUMERIC(12,6),
    rule_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_reference TEXT NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (company_id, rule_key, rule_version, jurisdiction, taxpayer_condition, document_type, effective_from)
);

CREATE TABLE IF NOT EXISTS public.exchange_rate (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL DEFAULT 1 REFERENCES public.empresas(id),
    currency VARCHAR(10) NOT NULL,
    rate_type VARCHAR(40) NOT NULL,
    rate NUMERIC(18,6) NOT NULL,
    source VARCHAR(120) NOT NULL DEFAULT '',
    quoted_at TIMESTAMP NOT NULL,
    effective_date DATE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (company_id, currency, rate_type, effective_date, source)
);

CREATE TABLE IF NOT EXISTS public.billing_document (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL DEFAULT 1 REFERENCES public.empresas(id),
    customer_id INTEGER REFERENCES public.clientes(id),
    customer_fiscal_profile_id BIGINT REFERENCES public.customer_fiscal_profile(id),
    document_type VARCHAR(60) NOT NULL,
    letter VARCHAR(5) NOT NULL DEFAULT '',
    point_of_sale INTEGER,
    document_number INTEGER,
    status VARCHAR(40) NOT NULL DEFAULT 'draft',
    issue_date DATE,
    service_date_from DATE,
    service_date_to DATE,
    due_date DATE,
    currency VARCHAR(10) NOT NULL DEFAULT 'PES',
    fiscal_exchange_rate NUMERIC(18,6),
    commercial_exchange_rate NUMERIC(18,6),
    net_taxable NUMERIC(14,2) NOT NULL DEFAULT 0,
    net_exempt NUMERIC(14,2) NOT NULL DEFAULT 0,
    net_non_taxable NUMERIC(14,2) NOT NULL DEFAULT 0,
    vat_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    other_tax_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    perception_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    grand_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    open_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    source_venta_id INTEGER REFERENCES public.ventas(id),
    source_remito_id INTEGER REFERENCES public.remitos(id),
    source_presupuesto_id INTEGER REFERENCES public.presupuestos(id),
    source_order_label VARCHAR(80) NOT NULL DEFAULT '',
    created_by VARCHAR(100) NOT NULL DEFAULT '',
    authorized_at TIMESTAMP,
    immutable_snapshot JSONB,
    validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
    idempotency_key VARCHAR(120),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMP,
    CHECK (grand_total >= 0),
    CHECK (open_amount >= 0),
    CHECK (status IN (
        'draft',
        'ready_for_validation',
        'validation_failed',
        'pending_authorization',
        'authorized',
        'authorized_with_observations',
        'rejected',
        'retry_scheduled',
        'contingency_pending',
        'sent',
        'partially_paid',
        'paid',
        'overdue',
        'credited_partially',
        'credited_fully',
        'reversed_by_credit_note',
        'archived',
        'void_draft'
    ))
);

CREATE TABLE IF NOT EXISTS public.billing_document_line (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL DEFAULT 1 REFERENCES public.empresas(id),
    document_id BIGINT NOT NULL REFERENCES public.billing_document(id) ON DELETE RESTRICT,
    product_id INTEGER REFERENCES public.productos(id),
    description_snapshot TEXT NOT NULL,
    sku_snapshot VARCHAR(80) NOT NULL DEFAULT '',
    quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
    unit VARCHAR(30) NOT NULL DEFAULT 'unidad',
    unit_price NUMERIC(14,4) NOT NULL DEFAULT 0,
    discount NUMERIC(8,4) NOT NULL DEFAULT 0,
    net_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_category VARCHAR(50) NOT NULL DEFAULT '',
    tax_rate NUMERIC(8,4),
    total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    line_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (quantity >= 0),
    CHECK (unit_price >= 0),
    CHECK (total_amount >= 0)
);

CREATE TABLE IF NOT EXISTS public.billing_tax_line (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL DEFAULT 1 REFERENCES public.empresas(id),
    document_id BIGINT NOT NULL REFERENCES public.billing_document(id) ON DELETE RESTRICT,
    tax_type VARCHAR(40) NOT NULL,
    jurisdiction VARCHAR(80) NOT NULL DEFAULT 'AR',
    taxable_base NUMERIC(14,2) NOT NULL DEFAULT 0,
    rate NUMERIC(12,6),
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    rule_version_id BIGINT REFERENCES public.tax_rule_version(id),
    source_registry VARCHAR(120) NOT NULL DEFAULT '',
    calculation_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.fiscal_authorization (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL DEFAULT 1 REFERENCES public.empresas(id),
    document_id BIGINT NOT NULL REFERENCES public.billing_document(id) ON DELETE RESTRICT,
    provider VARCHAR(30) NOT NULL DEFAULT 'ARCA',
    environment VARCHAR(20) NOT NULL DEFAULT 'homologacion',
    request_id VARCHAR(120) NOT NULL,
    correlation_id VARCHAR(120) NOT NULL DEFAULT '',
    idempotency_key VARCHAR(120) NOT NULL,
    authorization_type VARCHAR(20) NOT NULL DEFAULT 'CAE',
    authorization_code VARCHAR(80) NOT NULL DEFAULT '',
    authorization_expiration DATE,
    request_payload_encrypted TEXT NOT NULL DEFAULT '',
    response_payload_encrypted TEXT NOT NULL DEFAULT '',
    status VARCHAR(40) NOT NULL DEFAULT 'pending',
    error_code VARCHAR(80) NOT NULL DEFAULT '',
    error_message TEXT NOT NULL DEFAULT '',
    observations JSONB NOT NULL DEFAULT '[]'::jsonb,
    requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP,
    UNIQUE (company_id, idempotency_key),
    UNIQUE (document_id, provider, environment, authorization_type)
);

CREATE TABLE IF NOT EXISTS public.billing_document_link (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL DEFAULT 1 REFERENCES public.empresas(id),
    source_document_id BIGINT NOT NULL REFERENCES public.billing_document(id) ON DELETE RESTRICT,
    target_document_id BIGINT NOT NULL REFERENCES public.billing_document(id) ON DELETE RESTRICT,
    relation_type VARCHAR(40) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (company_id, source_document_id, target_document_id, relation_type)
);

CREATE TABLE IF NOT EXISTS public.billing_payment_allocation (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL DEFAULT 1 REFERENCES public.empresas(id),
    document_id BIGINT NOT NULL REFERENCES public.billing_document(id) ON DELETE RESTRICT,
    cuenta_corriente_id INTEGER REFERENCES public.cuentas_corrientes(id),
    pago_registro_id INTEGER REFERENCES public.pagos_registro(id),
    amount NUMERIC(14,2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'PES',
    exchange_rate NUMERIC(18,6),
    status VARCHAR(30) NOT NULL DEFAULT 'applied',
    applied_by VARCHAR(100) NOT NULL DEFAULT '',
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reversal_reason TEXT NOT NULL DEFAULT '',
    CHECK (amount > 0)
);

CREATE TABLE IF NOT EXISTS public.billing_event (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL DEFAULT 1 REFERENCES public.empresas(id),
    document_id BIGINT REFERENCES public.billing_document(id) ON DELETE RESTRICT,
    event_type VARCHAR(80) NOT NULL,
    event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    actor VARCHAR(100) NOT NULL DEFAULT '',
    trace_id VARCHAR(120) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.billing_audit_log (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL DEFAULT 1 REFERENCES public.empresas(id),
    document_id BIGINT REFERENCES public.billing_document(id) ON DELETE RESTRICT,
    actor VARCHAR(100) NOT NULL DEFAULT '',
    actor_role VARCHAR(80) NOT NULL DEFAULT '',
    ip_address INET,
    action VARCHAR(80) NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id VARCHAR(80) NOT NULL DEFAULT '',
    previous_state JSONB,
    next_state JSONB,
    reason TEXT NOT NULL DEFAULT '',
    trace_id VARCHAR(120) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.fiscal_sync_job (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL DEFAULT 1 REFERENCES public.empresas(id),
    job_type VARCHAR(60) NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'pending',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    next_run_at TIMESTAMP,
    last_error TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.fiscal_error_catalog (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL DEFAULT 1 REFERENCES public.empresas(id),
    provider VARCHAR(30) NOT NULL DEFAULT 'ARCA',
    environment VARCHAR(20) NOT NULL DEFAULT '',
    error_code VARCHAR(80) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'error',
    message TEXT NOT NULL DEFAULT '',
    recommended_action TEXT NOT NULL DEFAULT '',
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    source_reference TEXT NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (company_id, provider, environment, error_code, effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_billing_document_number
    ON public.billing_document (company_id, document_type, letter, point_of_sale, document_number)
    WHERE document_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_billing_document_idempotency
    ON public.billing_document (company_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

CREATE INDEX IF NOT EXISTS idx_billing_document_company_status
    ON public.billing_document (company_id, status, issue_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_billing_document_customer
    ON public.billing_document (company_id, customer_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_billing_document_source_venta
    ON public.billing_document (company_id, source_venta_id);
CREATE INDEX IF NOT EXISTS idx_billing_document_source_remito
    ON public.billing_document (company_id, source_remito_id);
CREATE INDEX IF NOT EXISTS idx_billing_line_document
    ON public.billing_document_line (company_id, document_id);
CREATE INDEX IF NOT EXISTS idx_billing_tax_document
    ON public.billing_tax_line (company_id, document_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_authorization_document
    ON public.fiscal_authorization (company_id, document_id, status);
CREATE INDEX IF NOT EXISTS idx_billing_payment_document
    ON public.billing_payment_allocation (company_id, document_id);
CREATE INDEX IF NOT EXISTS idx_billing_event_document
    ON public.billing_event (company_id, document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_audit_document
    ON public.billing_audit_log (company_id, document_id, created_at DESC);

CREATE OR REPLACE FUNCTION app_private.billing_prevent_authorized_snapshot_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status IN (
        'authorized',
        'authorized_with_observations',
        'sent',
        'partially_paid',
        'paid',
        'overdue',
        'credited_partially',
        'credited_fully',
        'reversed_by_credit_note'
    ) THEN
        IF NEW.immutable_snapshot IS DISTINCT FROM OLD.immutable_snapshot THEN
            RAISE EXCEPTION 'No se puede modificar el snapshot inmutable de un comprobante autorizado';
        END IF;
        IF NEW.document_type IS DISTINCT FROM OLD.document_type
           OR NEW.letter IS DISTINCT FROM OLD.letter
           OR NEW.point_of_sale IS DISTINCT FROM OLD.point_of_sale
           OR NEW.document_number IS DISTINCT FROM OLD.document_number
           OR NEW.grand_total IS DISTINCT FROM OLD.grand_total THEN
            RAISE EXCEPTION 'No se pueden modificar datos fiscales principales de un comprobante autorizado';
        END IF;
    END IF;
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_billing_document_immutable ON public.billing_document;
CREATE TRIGGER trg_billing_document_immutable
BEFORE UPDATE ON public.billing_document
FOR EACH ROW
EXECUTE FUNCTION app_private.billing_prevent_authorized_snapshot_update();

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'customer_fiscal_profile',
        'tax_rule_version',
        'exchange_rate',
        'billing_document',
        'billing_document_line',
        'billing_tax_line',
        'fiscal_authorization',
        'billing_document_link',
        'billing_payment_allocation',
        'billing_event',
        'billing_audit_log',
        'fiscal_sync_job',
        'fiscal_error_catalog'
    ]
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_isolation', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I
             USING (company_id = COALESCE(NULLIF(current_setting(''app.current_empresa_id'', true), '''')::bigint, 1))
             WITH CHECK (company_id = COALESCE(NULLIF(current_setting(''app.current_empresa_id'', true), '''')::bigint, 1))',
            t || '_tenant_isolation',
            t
        );
    END LOOP;
END $$;

COMMENT ON TABLE public.billing_document IS 'Workbench de facturacion: comprobantes fiscales/internos con snapshot inmutable al autorizar.';
COMMENT ON TABLE public.fiscal_authorization IS 'Registro de integraciones ARCA/autoridad fiscal. Payloads deben guardarse cifrados.';
COMMENT ON TABLE public.tax_rule_version IS 'Reglas fiscales versionadas por vigencia, jurisdiccion y condicion fiscal.';
