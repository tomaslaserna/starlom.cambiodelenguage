-- Read-only regression fixtures. CTEs shadow real tables; no writes.
-- Expected: remits 529.42 / 261813.55; scheduled supplier 600 once; unallocated 150 undated; credit 50 separate; accepted cheque 100, cleared excluded.
WITH sales AS (SELECT * FROM json_populate_recordset(NULL::public.sales, '[{"id":"00000000-0000-0000-0000-000000000001","empresa_id":1,"client_id":"00000000-0000-0000-0000-000000000011","client_name":"Test 1","sale_number":"P-1","sale_date":"2026-11-20","order_status":"entregado","source_sheet":null,"payment_condition":"contado"},{"id":"00000000-0000-0000-0000-000000000002","empresa_id":1,"client_id":"00000000-0000-0000-0000-000000000012","client_name":"Test 2","sale_number":"P-2","sale_date":"2026-11-20","order_status":"entregado","source_sheet":null,"payment_condition":"contado"},{"id":"00000000-0000-0000-0000-000000000003","empresa_id":1,"client_id":"00000000-0000-0000-0000-000000000013","client_name":"Test 3","sale_number":"P-3","sale_date":"2026-11-20","order_status":"entregado","source_sheet":null,"payment_condition":"contado"}]')),
clients AS (SELECT * FROM json_populate_recordset(NULL::public.clients, '[{"id":"00000000-0000-0000-0000-000000000011","empresa_id":1,"display_name":"Test 1","payment_term_days":0},{"id":"00000000-0000-0000-0000-000000000012","empresa_id":1,"display_name":"Test 2","payment_term_days":0},{"id":"00000000-0000-0000-0000-000000000013","empresa_id":1,"display_name":"Test 3","payment_term_days":0},{"id":"00000000-0000-0000-0000-000000000014","empresa_id":1,"display_name":"Test 4","payment_term_days":0}]')),
current_account_movements AS (SELECT * FROM json_populate_recordset(NULL::public.current_account_movements, '[{"client_id":"00000000-0000-0000-0000-000000000011","sale_id":"00000000-0000-0000-0000-000000000001","debit":97529.42,"credit":0,"id":"00000000-0000-0000-0000-000000000100","empresa_id":1,"entity_type":"cliente","movement_date":"2026-11-20"},{"client_id":"00000000-0000-0000-0000-000000000011","sale_id":"00000000-0000-0000-0000-000000000001","debit":0,"credit":97000,"id":"00000000-0000-0000-0000-000000000101","empresa_id":1,"entity_type":"cliente","movement_date":"2026-11-20"},{"client_id":"00000000-0000-0000-0000-000000000012","sale_id":"00000000-0000-0000-0000-000000000002","debit":523626.55,"credit":0,"id":"00000000-0000-0000-0000-000000000102","empresa_id":1,"entity_type":"cliente","movement_date":"2026-11-20"},{"client_id":"00000000-0000-0000-0000-000000000012","sale_id":"00000000-0000-0000-0000-000000000002","debit":0,"credit":261813,"id":"00000000-0000-0000-0000-000000000103","empresa_id":1,"entity_type":"cliente","movement_date":"2026-11-20"},{"client_id":"00000000-0000-0000-0000-000000000012","sale_id":"00000000-0000-0000-0000-000000000002","debit":0,"credit":261813,"id":"00000000-0000-0000-0000-000000000104","empresa_id":1,"entity_type":"cliente","movement_date":"2026-11-20"},{"client_id":"00000000-0000-0000-0000-000000000012","sale_id":"00000000-0000-0000-0000-000000000002","debit":261813,"credit":0,"id":"00000000-0000-0000-0000-000000000105","empresa_id":1,"entity_type":"cliente","movement_date":"2026-11-20"},{"client_id":"00000000-0000-0000-0000-000000000013","sale_id":"00000000-0000-0000-0000-000000000003","debit":200,"credit":0,"id":"00000000-0000-0000-0000-000000000106","empresa_id":1,"entity_type":"cliente","movement_date":"2026-11-20"},{"client_id":"00000000-0000-0000-0000-000000000013","sale_id":null,"debit":0,"credit":50,"id":"00000000-0000-0000-0000-000000000107","empresa_id":1,"entity_type":"cliente","movement_date":"2026-11-20"},{"client_id":"00000000-0000-0000-0000-000000000014","sale_id":null,"debit":0,"credit":50,"id":"00000000-0000-0000-0000-000000000108","empresa_id":1,"entity_type":"cliente","movement_date":"2026-11-20"}]')),
purchases AS (SELECT * FROM json_populate_recordset(NULL::public.purchases, '[{"id":"00000000-0000-0000-0000-000000000050","empresa_id":1,"total_amount":1000,"paid_amount":400,"status":"recibida","purchase_number":"TEST","due_date":"2026-11-25"}]')),
app_solicitudes AS (SELECT * FROM json_populate_recordset(NULL::public.app_solicitudes, '[{"id":1,"empresa_id":1,"estado":"pendiente","metadata":{"action":"supplier_payment","purchaseId":"00000000-0000-0000-0000-000000000050","date":"2026-11-25","amount":700}}]')),
suppliers AS (SELECT * FROM json_populate_recordset(NULL::public.suppliers, '[]')),
admin_echeqs AS (SELECT * FROM json_populate_recordset(NULL::public.admin_echeqs, '[{"id":1,"empresa_id":1,"cheque_number":"A","received_from":"Test","amount":100,"due_date":"2026-11-25","status":"accepted"},{"id":2,"empresa_id":1,"cheque_number":"B","received_from":"Test","amount":999,"due_date":"2026-11-25","status":"cleared"}]')),
admin_outgoing_echeqs AS (SELECT * FROM json_populate_recordset(NULL::public.admin_outgoing_echeqs, '[]')),
admin_treasury_movements AS (SELECT * FROM json_populate_recordset(NULL::public.admin_treasury_movements, '[]')),
admin_treasury_accounts AS (SELECT * FROM json_populate_recordset(NULL::public.admin_treasury_accounts, '[]')),
admin_treasury_reconciliations AS (SELECT * FROM json_populate_recordset(NULL::public.admin_treasury_reconciliations, '[]')),
admin_sueldos_config AS (SELECT * FROM json_populate_recordset(NULL::public.admin_sueldos_config, '[]')),
admin_sueldo_movimientos AS (SELECT * FROM json_populate_recordset(NULL::public.admin_sueldo_movimientos, '[]')),
profiles AS (SELECT * FROM json_populate_recordset(NULL::public.profiles, '[]')),
admin_obligaciones_fiscales AS (SELECT * FROM json_populate_recordset(NULL::public.admin_obligaciones_fiscales, '[]')), ledger AS (
        SELECT m.client_id, m.sale_id, m.debit - m.credit AS amount
        FROM current_account_movements m
        LEFT JOIN sales s ON s.id=m.sale_id AND s.empresa_id=m.empresa_id
        WHERE m.empresa_id=1 AND m.entity_type='cliente' AND m.client_id IS NOT NULL
          AND (m.entity_type <> 'cliente' OR m.sale_id IS NULL OR (CASE
    WHEN COALESCE(s.order_status, s.status, 'cargado') IN ('cargado','confirmado','entregado','cancelado') THEN COALESCE(s.order_status, s.status, 'cargado')
    WHEN COALESCE(s.order_status, s.status, 'cargado') IN ('recibido','registrada','registrado') THEN 'cargado'
    WHEN COALESCE(s.order_status, s.status, 'cargado') IN ('en_proceso','pendiente_entrega') THEN 'confirmado'
    WHEN COALESCE(s.order_status, s.status, 'cargado') IN ('cancelada','anulado','anulada') THEN 'cancelado'
    ELSE 'cargado'
  END='entregado' AND (
    s.source_sheet IS NULL
    OR s.source_sheet = ''
    OR (
      s.source_sheet = '12lzgmYiRh-sIAFv-EnhPVnbAfZMuNZYi8uwTj-ooJIE:ENTREGAS MACRO'
    )
    OR (
      s.sale_date < DATE '2026-07-01'
      AND s.source_sheet = '1Ocl4Y9gcTS5LqNIePCebV3mtgYk7v6pa5Vy8uHDc75M:VENTAS ANUAL'
    )
  )))
      ), account_balances AS (
        SELECT client_id, SUM(amount) AS balance FROM ledger GROUP BY client_id
      ), sale_balances AS (
        SELECT client_id, sale_id, SUM(amount) AS balance FROM ledger WHERE sale_id IS NOT NULL
        GROUP BY client_id, sale_id HAVING SUM(amount) > 0.005
      ), open_totals AS (
        SELECT client_id, SUM(balance) AS total FROM sale_balances GROUP BY client_id
      ), matched AS (
        SELECT a.*, ABS(a.balance - COALESCE(o.total,0)) < 0.005 AS reconciled
        FROM account_balances a LEFT JOIN open_totals o USING(client_id)
      ), scheduled AS (
        SELECT p.id AS purchase_id, req.id::text AS id, req.titulo AS label,
          NULLIF(req.metadata->>'date','')::date AS date,
          LEAST(GREATEST(p.total_amount-COALESCE(p.paid_amount,0)-COALESCE(SUM(
            GREATEST(COALESCE(NULLIF(req.metadata->>'amount','')::numeric,req.monto,0),0)
          ) OVER (PARTITION BY p.id ORDER BY req.id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0),0),
          GREATEST(COALESCE(NULLIF(req.metadata->>'amount','')::numeric,req.monto,0),0)) AS amount
        FROM app_solicitudes req JOIN purchases p ON req.metadata->>'purchaseId'=p.id::text AND p.empresa_id=req.empresa_id
        WHERE req.empresa_id=1 AND req.estado='pendiente' AND req.metadata->>'action'='supplier_payment'
          AND p.status <> 'cancelada'
      ), flows AS (
        SELECT 'sale:'||s.id::text AS id, COALESCE(c.display_name,s.client_name,'Cliente')||' · '||COALESCE(s.sale_number,s.id::text) AS label,
          b.balance AS amount, (s.sale_date::date + COALESCE(
    s.source_payment_term_days,
    CASE
      WHEN COALESCE(s.payment_condition, '') ~ '[0-9]'
        THEN (regexp_match(s.payment_condition, '([0-9]+)'))[1]::int
      WHEN LOWER(BTRIM(COALESCE(s.payment_condition, ''))) IN ('pendiente', 'contado', 'pago al recibir') THEN 0
      ELSE c.payment_term_days
    END,
    0
  )) AS date, 'inflow' AS kind, 'remito' AS source
        FROM sale_balances b JOIN matched a ON a.client_id=b.client_id AND a.reconciled
        JOIN sales s ON s.id=b.sale_id AND s.empresa_id=1
        LEFT JOIN clients c ON c.id=b.client_id AND c.empresa_id=1
        UNION ALL
        SELECT 'account:'||a.client_id::text, COALESCE(c.display_name,'Cliente')||' · imputación a revisar',
          a.balance, NULL::date, 'inflow', 'cuenta_sin_imputar'
        FROM matched a LEFT JOIN clients c ON c.id=a.client_id AND c.empresa_id=1
        WHERE NOT a.reconciled AND a.balance>0.005
        UNION ALL
        SELECT 'credit:'||a.client_id::text, COALESCE(c.display_name,'Cliente')||' · saldo a favor',
          -a.balance, NULL::date, 'credit', 'saldo_a_favor'
        FROM matched a LEFT JOIN clients c ON c.id=a.client_id AND c.empresa_id=1 WHERE a.balance < -0.005
        UNION ALL
        SELECT 'purchase:'||p.id::text, COALESCE(s.display_name,'Proveedor')||' · '||COALESCE(p.purchase_number,p.id::text),
          GREATEST(p.total_amount-COALESCE(p.paid_amount,0)-COALESCE(sc.amount,0),0), p.due_date, 'outflow', 'proveedor'
        FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id AND s.empresa_id=p.empresa_id
        LEFT JOIN (SELECT purchase_id,SUM(amount) AS amount FROM scheduled GROUP BY purchase_id) sc ON sc.purchase_id=p.id
        WHERE p.empresa_id=1 AND p.status <> 'cancelada'
        UNION ALL
        SELECT 'scheduled:'||id,COALESCE(label,'Pago proveedor programado'),amount,date,'outflow','proveedor_programado' FROM scheduled
        UNION ALL
        SELECT 'echeq-in:'||id::text,'E-cheq '||cheque_number||' · '||received_from,amount,due_date,'inflow','cheque_recibido'
        FROM admin_echeqs WHERE empresa_id=1 AND status IN ('accepted','deposited')
        UNION ALL
        SELECT 'echeq-out:'||id::text,'E-cheq '||cheque_number||' · '||beneficiary,amount,due_date,'outflow','cheque_emitido'
        FROM admin_outgoing_echeqs WHERE empresa_id=1 AND status IN ('issued','accepted')
        UNION ALL
        SELECT 'movement:'||m.id::text,m.concept,m.amount,m.movement_date,m.direction,'movimiento_futuro'
        FROM admin_treasury_movements m JOIN admin_treasury_accounts a ON a.id=m.account_id AND a.empresa_id=m.empresa_id AND a.active
        WHERE m.empresa_id=1 AND m.movement_date>'2026-11-20'::date
          AND m.created_at>COALESCE((SELECT MAX(r.reconciled_at) FROM admin_treasury_reconciliations r
            WHERE r.empresa_id=m.empresa_id AND r.account_id=m.account_id AND r.statement_date<='2026-11-20'::date),'-infinity'::timestamptz)
        UNION ALL
        SELECT 'salary:'||c.id::text,COALESCE(p.full_name,p.username,c.employee_name,'Empleado')||' · estimación mensual',
          GREATEST(c.sueldo_mensual + CASE WHEN COALESCE(c.aguinaldo_aplica,TRUE) THEN c.sueldo_mensual/12 ELSE 0 END
            +c.sueldo_mensual*COALESCE(c.cargas_pct,0)/100-COALESCE(paid.amount,0),0),
          (date_trunc('month','2026-11-20'::date)+INTERVAL '1 month')::date,'outflow','sueldo_estimado'
        FROM admin_sueldos_config c LEFT JOIN profiles p ON p.id=c.profile_id
        LEFT JOIN LATERAL (SELECT SUM(m.monto) AS amount FROM admin_sueldo_movimientos m
          WHERE m.empresa_id=c.empresa_id AND c.profile_id IS NOT NULL AND m.profile_id=c.profile_id
            AND m.periodo>=date_trunc('month','2026-11-20'::date) AND m.periodo<date_trunc('month','2026-11-20'::date)+INTERVAL '1 month'
            AND m.tipo IN ('pago','retiro')) paid ON TRUE
        WHERE c.empresa_id=1 AND c.activo
        UNION ALL
        SELECT 'tax:'||id::text,impuesto||' · '||periodo::text,monto_estimado,vencimiento,'outflow','impuesto'
        FROM admin_obligaciones_fiscales WHERE empresa_id=1 AND estado IN ('pendiente','vencido','revisar')
      ) SELECT id,label,amount::text,date::text,kind,source FROM flows WHERE amount>0.005 ORDER BY date NULLS LAST,id
    ;
-- Expected balance 1150, future 800, operating outflows 1. Baseline movements excluded.
WITH admin_treasury_accounts AS (SELECT * FROM json_populate_recordset(NULL::public.admin_treasury_accounts, '[{"id":1,"empresa_id":1,"name":"Caja prueba","account_type":"cash","active":true}]')),admin_treasury_reconciliations AS (SELECT * FROM json_populate_recordset(NULL::public.admin_treasury_reconciliations, '[{"id":1,"empresa_id":1,"account_id":1,"statement_date":"2026-11-01","statement_balance":1000,"reconciled_at":"2026-11-01T12:00:00Z"}]')),admin_treasury_movements AS (SELECT * FROM json_populate_recordset(NULL::public.admin_treasury_movements, '[{"id":1,"empresa_id":1,"account_id":1,"created_at":"2026-11-02T12:00:00Z","movement_date":"2026-11-02","direction":"inflow","amount":200,"source_type":"customer_payment"},{"id":2,"empresa_id":1,"account_id":1,"created_at":"2026-11-02T12:00:00Z","movement_date":"2026-11-02","direction":"outflow","amount":50,"source_type":"manual"},{"id":3,"empresa_id":1,"account_id":1,"created_at":"2026-11-02T12:00:00Z","movement_date":"2026-12-11","direction":"inflow","amount":800,"source_type":"customer_payment"},{"id":4,"empresa_id":1,"account_id":1,"created_at":"2026-10-31T12:00:00Z","movement_date":"2026-10-31","direction":"inflow","amount":9000,"source_type":"customer_payment"}]'))
    SELECT account.id::text AS account_id, account.name AS account, account.account_type,
      (COALESCE(reconciliation.statement_balance, 0) + COALESCE(movements.signed_amount, 0))::text AS balance,
      COALESCE(movements.movement_count, 0)::text AS movements,
      reconciliation.statement_date::text,
      COALESCE(movements.future_amount, 0)::text AS future_amount,
      COALESCE(movements.operating_outflows, 0)::text AS operating_outflows
    FROM admin_treasury_accounts account
    LEFT JOIN LATERAL (
      SELECT item.statement_balance, item.reconciled_at, item.statement_date
      FROM admin_treasury_reconciliations item
      WHERE item.empresa_id = account.empresa_id AND item.account_id = account.id
        AND item.statement_date <= '2026-11-20'::date
      ORDER BY item.reconciled_at DESC, item.id DESC LIMIT 1
    ) reconciliation ON TRUE
    LEFT JOIN LATERAL (
      SELECT SUM(CASE WHEN movement.direction = 'inflow' THEN movement.amount ELSE -movement.amount END)
          FILTER (WHERE movement.movement_date <= '2026-11-20'::date) AS signed_amount,
        COUNT(*) FILTER (WHERE movement.movement_date <= '2026-11-20'::date) AS movement_count,
        SUM(CASE WHEN movement.direction = 'inflow' THEN movement.amount ELSE -movement.amount END)
          FILTER (WHERE movement.movement_date > '2026-11-20'::date) AS future_amount,
        COUNT(*) FILTER (WHERE movement.movement_date <= '2026-11-20'::date AND movement.direction = 'outflow'
          AND movement.source_type <> 'customer_payment_void') AS operating_outflows
      FROM admin_treasury_movements movement
      WHERE movement.empresa_id = account.empresa_id AND movement.account_id = account.id
        AND movement.created_at > COALESCE(reconciliation.reconciled_at, '-infinity'::timestamptz)
    ) movements ON TRUE
    WHERE account.empresa_id = 1 AND account.active = TRUE
    ORDER BY account.account_type, account.name;
-- Expected collections 300, cheque portion 100, cancelled 900. Supplier and future excluded.
WITH payments AS (SELECT * FROM json_populate_recordset(NULL::public.payments, '[{"status":"registrado","entity_type":"cliente","method":"transferencia","payment_date":"2026-11-20","amount":200,"empresa_id":1},{"status":"anulado","entity_type":"cliente","method":"transferencia","payment_date":"2026-11-20","amount":900,"empresa_id":1},{"status":"registrado","entity_type":"cliente","method":"echeck","payment_date":"2026-11-20","amount":100,"empresa_id":1},{"status":"registrado","entity_type":"proveedor","method":"transferencia","payment_date":"2026-11-20","amount":500,"empresa_id":1},{"status":"registrado","entity_type":"cliente","method":"transferencia","payment_date":"2026-11-30","amount":1000,"empresa_id":1}]'))
    SELECT COALESCE(SUM(p.amount) FILTER (WHERE COALESCE(p.status::text, 'registrado') = 'registrado'
  AND COALESCE(p.entity_type, 'cliente') = 'cliente'), 0)::text AS total,
      COALESCE(SUM(p.amount) FILTER (WHERE COALESCE(p.status::text, 'registrado') = 'registrado'
  AND COALESCE(p.entity_type, 'cliente') = 'cliente'
        AND LOWER(p.method) IN ('echeck', 'echeq', 'cheque')), 0)::text AS cheques,
      COALESCE(SUM(p.amount) FILTER (WHERE p.status::text = 'anulado'
        AND COALESCE(p.entity_type, 'cliente') = 'cliente'), 0)::text AS cancelled
    FROM payments p WHERE p.empresa_id = 1 AND p.payment_date >= '2026-11-01'::date
      AND p.payment_date < '2026-12-01'::date AND p.payment_date <= '2026-11-20'::date;
