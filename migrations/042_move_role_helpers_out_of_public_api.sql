-- Move legacy role helpers out of the exposed public API schema.
-- They remain SECURITY DEFINER because RLS policies need to read profiles,
-- but they are no longer callable as /rest/v1/rpc/* functions in public.

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM anon, PUBLIC;

CREATE OR REPLACE FUNCTION app_private.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT p.role
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.active = true
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app_private.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT COALESCE(app_private.current_user_role() = 'administrador'::public.user_role, false)
$$;

GRANT USAGE ON SCHEMA app_private TO authenticated;
REVOKE ALL ON FUNCTION app_private.current_user_role() FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION app_private.is_admin() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_admin() TO authenticated;

DO $$
DECLARE
  policy_record record;
  using_expr text;
  check_expr text;
  statement text;
BEGIN
  FOR policy_record IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        qual ILIKE '%current_user_role%'
        OR qual ILIKE '%is_admin%'
        OR with_check ILIKE '%current_user_role%'
        OR with_check ILIKE '%is_admin%'
      )
  LOOP
    using_expr := replace(replace(policy_record.qual, 'current_user_role()', 'app_private.current_user_role()'), 'is_admin()', 'app_private.is_admin()');
    check_expr := replace(replace(policy_record.with_check, 'current_user_role()', 'app_private.current_user_role()'), 'is_admin()', 'app_private.is_admin()');

    statement := format(
      'ALTER POLICY %I ON %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );

    IF using_expr IS NOT NULL THEN
      statement := statement || ' USING (' || using_expr || ')';
    END IF;

    IF check_expr IS NOT NULL THEN
      statement := statement || ' WITH CHECK (' || check_expr || ')';
    END IF;

    EXECUTE statement;
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.is_admin();
DROP FUNCTION IF EXISTS public.current_user_role();
