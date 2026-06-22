-- Facturacion ARCA - cola de aprobacion Admin.
-- No crea tablas nuevas: completa el workbench fiscal existente.

INSERT INTO public.admin_resources (clave, nombre, descripcion, ruta, orden, sensible, fuente, activo)
VALUES (
    'admin.facturacion',
    'Facturacion',
    'Aprobacion Admin de facturas ARCA, IVA debito/credito y registro fiscal.',
    'facturacion.php',
    110,
    TRUE,
    'fiscal',
    TRUE
)
ON CONFLICT (clave) DO UPDATE
SET nombre = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion,
    ruta = EXCLUDED.ruta,
    orden = EXCLUDED.orden,
    sensible = EXCLUDED.sensible,
    fuente = EXCLUDED.fuente,
    activo = TRUE;

UPDATE public.admin_resources
SET activo = FALSE
WHERE clave = 'admin.obligaciones_fiscales';

INSERT INTO public.app_permisos (clave, modulo, accion, nombre)
VALUES
    ('admin.facturacion.ver', 'admin.facturacion', 'ver', 'Ver Facturacion fiscal'),
    ('admin.facturacion.editar', 'admin.facturacion', 'editar', 'Preparar facturacion fiscal'),
    ('admin.facturacion.ver_sensible', 'admin.facturacion', 'ver_sensible', 'Ver datos fiscales sensibles'),
    ('admin.facturacion.editar_sensible', 'admin.facturacion', 'editar_sensible', 'Editar datos fiscales sensibles')
ON CONFLICT (clave) DO UPDATE
SET modulo = EXCLUDED.modulo,
    accion = EXCLUDED.accion,
    nombre = EXCLUDED.nombre;

INSERT INTO public.app_rol_permisos (id_rol, id_permiso)
SELECT r.id, p.id
FROM public.app_roles r
JOIN public.app_permisos p ON p.clave LIKE 'admin.facturacion.%'
WHERE r.clave = 'Admin'
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_billing_document_approval_queue
    ON public.billing_document (company_id, status, created_at, id)
    WHERE status IN ('ready_for_validation','pending_authorization','rejected','validation_failed');

COMMENT ON INDEX public.idx_billing_document_approval_queue IS
    'Acelera la cola de aprobacion ARCA visible en Administracion > Facturacion.';
