-- Admin page permissions used by React pages.
-- Additive and idempotent: aligns page/API checks with app_permissions/role_permissions.

INSERT INTO public.app_permissions (key, module, action, label, sensitive)
VALUES
  ('admin.balance', 'admin', 'ver', 'Ver balance administrativo', TRUE),
  ('admin.cashflow', 'admin', 'ver', 'Ver cash flow administrativo', TRUE),
  ('admin.dividendos', 'admin', 'ver', 'Ver dividendos', TRUE),
  ('admin.movimientos', 'admin', 'ver', 'Ver movimientos administrativos', TRUE),
  ('admin.sueldos', 'admin', 'ver', 'Ver sueldos', TRUE)
ON CONFLICT (key) DO UPDATE
SET module = EXCLUDED.module,
    action = EXCLUDED.action,
    label = EXCLUDED.label,
    sensitive = EXCLUDED.sensitive;

INSERT INTO public.role_permissions (role, permission_key)
VALUES
  ('administrador'::public.user_role, 'admin.balance'),
  ('administrador'::public.user_role, 'admin.cashflow'),
  ('administrador'::public.user_role, 'admin.dividendos'),
  ('administrador'::public.user_role, 'admin.movimientos'),
  ('administrador'::public.user_role, 'admin.sueldos')
ON CONFLICT DO NOTHING;
