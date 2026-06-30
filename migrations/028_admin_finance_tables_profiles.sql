-- Finance/admin support tables for the Supabase profiles-based schema.
-- Idempotent and additive: creates missing administrative tables used by metrics,
-- balance, treasury, salaries and dividends without recreating legacy usuarios.

CREATE TABLE IF NOT EXISTS public.costos_operativos (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL DEFAULT 1,
  concepto TEXT NOT NULL DEFAULT '',
  monto NUMERIC(14,2) NOT NULL DEFAULT 0,
  categoria TEXT NOT NULL DEFAULT '',
  fecha DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_costos_operativos_empresa_fecha
  ON public.costos_operativos (empresa_id, fecha DESC);

CREATE TABLE IF NOT EXISTS public.admin_socios (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL DEFAULT 1,
  nombre TEXT NOT NULL,
  participacion NUMERIC(8,4) NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  notas TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_socios_empresa
  ON public.admin_socios (empresa_id, activo, nombre);

CREATE TABLE IF NOT EXISTS public.admin_dividendos (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL DEFAULT 1,
  socio_id BIGINT REFERENCES public.admin_socios(id) ON DELETE SET NULL,
  periodo DATE NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo TEXT NOT NULL DEFAULT 'dividendo' CHECK (tipo IN ('dividendo', 'retiro', 'ajuste')),
  concepto TEXT NOT NULL DEFAULT '',
  monto NUMERIC(14,2) NOT NULL DEFAULT 0,
  notas TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_dividendos_empresa_periodo
  ON public.admin_dividendos (empresa_id, periodo DESC, fecha DESC);

CREATE TABLE IF NOT EXISTS public.admin_sueldos_config (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL DEFAULT 1,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  employee_name TEXT NOT NULL DEFAULT '',
  sueldo_mensual NUMERIC(14,2) NOT NULL DEFAULT 0,
  modalidad TEXT NOT NULL DEFAULT 'mensual',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  aguinaldo_aplica BOOLEAN NOT NULL DEFAULT TRUE,
  cargas_pct NUMERIC(7,4) NOT NULL DEFAULT 0,
  notas TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_sueldos_config_empresa
  ON public.admin_sueldos_config (empresa_id, activo, profile_id);

CREATE TABLE IF NOT EXISTS public.admin_sueldo_movimientos (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL DEFAULT 1,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  periodo DATE NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo TEXT NOT NULL DEFAULT 'retiro' CHECK (tipo IN ('retiro', 'pago', 'ajuste')),
  concepto TEXT NOT NULL DEFAULT '',
  monto NUMERIC(14,2) NOT NULL DEFAULT 0,
  notas TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_sueldo_movimientos_empresa_periodo
  ON public.admin_sueldo_movimientos (empresa_id, periodo DESC, fecha DESC);

CREATE TABLE IF NOT EXISTS public.admin_obligaciones_fiscales (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL DEFAULT 1,
  impuesto TEXT NOT NULL,
  periodo DATE NOT NULL,
  vencimiento DATE NOT NULL,
  monto_estimado NUMERIC(14,2) NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagado', 'vencido', 'revisar')),
  fuente TEXT NOT NULL DEFAULT 'manual',
  notas TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_obligaciones_fiscales_empresa_vencimiento
  ON public.admin_obligaciones_fiscales (empresa_id, estado, vencimiento);

CREATE TABLE IF NOT EXISTS public.admin_bank_accounts (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL DEFAULT 1,
  nombre TEXT NOT NULL,
  banco TEXT NOT NULL DEFAULT '',
  moneda TEXT NOT NULL DEFAULT 'ARS',
  tipo_cuenta TEXT NOT NULL DEFAULT '',
  alias_cuenta TEXT NOT NULL DEFAULT '',
  cbu_masked TEXT NOT NULL DEFAULT '',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_bank_accounts_empresa
  ON public.admin_bank_accounts (empresa_id, activo, nombre);

CREATE TABLE IF NOT EXISTS public.admin_bank_statement_lines (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL DEFAULT 1,
  bank_account_id BIGINT NOT NULL REFERENCES public.admin_bank_accounts(id) ON DELETE RESTRICT,
  fecha DATE NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  referencia TEXT NOT NULL DEFAULT '',
  debit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'matched', 'ignored')),
  notas TEXT NOT NULL DEFAULT '',
  imported_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((debit > 0 AND credit = 0 AND amount = -debit) OR (credit > 0 AND debit = 0 AND amount = credit))
);

CREATE INDEX IF NOT EXISTS idx_admin_bank_lines_empresa_fecha
  ON public.admin_bank_statement_lines (empresa_id, fecha DESC, status);

CREATE INDEX IF NOT EXISTS idx_admin_bank_lines_account
  ON public.admin_bank_statement_lines (empresa_id, bank_account_id, fecha DESC);

CREATE TABLE IF NOT EXISTS public.admin_bank_reconciliation_matches (
  id BIGSERIAL PRIMARY KEY,
  empresa_id BIGINT NOT NULL DEFAULT 1,
  statement_line_id BIGINT NOT NULL REFERENCES public.admin_bank_statement_lines(id) ON DELETE RESTRICT,
  payment_id UUID REFERENCES public.payments(id) ON DELETE RESTRICT,
  matched_amount NUMERIC(14,2) NOT NULL CHECK (matched_amount > 0),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'reversed')),
  notas TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (statement_line_id, payment_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_bank_matches_empresa_line
  ON public.admin_bank_reconciliation_matches (empresa_id, statement_line_id, status);
