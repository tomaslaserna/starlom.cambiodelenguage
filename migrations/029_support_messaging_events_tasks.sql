-- Support tables still used by the app for integration events, messages and tasks.
-- Idempotent so it can be applied safely to databases that already have any part.

CREATE TABLE IF NOT EXISTS public.eventos_integracion (
  id BIGSERIAL PRIMARY KEY,
  tipo TEXT NOT NULL,
  datos JSONB NOT NULL DEFAULT '{}'::jsonb,
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mensajes (
  id BIGSERIAL PRIMARY KEY,
  de TEXT NOT NULL,
  para TEXT NOT NULL DEFAULT '',
  asunto TEXT NOT NULL,
  cuerpo TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'directo',
  importancia TEXT NOT NULL DEFAULT 'normal',
  estado TEXT NOT NULL DEFAULT 'enviado',
  leido INTEGER NOT NULL DEFAULT 0,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.recordatorios (
  id BIGSERIAL PRIMARY KEY,
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  prioridad TEXT NOT NULL DEFAULT 'normal',
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_limite TIMESTAMPTZ,
  fecha_envio TIMESTAMPTZ,
  usuario TEXT NOT NULL DEFAULT '',
  completado INTEGER NOT NULL DEFAULT 0,
  recurrencia_tipo TEXT NOT NULL DEFAULT 'unica',
  recurrencia_dia_mes INTEGER,
  recurrencia_dia_semana INTEGER,
  recurrencia_hora TEXT,
  recurrencia_activa BOOLEAN NOT NULL DEFAULT FALSE,
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.tareas_asignadas (
  id BIGSERIAL PRIMARY KEY,
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  prioridad TEXT NOT NULL DEFAULT 'normal',
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_limite TIMESTAMPTZ,
  fecha_envio TIMESTAMPTZ,
  asignado_por TEXT NOT NULL,
  asignado_a TEXT NOT NULL,
  completado INTEGER NOT NULL DEFAULT 0,
  mensaje_completado TEXT NOT NULL DEFAULT '',
  fecha_completado TIMESTAMPTZ,
  recurrencia_tipo TEXT NOT NULL DEFAULT 'unica',
  recurrencia_dia_mes INTEGER,
  recurrencia_dia_semana INTEGER,
  recurrencia_hora TEXT,
  recurrencia_activa BOOLEAN NOT NULL DEFAULT FALSE,
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE
);

CREATE OR REPLACE VIEW public.usuarios AS
SELECT
  p.id,
  COALESCE(NULLIF(p.username, ''), p.email) AS usuario,
  p.full_name AS nombre_completo,
  COALESCE(ue.role::text, p.role::text) AS rango,
  COALESCE(ue.activo, p.active, TRUE) AS activo,
  ue.empresa_id
FROM public.profiles p
LEFT JOIN public.usuario_empresa ue ON ue.id_usuario = p.id;

CREATE INDEX IF NOT EXISTS idx_eventos_integracion_empresa_id
  ON public.eventos_integracion (empresa_id);
CREATE INDEX IF NOT EXISTS idx_eventos_integracion_empresa_created
  ON public.eventos_integracion (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mensajes_empresa_para_fecha
  ON public.mensajes (empresa_id, para, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_mensajes_empresa_de_fecha
  ON public.mensajes (empresa_id, de, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_recordatorios_empresa_usuario
  ON public.recordatorios (empresa_id, usuario, completado, fecha_creacion DESC);
CREATE INDEX IF NOT EXISTS idx_tareas_empresa_asignado_a
  ON public.tareas_asignadas (empresa_id, asignado_a, completado, fecha_creacion DESC);
CREATE INDEX IF NOT EXISTS idx_tareas_empresa_asignado_por
  ON public.tareas_asignadas (empresa_id, asignado_por, completado, fecha_creacion DESC);

ALTER TABLE public.eventos_integracion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recordatorios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tareas_asignadas ENABLE ROW LEVEL SECURITY;
