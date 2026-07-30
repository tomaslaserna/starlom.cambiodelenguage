-- Private attachments for internal messages.
-- Uploads are staged before the message is created so the browser can upload
-- directly to Supabase Storage without crossing Vercel's request body limit.

CREATE TABLE IF NOT EXISTS public.mensaje_cargas (
  id UUID PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  usuario TEXT NOT NULL,
  bucket TEXT NOT NULL DEFAULT 'uploads',
  objeto_path TEXT NOT NULL UNIQUE,
  nombre_original TEXT NOT NULL,
  tipo_mime TEXT NOT NULL,
  tamano_bytes BIGINT NOT NULL CHECK (tamano_bytes > 0 AND tamano_bytes <= 20971520),
  creado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 hours'),
  consumido_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.mensaje_adjuntos (
  id BIGSERIAL PRIMARY KEY,
  mensaje_id BIGINT NOT NULL REFERENCES public.mensajes(id) ON DELETE CASCADE,
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  carga_id UUID NOT NULL UNIQUE REFERENCES public.mensaje_cargas(id),
  bucket TEXT NOT NULL,
  objeto_path TEXT NOT NULL UNIQUE,
  nombre_original TEXT NOT NULL,
  tipo_mime TEXT NOT NULL,
  tamano_bytes BIGINT NOT NULL CHECK (tamano_bytes > 0 AND tamano_bytes <= 20971520),
  creado_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mensaje_cargas_usuario_pendientes
  ON public.mensaje_cargas (empresa_id, usuario, expira_at DESC)
  WHERE consumido_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mensaje_adjuntos_mensaje
  ON public.mensaje_adjuntos (empresa_id, mensaje_id, creado_at ASC);

ALTER TABLE public.mensaje_cargas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensaje_adjuntos ENABLE ROW LEVEL SECURITY;

-- These tables are internal to the authenticated Node application. The
-- browser never reads their rows through the Supabase Data API.
REVOKE ALL ON TABLE public.mensaje_cargas FROM anon, authenticated;
REVOKE ALL ON TABLE public.mensaje_adjuntos FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.mensaje_adjuntos_id_seq FROM anon, authenticated;

-- The bucket stays private. Signed upload URLs are created by the application
-- and signed download URLs are issued only after checking message membership.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'uploads',
  'uploads',
  false,
  20971520,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
