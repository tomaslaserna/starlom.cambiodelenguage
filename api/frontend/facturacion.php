<?php
$PERMITIDOS = ['Jefe1', 'Admin'];
require __DIR__ . '/partials/guard.php';
include '../php/conexion_starlim_be.php';
require_once __DIR__ . '/../php/billing_lib.php';
require_once __DIR__ . '/../php/admin_permissions.php';

$empresaId = starlim_bootstrap_tenant_context($conexion);
$canAdminFacturacion = starlim_admin_can($conexion, 'admin.facturacion', 'ver')
    || starlim_admin_can_sensitive($conexion, 'admin.obligaciones_fiscales', 'ver')
    || in_array((string)($rango ?? ''), ['Jefe1', 'Admin'], true);
if (!$canAdminFacturacion) {
    http_response_code(403);
    echo 'Acceso denegado.';
    exit;
}
starlim_set_empresa_context(billing_pdo($conexion), $empresaId);

$billing = billing_dashboard_data($conexion, $_GET);
$range = $billing['range'];
$docs = $billing['docs'];
$op = $billing['operational'];
$quality = $billing['data_quality'];
$approvalQueue = $billing['approval_queue'] ?? [];
$isBillingAdmin = starlim_normalizar_rango((string)($rango ?? '')) === 'Admin';

$periodOptions = [
    'hoy' => 'Hoy',
    '7d' => 'Ultimos 7 dias',
    '30d' => 'Ultimos 30 dias',
    'mes_actual' => 'Mes actual',
    'anio_actual' => 'Anio actual',
    'personalizado' => 'Personalizado',
];

$alerts = [];
if ((int)$docs['pending_count'] > 0) {
    $alerts[] = ['level' => 'critica', 'title' => 'Facturas pendientes de aprobacion', 'text' => billing_int((int)$docs['pending_count']) . ' comprobantes esperan validacion o autorizacion fiscal.'];
}
if ((int)$billing['remitos_sin_factura'] > 0) {
    $alerts[] = ['level' => 'alta', 'title' => 'Remitos sin comprobante fiscal', 'text' => billing_int((int)$billing['remitos_sin_factura']) . ' remitos entregados no tienen factura autorizada vinculada.'];
}
if ((int)$docs['rejected_count'] > 0) {
    $alerts[] = ['level' => 'alta', 'title' => 'Rechazos fiscales pendientes', 'text' => billing_int((int)$docs['rejected_count']) . ' comprobantes rechazados requieren resolucion.'];
}
if ((int)$billing['drafts_vencidos'] > 0) {
    $alerts[] = ['level' => 'media', 'title' => 'Borradores fuera de plazo', 'text' => billing_int((int)$billing['drafts_vencidos']) . ' borradores llevan mas de 7 dias sin resolverse.'];
}
$missingFiscal = (int)$quality['clientes_sin_doc'] + (int)$quality['clientes_sin_iva'] + (int)$quality['clientes_sin_razon'] + (int)$quality['clientes_sin_domicilio'];
if ($missingFiscal > 0) {
    $alerts[] = ['level' => 'media', 'title' => 'Datos fiscales incompletos', 'text' => billing_int($missingFiscal) . ' campos fiscales faltantes en clientes activos/base.'];
}

function billing_status_label(string $status): string {
    return [
        'draft' => 'Borrador',
        'validation_failed' => 'Validacion fallida',
        'ready_for_validation' => 'Listo para validar',
        'pending_authorization' => 'Pendiente ARCA',
        'authorized' => 'Autorizado',
        'authorized_with_observations' => 'Autorizado c/obs.',
        'rejected' => 'Rechazado',
        'sent' => 'Enviado',
        'paid' => 'Cobrado',
        'overdue' => 'Vencido',
    ][$status] ?? $status;
}

function billing_queue_errors(?string $raw): string {
    if (!$raw) return '';
    $decoded = json_decode($raw, true);
    if (is_array($decoded)) {
        $flat = array_filter(array_map(fn($v) => is_scalar($v) ? (string)$v : json_encode($v, JSON_UNESCAPED_UNICODE), $decoded));
        return implode(' | ', $flat);
    }
    return $raw;
}
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Facturacion - Starlim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <link rel="stylesheet" href="../css/panel_ventas.css">
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>
<?php $NAV_ACTIVA = 'admin'; $ADMIN_ACTIVA = 'admin.facturacion'; include __DIR__ . '/partials/nav.php'; ?>

