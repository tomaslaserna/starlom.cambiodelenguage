<?php
/**
 * billing_lib.php - Servicios base del workbench de Facturacion.
 *
 * Esta capa prepara solicitudes, muestra datos reales y controla brechas entre
 * ventas, remitos, cobros y facturacion. La emision ARCA vive en billing_arca_lib.
 */

require_once __DIR__ . '/tenant.php';

function billing_pdo(mixed $db): PDO
{
    if ($db instanceof PDO) return $db;
    if (is_object($db) && method_exists($db, 'getPDO')) return $db->getPDO();
    throw new RuntimeException('No hay conexion PDO disponible.');
}

function billing_company_id(mixed $db): int
{
    return function_exists('starlim_current_empresa_id') ? starlim_current_empresa_id($db, false) : 1;
}

function billing_money(float $value): string
{
    return '$' . number_format($value, 2, ',', '.');
}

function billing_int(int|float $value): string
{
    return number_format((float)$value, 0, ',', '.');
}

function billing_date(?string $value): string
{
    if (!$value) return '-';
    $ts = strtotime($value);
    return $ts ? date('d/m/Y', $ts) : '-';
}

function billing_period_from_request(array $source): array
{
    $tz = new DateTimeZone('America/Argentina/Buenos_Aires');
    $today = new DateTimeImmutable('today', $tz);
    $period = (string)($source['periodo'] ?? 'mes_actual');

    switch ($period) {
        case 'hoy':
            $from = $today;
            $to = $today;
            break;
        case '7d':
            $from = $today->modify('-6 days');
            $to = $today;
            break;
        case '30d':
            $from = $today->modify('-29 days');
            $to = $today;
            break;
        case 'anio_actual':
            $from = $today->modify('first day of january');
            $to = $today;
            break;
        case 'personalizado':
            $fromRaw = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($source['desde'] ?? '')) ? $source['desde'] : $today->modify('first day of this month')->format('Y-m-d');
            $toRaw = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($source['hasta'] ?? '')) ? $source['hasta'] : $today->format('Y-m-d');
            $from = new DateTimeImmutable($fromRaw, $tz);
            $to = new DateTimeImmutable($toRaw, $tz);
            if ($to < $from) $to = $from;
            break;
        case 'mes_actual':
        default:
            $period = 'mes_actual';
            $from = $today->modify('first day of this month');
            $to = $today;
            break;
    }

    return [
        'period' => $period,
        'from' => $from->format('Y-m-d'),
        'to' => $to->format('Y-m-d'),
    ];
}

function billing_fetch_one(PDO $pdo, string $sql, array $params = []): array
{
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
}

