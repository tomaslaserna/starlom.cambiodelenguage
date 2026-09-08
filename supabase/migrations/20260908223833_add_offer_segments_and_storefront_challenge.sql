ALTER TABLE public.price_offers
  ADD COLUMN IF NOT EXISTS business_segment text;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS storefront_challenge_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS storefront_challenge_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS storefront_challenge_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS storefront_estimated_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS storefront_distance_km numeric(8,3);

CREATE INDEX IF NOT EXISTS price_offers_empresa_segment_idx
  ON public.price_offers (empresa_id, business_segment)
  WHERE active = true;

COMMENT ON COLUMN public.price_offers.business_segment IS
  'Rubro recomendado en tienda; NULL significa combo disponible para todos.';
COMMENT ON COLUMN public.quotes.storefront_challenge_eligible IS
  'Resultado de la validacion del Desafio Starlim al recibir la solicitud web.';