<main class="dash-main billing-workbench">
    <header class="billing-topbar">
        <div>
            <p class="billing-kicker">Centro financiero</p>
            <h1>Facturacion</h1>
            <span>Aprobacion de facturas, IVA debito/credito y registro de comprobantes fiscales.</span>
        </div>
    </header>

    <form class="billing-filterbar" method="get">
        <label>
            Periodo
            <select name="periodo" onchange="this.form.submit()">
                <?php foreach ($periodOptions as $key => $label): ?>
                    <option value="<?= htmlspecialchars($key) ?>" <?= $range['period'] === $key ? 'selected' : '' ?>><?= htmlspecialchars($label) ?></option>
                <?php endforeach; ?>
            </select>
        </label>
        <label>
            Desde
            <input type="date" name="desde" value="<?= htmlspecialchars($range['from']) ?>">
        </label>
        <label>
            Hasta
            <input type="date" name="hasta" value="<?= htmlspecialchars($range['to']) ?>">
        </label>
        <button type="submit">Aplicar</button>
    </form>

    <section class="billing-grid billing-grid-kpis">
        <article class="billing-kpi">
            <span>Total facturado bruto</span>
            <strong><?= billing_money((float)$docs['gross_total']) ?></strong>
            <em><?= billing_int((int)$docs['authorized_count']) ?> comprobantes autorizados</em>
        </article>
        <article class="billing-kpi">
            <span>IVA debito</span>
            <strong><?= billing_money((float)$docs['vat_total']) ?></strong>
            <em>Neto gravado: <?= billing_money((float)$docs['net_taxable']) ?></em>
        </article>
        <article class="billing-kpi">
            <span>IVA credito</span>
            <strong><?= billing_money((float)$docs['purchase_vat_credit']) ?></strong>
            <em>Tomado de compras registradas</em>
        </article>
        <article class="billing-kpi billing-kpi-risk">
            <span>Facturas pendientes de aprobacion</span>
            <strong><?= billing_int((int)$docs['pending_count']) ?></strong>
            <em>Borradores: <?= billing_int((int)$docs['draft_count']) ?></em>
        </article>
    </section>

    <section class="billing-layout">
        <article class="billing-card billing-card-wide">
            <div class="billing-card-head">
                <div>
                    <h2>Evolucion fiscal</h2>
                    <p>Importes autorizados por fecha de emision.</p>
                </div>
                <span><?= billing_date($range['from']) ?> - <?= billing_date($range['to']) ?></span>
            </div>
            <?php if (empty($billing['daily'])): ?>
                <div class="billing-empty">Todavia no hay comprobantes fiscales autorizados en este periodo. El grafico se activara con datos reales.</div>
            <?php else: ?>
                <?php
                $max = max(array_map(fn($r) => (float)$r['amount'], $billing['daily'])) ?: 1;
                ?>
                <div class="billing-bars">
                    <?php foreach ($billing['daily'] as $bar): ?>
                        <div class="billing-bar" title="<?= htmlspecialchars(billing_date($bar['day']) . ' - ' . billing_money((float)$bar['amount'])) ?>">
                            <span style="height: <?= max(4, round(((float)$bar['amount'] / $max) * 100)) ?>%"></span>
                            <em><?= date('d/m', strtotime($bar['day'])) ?></em>
                        </div>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>
        </article>

        <article class="billing-card">
            <div class="billing-card-head">
                <div>
                    <h2>Requiere atencion</h2>
                    <p>Alertas reales del circuito fiscal.</p>
                </div>
            </div>
            <?php if (!$alerts): ?>
                <div class="billing-empty billing-empty-ok">Sin alertas fiscales para el periodo seleccionado.</div>
            <?php else: ?>
                <div class="billing-alerts">
                    <?php foreach ($alerts as $alert): ?>
                        <div class="billing-alert billing-alert-<?= htmlspecialchars($alert['level']) ?>">
                            <strong><?= htmlspecialchars($alert['title']) ?></strong>
                            <span><?= htmlspecialchars($alert['text']) ?></span>
                        </div>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>
        </article>
    </section>

    <section class="billing-layout billing-layout-details">
        <article class="billing-card billing-card-wide">
            <div class="billing-card-head">
                <div>
                    <h2>Cola de aprobacion ARCA</h2>
                    <p>Solicitudes fiscales generadas desde ventas. Solo Admin puede aprobar y emitir CAE.</p>
                </div>
                <span><?= billing_int(count($approvalQueue)) ?> pendientes</span>
            </div>
            <?php if (empty($approvalQueue)): ?>
                <div class="billing-empty billing-empty-ok">No hay facturas esperando aprobacion.</div>
            <?php else: ?>
                <div class="billing-table-wrap">
                    <table class="billing-table">
                        <thead>
                            <tr>
                                <th>Solicitud</th>
                                <th>Cliente</th>
                                <th>Documento</th>
                                <th>Total</th>
                                <th>Estado</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                        <?php foreach ($approvalQueue as $doc): ?>
                            <?php
                                $status = (string)$doc['status'];
                                $canApprove = $isBillingAdmin && in_array($status, ['ready_for_validation', 'rejected'], true);
                                $errors = billing_queue_errors((string)($doc['validation_errors'] ?? ''));
                            ?>
                            <tr>
                                <td>
                                    <strong>#<?= (int)$doc['id'] ?></strong>
                                    <span><?= billing_date($doc['issue_date'] ?: $doc['created_at']) ?></span>
                                </td>
                                <td>
                                    <strong><?= htmlspecialchars($doc['customer_name'] ?: '-') ?></strong>
                                    <span><?= htmlspecialchars($doc['vat_condition'] ?: 'Sin IVA cargado') ?></span>
                                </td>
                                <td>
                                    <?= htmlspecialchars(trim(($doc['identification_type'] ?: 'Doc') . ' ' . ($doc['identification_number'] ?: ''))) ?>
                                    <?php if ($errors): ?><span><?= htmlspecialchars($errors) ?></span><?php endif; ?>
                                </td>
                                <td><?= billing_money((float)$doc['grand_total']) ?></td>
                                <td><span class="billing-pill"><?= htmlspecialchars(billing_status_label($status)) ?></span></td>
                                <td>
                                    <?php if ($canApprove): ?>
                                        <button class="billing-approve-action" type="button" data-doc="<?= (int)$doc['id'] ?>">Aprobar y emitir</button>
                                    <?php elseif ($status === 'pending_authorization'): ?>
                                        <button class="billing-row-action" type="button" disabled>Procesando</button>
                                    <?php elseif ($status === 'validation_failed'): ?>
                                        <button class="billing-row-action" type="button" disabled>Corregir datos</button>
                                    <?php elseif (!$isBillingAdmin): ?>
                                        <button class="billing-row-action" type="button" disabled>Espera Admin</button>
                                    <?php else: ?>
                                        <button class="billing-row-action" type="button" disabled>No disponible</button>
                                    <?php endif; ?>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            <?php endif; ?>
        </article>

        <article class="billing-card">
            <div class="billing-card-head">
                <div>
                    <h2>Ventas sin solicitud fiscal</h2>
                    <p>Ventas entregadas que todavia no entraron en la cola de aprobacion.</p>
                </div>
            </div>
            <?php if (empty($billing['pending_sales'])): ?>
                <div class="billing-empty">No hay ventas entregadas pendientes de preparar.</div>
            <?php else: ?>
                <div class="billing-table-wrap">
                    <table class="billing-table">
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Cliente</th>
                                <th>Remito</th>
                                <th>Total</th>
                                <th>Condicion IVA</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                        <?php foreach ($billing['pending_sales'] as $sale): ?>
                            <tr>
                                <td><?= billing_date($sale['fecha']) ?></td>
                                <td>
                                    <strong><?= htmlspecialchars($sale['nombre_cliente'] ?: '-') ?></strong>
                                    <span><?= htmlspecialchars($sale['dni_cliente'] ?: 'Sin documento') ?></span>
                                </td>
                                <td>#<?= str_pad((string)$sale['nro_remito'], 8, '0', STR_PAD_LEFT) ?></td>
                                <td><?= billing_money((float)$sale['monto']) ?></td>
                                <td><span class="billing-pill"><?= htmlspecialchars($sale['cond_iva'] ?: 'Sin dato') ?></span></td>
                                <td>
                                    <button class="billing-row-action" type="button" data-sale="<?= (int)$sale['id'] ?>">Enviar a aprobacion</button>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            <?php endif; ?>
        </article>

        <article class="billing-card">
            <div class="billing-card-head">
                <div>
                    <h2>Comprobantes</h2>
                    <p>Ultimos documentos creados en el modulo.</p>
                </div>
            </div>
            <?php if (empty($billing['recent_docs'])): ?>
                <div class="billing-empty">Aun no hay documentos en el modulo nuevo.</div>
            <?php else: ?>
                <div class="billing-doc-list">
                    <?php foreach ($billing['recent_docs'] as $doc): ?>
                        <div class="billing-doc-item">
                            <div>
                                <strong><?= htmlspecialchars(ucfirst($doc['document_type'])) ?> <?= htmlspecialchars($doc['letter']) ?></strong>
                                <span><?= htmlspecialchars($doc['customer_name'] ?: 'Sin cliente') ?></span>
                            </div>
                            <div>
                                <b><?= billing_money((float)$doc['grand_total']) ?></b>
                                <em><?= htmlspecialchars(billing_status_label($doc['status'])) ?></em>
                            </div>
                        </div>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>
        </article>

        <article class="billing-card">
            <div class="billing-card-head">
                <div>
                    <h2>Calidad fiscal de clientes</h2>
                    <p>Campos necesarios antes de emitir.</p>
                </div>
            </div>
            <div class="billing-quality">
                <div><span>Sin documento</span><strong><?= billing_int((int)$quality['clientes_sin_doc']) ?></strong></div>
                <div><span>Sin condicion IVA</span><strong><?= billing_int((int)$quality['clientes_sin_iva']) ?></strong></div>
                <div><span>Sin razon social</span><strong><?= billing_int((int)$quality['clientes_sin_razon']) ?></strong></div>
                <div><span>Sin domicilio fiscal</span><strong><?= billing_int((int)$quality['clientes_sin_domicilio']) ?></strong></div>
            </div>
        </article>
    </section>
