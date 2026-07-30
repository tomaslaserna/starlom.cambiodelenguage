-- Ofertas y combos: una oferta agrupa 1+ articulos con una regla de precio
-- (fijo o descuento %) y de vigencia/stock. Solo gestion en esta fase.

CREATE TABLE IF NOT EXISTS public.price_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  price_mode TEXT NOT NULL CHECK (price_mode IN ('fijo', 'descuento')),
  fixed_price NUMERIC,
  discount_percent NUMERIC,
  min_price NUMERIC,
  valid_from DATE,
  valid_to DATE,
  stock_limit INTEGER,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.price_offer_items (
  id BIGSERIAL PRIMARY KEY,
  offer_id UUID NOT NULL REFERENCES public.price_offers(id) ON DELETE CASCADE,
  empresa_id BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  quantity NUMERIC NOT NULL CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_price_offers_empresa ON public.price_offers (empresa_id, active);
CREATE INDEX IF NOT EXISTS idx_price_offer_items_offer ON public.price_offer_items (empresa_id, offer_id);

ALTER TABLE public.price_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_offer_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.price_offers FROM anon, authenticated;
REVOKE ALL ON TABLE public.price_offer_items FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.price_offer_items_id_seq FROM anon, authenticated;

DO $$
DECLARE
  t TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'starlim_app') THEN
    FOREACH t IN ARRAY ARRAY['price_offers', 'price_offer_items'] LOOP
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO starlim_app', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_starlim_app_tenant', t);
      EXECUTE format($policy$
        CREATE POLICY %I ON public.%I
        FOR ALL TO starlim_app
        USING (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint)
        WITH CHECK (empresa_id = NULLIF(current_setting('app.current_empresa_id', true), '')::bigint)
      $policy$, t || '_starlim_app_tenant', t);
    END LOOP;
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.price_offer_items_id_seq TO starlim_app';
  END IF;
END
$$;
