<?php
/**
 * billing_arca_lib.php - Autorizacion fiscal ARCA desde la cola de billing.
 *
 * La emision real se ejecuta solamente desde endpoints autenticados y con
 * permiso Admin. Usuarios operativos solo crean documentos pendientes.
 */

require_once __DIR__ . '/billing_lib.php';
require_once __DIR__ . '/../facturacion/generar_factura.php';

function billing_arca_env(string $key, string $default = ''): string
{
    if (function_exists('_env')) return _env($key, $default);
    $value = getenv($key);
    return $value !== false ? trim((string)$value) : $default;
}

function billing_arca_normalize_text(string $value): string
{
    if (function_exists('iconv')) {
        $converted = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value);
        if (is_string($converted) && $converted !== '') $value = $converted;
    }
    return strtoupper(trim($value));
}

function billing_arca_doc_type(string $identificationType, string $identificationNumber): int
{
    $type = billing_arca_normalize_text($identificationType);
    $digits = preg_replace('/\D+/', '', $identificationNumber);
    if (str_contains($type, 'CUIT') || str_contains($type, 'CUIL') || strlen($digits) === 11) {
        return 80;
    }
    return 96;
}

function billing_arca_invoice_kind(string $vatCondition, int $docType): array
{
    $vat = billing_arca_normalize_text($vatCondition);
    $isRegistered = $docType === 80
        && str_contains($vat, 'RESPONSABLE')
        && (str_contains($vat, 'INSCRIPTO') || str_contains($vat, 'INSCRIPTA'));

    return $isRegistered
        ? ['type' => 1, 'letter' => 'A']
        : ['type' => 6, 'letter' => 'B'];
}

function billing_arca_date_from_yyyymmdd(?string $value): ?string
{
    $value = preg_replace('/\D+/', '', (string)$value);
    if (strlen($value) !== 8) return null;
    return substr($value, 0, 4) . '-' . substr($value, 4, 2) . '-' . substr($value, 6, 2);
}

function billing_arca_json(array $value): string
{
    return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{}';
}

