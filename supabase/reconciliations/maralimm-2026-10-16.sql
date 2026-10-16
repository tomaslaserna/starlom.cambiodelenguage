-- Conciliación de 15 compras y registro de cinco E-cheqs por instrucción de administración.
-- Ejecutar una vez; repetir conserva los registros por clave de auditoría.
DO $$
DECLARE
  company_id bigint := 1;
  maralimm_supplier_id uuid;
  santander_account_id bigint;
  previous_open_amount numeric(16,2);
  previous_purchases jsonb;
  documented_echeqs numeric(16,2) := 9200000.00;
  target_purchase_ids uuid[] := ARRAY['2ec482eb-48fa-4531-b5a2-e42a5b3117a3','5141667e-56b7-4ec2-906e-df0ce514216c','a4854f15-c146-4b71-bec4-0040dc8330ee','9f9d1d68-58f8-4fff-87dc-209f2a550d9e','8aee4005-4a5e-42e9-9848-bd6db766e466','ae10fdcc-32a3-40e0-a026-9751f766b93c','60e68060-79dd-4ae2-a9bc-765b36bf5040','82b88076-24a6-48dd-a360-6a8d07cdf893','930ea807-37e0-4751-a324-ffced8573a0f','4d8b11bf-a2f6-40e8-8044-36f9e1db3fd5','303c3587-a0ee-4d91-8af0-44b18d5797b3','589cc9bf-85b2-4629-9d90-3bf5b57df544','cd3f44e6-afdc-4b54-8466-5ccacb857002','93d7139e-2e47-40d9-b3f9-a33f9cf4ce74','262ef3c7-f9fa-4b65-90f9-780d23832110']::uuid[];
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.audit_log
    WHERE empresa_id = company_id
      AND action = 'supplier.payables_reconciled'
      AND new_data->>'reconciliationKey' = 'maralimm-2026-10-16'
  ) THEN
    RETURN;
  END IF;

  PERFORM id FROM public.purchases WHERE empresa_id = company_id AND id = ANY(target_purchase_ids) FOR UPDATE;
  IF (SELECT count(*) FROM public.purchases WHERE empresa_id = company_id AND id = ANY(target_purchase_ids) AND paid_amount = 0 AND status = 'recibida') <> 15 THEN
    RAISE EXCEPTION 'Las 15 compras verificadas cambiaron; conciliación cancelada';
  END IF;
  SELECT id INTO STRICT maralimm_supplier_id
  FROM public.suppliers
  WHERE empresa_id = company_id
    AND active = true
    AND upper(trim(display_name)) = 'MARALIMM';

  SELECT id INTO STRICT santander_account_id
  FROM public.admin_treasury_accounts
  WHERE empresa_id = company_id
    AND active = true
    AND upper(trim(name)) = 'SANTANDER';

  SELECT COALESCE(SUM(GREATEST(total_amount - paid_amount, 0)), 0)
    INTO previous_open_amount
  FROM public.purchases
  WHERE empresa_id = company_id
    AND supplier_id = maralimm_supplier_id
    AND id = ANY(target_purchase_ids);

  SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) INTO previous_purchases
  FROM public.purchases p
  WHERE p.empresa_id = company_id AND p.supplier_id = maralimm_supplier_id
    AND p.id = ANY(target_purchase_ids);

  IF previous_open_amount <> 10682538.51 THEN
    RAISE EXCEPTION 'El saldo MARALIMM cambió: esperado 10682538.51, encontrado %', previous_open_amount;
  END IF;



  INSERT INTO public.admin_outgoing_echeqs (
    empresa_id, cheque_number, beneficiary, beneficiary_cuit, account_id,
    due_date, amount, status, notes
  ) VALUES
    (company_id, '00000040', 'MARALIMM SAS', '30-71633069-5', santander_account_id, DATE '2026-10-28', 2000000.00, 'accepted', 'E-cheq emitido desde Santander · conciliación MARALIMM 16/10/2026'),
    (company_id, '00000039', 'MARALIMM SAS', '30-71633069-5', santander_account_id, DATE '2026-11-04', 2000000.00, 'accepted', 'E-cheq emitido desde Santander · conciliación MARALIMM 16/10/2026'),
    (company_id, '00000041', 'MARALIMM SAS', '30-71633069-5', santander_account_id, DATE '2026-11-11', 2000000.00, 'accepted', 'E-cheq emitido desde Santander · conciliación MARALIMM 16/10/2026'),
    (company_id, '00000043', 'MARALIMM SAS', '30-71633069-5', santander_account_id, DATE '2026-11-20', 1600000.00, 'issued', 'E-cheq emitido desde Santander · conciliación MARALIMM 16/10/2026'),
    (company_id, '00000042', 'MARALIMM SAS', '30-71633069-5', santander_account_id, DATE '2026-11-27', 1600000.00, 'issued', 'E-cheq emitido desde Santander · conciliación MARALIMM 16/10/2026');

  -- Conciliación financiera únicamente: se preservan compras, ítems y stock.
  UPDATE public.purchases
  SET paid_amount = total_amount,
      updated_at = now()
  WHERE empresa_id = company_id
    AND supplier_id = maralimm_supplier_id
    AND id = ANY(target_purchase_ids);

  IF (
    SELECT COALESCE(SUM(GREATEST(total_amount - paid_amount, 0)), 0)
    FROM public.purchases
    WHERE empresa_id = company_id
      AND supplier_id = maralimm_supplier_id
      AND id = ANY(target_purchase_ids)
  ) <> 0 THEN
    RAISE EXCEPTION 'La conciliación de MARALIMM no dejó saldo cero';
  END IF;

  INSERT INTO public.audit_log (action, entity_table, entity_id, old_data, new_data, empresa_id)
  VALUES (
    'supplier.payables_reconciled',
    'suppliers',
    maralimm_supplier_id::text,
    jsonb_build_object('purchases', previous_purchases),
    jsonb_build_object(
      'reconciliationKey', 'maralimm-2026-10-16',
      'previousOpenAmount', previous_open_amount,
      'confirmedOpenAmount', 0,
      'documentedOutgoingEcheqs', documented_echeqs,
      'otherConfirmedPayments', previous_open_amount - documented_echeqs,
      'outgoingEcheqNumbers', jsonb_build_array('00000040','00000039','00000041','00000043','00000042'),
      'stockPreserved', true
    ),
    company_id
  );
END $$;

