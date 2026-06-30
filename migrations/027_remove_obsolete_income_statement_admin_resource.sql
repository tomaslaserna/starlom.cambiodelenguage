-- Remove obsolete admin resource for the removed Balance > Estado de resultados page.
-- The income statement data now lives inside Balance > Resumen.

DO $$
BEGIN
  IF to_regclass('public.admin_resources') IS NOT NULL THEN
    UPDATE public.admin_resources
    SET activo = FALSE,
        ruta = '/balance',
        updated_at = CURRENT_TIMESTAMP
    WHERE clave = 'admin.resultados';
  END IF;

  IF to_regclass('public.app_permisos') IS NOT NULL
     AND to_regclass('public.app_rol_permisos') IS NOT NULL THEN
    DELETE FROM public.app_rol_permisos rol_perm
    USING public.app_permisos permiso
    WHERE rol_perm.id_permiso = permiso.id
      AND permiso.clave IN ('admin.resultados.ver', 'admin.resultados.editar');
  END IF;

  IF to_regclass('public.app_permisos') IS NOT NULL THEN
    DELETE FROM public.app_permisos
    WHERE clave IN ('admin.resultados.ver', 'admin.resultados.editar');
  END IF;
END $$;
