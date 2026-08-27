CREATE TABLE public.supervisor_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  message JSONB NOT NULL,
  sequence_index INTEGER NOT NULL CHECK (sequence_index >= 0),
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),
  CONSTRAINT supervisor_chat_messages_identity_key
    UNIQUE (empresa_id, user_id, message_id)
);

CREATE INDEX supervisor_chat_messages_user_idx
  ON public.supervisor_chat_messages (empresa_id, user_id, sequence_index);

CREATE INDEX supervisor_chat_messages_profile_fk_idx
  ON public.supervisor_chat_messages (user_id);

CREATE INDEX supervisor_chat_messages_expiry_idx
  ON public.supervisor_chat_messages (expires_at);

ALTER TABLE public.supervisor_chat_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.supervisor_chat_messages FROM anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.supervisor_chat_messages TO starlim_app;

CREATE POLICY supervisor_chat_messages_starlim_app_tenant
  ON public.supervisor_chat_messages
  FOR ALL
  TO starlim_app
  USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint);
