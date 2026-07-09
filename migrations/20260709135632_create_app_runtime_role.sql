-- Least-privilege runtime role for the Node/Next.js server.
-- The password is intentionally not stored in Git. Set it after applying this
-- migration with:
--   ALTER ROLE starlim_app WITH PASSWORD '<deliver-privately>';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'starlim_app') THEN
    CREATE ROLE starlim_app
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS;
  ELSE
    ALTER ROLE starlim_app
      WITH LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END $$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO starlim_app', current_database());
END $$;

CREATE SCHEMA IF NOT EXISTS app_private;

ALTER ROLE starlim_app SET search_path TO public;
ALTER ROLE starlim_app SET statement_timeout TO '30s';
ALTER ROLE starlim_app SET idle_in_transaction_session_timeout TO '15s';
ALTER ROLE starlim_app SET lock_timeout TO '5s';
ALTER ROLE starlim_app SET row_security TO on;

GRANT USAGE ON SCHEMA public TO starlim_app;
GRANT USAGE ON SCHEMA app_private TO starlim_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO starlim_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO starlim_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app_private TO starlim_app;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO starlim_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO starlim_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app_private
  GRANT EXECUTE ON FUNCTIONS TO starlim_app;

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS profiles_starlim_app_identity_read ON public.profiles';
    EXECUTE 'CREATE POLICY profiles_starlim_app_identity_read ON public.profiles
      FOR SELECT TO starlim_app
      USING (true)';
  END IF;

  IF to_regclass('public.usuario_empresa') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.usuario_empresa ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS usuario_empresa_starlim_app_identity_read ON public.usuario_empresa';
    EXECUTE 'CREATE POLICY usuario_empresa_starlim_app_identity_read ON public.usuario_empresa
      FOR SELECT TO starlim_app
      USING (true)';
  END IF;

  IF to_regclass('public.empresas') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS empresas_starlim_app_identity_read ON public.empresas';
    EXECUTE 'CREATE POLICY empresas_starlim_app_identity_read ON public.empresas
      FOR SELECT TO starlim_app
      USING (true)';
  END IF;

  IF to_regclass('public.app_permissions') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.app_permissions ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS app_permissions_starlim_app_read ON public.app_permissions';
    EXECUTE 'CREATE POLICY app_permissions_starlim_app_read ON public.app_permissions
      FOR SELECT TO starlim_app
      USING (true)';
  END IF;

  IF to_regclass('public.role_permissions') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS role_permissions_starlim_app_read ON public.role_permissions';
    EXECUTE 'CREATE POLICY role_permissions_starlim_app_read ON public.role_permissions
      FOR SELECT TO starlim_app
      USING (true)';
  END IF;
END $$;

COMMENT ON ROLE starlim_app IS
  'Least-privilege runtime role for the Star_lim app. Set its password outside Git.';
