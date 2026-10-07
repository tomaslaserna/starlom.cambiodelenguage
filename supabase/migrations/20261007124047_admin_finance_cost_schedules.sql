-- Administración V2: vigencia real para costos operativos.
-- Aditivo y compatible con los registros históricos de costos_operativos.

ALTER TABLE public.costos_operativos
  ADD COLUMN IF NOT EXISTS cost_type text,
  ADD COLUMN IF NOT EXISTS start_month date,
  ADD COLUMN IF NOT EXISTS duration_months integer,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';

UPDATE public.costos_operativos
SET cost_type = CASE
      WHEN lower(trim(coalesce(categoria, ''))) IN ('fijo', 'variable', 'unico', 'único')
        THEN CASE WHEN lower(trim(categoria)) = 'único' THEN 'unico' ELSE lower(trim(categoria)) END
      ELSE 'unico'
    END,
    start_month = date_trunc('month', coalesce(fecha, created_at::date, current_date))::date,
    duration_months = CASE
      WHEN lower(trim(coalesce(categoria, ''))) = 'fijo' THEN NULL
      ELSE 1
    END
WHERE cost_type IS NULL OR start_month IS NULL;

ALTER TABLE public.costos_operativos
  ALTER COLUMN cost_type SET DEFAULT 'unico',
  ALTER COLUMN cost_type SET NOT NULL,
  ALTER COLUMN start_month SET DEFAULT date_trunc('month', current_date)::date,
  ALTER COLUMN start_month SET NOT NULL,
  ALTER COLUMN duration_months SET DEFAULT 1;

ALTER TABLE public.costos_operativos
  DROP CONSTRAINT IF EXISTS costos_operativos_cost_type_check,
  DROP CONSTRAINT IF EXISTS costos_operativos_duration_months_check,
  DROP CONSTRAINT IF EXISTS costos_operativos_start_month_check;

ALTER TABLE public.costos_operativos
  ADD CONSTRAINT costos_operativos_cost_type_check
    CHECK (cost_type IN ('fijo', 'variable', 'unico')) NOT VALID,
  ADD CONSTRAINT costos_operativos_duration_months_check
    CHECK (duration_months IS NULL OR duration_months BETWEEN 1 AND 120) NOT VALID,
  ADD CONSTRAINT costos_operativos_start_month_check
    CHECK (start_month = date_trunc('month', start_month)::date) NOT VALID;

ALTER TABLE public.costos_operativos
  VALIDATE CONSTRAINT costos_operativos_cost_type_check;
ALTER TABLE public.costos_operativos
  VALIDATE CONSTRAINT costos_operativos_duration_months_check;
ALTER TABLE public.costos_operativos
  VALIDATE CONSTRAINT costos_operativos_start_month_check;

CREATE INDEX IF NOT EXISTS idx_costos_operativos_empresa_vigencia
  ON public.costos_operativos (empresa_id, active, start_month, duration_months);

CREATE TABLE IF NOT EXISTS public.admin_operating_cost_month_status (
  id bigserial PRIMARY KEY,
  empresa_id bigint NOT NULL,
  cost_id bigint NOT NULL REFERENCES public.costos_operativos(id) ON DELETE RESTRICT,
  month date NOT NULL,
  included boolean NOT NULL,
  notes text NOT NULL DEFAULT '',
  created_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_operating_cost_month_status_month_check
    CHECK (month = date_trunc('month', month)::date),
  CONSTRAINT admin_operating_cost_month_status_unique
    UNIQUE (empresa_id, cost_id, month)
);

CREATE INDEX IF NOT EXISTS idx_admin_operating_cost_month_status_company_month
  ON public.admin_operating_cost_month_status (empresa_id, month, included);

ALTER TABLE public.admin_operating_cost_month_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_operating_cost_month_status FROM anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.admin_operating_cost_month_status_id_seq FROM anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'starlim_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_operating_cost_month_status TO starlim_app';
    EXECUTE 'GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.admin_operating_cost_month_status_id_seq TO starlim_app';
  END IF;
END $$;

DROP POLICY IF EXISTS admin_operating_cost_month_status_company_context
  ON public.admin_operating_cost_month_status;
CREATE POLICY admin_operating_cost_month_status_company_context
  ON public.admin_operating_cost_month_status
  FOR ALL TO starlim_app
  USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint);

COMMENT ON COLUMN public.costos_operativos.duration_months IS
  'Cantidad de meses desde start_month. NULL significa indefinido y requiere confirmación mensual luego del primer mes.';
COMMENT ON TABLE public.admin_operating_cost_month_status IS
  'Confirmación o suspensión explícita de un costo programado para un mes específico.';
