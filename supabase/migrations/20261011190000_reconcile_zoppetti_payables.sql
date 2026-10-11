-- Conciliación administrativa de ZOPPETTI al 2026-10-11.
--
-- La deuda confirmada se compone de:
--   FA 9-302764  $ 471.819,20
--   FA 9-302820  $ 453.042,69
--   FA 9-302879  $ 659.661,95
--   Saldo adicional informado  $ 247.072,18
-- Total pendiente: $ 1.831.596,02.
--
-- La FA 9-302737 por $ 267.595,00 queda fuera del saldo por la deducción
-- informada. Las compras históricas que ya no integran la deuda se saldan
-- solo a nivel financiero: no se eliminan compras, ítems ni movimientos de stock.

DO $$
DECLARE
  zoppetti_supplier_id UUID := 'a59c9940-f731-44c9-bff2-1710ed590113';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.suppliers
    WHERE id = zoppetti_supplier_id
      AND empresa_id = 1
      AND upper(display_name) = 'ZOPPETTI'
  ) THEN
    RAISE EXCEPTION 'No se encontró el proveedor ZOPPETTI esperado';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.audit_log
    WHERE empresa_id = 1
      AND action = 'supplier.payables_reconciled'
      AND new_data->>'reconciliationKey' = 'zoppetti-2026-10-11'
  ) THEN
    RETURN;
  END IF;

  -- Estas compras conservan íntegros sus purchase_items y stock_movements.
  UPDATE public.purchases
  SET paid_amount = total_amount,
      description = CASE
        WHEN COALESCE(description, '') ILIKE '%conciliación zoppetti 11/10/2026%'
          THEN description
        ELSE concat_ws(
          ' | ',
          NULLIF(BTRIM(description), ''),
          'Conciliación Zoppetti 11/10/2026: no integra deuda vigente; stock preservado'
        )
      END,
      updated_at = NOW()
  WHERE empresa_id = 1
    AND supplier_id = zoppetti_supplier_id
    AND id IN (
      'c5a95212-7efb-4a62-afba-126975c849bf'::uuid,
      '6eba6eb9-8055-4bf2-bb53-759f0d7d87a3'::uuid,
      '2b425c6d-ae34-4518-8283-26c8617293d1'::uuid
    );

  UPDATE public.purchases
  SET description = 'FA 9-302820',
      due_date = DATE '2026-10-09',
      updated_at = NOW()
  WHERE id = '8edf883a-6566-41ad-94e9-b52b6aecedb8'::uuid
    AND empresa_id = 1
    AND supplier_id = zoppetti_supplier_id
    AND total_amount = 453042.69;

  UPDATE public.purchases
  SET description = 'FA 9-302879',
      due_date = DATE '2026-10-20',
      updated_at = NOW()
  WHERE id = 'b99b794c-1651-46df-a688-199ed14dfd90'::uuid
    AND empresa_id = 1
    AND supplier_id = zoppetti_supplier_id
    AND total_amount = 659661.95;

  INSERT INTO public.purchases (
    id, supplier_id, description, total_amount, paid_amount,
    purchase_date, due_date, status, purchase_type, tax_mode,
    vat_rate, package_status, empresa_id
  ) VALUES (
    '0c8943a4-5a33-4708-998f-20ef4971d722'::uuid,
    zoppetti_supplier_id,
    'FA 9-302764',
    471819.20,
    0,
    DATE '2026-10-01',
    DATE '2026-10-01',
    'recibida',
    'compra',
    'con_iva',
    21,
    'revisado',
    1
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.purchases (
    id, supplier_id, description, total_amount, paid_amount,
    purchase_date, due_date, status, purchase_type, tax_mode,
    vat_rate, package_status, empresa_id
  ) VALUES (
    '36adc2b2-c1db-442b-baa5-9876588d4237'::uuid,
    zoppetti_supplier_id,
    'Saldo adicional Zoppetti conciliado al 11/10/2026',
    247072.18,
    0,
    DATE '2026-10-11',
    DATE '2026-10-11',
    'recibida',
    'compra',
    'con_iva',
    21,
    'revisado',
    1
  ) ON CONFLICT (id) DO NOTHING;

  IF (
    SELECT COALESCE(SUM(total_amount - paid_amount), 0)
    FROM public.purchases
    WHERE empresa_id = 1
      AND supplier_id = zoppetti_supplier_id
      AND status = 'recibida'
      AND total_amount > paid_amount
  ) <> 1831596.02 THEN
    RAISE EXCEPTION 'La conciliación de ZOPPETTI no cierra en $1.831.596,02';
  END IF;

  INSERT INTO public.audit_log (
    action, entity_table, entity_id, new_data, empresa_id
  ) VALUES (
    'supplier.payables_reconciled',
    'suppliers',
    zoppetti_supplier_id::text,
    jsonb_build_object(
      'reconciliationKey', 'zoppetti-2026-10-11',
      'confirmedOpenAmount', 1831596.02,
      'sourceImageAmount', 1852118.84,
      'additionalAmount', 247072.18,
      'deductedAmount', 267595.00,
      'deductedDocument', 'FA 9-302737',
      'stockPreserved', true
    ),
    1
  );
END $$;
