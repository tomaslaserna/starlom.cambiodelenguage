-- Conciliación administrativa de POLIDES al 2026-10-11.
--
-- La única obligación pendiente confirmada es la compra más reciente:
--   Compra del 08/10/2026  $ 548.336,98
--
-- Las tres compras anteriores se saldan solo a nivel financiero. No se
-- eliminan compras, ítems ni movimientos de stock.

DO $$
DECLARE
  polides_supplier_id UUID := '26b6925e-446c-4527-9563-d72be45aa46d';
  latest_purchase_id UUID := '738adc0d-bc5c-4bec-ba98-493e79446b38';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.suppliers
    WHERE id = polides_supplier_id
      AND empresa_id = 1
      AND upper(display_name) = 'POLIDES'
  ) THEN
    RAISE EXCEPTION 'No se encontró el proveedor POLIDES esperado';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.audit_log
    WHERE empresa_id = 1
      AND action = 'supplier.payables_reconciled'
      AND new_data->>'reconciliationKey' = 'polides-2026-10-11'
  ) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.purchases
    WHERE id = latest_purchase_id
      AND empresa_id = 1
      AND supplier_id = polides_supplier_id
      AND purchase_date = DATE '2026-10-08'
      AND total_amount = 548336.98
  ) THEN
    RAISE EXCEPTION 'La última compra de POLIDES no coincide con la conciliación esperada';
  END IF;

  UPDATE public.purchases
  SET paid_amount = total_amount,
      description = CASE
        WHEN COALESCE(description, '') ILIKE '%conciliación polides 11/10/2026%'
          THEN description
        ELSE concat_ws(
          ' | ',
          NULLIF(BTRIM(description), ''),
          'Conciliación Polides 11/10/2026: no integra deuda vigente; stock preservado'
        )
      END,
      updated_at = NOW()
  WHERE empresa_id = 1
    AND supplier_id = polides_supplier_id
    AND id IN (
      '35b69f5c-5c15-413f-a552-2957395c7679'::uuid,
      'ce68d9cc-2276-434f-92bf-fde2045927b8'::uuid,
      '08492476-5bf8-41ea-9951-464b6d2ee793'::uuid
    );

  UPDATE public.purchases
  SET description = CASE
        WHEN NULLIF(BTRIM(description), '') IS NULL
          THEN 'Última factura POLIDES registrada 08/10/2026'
        ELSE description
      END,
      updated_at = NOW()
  WHERE id = latest_purchase_id
    AND empresa_id = 1
    AND supplier_id = polides_supplier_id;

  IF (
    SELECT COUNT(*)
    FROM public.purchases
    WHERE empresa_id = 1
      AND supplier_id = polides_supplier_id
      AND status = 'recibida'
      AND total_amount > paid_amount
  ) <> 1 THEN
    RAISE EXCEPTION 'La conciliación de POLIDES no dejó una única obligación abierta';
  END IF;

  IF (
    SELECT COALESCE(SUM(total_amount - paid_amount), 0)
    FROM public.purchases
    WHERE empresa_id = 1
      AND supplier_id = polides_supplier_id
      AND status = 'recibida'
      AND total_amount > paid_amount
  ) <> 548336.98 THEN
    RAISE EXCEPTION 'La conciliación de POLIDES no cierra en $548.336,98';
  END IF;

  INSERT INTO public.audit_log (
    action, entity_table, entity_id, new_data, empresa_id
  ) VALUES (
    'supplier.payables_reconciled',
    'suppliers',
    polides_supplier_id::text,
    jsonb_build_object(
      'reconciliationKey', 'polides-2026-10-11',
      'previousOpenAmount', 2288391.85,
      'reconciledHistoricalAmount', 1740054.87,
      'confirmedOpenAmount', 548336.98,
      'confirmedOpenPurchaseId', latest_purchase_id,
      'confirmedOpenPurchaseDate', '2026-10-08',
      'stockPreserved', true
    ),
    1
  );
END $$;
