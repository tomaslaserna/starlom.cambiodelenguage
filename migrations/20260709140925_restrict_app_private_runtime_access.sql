-- Keep internal helper functions out of Supabase Data API roles.
-- The application runtime uses starlim_app over the server-side Postgres
-- connection; anon/authenticated must not call app_private helpers directly.

CREATE SCHEMA IF NOT EXISTS app_private;

REVOKE ALL ON SCHEMA app_private FROM anon, authenticated, PUBLIC;
GRANT USAGE ON SCHEMA app_private TO starlim_app;

DO $$
DECLARE
  function_record record;
BEGIN
  FOR function_record IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app_private'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated, PUBLIC', function_record.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO starlim_app', function_record.signature);
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app_private
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app_private
  GRANT EXECUTE ON FUNCTIONS TO starlim_app;