function billing_fetch_all(PDO $pdo, string $sql, array $params = []): array
{
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function billing_scalar(PDO $pdo, string $sql, array $params = []): mixed
{
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchColumn();
}

function billing_authorized_status_sql(): string
{
    return "('authorized','authorized_with_observations','sent','partially_paid','paid','overdue','credited_partially','credited_fully','reversed_by_credit_note')";
}

function billing_dashboard_data(mixed $db, array $source): array
{
    $pdo = billing_pdo($db);
    $companyId = billing_company_id($db);
    $range = billing_period_from_request($source);
    $from = $range['from'];
    $to = $range['to'];
    $authStatuses = billing_authorized_status_sql();

    $docs = billing_fetch_one($pdo, "
        SELECT
            COUNT(*) FILTER (WHERE status IN $authStatuses) AS authorized_count,
            COUNT(*) FILTER (WHERE status IN ('ready_for_validation','pending_authorization','retry_scheduled')) AS pending_count,
            COUNT(*) FILTER (WHERE status = 'rejected') AS rejected_count,
            COUNT(*) FILTER (WHERE status IN ('draft','validation_failed')) AS draft_count,
            COALESCE(SUM(grand_total) FILTER (WHERE status IN $authStatuses), 0) AS gross_total,
            COALESCE(SUM(net_taxable) FILTER (WHERE status IN $authStatuses), 0) AS net_taxable,
            COALESCE(SUM(vat_total) FILTER (WHERE status IN $authStatuses), 0) AS vat_total,
            COALESCE(SUM(other_tax_total) FILTER (WHERE status IN $authStatuses), 0) AS other_tax_total,
            COALESCE(SUM(perception_total) FILTER (WHERE status IN $authStatuses), 0) AS perception_total,
            COALESCE(SUM(grand_total) FILTER (WHERE document_type ILIKE '%credito%' AND status IN $authStatuses), 0) AS credit_notes_total,
            COALESCE(SUM(open_amount) FILTER (WHERE status IN $authStatuses), 0) AS open_amount
        FROM billing_document
        WHERE company_id = ?
          AND COALESCE(issue_date, created_at::date) BETWEEN ? AND ?
    ", [$companyId, $from, $to]);

    $purchaseVatCredit = billing_scalar($pdo, "
        SELECT ROUND(COALESCE(SUM(total - (total / 1.21)), 0), 2)
        FROM compras_registro
        WHERE empresa_id = ?
          AND fecha BETWEEN ? AND ?
          AND COALESCE(estado, '') <> 'cancelada'
    ", [$companyId, $from, $to]);
    $docs['purchase_vat_credit'] = (string)($purchaseVatCredit ?: '0');

    $operational = billing_fetch_one($pdo, "
        WITH delivered AS (
            SELECT v.*
            FROM ventas v
            WHERE v.empresa_id = ?
              AND COALESCE(v.estado_pedido, 'entregado') = 'entregado'
              AND v.fecha BETWEEN ? AND ?
        ),
        delivered_unbilled AS (
            SELECT d.*
            FROM delivered d
            WHERE NOT EXISTS (
                SELECT 1
                FROM billing_document bd
                WHERE bd.company_id = d.empresa_id
                  AND bd.source_venta_id = d.id
                  AND bd.status IN $authStatuses
            )
        )
        SELECT
            COUNT(*) AS delivered_count,
            COALESCE(SUM(monto), 0) AS delivered_total,
            COUNT(*) FILTER (WHERE id IN (SELECT id FROM delivered_unbilled)) AS unbilled_count,
            COALESCE(SUM(monto) FILTER (WHERE id IN (SELECT id FROM delivered_unbilled)), 0) AS unbilled_total,
            COUNT(*) FILTER (
                WHERE id IN (SELECT id FROM delivered_unbilled)
                  AND COALESCE(estado_cobro, 'pendiente') = 'recibido'
            ) AS collected_unbilled_count,
            COALESCE(SUM(monto) FILTER (
                WHERE id IN (SELECT id FROM delivered_unbilled)
                  AND COALESCE(estado_cobro, 'pendiente') = 'recibido'
            ), 0) AS collected_unbilled_total,
            COUNT(*) FILTER (WHERE COALESCE(estado_cobro, 'pendiente') IN ('pendiente','vencido','pendiente_aprobacion','en_proceso')) AS open_sales_count,
            COALESCE(SUM(monto) FILTER (WHERE COALESCE(estado_cobro, 'pendiente') IN ('pendiente','vencido','pendiente_aprobacion','en_proceso')), 0) AS open_sales_total,
            COALESCE(SUM(monto) FILTER (WHERE COALESCE(estado_cobro, 'pendiente') = 'vencido'), 0) AS overdue_sales_total
        FROM delivered
    ", [$companyId, $from, $to]);

    $remitosSinFactura = (int)billing_scalar($pdo, "
        SELECT COUNT(*)
        FROM remitos r
        LEFT JOIN ventas v ON v.empresa_id = r.empresa_id AND v.id = r.id_venta
        WHERE r.empresa_id = ?
          AND r.fecha BETWEEN ? AND ?
          AND COALESCE(r.estado_pedido, 'entregado') = 'entregado'
          AND NOT EXISTS (
              SELECT 1
              FROM billing_document bd
              WHERE bd.company_id = r.empresa_id
                AND (bd.source_remito_id = r.id OR bd.source_venta_id = r.id_venta)
                AND bd.status IN $authStatuses
          )
    ", [$companyId, $from, $to]);

    $draftsVencidos = (int)billing_scalar($pdo, "
        SELECT COUNT(*)
        FROM billing_document
        WHERE company_id = ?
          AND status IN ('draft','validation_failed')
          AND created_at < NOW() - INTERVAL '7 days'
    ", [$companyId]);

    $dataQuality = billing_fetch_one($pdo, "
        SELECT
            COUNT(*) FILTER (WHERE COALESCE(nro_id, '') = '') AS clientes_sin_doc,
            COUNT(*) FILTER (WHERE COALESCE(cond_iva, '') = '') AS clientes_sin_iva,
            COUNT(*) FILTER (WHERE COALESCE(razon_social, '') = '') AS clientes_sin_razon,
            COUNT(*) FILTER (WHERE COALESCE(domicilio, '') = '') AS clientes_sin_domicilio
        FROM clientes
        WHERE empresa_id = ?
    ", [$companyId]);

    $debtAging = billing_fetch_all($pdo, "
        SELECT bucket, COUNT(*) AS quantity, COALESCE(SUM(monto), 0) AS amount
        FROM (
            SELECT
                monto,
                CASE
                    WHEN vencimiento_cobro IS NULL OR vencimiento_cobro::date >= CURRENT_DATE THEN 'Al dia'
                    WHEN CURRENT_DATE - vencimiento_cobro::date BETWEEN 1 AND 30 THEN '1 a 30 dias'
                    WHEN CURRENT_DATE - vencimiento_cobro::date BETWEEN 31 AND 60 THEN '31 a 60 dias'
                    WHEN CURRENT_DATE - vencimiento_cobro::date BETWEEN 61 AND 90 THEN '61 a 90 dias'
                    ELSE 'Mas de 90 dias'
                END AS bucket
            FROM ventas
            WHERE empresa_id = ?
              AND COALESCE(estado_pedido, 'entregado') = 'entregado'
              AND COALESCE(estado_cobro, 'pendiente') IN ('pendiente','vencido','pendiente_aprobacion','en_proceso')
        ) x
        GROUP BY bucket
        ORDER BY CASE bucket
            WHEN 'Al dia' THEN 1
            WHEN '1 a 30 dias' THEN 2
            WHEN '31 a 60 dias' THEN 3
            WHEN '61 a 90 dias' THEN 4
            ELSE 5
        END
    ", [$companyId]);

    $daily = billing_fetch_all($pdo, "
        SELECT issue_date::date AS day, COALESCE(SUM(grand_total), 0) AS amount
        FROM billing_document
        WHERE company_id = ?
          AND status IN $authStatuses
          AND issue_date BETWEEN ? AND ?
        GROUP BY issue_date::date
        ORDER BY day
    ", [$companyId, $from, $to]);

    $pendingSales = billing_fetch_all($pdo, "
        SELECT
            v.id,
            v.fecha,
            v.nombre_cliente,
            v.dni_cliente,
            v.monto,
            v.estado_cobro,
            v.vencimiento_cobro,
            COALESCE(r.id, 0) AS id_remito,
            COALESCE(r.nro_remito, v.nro_comprobante) AS nro_remito,
            COALESCE(c.cond_iva, '') AS cond_iva,
            COALESCE(c.razon_social, '') AS razon_social
        FROM ventas v
        LEFT JOIN remitos r ON r.empresa_id = v.empresa_id AND r.id_venta = v.id
        LEFT JOIN clientes c ON c.empresa_id = v.empresa_id AND REPLACE(REPLACE(c.nro_id, '-', ''), ' ', '') = REPLACE(REPLACE(v.dni_cliente, '-', ''), ' ', '')
        WHERE v.empresa_id = ?
          AND COALESCE(v.estado_pedido, 'entregado') = 'entregado'
          AND NOT EXISTS (
              SELECT 1
              FROM billing_document bd
              WHERE bd.company_id = v.empresa_id
                AND bd.source_venta_id = v.id
                AND bd.status NOT IN ('void_draft','archived')
          )
        ORDER BY v.fecha DESC, v.id DESC
        LIMIT 15
    ", [$companyId]);

    $approvalQueue = billing_fetch_all($pdo, "
        SELECT
            bd.id,
            bd.status,
            bd.issue_date,
            bd.created_at,
            bd.grand_total,
            bd.net_taxable,
            bd.vat_total,
            bd.source_venta_id,
            bd.source_remito_id,
            bd.source_order_label,
            bd.validation_errors::text AS validation_errors,
            COALESCE(c.nombre_cliente, cfp.trade_name, cfp.legal_name, bd.source_order_label, '') AS customer_name,
            COALESCE(cfp.identification_type, '') AS identification_type,
            COALESCE(cfp.identification_number, '') AS identification_number,
            COALESCE(cfp.vat_condition, '') AS vat_condition
        FROM billing_document bd
        LEFT JOIN customer_fiscal_profile cfp
          ON cfp.id = bd.customer_fiscal_profile_id
         AND cfp.company_id = bd.company_id
        LEFT JOIN clientes c
          ON c.id = bd.customer_id
         AND c.empresa_id = bd.company_id
        WHERE bd.company_id = ?
          AND bd.status IN ('ready_for_validation','pending_authorization','rejected','validation_failed')
        ORDER BY
            CASE bd.status
                WHEN 'ready_for_validation' THEN 1
                WHEN 'rejected' THEN 2
                WHEN 'validation_failed' THEN 3
                WHEN 'pending_authorization' THEN 4
                ELSE 5
            END,
            bd.created_at ASC,
            bd.id ASC
        LIMIT 80
    ", [$companyId]);

    $recentDocs = billing_fetch_all($pdo, "
        SELECT bd.id, bd.document_type, bd.letter, bd.point_of_sale, bd.document_number,
               bd.status, bd.issue_date, bd.grand_total, bd.open_amount,
               COALESCE(c.nombre_cliente, bd.source_order_label, '') AS customer_name
        FROM billing_document bd
        LEFT JOIN clientes c ON c.id = bd.customer_id AND c.empresa_id = bd.company_id
        WHERE bd.company_id = ?
        ORDER BY bd.created_at DESC, bd.id DESC
        LIMIT 15
    ", [$companyId]);

    return [
        'range' => $range,
        'docs' => $docs,
        'operational' => $operational,
        'remitos_sin_factura' => $remitosSinFactura,
        'drafts_vencidos' => $draftsVencidos,
        'data_quality' => $dataQuality,
        'debt_aging' => $debtAging,
        'daily' => $daily,
        'pending_sales' => $pendingSales,
        'approval_queue' => $approvalQueue,
        'recent_docs' => $recentDocs,
    ];
}

function billing_create_draft_from_sale(mixed $db, int $saleId, string $actor): array
{
    $pdo = billing_pdo($db);
    $companyId = billing_company_id($db);
    if ($saleId <= 0) return ['ok' => false, 'error' => 'Venta invalida.'];

    $pdo->beginTransaction();
    try {
        $existing = billing_fetch_one($pdo, "
            SELECT id, status
            FROM billing_document
            WHERE company_id = ?
              AND source_venta_id = ?
              AND status NOT IN ('void_draft','archived')
            ORDER BY id DESC
            LIMIT 1
            FOR UPDATE
        ", [$companyId, $saleId]);
        if ($existing) {
            $pdo->rollBack();
            return ['ok' => false, 'error' => 'Ya existe un comprobante o borrador asociado a esta venta.', 'id' => (int)$existing['id']];
        }

        $sale = billing_fetch_one($pdo, "
            SELECT v.*, r.id AS id_remito, r.nro_remito,
                   c.id AS customer_id, c.nombre_cliente AS cliente_nombre_db,
                   c.razon_social, c.tipo_id, c.nro_id, c.cond_iva,
                   c.domicilio, c.provincia, c.ciudad
            FROM ventas v
            LEFT JOIN remitos r ON r.empresa_id = v.empresa_id AND r.id_venta = v.id
            LEFT JOIN clientes c ON c.empresa_id = v.empresa_id
                AND REPLACE(REPLACE(c.nro_id, '-', ''), ' ', '') = REPLACE(REPLACE(v.dni_cliente, '-', ''), ' ', '')
            WHERE v.empresa_id = ? AND v.id = ?
            FOR UPDATE
        ", [$companyId, $saleId]);
        if (!$sale) {
            $pdo->rollBack();
            return ['ok' => false, 'error' => 'Venta no encontrada.'];
        }
        if (($sale['estado_pedido'] ?? 'recibido') !== 'entregado') {
            $pdo->rollBack();
            return ['ok' => false, 'error' => 'Solo se puede preparar facturacion de pedidos entregados.'];
        }

        $errors = [];
        if (trim((string)($sale['nro_id'] ?? $sale['dni_cliente'] ?? '')) === '') $errors[] = 'Cliente sin CUIT/CUIL/DNI.';
        if (trim((string)($sale['cond_iva'] ?? '')) === '') $errors[] = 'Cliente sin condicion frente al IVA.';
        if (trim((string)($sale['razon_social'] ?? $sale['nombre_cliente'] ?? '')) === '') $errors[] = 'Cliente sin razon social/nombre fiscal.';
        if (trim((string)($sale['domicilio'] ?? '')) === '') $errors[] = 'Cliente sin domicilio fiscal.';

        $lines = billing_fetch_all($pdo, "
            SELECT d.*, p.codigo, p.nombre AS producto_nombre
            FROM detalle_ventas d
            LEFT JOIN productos p ON p.id = d.id_producto AND p.empresa_id = d.empresa_id
            WHERE d.empresa_id = ? AND d.id_venta = ?
            ORDER BY d.id
        ", [$companyId, $saleId]);
        if (!$lines) $errors[] = 'La venta no tiene detalle de items suficiente para emitir factura fiscal.';

        $profileStmt = $pdo->prepare("
            INSERT INTO customer_fiscal_profile
                (company_id, customer_id, identification_type, identification_number, legal_name, trade_name,
                 vat_condition, fiscal_address, province, city, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'snapshot_venta')
            RETURNING id
        ");
        $profileStmt->execute([
            $companyId,
            $sale['customer_id'] ?: null,
            (string)($sale['tipo_id'] ?? ''),
            (string)($sale['nro_id'] ?: $sale['dni_cliente']),
            (string)($sale['razon_social'] ?: $sale['nombre_cliente']),
            (string)($sale['cliente_nombre_db'] ?: $sale['nombre_cliente']),
            (string)($sale['cond_iva'] ?? ''),
            (string)($sale['domicilio'] ?? ''),
            (string)($sale['provincia'] ?? ''),
            (string)($sale['ciudad'] ?? ''),
        ]);
        $profileId = (int)$profileStmt->fetchColumn();

        $net = (float)($sale['monto_neto'] ?: $sale['monto']);
        $vat = (float)($sale['monto_iva'] ?: 0);
        $total = (float)$sale['monto'];
        $status = $errors ? 'validation_failed' : 'ready_for_validation';
        $issueDate = $sale['fecha'] ?: date('Y-m-d');
        $dueDate = $sale['vencimiento_cobro'] ? date('Y-m-d', strtotime($sale['vencimiento_cobro'])) : null;
        $idempotency = 'draft-sale-' . $companyId . '-' . $saleId;
        $sourceLabel = 'Remito #' . str_pad((string)($sale['nro_remito'] ?: $sale['nro_comprobante'] ?: $saleId), 8, '0', STR_PAD_LEFT);

        $docStmt = $pdo->prepare("
            INSERT INTO billing_document
                (company_id, customer_id, customer_fiscal_profile_id, document_type, letter,
                 status, issue_date, due_date, currency, net_taxable, vat_total, grand_total,
                 open_amount, source_venta_id, source_remito_id, source_order_label, created_by,
                 validation_errors, idempotency_key)
            VALUES (?, ?, ?, 'factura', '', ?, ?, ?, 'PES', ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?)
            RETURNING id
        ");
        $docStmt->execute([
            $companyId,
            $sale['customer_id'] ?: null,
            $profileId,
            $status,
            $issueDate,
            $dueDate,
            $net,
            $vat,
            $total,
            $total,
            $saleId,
            $sale['id_remito'] ?: null,
            $sourceLabel,
            $actor,
            json_encode($errors, JSON_UNESCAPED_UNICODE),
            $idempotency,
        ]);
        $docId = (int)$docStmt->fetchColumn();

        $lineStmt = $pdo->prepare("
            INSERT INTO billing_document_line
                (company_id, document_id, product_id, description_snapshot, sku_snapshot,
                 quantity, unit_price, discount, net_amount, tax_category, tax_rate, total_amount, line_snapshot)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', NULL, ?, ?::jsonb)
        ");
        foreach ($lines as $line) {
            $qty = (float)$line['cantidad'];
            $unitPrice = (float)$line['precio_unit'];
            $discount = (float)$line['descuento'];
            $subtotal = (float)$line['subtotal'];
            $lineStmt->execute([
                $companyId,
                $docId,
                $line['id_producto'] ?: null,
                (string)($line['nombre_producto'] ?: $line['producto_nombre'] ?: 'Item de venta'),
                (string)($line['codigo'] ?? ''),
                $qty,
                $unitPrice,
                $discount,
                $subtotal,
                $subtotal,
                json_encode($line, JSON_UNESCAPED_UNICODE),
            ]);
        }

        $event = $pdo->prepare("
            INSERT INTO billing_event (company_id, document_id, event_type, event_payload, actor)
            VALUES (?, ?, 'billing.draft_created', ?::jsonb, ?)
        ");
        $event->execute([$companyId, $docId, json_encode(['source_venta_id' => $saleId, 'errors' => $errors], JSON_UNESCAPED_UNICODE), $actor]);

        $audit = $pdo->prepare("
            INSERT INTO billing_audit_log (company_id, document_id, actor, action, entity_type, entity_id, next_state, reason)
            VALUES (?, ?, ?, 'create_draft', 'billing_document', ?, ?::jsonb, 'Preparacion de borrador desde venta entregada')
        ");
        $audit->execute([$companyId, $docId, $actor, (string)$docId, json_encode(['status' => $status, 'source_venta_id' => $saleId], JSON_UNESCAPED_UNICODE)]);

        $pdo->commit();
        return ['ok' => true, 'id' => $docId, 'status' => $status, 'errors' => $errors];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log('[Starlim Billing] draft error: ' . $e->getMessage());
        return ['ok' => false, 'error' => 'No se pudo crear el borrador de facturacion.'];
    }
}
