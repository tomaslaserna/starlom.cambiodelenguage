BEGIN;

-- Keep the per-employee permission editor aligned with the consolidated
-- Administration and Finance experience. Read permissions retain their
-- historical keys for backwards compatibility; write permissions are explicit.
INSERT INTO public.app_permissions (key, module, action, label, sensitive)
VALUES
  ('admin.balance', 'Administración · Control y patrimonio', 'ver', 'Ver control y patrimonio', TRUE),
  ('admin.balance.editar', 'Administración · Control y patrimonio', 'editar', 'Cerrar o reabrir períodos', TRUE),
  ('admin.metricas', 'Administración · Resultados', 'ver', 'Ver resultados y rentabilidad', TRUE),
  ('admin.metricas.editar', 'Administración · Resultados', 'editar', 'Gestionar costos operativos', TRUE),
  ('admin.tesoreria', 'Administración · Tesorería', 'ver', 'Ver tesorería y conciliación', TRUE),
  ('admin.tesoreria.editar', 'Administración · Tesorería', 'editar', 'Operar tesorería y conciliación', TRUE),
  ('admin.cashflow', 'Administración · Tesorería', 'ver', 'Ver proyección de caja', TRUE),
  ('admin.cuentas_por_pagar', 'Administración · Obligaciones', 'ver', 'Ver obligaciones por pagar', TRUE),
  ('admin.cuentas_por_pagar.editar', 'Administración · Obligaciones', 'editar', 'Registrar obligaciones manuales', TRUE),
  ('admin.sueldos', 'RR. HH. · Remuneraciones', 'ver', 'Ver sueldos', TRUE),
  ('admin.sueldos.editar', 'RR. HH. · Remuneraciones', 'editar', 'Gestionar sueldos', TRUE),
  ('admin.dividendos', 'Administración · Socios', 'ver', 'Ver dividendos', TRUE),
  ('admin.dividendos.editar', 'Administración · Socios', 'editar', 'Gestionar dividendos', TRUE),
  ('admin.movimientos', 'Administración · Auditoría', 'ver', 'Ver movimientos y auditoría', TRUE)
ON CONFLICT (key) DO UPDATE
SET module = EXCLUDED.module,
    action = EXCLUDED.action,
    label = EXCLUDED.label,
    sensitive = EXCLUDED.sensitive;

-- Administrators keep the complete default set. Other roles only receive these
-- sensitive capabilities when they are granted explicitly to the employee.
INSERT INTO public.role_permissions (role, permission_key)
SELECT 'administrador'::public.user_role, permission_key
FROM unnest(ARRAY[
  'admin.balance',
  'admin.balance.editar',
  'admin.metricas',
  'admin.metricas.editar',
  'admin.tesoreria',
  'admin.tesoreria.editar',
  'admin.cashflow',
  'admin.cuentas_por_pagar',
  'admin.cuentas_por_pagar.editar',
  'admin.sueldos',
  'admin.sueldos.editar',
  'admin.dividendos',
  'admin.dividendos.editar',
  'admin.movimientos'
]) AS permissions(permission_key)
ON CONFLICT DO NOTHING;

COMMIT;