function billing_authorize_document_arca(mixed $db, int $documentId, string $actor): array
{
    $pdo = billing_pdo($db);
    $companyId = billing_company_id($db);
    if ($documentId <= 0) return ['ok' => false, 'error' => 'Documento invalido.'];

    $doc = [];
    $payload = [];

    $pdo->beginTransaction();
    try {
        $doc = billing_fetch_one($pdo, "
            SELECT
                bd.*,
                cfp.identification_type,
                cfp.identification_number,
                cfp.legal_name,
                cfp.trade_name,
                cfp.vat_condition,
                cfp.fiscal_address
            FROM billing_document bd
            LEFT JOIN customer_fiscal_profile cfp
              ON cfp.id = bd.customer_fiscal_profile_id
             AND cfp.company_id = bd.company_id
            WHERE bd.company_id = ?
              AND bd.id = ?
            FOR UPDATE OF bd
        ", [$companyId, $documentId]);

        if (!$doc) {
            $pdo->rollBack();
            return ['ok' => false, 'error' => 'Solicitud fiscal no encontrada.'];
        }

        $authorizedStatuses = ['authorized', 'authorized_with_observations', 'sent', 'partially_paid', 'paid', 'overdue'];
        if (in_array((string)$doc['status'], $authorizedStatuses, true)) {
            $pdo->rollBack();
            return [
                'ok' => true,
                'already_authorized' => true,
                'id' => (int)$doc['id'],
                'cae' => '',
                'document_number' => (int)($doc['document_number'] ?? 0),
            ];
        }

        if ((string)$doc['status'] === 'pending_authorization') {
            $pdo->rollBack();
            return ['ok' => false, 'error' => 'La solicitud ya esta en proceso de autorizacion ARCA.'];
        }

        if ((string)$doc['status'] === 'validation_failed') {
            $pdo->rollBack();
            return ['ok' => false, 'error' => 'No se puede aprobar: faltan datos fiscales del cliente o de la venta.'];
        }

        if (!in_array((string)$doc['status'], ['draft', 'ready_for_validation', 'rejected'], true)) {
            $pdo->rollBack();
            return ['ok' => false, 'error' => 'Estado no aprobable: ' . (string)$doc['status']];
        }

        $docNumber = preg_replace('/\D+/', '', (string)($doc['identification_number'] ?? ''));
        if ($docNumber === '') {
            $pdo->rollBack();
            return ['ok' => false, 'error' => 'El cliente no tiene CUIT/CUIL/DNI fiscal cargado.'];
        }
        if ((float)$doc['grand_total'] <= 0) {
            $pdo->rollBack();
            return ['ok' => false, 'error' => 'El total del comprobante debe ser mayor a cero.'];
        }
        if (empty($doc['source_venta_id'])) {
            $pdo->rollBack();
            return ['ok' => false, 'error' => 'La solicitud no esta vinculada a una venta.'];
        }

        $docType = billing_arca_doc_type((string)($doc['identification_type'] ?? ''), $docNumber);
        $kind = billing_arca_invoice_kind((string)($doc['vat_condition'] ?? ''), $docType);

        $total = round((float)$doc['grand_total'], 2);
        $net = round((float)$doc['net_taxable'], 2);
        $vat = round((float)$doc['vat_total'], 2);
        if ($net <= 0 || $vat <= 0) {
            $net = round($total / 1.21, 2);
            $vat = round($total - $net, 2);
        }

        $issueDate = (string)($doc['issue_date'] ?: date('Y-m-d'));
        $pointOfSale = max(1, (int)billing_arca_env('AFIP_PTO_VTA', '1'));

        $payload = [
            'document_id' => (int)$doc['id'],
            'source_venta_id' => (int)$doc['source_venta_id'],
            'doc_type' => $docType,
            'doc_number' => $docNumber,
            'cbte_type' => $kind['type'],
            'letter' => $kind['letter'],
            'point_of_sale' => $pointOfSale,
            'issue_date' => $issueDate,
            'net' => $net,
            'vat' => $vat,
            'total' => $total,
        ];

        $update = $pdo->prepare("
            UPDATE billing_document
               SET status = 'pending_authorization',
                   letter = ?,
                   point_of_sale = ?,
                   net_taxable = ?,
                   vat_total = ?,
                   validation_errors = '[]'::jsonb
             WHERE company_id = ?
               AND id = ?
        ");
        $update->execute([$kind['letter'], $pointOfSale, $net, $vat, $companyId, $documentId]);

        $event = $pdo->prepare("
            INSERT INTO billing_event (company_id, document_id, event_type, event_payload, actor)
            VALUES (?, ?, 'billing.arca_authorization_requested', ?::jsonb, ?)
        ");
        $event->execute([$companyId, $documentId, billing_arca_json($payload), $actor]);

        $audit = $pdo->prepare("
            INSERT INTO billing_audit_log (company_id, document_id, actor, action, entity_type, entity_id, next_state, reason)
            VALUES (?, ?, ?, 'approve_request', 'billing_document', ?, ?::jsonb, 'Aprobacion admin para emitir ARCA')
        ");
        $audit->execute([$companyId, $documentId, $actor, (string)$documentId, billing_arca_json(['status' => 'pending_authorization'])]);

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log('[Starlim Billing ARCA] prepare error: ' . $e->getMessage());
        return ['ok' => false, 'error' => 'No se pudo preparar la autorizacion ARCA.'];
    }

    $arca = emitirFacturaARCA(
        $payload['doc_number'],
        $payload['net'],
        $payload['vat'],
        $payload['total'],
        $payload['cbte_type'],
        $payload['doc_type'],
        $payload['issue_date']
    );

    if (empty($arca['success'])) {
        $error = (string)($arca['error'] ?? 'ARCA rechazo la solicitud.');
        try {
            $pdo->beginTransaction();
            $failState = [
                'status' => 'rejected',
                'error' => $error,
                'arca_payload' => $payload,
            ];
            $stmt = $pdo->prepare("
                UPDATE billing_document
                   SET status = 'rejected',
                       validation_errors = ?::jsonb
                 WHERE company_id = ?
                   AND id = ?
            ");
            $stmt->execute([billing_arca_json([$error]), $companyId, $documentId]);

            $auth = $pdo->prepare("
                INSERT INTO fiscal_authorization
                    (company_id, document_id, provider, environment, request_id, idempotency_key,
                     authorization_type, status, error_message, observations, responded_at)
                VALUES (?, ?, 'ARCA', ?, ?, ?, 'CAE', 'rejected', ?, ?::jsonb, CURRENT_TIMESTAMP)
                ON CONFLICT (company_id, idempotency_key) DO UPDATE
                SET status = EXCLUDED.status,
                    error_message = EXCLUDED.error_message,
                    observations = EXCLUDED.observations,
                    responded_at = EXCLUDED.responded_at
            ");
            $environment = strtolower(billing_arca_env('AFIP_PRODUCTION', 'false')) === 'true' ? 'produccion' : 'homologacion';
            $auth->execute([
                $companyId,
                $documentId,
                $environment,
                'arca-' . $companyId . '-' . $documentId,
                'arca-' . $companyId . '-' . $documentId,
                $error,
                billing_arca_json([$failState]),
            ]);

            $event = $pdo->prepare("
                INSERT INTO billing_event (company_id, document_id, event_type, event_payload, actor)
                VALUES (?, ?, 'billing.arca_authorization_rejected', ?::jsonb, ?)
            ");
            $event->execute([$companyId, $documentId, billing_arca_json($failState), $actor]);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            error_log('[Starlim Billing ARCA] reject persist error: ' . $e->getMessage());
        }

        return ['ok' => false, 'error' => $error];
    }

    $cae = (string)$arca['CAE'];
    $documentNumber = (int)$arca['comprobante'];
    $pointOfSale = (int)($arca['pto_vta'] ?? $payload['point_of_sale']);
    $expiration = billing_arca_date_from_yyyymmdd((string)($arca['vencimiento'] ?? ''));
    $environment = strtolower(billing_arca_env('AFIP_PRODUCTION', 'false')) === 'true' ? 'produccion' : 'homologacion';

    try {
        $pdo->beginTransaction();
        $snapshot = [
            'document_id' => $documentId,
            'provider' => 'ARCA',
            'environment' => $environment,
            'cae' => $cae,
            'cae_expiration' => $expiration,
            'point_of_sale' => $pointOfSale,
            'document_number' => $documentNumber,
            'request' => $payload,
        ];

        $stmt = $pdo->prepare("
            UPDATE billing_document
               SET status = 'authorized',
                   letter = ?,
                   point_of_sale = ?,
                   document_number = ?,
                   authorized_at = CURRENT_TIMESTAMP,
                   immutable_snapshot = ?::jsonb,
                   validation_errors = '[]'::jsonb,
                   warnings = '[]'::jsonb
             WHERE company_id = ?
               AND id = ?
        ");
        $stmt->execute([
            $payload['letter'],
            $pointOfSale,
            $documentNumber,
            billing_arca_json($snapshot),
            $companyId,
            $documentId,
        ]);

        $auth = $pdo->prepare("
            INSERT INTO fiscal_authorization
                (company_id, document_id, provider, environment, request_id, idempotency_key,
                 authorization_type, authorization_code, authorization_expiration,
                 status, observations, responded_at)
            VALUES (?, ?, 'ARCA', ?, ?, ?, 'CAE', ?, ?, 'authorized', ?::jsonb, CURRENT_TIMESTAMP)
            ON CONFLICT (company_id, idempotency_key) DO UPDATE
            SET authorization_code = EXCLUDED.authorization_code,
                authorization_expiration = EXCLUDED.authorization_expiration,
                status = EXCLUDED.status,
                observations = EXCLUDED.observations,
                responded_at = EXCLUDED.responded_at
        ");
        $auth->execute([
            $companyId,
            $documentId,
            $environment,
            'arca-' . $companyId . '-' . $documentId,
            'arca-' . $companyId . '-' . $documentId,
            $cae,
            $expiration,
            billing_arca_json([$snapshot]),
        ]);

        $saleUpdate = $pdo->prepare("
            UPDATE ventas
               SET tipo_cbte = ?,
                   cae = ?,
                   vencimiento_cae = ?,
                   nro_comprobante = ?,
                   monto_neto = ?,
                   monto_iva = ?,
                   seguimiento = 'facturada'
             WHERE empresa_id = ?
               AND id = ?
        ");
        $saleUpdate->execute([
            $payload['cbte_type'],
            $cae,
            $expiration ?: '',
            $documentNumber,
            $payload['net'],
            $payload['vat'],
            $companyId,
            (int)$payload['source_venta_id'],
        ]);

        $event = $pdo->prepare("
            INSERT INTO billing_event (company_id, document_id, event_type, event_payload, actor)
            VALUES (?, ?, 'billing.arca_authorized', ?::jsonb, ?)
        ");
        $event->execute([$companyId, $documentId, billing_arca_json($snapshot), $actor]);

        $audit = $pdo->prepare("
            INSERT INTO billing_audit_log (company_id, document_id, actor, action, entity_type, entity_id, next_state, reason)
            VALUES (?, ?, ?, 'authorize_arca', 'billing_document', ?, ?::jsonb, 'CAE otorgado por ARCA')
        ");
        $audit->execute([$companyId, $documentId, $actor, (string)$documentId, billing_arca_json($snapshot)]);

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log('[Starlim Billing ARCA] authorize persist error: ' . $e->getMessage());
        return [
            'ok' => false,
            'error' => 'ARCA devolvio CAE, pero no se pudo persistir la factura. Revisar auditoria y no reemitir sin control manual.',
        ];
    }

    return [
        'ok' => true,
        'id' => $documentId,
        'cae' => $cae,
        'vencimiento_cae' => $expiration,
        'pto_vta' => $pointOfSale,
        'tipo_cbte' => $payload['cbte_type'],
        'document_number' => $documentNumber,
        'source_venta_id' => (int)$payload['source_venta_id'],
        'pdf_url' => '../php/generar_pdf_factura.php?id_venta=' . (int)$payload['source_venta_id'] . '&view=1',
    ];
}