</main>

<script>
document.querySelectorAll('.billing-row-action').forEach((button) => {
    if (!button.dataset.sale) return;
    button.addEventListener('click', async () => {
        const saleId = button.dataset.sale;
        button.disabled = true;
        const original = button.textContent;
        button.textContent = 'Preparando...';
        try {
            const body = new URLSearchParams({ id_venta: saleId });
            const res = await fetch('../php/billing_prepare_draft.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body,
            });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error || 'No se pudo enviar a aprobacion.');
            window.location.reload();
        } catch (error) {
            alert(error.message);
            button.disabled = false;
            button.textContent = original;
        }
    });
});

document.querySelectorAll('.billing-approve-action').forEach((button) => {
    button.addEventListener('click', async () => {
        const documentId = button.dataset.doc;
        if (!documentId) return;
        const confirmed = window.confirm('Aprobar y emitir esta factura en ARCA? Esta accion solicita CAE y no debe duplicarse.');
        if (!confirmed) return;
        button.disabled = true;
        const original = button.textContent;
        button.textContent = 'Emitiendo...';
        try {
            const body = new URLSearchParams({ document_id: documentId });
            const res = await fetch('../php/billing_approve_document.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body,
            });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error || 'No se pudo aprobar la factura.');
            const nro = String(data.document_number || '').padStart(8, '0');
            alert(`Factura autorizada. CAE: ${data.cae || '-'} | Nro: ${nro}`);
            if (data.pdf_url) {
                window.open(data.pdf_url, '_blank');
            }
            window.location.reload();
        } catch (error) {
            alert(error.message);
            button.disabled = false;
            button.textContent = original;
        }
    });
});
</script>
<script src="../js/global.js"></script>
</body>
</html>
