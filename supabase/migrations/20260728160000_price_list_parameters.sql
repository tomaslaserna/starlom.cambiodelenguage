-- Parámetros de cada lista de precios: cómo deriva su precio, quién accede y
-- reglas de uso. La derivación recalcula los multiplicadores por categoría
-- (margenes_listas), que es lo que ya lee todo el cálculo de precios.

ALTER TABLE public.listas_precio
  ADD COLUMN IF NOT EXISTS derivation_type TEXT NOT NULL DEFAULT 'costo',
  ADD COLUMN IF NOT EXISTS parent_list_id BIGINT,
  ADD COLUMN IF NOT EXISTS percentage NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS allowed_roles TEXT[],
  ADD COLUMN IF NOT EXISTS valid_from DATE,
  ADD COLUMN IF NOT EXISTS valid_to DATE,
  ADD COLUMN IF NOT EXISTS requires_authorization BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admits_offers BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS floor_factor NUMERIC;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'listas_precio_derivation_type_check'
  ) THEN
    ALTER TABLE public.listas_precio
      ADD CONSTRAINT listas_precio_derivation_type_check
      CHECK (derivation_type IN ('costo', 'lista'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'listas_precio_parent_fk'
  ) THEN
    ALTER TABLE public.listas_precio
      ADD CONSTRAINT listas_precio_parent_fk
      FOREIGN KEY (parent_list_id) REFERENCES public.listas_precio(id) ON DELETE SET NULL;
  END IF;
END
$$;
