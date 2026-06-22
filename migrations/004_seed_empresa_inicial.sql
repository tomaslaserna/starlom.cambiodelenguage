-- Empresa inicial compatible con todos los datos actuales.

INSERT INTO public.empresas (id, nombre, slug, plan, activa)
VALUES (1, 'Starlim', 'starlim', 'base', TRUE)
ON CONFLICT (id) DO UPDATE
SET nombre = EXCLUDED.nombre,
    slug = EXCLUDED.slug,
    activa = TRUE,
    updated_at = CURRENT_TIMESTAMP;

SELECT setval(
    pg_get_serial_sequence('public.empresas', 'id'),
    GREATEST((SELECT COALESCE(MAX(id), 1) FROM public.empresas), 1),
    TRUE
);

INSERT INTO public.usuario_empresa (id_usuario, empresa_id, rango, activo)
SELECT id, 1, COALESCE(NULLIF(rango, ''), 'Minorista'), COALESCE(activo, 1) <> 0
FROM public.usuarios
ON CONFLICT (id_usuario, empresa_id) DO UPDATE
SET rango = EXCLUDED.rango,
    activo = EXCLUDED.activo,
    updated_at = CURRENT_TIMESTAMP;
