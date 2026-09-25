-- Materializa el saldo acreedor histórico general sobre remitos reales, en orden FIFO.
-- Agrega una contrapartida general por el mismo importe para conservar exactamente
-- el saldo total de cada cuenta y mantener intactos los movimientos originales.
DO $$
DECLARE
  customer_record record;
  sale_record record;
  available_credit numeric(14,2);
  allocation numeric(14,2);
  allocated_total numeric(14,2);
BEGIN
  FOR customer_record IN
    SELECT cam.empresa_id, cam.client_id, MAX(cam.entity_name) AS entity_name,
           ROUND(GREATEST(-SUM(cam.debit - cam.credit), 0), 2) AS available_credit
      FROM public.current_account_movements cam
     WHERE cam.entity_type = 'cliente' AND cam.sale_id IS NULL
     GROUP BY cam.empresa_id, cam.client_id
    HAVING ROUND(GREATEST(-SUM(cam.debit - cam.credit), 0), 2) > 0.005
  LOOP
    available_credit := customer_record.available_credit;
    allocated_total := 0;

    FOR sale_record IN
      SELECT s.id, s.sale_number, s.sale_date, s.created_at,
             ROUND(GREATEST(COALESCE(SUM(cam.debit - cam.credit), 0), 0), 2) AS outstanding
        FROM public.sales s
        JOIN public.current_account_movements cam
          ON cam.empresa_id = s.empresa_id AND cam.sale_id = s.id
       WHERE s.empresa_id = customer_record.empresa_id
         AND s.client_id = customer_record.client_id
         AND COALESCE(s.order_status, s.status, 'cargado') = 'entregado'
         AND (
           s.source_sheet IS NULL OR s.source_sheet = ''
           OR s.source_sheet = '12lzgmYiRh-sIAFv-EnhPVnbAfZMuNZYi8uwTj-ooJIE:ENTREGAS MACRO'
           OR (s.sale_date < DATE '2026-07-01' AND s.source_sheet = '1Ocl4Y9gcTS5LqNIePCebV3mtgYk7v6pa5Vy8uHDc75M:VENTAS ANUAL')
         )
       GROUP BY s.id, s.sale_number, s.sale_date, s.created_at
      HAVING ROUND(GREATEST(COALESCE(SUM(cam.debit - cam.credit), 0), 0), 2) > 0.005
       ORDER BY s.sale_date, s.created_at, s.id
    LOOP
      EXIT WHEN available_credit <= 0.005;
      allocation := ROUND(LEAST(available_credit, sale_record.outstanding), 2);
      CONTINUE WHEN allocation <= 0.005;

      INSERT INTO public.current_account_movements (
        client_id, sale_id, movement_date, debit, credit, description,
        entity_type, entity_name, empresa_id
      ) VALUES (
        customer_record.client_id, sale_record.id, CURRENT_DATE, 0, allocation,
        'Imputación histórica de saldo general a ' || COALESCE(sale_record.sale_number, 'remito'),
        'cliente', COALESCE(customer_record.entity_name, ''), customer_record.empresa_id
      );

      available_credit := ROUND(available_credit - allocation, 2);
      allocated_total := ROUND(allocated_total + allocation, 2);
    END LOOP;

    IF allocated_total > 0.005 THEN
      INSERT INTO public.current_account_movements (
        client_id, movement_date, debit, credit, description,
        entity_type, entity_name, empresa_id
      ) VALUES (
        customer_record.client_id, CURRENT_DATE, allocated_total, 0,
        'Contrapartida de imputación histórica de saldo general',
        'cliente', COALESCE(customer_record.entity_name, ''), customer_record.empresa_id
      );
    END IF;
  END LOOP;
END $$;

UPDATE public.sales s
   SET collection_status = CASE
         WHEN balances.outstanding <= 0.005 THEN 'recibido'
         WHEN s.collection_status IN ('pendiente_aprobacion', 'en_proceso') THEN s.collection_status
         ELSE 'pendiente'
       END,
       updated_at = now()
  FROM (
    SELECT s2.id, GREATEST(COALESCE(SUM(cam.debit - cam.credit), 0), 0) AS outstanding
      FROM public.sales s2
      JOIN public.current_account_movements cam
        ON cam.empresa_id = s2.empresa_id AND cam.sale_id = s2.id
     WHERE COALESCE(s2.order_status, s2.status, 'cargado') = 'entregado'
       AND (
         s2.source_sheet IS NULL OR s2.source_sheet = ''
         OR s2.source_sheet = '12lzgmYiRh-sIAFv-EnhPVnbAfZMuNZYi8uwTj-ooJIE:ENTREGAS MACRO'
         OR (s2.sale_date < DATE '2026-07-01' AND s2.source_sheet = '1Ocl4Y9gcTS5LqNIePCebV3mtgYk7v6pa5Vy8uHDc75M:VENTAS ANUAL')
       )
     GROUP BY s2.id
  ) balances
 WHERE s.id = balances.id;
