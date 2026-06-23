-- Node workflow/navigation additions.
-- Aditivo: no borra datos y prepara funcionalidades nuevas de la app React/Node.

CREATE TABLE IF NOT EXISTS public.app_user_presence (
    empresa_id BIGINT NOT NULL DEFAULT 1,
    id_usuario INT NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    usuario VARCHAR(120) NOT NULL DEFAULT '',
    nombre VARCHAR(180) NOT NULL DEFAULT '',
    last_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    user_agent TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (empresa_id, id_usuario)
);

CREATE INDEX IF NOT EXISTS idx_app_user_presence_online
    ON public.app_user_presence (empresa_id, last_seen DESC);

CREATE TABLE IF NOT EXISTS public.app_solicitudes (
    id BIGSERIAL PRIMARY KEY,
    empresa_id BIGINT NOT NULL DEFAULT 1,
    tipo VARCHAR(48) NOT NULL,
    origen_tipo VARCHAR(80) NOT NULL DEFAULT '',
    origen_id BIGINT,
    titulo VARCHAR(180) NOT NULL DEFAULT '',
    detalle TEXT NOT NULL DEFAULT '',
    monto NUMERIC(14,2) NOT NULL DEFAULT 0,
    estado VARCHAR(24) NOT NULL DEFAULT 'pendiente'
        CHECK (estado IN ('pendiente', 'aprobada', 'rechazada', 'cancelada')),
    solicitante VARCHAR(120) NOT NULL DEFAULT '',
    resuelto_por VARCHAR(120) NOT NULL DEFAULT '',
    resuelto_at TIMESTAMP,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_app_solicitudes_empresa_estado
    ON public.app_solicitudes (empresa_id, estado, created_at DESC);

ALTER TABLE public.mensajes
    ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'enviado',
    ADD COLUMN IF NOT EXISTS importancia VARCHAR(20) NOT NULL DEFAULT 'normal';

ALTER TABLE public.recordatorios
    ADD COLUMN IF NOT EXISTS recurrencia_tipo VARCHAR(20) NOT NULL DEFAULT 'unica',
    ADD COLUMN IF NOT EXISTS recurrencia_dia_mes SMALLINT,
    ADD COLUMN IF NOT EXISTS recurrencia_dia_semana SMALLINT,
    ADD COLUMN IF NOT EXISTS recurrencia_hora TIME,
    ADD COLUMN IF NOT EXISTS recurrencia_activa BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.tareas_asignadas
    ADD COLUMN IF NOT EXISTS recurrencia_tipo VARCHAR(20) NOT NULL DEFAULT 'unica',
    ADD COLUMN IF NOT EXISTS recurrencia_dia_mes SMALLINT,
    ADD COLUMN IF NOT EXISTS recurrencia_dia_semana SMALLINT,
    ADD COLUMN IF NOT EXISTS recurrencia_hora TIME,
    ADD COLUMN IF NOT EXISTS recurrencia_activa BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.admin_sueldos_config
    ADD COLUMN IF NOT EXISTS aguinaldo_aplica BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS cargas_pct NUMERIC(7,4) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.app_vendedor_metas (
    empresa_id BIGINT NOT NULL DEFAULT 1,
    vendedor VARCHAR(160) NOT NULL,
    periodo DATE NOT NULL,
    meta_ventas NUMERIC(14,2) NOT NULL DEFAULT 0,
    meta_clientes INT NOT NULL DEFAULT 0,
    notas TEXT NOT NULL DEFAULT '',
    updated_by VARCHAR(120) NOT NULL DEFAULT '',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (empresa_id, vendedor, periodo)
);

CREATE INDEX IF NOT EXISTS idx_app_vendedor_metas_periodo
    ON public.app_vendedor_metas (empresa_id, periodo DESC, vendedor);
