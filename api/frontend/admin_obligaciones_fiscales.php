<?php
$PERMITIDOS = ['Empleado', 'Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'];
require __DIR__ . '/partials/guard.php';
include '../php/conexion_starlim_be.php';
require_once __DIR__ . '/../php/admin_reports.php';

[$pdo, $empresaId] = admin_report_bootstrap($conexion, 'admin.obligaciones_fiscales', true);
date_default_timezone_set('America/Argentina/Buenos_Aires');
$canEdit = ar_can_edit($conexion, 'admin.obligaciones_fiscales', true);
$csrf = ar_csrf_token();

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $canEdit) {
    ar_check_csrf();
    $impuesto = trim((string)($_POST['impuesto'] ?? ''));
    $periodoInput = (string)($_POST['periodo'] ?? date('Y-m'));
    $periodo = (preg_match('/^\d{4}-\d{2}$/', $periodoInput) ? $periodoInput : date('Y-m')) . '-01';
    $vencimiento = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($_POST['vencimiento'] ?? '')) ? (string)$_POST['vencimiento'] : '';
    $monto = str_replace(',', '.', (string)($_POST['monto_estimado'] ?? '0'));
    $estado = in_array((string)($_POST['estado'] ?? ''), ['pendiente', 'pagado', 'vencido', 'revisar'], true) ? (string)$_POST['estado'] : 'pendiente';
    if ($impuesto !== '' && $vencimiento !== '' && is_numeric($monto)) {
        $stmt = $pdo->prepare("INSERT INTO admin_obligaciones_fiscales (empresa_id, impuesto, periodo, vencimiento, monto_estimado, estado, notas, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([$empresaId, $impuesto, $periodo, $vencimiento, $monto, $estado, trim((string)($_POST['notas'] ?? '')), (string)($_SESSION['usuario'] ?? '')]);
        starlim_admin_audit($conexion, 'admin.obligaciones_fiscales', 'crear_obligacion', 'obligacion_fiscal', '', ['impuesto' => $impuesto, 'monto' => $monto]);
    }
    header('Location: admin_obligaciones_fiscales.php');
    exit;
}

$periodo = ar_month_param('periodo', date('Y-m'));
[$desde, $hasta] = ar_period_bounds($periodo);

$summary = ar_query_one($pdo, "
    SELECT
        ROUND(COALESCE((SELECT SUM(vat_total) FROM billing_document WHERE company_id = :empresa_b AND issue_date >= :desde_b AND issue_date < :hasta_b AND status IN ('authorized','sent','partially_paid','paid','overdue')),0),2)::text AS iva_debito,
        ROUND(COALESCE((SELECT SUM(amount) FROM billing_tax_line WHERE company_id = :empresa_t AND created_at >= :desde_t AND created_at < :hasta_t),0),2)::text AS otros_tributos,
        COALESCE((SELECT COUNT(*) FROM fiscal_authorization WHERE company_id = :empresa_f AND status IN ('rejected','validation_failed')),0)::text AS rechazos,
        ROUND(COALESCE((SELECT SUM(monto_estimado) FROM admin_obligaciones_fiscales WHERE empresa_id = :empresa_o AND periodo >= :desde_o AND periodo < :hasta_o AND estado <> 'pagado'),0),2)::text AS obligaciones_pendientes
", [
    'empresa_b' => $empresaId, 'desde_b' => $desde, 'hasta_b' => $hasta,
    'empresa_t' => $empresaId, 'desde_t' => $desde, 'hasta_t' => $hasta,
    'empresa_f' => $empresaId,
    'empresa_o' => $empresaId, 'desde_o' => $desde, 'hasta_o' => $hasta,
]) + ['iva_debito' => '0', 'otros_tributos' => '0', 'rechazos' => '0', 'obligaciones_pendientes' => '0'];

