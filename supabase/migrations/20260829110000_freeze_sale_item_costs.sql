ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS unit_cost_snapshot numeric(14, 2),
  ADD COLUMN IF NOT EXISTS gross_profit_snapshot numeric(14, 2),
  ADD COLUMN IF NOT EXISTS margin_percent_snapshot numeric(9, 4),
  ADD COLUMN IF NOT EXISTS price_list_snapshot text,
  ADD COLUMN IF NOT EXISTS snapshot_at timestamptz;

COMMENT ON COLUMN public.sale_items.unit_price IS
  'Precio unitario congelado al registrar o editar el pedido; no depende de cambios posteriores del catalogo.';
COMMENT ON COLUMN public.sale_items.unit_cost_snapshot IS
  'Costo unitario congelado al registrar o editar el pedido.';
COMMENT ON COLUMN public.sale_items.gross_profit_snapshot IS
  'Ganancia bruta congelada del renglon, despues de descuentos y antes de IVA.';
COMMENT ON COLUMN public.sale_items.margin_percent_snapshot IS
  'Margen bruto porcentual congelado del renglon.';
COMMENT ON COLUMN public.sale_items.price_list_snapshot IS
  'Lista de precios aplicada al renglon al momento del registro.';

UPDATE public.sale_items si
SET unit_cost_snapshot = ROUND(COALESCE(p.cost, 0), 2),
    gross_profit_snapshot = ROUND(si.total_amount - (si.quantity * COALESCE(p.cost, 0)), 2),
    margin_percent_snapshot = CASE
      WHEN si.total_amount > 0 THEN ROUND(
        ((si.total_amount - (si.quantity * COALESCE(p.cost, 0))) / si.total_amount) * 100,
        4
      )
      ELSE 0
    END,
    snapshot_at = COALESCE(si.snapshot_at, now())
FROM public.products p
WHERE p.id = si.product_id
  AND p.empresa_id = si.empresa_id
  AND si.unit_cost_snapshot IS NULL;

UPDATE public.sale_items
SET unit_cost_snapshot = COALESCE(unit_cost_snapshot, 0),
    gross_profit_snapshot = COALESCE(gross_profit_snapshot, total_amount),
    margin_percent_snapshot = COALESCE(
      margin_percent_snapshot,
      CASE WHEN total_amount > 0 THEN 100 ELSE 0 END
    ),
    snapshot_at = COALESCE(snapshot_at, now())
WHERE unit_cost_snapshot IS NULL
   OR gross_profit_snapshot IS NULL
   OR margin_percent_snapshot IS NULL
   OR snapshot_at IS NULL;

-- Las columnas quedan temporalmente anulables para que el despliegue sea compatible
-- con instancias anteriores de la aplicacion durante el rolling deploy.
ALTER TABLE public.sale_items
  ALTER COLUMN snapshot_at SET DEFAULT now();

ALTER TABLE public.sale_items
  DROP CONSTRAINT IF EXISTS sale_items_unit_cost_snapshot_nonnegative,
  ADD CONSTRAINT sale_items_unit_cost_snapshot_nonnegative
    CHECK (unit_cost_snapshot >= 0);
