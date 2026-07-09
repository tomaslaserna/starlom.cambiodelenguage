-- Supabase security advisor hardening.
-- These tables are only used by the ERP server-side database connection.
-- Do not FORCE RLS here: the application uses a privileged server connection.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, service_role, PUBLIC;

REVOKE CREATE ON SCHEMA public FROM anon, authenticated, service_role, PUBLIC;
REVOKE USAGE ON SCHEMA public FROM anon, authenticated;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'delivery_runs',
    'delivery_run_sales',
    'delivery_documents',
    'delivery_document_items',
    'costos_operativos',
    'sales_admin_audit',
    'vendor_goals',
    'admin_socios',
    'admin_dividendos',
    'admin_sueldos_config',
    'admin_sueldo_movimientos',
    'admin_obligaciones_fiscales',
    'admin_bank_accounts',
    'admin_bank_statement_lines',
    'admin_bank_reconciliation_matches',
    'offers',
    'sales_internal_documents'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('public.vista_precios') IS NOT NULL THEN
    CREATE OR REPLACE VIEW public.vista_precios
    WITH (security_invoker = true)
    AS
    SELECT p.id,
           p.id_producto,
           p.codigo,
           p.nombre,
           p.costo,
           p.stock,
           ROUND(p.costo * m.precio_0, 2)         AS precio_0,
           ROUND(p.costo * m.precio_1, 2)         AS precio_1,
           ROUND(p.costo * m.precio_2, 2)         AS precio_2,
           ROUND(p.costo * m.precio_3, 2)         AS precio_3,
           ROUND(p.costo * m.margen_minorista, 2) AS precio_minorista,
           p.empresa_id
    FROM public.productos p
    LEFT JOIN public.margenes m
           ON m.empresa_id = p.empresa_id
          AND m.codigo = p.codigo
    WHERE p.empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::BIGINT;

    ALTER VIEW public.vista_precios SET (security_invoker = true);
    REVOKE ALL ON TABLE public.vista_precios FROM anon, authenticated, service_role;
  END IF;

  IF to_regclass('public.vista_stock_disponible') IS NOT NULL THEN
    CREATE OR REPLACE VIEW public.vista_stock_disponible
    WITH (security_invoker = true)
    AS
    SELECT p.id,
           p.id_producto,
           p.codigo,
           p.rubro,
           p.categoria,
           p.proveedor,
           p.nombre,
           p.costo,
           p.descripcion,
           p.imagen,
           p.stock                              AS stock_real,
           COALESCE(rsv.reservado, 0)           AS reservado,
           p.stock - COALESCE(rsv.reservado, 0) AS disponible,
           p.empresa_id
    FROM public.productos p
    LEFT JOIN (
        SELECT v.empresa_id, dv.id_producto, SUM(dv.cantidad) AS reservado
        FROM public.detalle_ventas dv
        JOIN public.ventas v ON v.id = dv.id_venta
        WHERE v.estado_pedido IN ('recibido', 'en_proceso', 'pendiente_entrega')
          AND COALESCE(v.stock_descontado, 0) = 0
        GROUP BY v.empresa_id, dv.id_producto
    ) rsv ON rsv.empresa_id = p.empresa_id
         AND rsv.id_producto = p.id
    WHERE p.empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::BIGINT;

    ALTER VIEW public.vista_stock_disponible SET (security_invoker = true);
    REVOKE ALL ON TABLE public.vista_stock_disponible FROM anon, authenticated, service_role;
  END IF;

  IF to_regclass('public.usuarios') IS NOT NULL THEN
    ALTER VIEW public.usuarios SET (security_invoker = true);
    REVOKE ALL ON TABLE public.usuarios FROM anon, authenticated, service_role;
  END IF;
END $$;

DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        qual ILIKE '%COALESCE(NULLIF(current_setting(''app.current_empresa_id''%'
        OR with_check ILIKE '%COALESCE(NULLIF(current_setting(''app.current_empresa_id''%'
        OR qual ILIKE '%app_private.current_empresa_id(1)%'
        OR with_check ILIKE '%app_private.current_empresa_id(1)%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_record.policyname, policy_record.schemaname, policy_record.tablename);
  END LOOP;
END $$;

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
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated, service_role', table_record.table_name);
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
      policy_name := table_record.table_name || '_company_context';
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, table_record.table_name);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I
           AS PERMISSIVE
           FOR ALL
           TO PUBLIC
           USING (%I = NULLIF(current_setting(''app.current_empresa_id'', true), '''')::BIGINT)
           WITH CHECK (%I = NULLIF(current_setting(''app.current_empresa_id'', true), '''')::BIGINT)',
        policy_name,
        table_record.table_name,
        tenant_column,
        tenant_column
      );
    END IF;

    tenant_column := NULL;
  END LOOP;
END $$;

DO $$
DECLARE
  sequence_record record;
  function_record record;
BEGIN
  FOR sequence_record IN
    SELECT c.relname AS sequence_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
  LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM anon, authenticated, service_role', sequence_record.sequence_name);
  END LOOP;

  FOR function_record IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated, service_role, PUBLIC', function_record.signature);
  END LOOP;
END $$;
