ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS order_priority text NOT NULL DEFAULT 'media';

ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS sales_order_priority_check;

ALTER TABLE public.sales
  ADD CONSTRAINT sales_order_priority_check
  CHECK (order_priority IN ('baja', 'media', 'alta'));

COMMENT ON COLUMN public.sales.order_priority IS
  'Urgencia operativa seleccionada al cargar el pedido: baja, media o alta.';
