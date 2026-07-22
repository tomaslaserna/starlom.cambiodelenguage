-- Borrado excepcional de registros operativos.
-- Es sensible y se concede por perfil, sin heredarlo por rol.

INSERT INTO public.app_permissions (key, module, action, label, sensitive)
VALUES ('registros.borrar', 'registros', 'borrar', 'Borrar ventas, compras y pedidos', TRUE)
ON CONFLICT (key) DO UPDATE
SET module = EXCLUDED.module,
    action = EXCLUDED.action,
    label = EXCLUDED.label,
    sensitive = EXCLUDED.sensitive;

INSERT INTO public.profile_permissions (profile_id, empresa_id, permission_key, granted_by)
SELECT profile_id, 1, 'registros.borrar', '5bc04a0b-d012-40df-a61d-8924d509dde4'::uuid
FROM (
  VALUES
    ('5bc04a0b-d012-40df-a61d-8924d509dde4'::uuid), -- Tomi Laserna
    ('a486fbfe-243c-4954-8ae9-6dcd9df89278'::uuid)  -- Augusto Finocchietti (perfil activo)
) AS allowed_profiles(profile_id)
WHERE EXISTS (
  SELECT 1
  FROM public.usuario_empresa ue
  WHERE ue.id_usuario = allowed_profiles.profile_id
    AND ue.empresa_id = 1
    AND ue.activo = TRUE
)
ON CONFLICT (profile_id, empresa_id, permission_key) DO NOTHING;
