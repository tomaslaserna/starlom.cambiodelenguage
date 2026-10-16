DO $$
DECLARE
  previous_cheques jsonb;
  removed_count integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.audit_log WHERE empresa_id = 1
      AND action = 'treasury.received_echeqs_archived'
      AND new_data->>'reconciliationKey' = 'received-echeqs-reset-2026-10-16'
  ) THEN
    RETURN;
  END IF;
  PERFORM id FROM public.admin_echeqs
    WHERE empresa_id = 1 AND id IN (1,2,3,4,5) FOR UPDATE;
  SELECT jsonb_agg(to_jsonb(cheque) ORDER BY cheque.id) INTO previous_cheques
    FROM public.admin_echeqs cheque
    WHERE cheque.empresa_id = 1
      AND (cheque.id, cheque.cheque_number) IN (
        (1,'04268832'),(2,'07754991'),(3,'07754990'),(4,'08500001'),(5,'00000099')
      )
      AND cheque.status IN ('accepted','deposited');
  IF coalesce(jsonb_array_length(previous_cheques),0) <> 5 THEN
    RAISE EXCEPTION 'La cartera antigua cambió; no se retiró ningún cheque';
  END IF;
  INSERT INTO public.audit_log (action,entity_table,entity_id,old_data,new_data,empresa_id)
  VALUES (
    'treasury.received_echeqs_archived','admin_echeqs','received-echeqs-reset-2026-10-16',
    jsonb_build_object('cheques',previous_cheques),
    jsonb_build_object(
      'reconciliationKey','received-echeqs-reset-2026-10-16',
      'reason','Administración confirmó que estos cinco cheques ya se cobraron y se usaron para pagos. Retirar de la cartera vigente sin volver a acreditar bancos.',
      'removedCount',5,'bankMovementsCreated',0,'customerPaymentsPreserved',true
    ),1
  );
  DELETE FROM public.admin_echeqs
    WHERE empresa_id = 1 AND id IN (1,2,3,4,5)
      AND status IN ('accepted','deposited');
  GET DIAGNOSTICS removed_count = ROW_COUNT;
  IF removed_count <> 5 THEN RAISE EXCEPTION 'Se esperaban exactamente cinco cheques'; END IF;
END $$;
