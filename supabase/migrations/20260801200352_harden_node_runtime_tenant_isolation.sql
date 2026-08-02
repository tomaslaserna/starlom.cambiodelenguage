-- Enforce tenant isolation for the server-side Node runtime.
--
-- The app must connect with starlim_app, never postgres. Set the role password
-- in the managed database and configure it as SUPABASE_DB_USER/PASS outside Git.
-- Every business request goes through withCompanyContext(), which sets
-- app.current_empresa_id transaction-locally before running queries.

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
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO starlim_app', current_database());
END
$$;

-- Supabase's managed `postgres` role can create the runtime role but cannot
-- persist per-role settings. RLS is enabled below and PostgreSQL defaults
-- `row_security` to on; query timeouts remain application/connection settings.

GRANT USAGE ON SCHEMA public TO starlim_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO starlim_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO starlim_app;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO starlim_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO starlim_app;

-- Browser-facing Data API roles never access ERP tables directly.
REVOKE USAGE ON SCHEMA public FROM anon, authenticated;
REVOKE CREATE ON SCHEMA public FROM anon, authenticated, service_role, PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM anon, authenticated, service_role;

DO $$
DECLARE
  table_record record;
  tenant_column text;
  policy_name text;
BEGIN
  FOR table_record IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname NOT LIKE 'pg_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_record.table_name);

    SELECT column_name
    INTO tenant_column
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = table_record.table_name
      AND column_name IN ('empresa_id', 'company_id')
    ORDER BY CASE column_name WHEN 'empresa_id' THEN 1 ELSE 2 END
    LIMIT 1;

    IF tenant_column IS NOT NULL THEN
      policy_name := table_record.table_name || '_starlim_app_tenant';
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, table_record.table_name);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO starlim_app
         USING (%I = NULLIF(current_setting(''app.current_empresa_id'', true), '''')::bigint)
         WITH CHECK (%I = NULLIF(current_setting(''app.current_empresa_id'', true), '''')::bigint)',
        policy_name,
        table_record.table_name,
        tenant_column,
        tenant_column
      );
    END IF;
  END LOOP;
END
$$;

-- Authentication has to resolve a user and their active company before a
-- transaction can set tenant context. These grants are limited to the Node
-- runtime role, which is not available to browser clients.
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    DROP POLICY IF EXISTS profiles_starlim_app_identity ON public.profiles;
    CREATE POLICY profiles_starlim_app_identity ON public.profiles
      FOR ALL TO starlim_app USING (true) WITH CHECK (true);
  END IF;

  IF to_regclass('public.empresas') IS NOT NULL THEN
    DROP POLICY IF EXISTS empresas_starlim_app_identity ON public.empresas;
    CREATE POLICY empresas_starlim_app_identity ON public.empresas
      FOR SELECT TO starlim_app USING (true);
  END IF;

  IF to_regclass('public.usuario_empresa') IS NOT NULL THEN
    DROP POLICY IF EXISTS usuario_empresa_starlim_app_identity_read ON public.usuario_empresa;
    CREATE POLICY usuario_empresa_starlim_app_identity_read ON public.usuario_empresa
      FOR SELECT TO starlim_app USING (true);
  END IF;

  IF to_regclass('public.app_permissions') IS NOT NULL THEN
    DROP POLICY IF EXISTS app_permissions_starlim_app_read ON public.app_permissions;
    CREATE POLICY app_permissions_starlim_app_read ON public.app_permissions
      FOR SELECT TO starlim_app USING (true);
  END IF;

  IF to_regclass('public.role_permissions') IS NOT NULL THEN
    DROP POLICY IF EXISTS role_permissions_starlim_app_read ON public.role_permissions;
    CREATE POLICY role_permissions_starlim_app_read ON public.role_permissions
      FOR SELECT TO starlim_app USING (true);
  END IF;
END
$$;
