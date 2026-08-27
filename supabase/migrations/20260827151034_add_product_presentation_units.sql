ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS presentation_units integer NOT NULL DEFAULT 1;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_presentation_units_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_presentation_units_check
  CHECK (presentation_units BETWEEN 1 AND 9999) NOT VALID;

ALTER TABLE public.products
  VALIDATE CONSTRAINT products_presentation_units_check;

COMMENT ON COLUMN public.products.presentation_units IS
  'Cantidad de unidades de una presentación completa. Para clientes L2, cada presentación completa accede a L1; el excedente conserva L2.';
