-- Generic approval queue used by the admin approval center.

CREATE TABLE IF NOT EXISTS public.app_solicitudes (
  id BIGSERIAL PRIMARY KEY,
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL DEFAULT '',
  detalle TEXT NOT NULL DEFAULT '',
  monto NUMERIC NOT NULL DEFAULT 0,
  solicitante TEXT NOT NULL DEFAULT '',
  estado TEXT NOT NULL DEFAULT 'pendiente',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  resuelto_por TEXT,
  resuelto_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_app_solicitudes_empresa_estado_created
  ON public.app_solicitudes (empresa_id, estado, created_at DESC);

ALTER TABLE public.app_solicitudes ENABLE ROW LEVEL SECURITY;
