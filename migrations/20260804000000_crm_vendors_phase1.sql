BEGIN;

-- CRM para vendedores — Fase 1.

-- 1) Vendedor asignado ("a cargo") por cliente. Convive con clients.seller_name
--    (el que cierra la venta = cliente propio). Este campo = el que lo maneja.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS assigned_seller text;

-- 2) Comisión por vendedor (porcentaje), editable desde Gestion de vendedores.
--    El vendedor se identifica por string (username/full_name/seller_name), igual
--    que vendor_goals y vendors-management.ts. Se replica el patrón de RLS/grants
--    de vendor_goals (024) para que el rol de runtime starlim_app pueda accederla.
CREATE TABLE IF NOT EXISTS public.vendor_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id bigint NOT NULL DEFAULT 1,
  vendor text NOT NULL,
  commission_rate numeric NOT NULL DEFAULT 0,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, vendor)
);

ALTER TABLE public.vendor_commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendor_commissions_starlim_app_tenant ON public.vendor_commissions;
CREATE POLICY vendor_commissions_starlim_app_tenant ON public.vendor_commissions
  FOR ALL TO starlim_app
  USING (empresa_id = (NULLIF(current_setting('app.current_empresa_id', true), ''))::bigint)
  WITH CHECK (empresa_id = (NULLIF(current_setting('app.current_empresa_id', true), ''))::bigint);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_commissions TO starlim_app;

-- 3) Permiso del CRM (segundo mundo). No sensible: se puede otorgar por empleado
--    desde RR.HH. Los roles full-access (administrador/jefe) ya lo tienen. Se otorga
--    al rol vendedor por defecto porque el CRM es su herramienta.
INSERT INTO public.app_permissions (key, module, action, label, sensitive)
VALUES ('crm.ver', 'crm', 'ver', 'Ver CRM de vendedores', FALSE)
ON CONFLICT (key) DO UPDATE
SET module = EXCLUDED.module,
    action = EXCLUDED.action,
    label = EXCLUDED.label,
    sensitive = EXCLUDED.sensitive;

INSERT INTO public.role_permissions (role, permission_key)
VALUES ('vendedor'::public.user_role, 'crm.ver')
ON CONFLICT DO NOTHING;

COMMIT;
