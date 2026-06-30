ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS purchase_type text NOT NULL DEFAULT 'compra',
  ADD COLUMN IF NOT EXISTS package_status text NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS failure_description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_photo text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS purchases_empresa_type_idx
  ON public.purchases (empresa_id, purchase_type);

CREATE INDEX IF NOT EXISTS purchase_items_empresa_purchase_idx
  ON public.purchase_items (empresa_id, purchase_id);
