-- Capacidades de lectura ampliada para vendedores principales.
-- Son permisos no sensibles y no habilitan acciones sobre ventas, pedidos o cobranzas.

INSERT INTO public.app_permissions (key, module, action, label, sensitive)
VALUES
  ('clientes.ver_todos', 'clientes', 'ver_todos', 'Ver todos los clientes', FALSE),
  ('ventas.ver_solo_lectura', 'ventas', 'ver_solo_lectura', 'Ver registro de ventas sin operar', FALSE),
  ('cobranzas.ver_solo_lectura', 'cobranzas', 'ver_solo_lectura', 'Ver cuentas corrientes sin operar', FALSE)
ON CONFLICT (key) DO UPDATE
SET module = EXCLUDED.module,
    action = EXCLUDED.action,
    label = EXCLUDED.label,
    sensitive = EXCLUDED.sensitive;

INSERT INTO public.profile_permissions (profile_id, empresa_id, permission_key, granted_by)
SELECT lucas.id_usuario,
       lucas.empresa_id,
       permission.key,
       COALESCE(grantor.id_usuario, lucas.id_usuario)
FROM public.usuario_empresa lucas
JOIN public.profiles lucas_profile
  ON lucas_profile.id = lucas.id_usuario
CROSS JOIN (
  VALUES
    ('clientes.ver_todos'::text),
    ('ventas.ver_solo_lectura'::text),
    ('cobranzas.ver_solo_lectura'::text)
) AS permission(key)
LEFT JOIN LATERAL (
  SELECT ue.id_usuario
  FROM public.usuario_empresa ue
  JOIN public.profiles profile ON profile.id = ue.id_usuario
  WHERE ue.empresa_id = lucas.empresa_id
    AND ue.activo = TRUE
    AND ue.role::text IN ('administrador', 'jefe')
    AND LOWER(COALESCE(profile.username, '')) = 'augusto'
  LIMIT 1
) grantor ON TRUE
WHERE lucas.activo = TRUE
  AND lucas.role::text = 'vendedor'
  AND LOWER(COALESCE(lucas_profile.username, '')) = 'lucaslaserna'
ON CONFLICT (profile_id, empresa_id, permission_key) DO NOTHING;
