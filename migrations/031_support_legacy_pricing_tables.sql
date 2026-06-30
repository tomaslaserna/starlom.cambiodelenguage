-- Compatibility tables for pricing screens that still use legacy Spanish names.
-- They are seeded from the current Supabase catalog so products/pricing can render.

CREATE TABLE IF NOT EXISTS public.rubros (
  codigo TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.margenes (
  codigo TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  precio_0 NUMERIC NOT NULL DEFAULT 1,
  precio_1 NUMERIC NOT NULL DEFAULT 1,
  precio_2 NUMERIC NOT NULL DEFAULT 1,
  precio_3 NUMERIC NOT NULL DEFAULT 1,
  margen_minorista NUMERIC NOT NULL DEFAULT 1,
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.listas_precio (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  activa INTEGER NOT NULL DEFAULT 1,
  orden INTEGER NOT NULL DEFAULT 0,
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.margenes_listas (
  codigo TEXT NOT NULL REFERENCES public.margenes(codigo) ON DELETE CASCADE,
  lista_id BIGINT NOT NULL REFERENCES public.listas_precio(id) ON DELETE CASCADE,
  multiplicador NUMERIC NOT NULL DEFAULT 1,
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (codigo, lista_id)
);

CREATE INDEX IF NOT EXISTS idx_rubros_empresa_codigo
  ON public.rubros (empresa_id, codigo);
CREATE INDEX IF NOT EXISTS idx_margenes_empresa_codigo
  ON public.margenes (empresa_id, codigo);
CREATE INDEX IF NOT EXISTS idx_listas_precio_empresa_activa
  ON public.listas_precio (empresa_id, activa, orden, nombre);
CREATE INDEX IF NOT EXISTS idx_margenes_listas_empresa_lista
  ON public.margenes_listas (empresa_id, lista_id, codigo);

ALTER TABLE public.rubros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.margenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listas_precio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.margenes_listas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'rubros' AND policyname = 'rubros_company_context'
  ) THEN
    CREATE POLICY rubros_company_context ON public.rubros
      FOR ALL
      USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::BIGINT)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::BIGINT);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'margenes' AND policyname = 'margenes_company_context'
  ) THEN
    CREATE POLICY margenes_company_context ON public.margenes
      FOR ALL
      USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::BIGINT)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::BIGINT);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'listas_precio' AND policyname = 'listas_precio_company_context'
  ) THEN
    CREATE POLICY listas_precio_company_context ON public.listas_precio
      FOR ALL
      USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::BIGINT)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::BIGINT);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'margenes_listas' AND policyname = 'margenes_listas_company_context'
  ) THEN
    CREATE POLICY margenes_listas_company_context ON public.margenes_listas
      FOR ALL
      USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::BIGINT)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::BIGINT);
  END IF;
END $$;

WITH product_categories AS (
  SELECT
    empresa_id,
    COALESCE(NULLIF(category, ''), NULLIF(category_code, ''), 'Sin categoria') AS nombre,
    CASE
      WHEN NULLIF(REGEXP_REPLACE(UPPER(COALESCE(category_code, '')), '[^A-Z0-9]', '', 'g'), '') IS NOT NULL
        THEN LEFT(REGEXP_REPLACE(UPPER(category_code), '[^A-Z0-9]', '', 'g'), 10)
      ELSE 'CAT' || UPPER(SUBSTRING(MD5(COALESCE(category, 'Sin categoria')) FROM 1 FOR 7))
    END AS codigo,
    LEAST(
      9.99,
      GREATEST(
        1,
        COALESCE(AVG(sale_price / NULLIF(cost, 0)) FILTER (WHERE cost > 0 AND sale_price > 0), 1)
      )
    ) AS multiplicador
  FROM public.products
  WHERE empresa_id IS NOT NULL
  GROUP BY empresa_id, category, category_code
),
deduped_categories AS (
  SELECT DISTINCT ON (codigo)
    codigo,
    LEFT(nombre, 100) AS nombre,
    multiplicador,
    empresa_id
  FROM product_categories
  WHERE codigo IS NOT NULL AND codigo <> ''
  ORDER BY codigo, empresa_id
)
INSERT INTO public.rubros (codigo, nombre, empresa_id)
SELECT codigo, nombre, empresa_id
FROM deduped_categories
ON CONFLICT (codigo) DO NOTHING;

WITH product_categories AS (
  SELECT
    empresa_id,
    COALESCE(NULLIF(category, ''), NULLIF(category_code, ''), 'Sin categoria') AS nombre,
    CASE
      WHEN NULLIF(REGEXP_REPLACE(UPPER(COALESCE(category_code, '')), '[^A-Z0-9]', '', 'g'), '') IS NOT NULL
        THEN LEFT(REGEXP_REPLACE(UPPER(category_code), '[^A-Z0-9]', '', 'g'), 10)
      ELSE 'CAT' || UPPER(SUBSTRING(MD5(COALESCE(category, 'Sin categoria')) FROM 1 FOR 7))
    END AS codigo,
    LEAST(
      9.99,
      GREATEST(
        1,
        COALESCE(AVG(sale_price / NULLIF(cost, 0)) FILTER (WHERE cost > 0 AND sale_price > 0), 1)
      )
    ) AS multiplicador
  FROM public.products
  WHERE empresa_id IS NOT NULL
  GROUP BY empresa_id, category, category_code
),
deduped_categories AS (
  SELECT DISTINCT ON (codigo)
    codigo,
    LEFT(nombre, 100) AS nombre,
    multiplicador,
    empresa_id
  FROM product_categories
  WHERE codigo IS NOT NULL AND codigo <> ''
  ORDER BY codigo, empresa_id
)
INSERT INTO public.margenes (
  codigo, nombre, precio_0, precio_1, precio_2, precio_3, margen_minorista, empresa_id
)
SELECT
  codigo,
  nombre,
  multiplicador,
  multiplicador,
  multiplicador,
  multiplicador,
  multiplicador,
  empresa_id
FROM deduped_categories
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.listas_precio (nombre, activa, orden, empresa_id)
SELECT 'General', 1, 1, e.id
FROM public.empresas e
WHERE EXISTS (SELECT 1 FROM public.products p WHERE p.empresa_id = e.id)
  AND NOT EXISTS (
    SELECT 1 FROM public.listas_precio lp WHERE lp.empresa_id = e.id AND lp.nombre = 'General'
  );

INSERT INTO public.margenes_listas (codigo, lista_id, multiplicador, empresa_id)
SELECT m.codigo, lp.id, 1, m.empresa_id
FROM public.margenes m
JOIN public.listas_precio lp ON lp.empresa_id = m.empresa_id AND lp.activa = 1
ON CONFLICT (codigo, lista_id) DO NOTHING;
