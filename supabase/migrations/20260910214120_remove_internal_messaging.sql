-- Apply only after the application release that removes internal messaging.
-- Version matches the migration applied to STARLIM ERP on 2026-09-10.
-- Delete objects using the Storage API first; never delete storage.objects rows.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.objects WHERE name LIKE 'mensajes/%') THEN
    RAISE EXCEPTION 'Remove internal messaging objects through the Storage API before applying this migration';
  END IF;
END $$;

-- Dependency-safe order, deliberately without CASCADE: unexpected dependencies
-- must abort the migration rather than remove another business feature.
DROP TABLE IF EXISTS public.mensaje_adjuntos;
DROP TABLE IF EXISTS public.mensaje_cargas;
DROP TABLE IF EXISTS public.mensajes;

DELETE FROM public.profile_permissions
WHERE permission_key IN ('mensajes.ver', 'mensajes.crear');
DELETE FROM public.role_permissions
WHERE permission_key IN ('mensajes.ver', 'mensajes.crear');
DELETE FROM public.app_permissions
WHERE key IN ('mensajes.ver', 'mensajes.crear');