$obligaciones = ar_query_all($pdo, "
    SELECT impuesto, periodo::text, vencimiento::text, ROUND(monto_estimado,2)::text AS monto, estado, fuente, notas
    FROM admin_obligaciones_fiscales
    WHERE empresa_id = :empresa
      AND periodo >= :desde AND periodo < :hasta
    ORDER BY vencimiento ASC, id ASC
", ['empresa' => $empresaId, 'desde' => $desde, 'hasta' => $hasta]);

$errores = ar_query_all($pdo, "
    SELECT fa.provider, fa.environment, fa.status, fa.error_code, fa.error_message, fa.requested_at::text AS fecha
    FROM fiscal_authorization fa
    WHERE fa.company_id = :empresa
      AND fa.status IN ('rejected','validation_failed')
    ORDER BY fa.requested_at DESC NULLS LAST, fa.id DESC
    LIMIT 20
", ['empresa' => $empresaId]);
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Obligaciones fiscales - Starlim</title>
    <link rel="stylesheet" href="../css/global.css"><link rel="stylesheet" href="../css/styleEmpleado.css"><link rel="stylesheet" href="../css/theme.css">
</head>
<body>
<?php $NAV_ACTIVA = 'admin'; $ADMIN_ACTIVA = 'admin.obligaciones_fiscales'; include __DIR__ . '/partials/nav.php'; ?>
<main class="dash-main admin-page">
    <header class="admin-page-head"><div><p class="exec-kicker">Administracion sensible</p><h1>Obligaciones fiscales</h1><p>IVA, tributos, vencimientos y rechazos fiscales. Debe validarse con contador antes de produccion fiscal.</p></div></header>
    <form class="admin-filterbar" method="GET"><label><span>Periodo</span><input type="month" name="periodo" value="<?= ar_h($periodo) ?>"></label><div class="admin-filter-actions"><button class="exec-btn exec-btn--primary" type="submit">Actualizar</button></div></form>
    <section class="admin-treasury-grid">
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>IVA debito</span><small>Comprobantes autorizados.</small></div><strong><?= ar_money($summary['iva_debito']) ?></strong></article>
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Otros tributos</span><small>Lineas de impuestos.</small></div><strong><?= ar_money($summary['otros_tributos']) ?></strong></article>
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Obligaciones pendientes</span><small>Carga administrativa manual.</small></div><strong><?= ar_money($summary['obligaciones_pendientes']) ?></strong></article>
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Rechazos fiscales</span><small>Autorizaciones con error.</small></div><strong><?= ar_int($summary['rechazos']) ?></strong></article>
    </section>
    <section class="admin-treasury-split">
        <article class="admin-card">
            <div class="admin-card-head"><div><h2>Vencimientos fiscales</h2><p>Obligaciones cargadas para el periodo.</p></div></div>
            <?php if (!$obligaciones): ?><p class="exec-empty">No hay obligaciones fiscales cargadas para este periodo.</p><?php else: ?><div class="exec-kpi-list"><?php foreach ($obligaciones as $o): ?><div><span><?= ar_h($o['impuesto']) ?><small><?= ar_date($o['vencimiento']) ?> · <?= ar_h($o['estado']) ?></small></span><strong><?= ar_money($o['monto']) ?></strong></div><?php endforeach; ?></div><?php endif; ?>
        </article>
        <article class="admin-card">
            <div class="admin-card-head"><div><h2>Nueva obligacion</h2><p>Solo usuarios con edicion sensible.</p></div></div>
            <?php if (!$canEdit): ?><p class="exec-empty">Tu usuario tiene permiso de lectura sensible, no de edicion.</p><?php else: ?>
                <form class="admin-mini-form" method="POST">
                    <input type="hidden" name="csrf_admin" value="<?= ar_h($csrf) ?>">
                    <label><span>Impuesto</span><input name="impuesto" required maxlength="80"></label>
                    <label><span>Periodo</span><input type="month" name="periodo" value="<?= ar_h($periodo) ?>"></label>
                    <label><span>Vencimiento</span><input type="date" name="vencimiento" required></label>
                    <label><span>Monto estimado</span><input name="monto_estimado" inputmode="decimal" required></label>
                    <label><span>Estado</span><select name="estado"><option value="pendiente">Pendiente</option><option value="revisar">Revisar</option><option value="pagado">Pagado</option><option value="vencido">Vencido</option></select></label>
                    <button class="exec-btn exec-btn--primary" type="submit">Guardar</button>
                </form>
            <?php endif; ?>
        </article>
    </section>
    <section class="admin-card">
        <div class="admin-card-head"><div><h2>Errores y rechazos fiscales</h2><p>Autorizaciones que requieren revision.</p></div></div>
        <?php if (!$errores): ?><p class="exec-empty">Sin rechazos fiscales pendientes registrados.</p><?php else: ?><div class="admin-treasury-table"><div class="admin-treasury-row admin-treasury-row--head"><span>Fecha</span><span>Ambiente</span><span>Codigo</span><span>Mensaje</span></div><?php foreach ($errores as $e): ?><div class="admin-treasury-row"><span><?= ar_date($e['fecha']) ?></span><strong><?= ar_h($e['provider'] . ' / ' . $e['environment']) ?></strong><span><?= ar_h($e['error_code']) ?></span><b><?= ar_h($e['error_message']) ?></b></div><?php endforeach; ?></div><?php endif; ?>
    </section>
</main>
<script src="../js/global.js"></script>
</body>
</html>
