-- Administracion - conciliacion bancaria.
-- Aditivo: agrega extractos bancarios y cruces contra pagos_registro sin borrar datos.

CREATE TABLE IF NOT EXISTS public.admin_bank_accounts (
    id BIGSERIAL PRIMARY KEY,
    empresa_id BIGINT NOT NULL DEFAULT 1,
    nombre VARCHAR(120) NOT NULL,
    banco VARCHAR(120) NOT NULL DEFAULT '',
    moneda VARCHAR(12) NOT NULL DEFAULT 'ARS',
    tipo_cuenta VARCHAR(40) NOT NULL DEFAULT '',
    alias_cuenta VARCHAR(120) NOT NULL DEFAULT '',
    cbu_masked VARCHAR(40) NOT NULL DEFAULT '',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.admin_bank_statement_lines (
    id BIGSERIAL PRIMARY KEY,
    empresa_id BIGINT NOT NULL DEFAULT 1,
    bank_account_id BIGINT NOT NULL REFERENCES public.admin_bank_accounts(id) ON DELETE RESTRICT,
    fecha DATE NOT NULL,
    descripcion TEXT NOT NULL DEFAULT '',
    referencia VARCHAR(160) NOT NULL DEFAULT '',
    debit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
    credit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'matched', 'ignored')),
    notas TEXT NOT NULL DEFAULT '',
    imported_by VARCHAR(120) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((debit > 0 AND credit = 0 AND amount = -debit) OR (credit > 0 AND debit = 0 AND amount = credit))
);

CREATE TABLE IF NOT EXISTS public.admin_bank_reconciliation_matches (
    id BIGSERIAL PRIMARY KEY,
    empresa_id BIGINT NOT NULL DEFAULT 1,
    statement_line_id BIGINT NOT NULL REFERENCES public.admin_bank_statement_lines(id) ON DELETE RESTRICT,
    pago_registro_id INT NOT NULL REFERENCES public.pagos_registro(id) ON DELETE RESTRICT,
    matched_amount NUMERIC(14,2) NOT NULL CHECK (matched_amount > 0),
    status VARCHAR(24) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'reversed')),
    notas TEXT NOT NULL DEFAULT '',
    created_by VARCHAR(120) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (statement_line_id, pago_registro_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_bank_accounts_empresa
    ON public.admin_bank_accounts (empresa_id, activo, nombre);

CREATE INDEX IF NOT EXISTS idx_admin_bank_lines_empresa_fecha
    ON public.admin_bank_statement_lines (empresa_id, fecha DESC, status);

CREATE INDEX IF NOT EXISTS idx_admin_bank_lines_account
    ON public.admin_bank_statement_lines (empresa_id, bank_account_id, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_admin_bank_matches_empresa_line
    ON public.admin_bank_reconciliation_matches (empresa_id, statement_line_id, status);

CREATE INDEX IF NOT EXISTS idx_admin_bank_matches_pago
    ON public.admin_bank_reconciliation_matches (empresa_id, pago_registro_id, status);

ALTER TABLE public.admin_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_bank_statement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_bank_reconciliation_matches ENABLE ROW LEVEL SECURITY;

INSERT INTO public.admin_resources (clave, nombre, descripcion, ruta, orden, sensible, fuente)
VALUES
    ('admin.conciliacion_bancaria', 'Conciliacion bancaria', 'Cruce de extractos bancarios contra cobros y pagos registrados.', '/treasury/movements', 25, FALSE, 'tesoreria')
ON CONFLICT (clave) DO UPDATE
SET nombre = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion,
    ruta = EXCLUDED.ruta,
    orden = EXCLUDED.orden,
    sensible = EXCLUDED.sensible,
    fuente = EXCLUDED.fuente,
    activo = TRUE,
    updated_at = CURRENT_TIMESTAMP;

WITH catalogo(clave, modulo, accion, nombre) AS (
    VALUES
        ('admin.conciliacion_bancaria.ver', 'admin.conciliacion_bancaria', 'ver', 'Ver Conciliacion bancaria'),
        ('admin.conciliacion_bancaria.editar', 'admin.conciliacion_bancaria', 'editar', 'Editar conciliaciones bancarias')
)
INSERT INTO public.app_permisos (clave, modulo, accion, nombre)
SELECT clave, modulo, accion, nombre
FROM catalogo
ON CONFLICT (clave) DO UPDATE
SET modulo = EXCLUDED.modulo,
    accion = EXCLUDED.accion,
    nombre = EXCLUDED.nombre;

INSERT INTO public.app_rol_permisos (id_rol, id_permiso)
SELECT r.id, p.id
FROM public.app_roles r
JOIN public.app_permisos p ON p.clave IN ('admin.conciliacion_bancaria.ver', 'admin.conciliacion_bancaria.editar')
WHERE r.clave = 'Admin'
ON CONFLICT DO NOTHING;
