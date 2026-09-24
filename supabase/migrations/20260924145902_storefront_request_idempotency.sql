ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS storefront_request_key text;

CREATE UNIQUE INDEX IF NOT EXISTS quotes_empresa_storefront_request_key_uidx
  ON public.quotes (empresa_id, storefront_request_key)
  WHERE storefront_request_key IS NOT NULL;
