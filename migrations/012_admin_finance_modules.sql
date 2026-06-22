-- Administracion - modulos financieros complementarios.
-- Aditivo: no borra ni modifica datos operativos existentes.

CREATE TABLE IF NOT EXISTS public.admin_socios (
    id BIGSERIAL PRIMARY KEY,
    empresa_id BIGINT NOT NULL DEFAULT 1,
    nombre VARCHAR(160) NOT NULL,
    participacion NUMERIC(8,4) NOT NULL DEFAULT 0,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    notas TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.admin_dividendos (
    id BIGSERIAL PRIMARY KEY,
    empresa_id BIGINT NOT NULL DEFAULT 1,
    socio_id BIGINT REFERENCES public.admin_socios(id) ON DELETE SET NULL,
    periodo DATE NOT NULL,
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    tipo VARCHAR(24) NOT NULL DEFAULT 'dividendo' CHECK (tipo IN ('dividendo', 'retiro', 'ajuste')),
    concepto VARCHAR(180) NOT NULL DEFAULT '',
    monto NUMERIC(14,2) NOT NULL DEFAULT 0,
    notas TEXT NOT NULL DEFAULT '',
    created_by VARCHAR(120) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.admin_sueldos_config (
    id BIGSERIAL PRIMARY KEY,
    empresa_id BIGINT NOT NULL DEFAULT 1,
    id_usuario INT REFERENCES public.usuarios(id) ON DELETE SET NULL,
    sueldo_mensual NUMERIC(14,2) NOT NULL DEFAULT 0,
    modalidad VARCHAR(40) NOT NULL DEFAULT 'mensual',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    notas TEXT NOT NULL DEFAULT '',
    updated_by VARCHAR(120) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (empresa_id, id_usuario)
);

CREATE TABLE IF NOT EXISTS public.admin_sueldo_movimientos (
    id BIGSERIAL PRIMARY KEY,
    empresa_id BIGINT NOT NULL DEFAULT 1,
    id_usuario INT REFERENCES public.usuarios(id) ON DELETE SET NULL,
    periodo DATE NOT NULL,
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    tipo VARCHAR(24) NOT NULL DEFAULT 'retiro' CHECK (tipo IN ('retiro', 'pago', 'ajuste')),
    concepto VARCHAR(180) NOT NULL DEFAULT '',
    monto NUMERIC(14,2) NOT NULL DEFAULT 0,
    notas TEXT NOT NULL DEFAULT '',
    created_by VARCHAR(120) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.admin_obligaciones_fiscales (
    id BIGSERIAL PRIMARY KEY,
    empresa_id BIGINT NOT NULL DEFAULT 1,
    impuesto VARCHAR(80) NOT NULL,
    periodo DATE NOT NULL,
    vencimiento DATE NOT NULL,
    monto_estimado NUMERIC(14,2) NOT NULL DEFAULT 0,
    estado VARCHAR(32) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagado', 'vencido', 'revisar')),
    fuente VARCHAR(80) NOT NULL DEFAULT 'manual',
    notas TEXT NOT NULL DEFAULT '',
    created_by VARCHAR(120) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_socios_empresa
    ON public.admin_socios (empresa_id, activo, nombre);

CREATE INDEX IF NOT EXISTS idx_admin_dividendos_empresa_periodo
    ON public.admin_dividendos (empresa_id, periodo DESC, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_admin_sueldos_config_empresa
    ON public.admin_sueldos_config (empresa_id, activo, id_usuario);

CREATE INDEX IF NOT EXISTS idx_admin_sueldo_movimientos_empresa_periodo
    ON public.admin_sueldo_movimientos (empresa_id, periodo DESC, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_admin_obligaciones_fiscales_empresa_vencimiento
    ON public.admin_obligaciones_fiscales (empresa_id, estado, vencimiento);

ALTER TABLE public.admin_socios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_dividendos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_sueldos_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_sueldo_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_obligaciones_fiscales ENABLE ROW LEVEL SECURITY;
