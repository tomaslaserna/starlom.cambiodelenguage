-- "Banco": per-user (personal) and company-wide (shared) file storage.
-- Files live in a dedicated private bucket; these tables hold the folder tree,
-- the file registry (with byte sizes for quota accounting) and a staging table
-- for pending direct-to-Supabase uploads (mirrors mensaje_cargas).

CREATE TABLE IF NOT EXISTS public.bank_folders (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('personal', 'shared')),
  owner_username TEXT,
  name TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((scope = 'personal' AND owner_username IS NOT NULL)
      OR (scope = 'shared' AND owner_username IS NULL))
);

CREATE TABLE IF NOT EXISTS public.bank_files (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('personal', 'shared')),
  owner_username TEXT,
  folder_id BIGINT REFERENCES public.bank_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  object_path TEXT NOT NULL UNIQUE,
  mime TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((scope = 'personal' AND owner_username IS NOT NULL)
      OR (scope = 'shared' AND owner_username IS NULL))
);

CREATE TABLE IF NOT EXISTS public.bank_uploads (
  id UUID PRIMARY KEY,
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('personal', 'shared')),
  owner_username TEXT,
  folder_id BIGINT REFERENCES public.bank_folders(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  object_path TEXT NOT NULL UNIQUE,
  nombre_original TEXT NOT NULL,
  tipo_mime TEXT NOT NULL,
  created_by TEXT,
  creado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 hours'),
  consumido_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bank_folders_scope
  ON public.bank_folders (empresa_id, scope, owner_username);
CREATE INDEX IF NOT EXISTS idx_bank_files_scope
  ON public.bank_files (empresa_id, scope, owner_username, folder_id);
CREATE INDEX IF NOT EXISTS idx_bank_uploads_pending
  ON public.bank_uploads (empresa_id, owner_username, expira_at DESC)
  WHERE consumido_at IS NULL;

ALTER TABLE public.bank_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_uploads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.bank_folders FROM anon, authenticated;
REVOKE ALL ON TABLE public.bank_files FROM anon, authenticated;
REVOKE ALL ON TABLE public.bank_uploads FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.bank_folders_id_seq FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.bank_files_id_seq FROM anon, authenticated;

-- The least-privilege Node runtime connects as starlim_app and sets
-- app.current_empresa_id at the start of every transaction.
DO $$
DECLARE
  t TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'starlim_app') THEN
    FOREACH t IN ARRAY ARRAY['bank_folders', 'bank_files', 'bank_uploads'] LOOP
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO starlim_app', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_starlim_app_tenant', t);
      EXECUTE format($policy$
        CREATE POLICY %I ON public.%I
        FOR ALL TO starlim_app
        USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint)
        WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint)
      $policy$, t || '_starlim_app_tenant', t);
    END LOOP;
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.bank_folders_id_seq TO starlim_app';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.bank_files_id_seq TO starlim_app';
  END IF;
END
$$;

-- Private bucket for bank files. 25 MB per file; documents, spreadsheets and
-- images relevant to a staff member's role.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bank',
  'bank',
  false,
  26214400,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
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
