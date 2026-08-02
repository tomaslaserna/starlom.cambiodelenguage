-- Pizarrón privado por usuario: post-its con posición y color, y las menciones
-- derivadas del texto. Un tablero por owner_username.

CREATE TABLE IF NOT EXISTS public.board_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  owner_username TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'amarillo',
  x NUMERIC NOT NULL DEFAULT 0,
  y NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.board_note_mentions (
  id BIGSERIAL PRIMARY KEY,
  note_id UUID NOT NULL REFERENCES public.board_notes(id) ON DELETE CASCADE,
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  mentioned_username TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_board_notes_owner ON public.board_notes (empresa_id, owner_username);
CREATE INDEX IF NOT EXISTS idx_board_note_mentions_note ON public.board_note_mentions (empresa_id, note_id);

ALTER TABLE public.board_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_note_mentions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.board_notes FROM anon, authenticated;
REVOKE ALL ON TABLE public.board_note_mentions FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.board_note_mentions_id_seq FROM anon, authenticated;

DO $$
DECLARE
  t TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'starlim_app') THEN
    FOREACH t IN ARRAY ARRAY['board_notes', 'board_note_mentions'] LOOP
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO starlim_app', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_starlim_app_tenant', t);
      EXECUTE format($policy$
        CREATE POLICY %I ON public.%I
        FOR ALL TO starlim_app
        USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint)
        WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint)
      $policy$, t || '_starlim_app_tenant', t);
    END LOOP;
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.board_note_mentions_id_seq TO starlim_app';
  END IF;
END
$$;
