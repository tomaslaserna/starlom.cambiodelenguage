ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand text;

CREATE INDEX IF NOT EXISTS products_empresa_brand_idx
  ON public.products (empresa_id, brand)
  WHERE active = true AND brand IS NOT NULL AND btrim(brand) <> '';
