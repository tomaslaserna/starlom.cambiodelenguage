<?php
$PERMITIDOS = ['Empleado', 'Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'];
require __DIR__ . '/partials/guard.php';
include '../php/conexion_starlim_be.php';
require_once __DIR__ . '/../php/admin_reports.php';

[$pdo, $empresaId] = admin_report_bootstrap($conexion, 'admin.dividendos', true);
date_default_timezone_set('America/Argentina/Buenos_Aires');
$canEdit = ar_can_edit($conexion, 'admin.dividendos', true);
$csrf = ar_csrf_token();

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $canEdit) {
    ar_check_csrf();
    $action = (string)($_POST['action'] ?? '');
    if ($action === 'socio') {
        $nombre = trim((string)($_POST['nombre'] ?? ''));
        $participacion = str_replace(',', '.', (string)($_POST['participacion'] ?? '0'));
        if ($nombre !== '' && is_numeric($participacion)) {
            $stmt = $pdo->prepare("INSERT INTO admin_socios (empresa_id, nombre, participacion, notas) VALUES (?, ?, ?, ?)");
            $stmt->execute([$empresaId, $nombre, $participacion, trim((string)($_POST['notas'] ?? ''))]);
            starlim_admin_audit($conexion, 'admin.dividendos', 'crear_socio', 'socio', '', ['nombre' => $nombre]);
        }
    }
    if ($action === 'movimiento') {
        $socioId = ctype_digit((string)($_POST['socio_id'] ?? '')) ? (int)$_POST['socio_id'] : null;
        $periodoInput = (string)($_POST['periodo'] ?? date('Y-m'));
        $periodo = (preg_match('/^\d{4}-\d{2}$/', $periodoInput) ? $periodoInput : date('Y-m')) . '-01';
        $fecha = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($_POST['fecha'] ?? '')) ? (string)$_POST['fecha'] : date('Y-m-d');
        $tipo = in_array((string)($_POST['tipo'] ?? ''), ['dividendo', 'retiro', 'ajuste'], true) ? (string)$_POST['tipo'] : 'dividendo';
        $monto = str_replace(',', '.', (string)($_POST['monto'] ?? '0'));
        if ($socioId && is_numeric($monto)) {
            $stmt = $pdo->prepare("INSERT INTO admin_dividendos (empresa_id, socio_id, periodo, fecha, tipo, concepto, monto, notas, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$empresaId, $socioId, $periodo, $fecha, $tipo, trim((string)($_POST['concepto'] ?? '')), $monto, trim((string)($_POST['notas'] ?? '')), (string)($_SESSION['usuario'] ?? '')]);
            starlim_admin_audit($conexion, 'admin.dividendos', 'crear_movimiento', 'dividendo', '', ['socio_id' => $socioId, 'tipo' => $tipo, 'monto' => $monto]);
        }
    }
    header('Location: admin_dividendos.php');
    exit;
}

$periodo = ar_month_param('periodo', date('Y-m'));
[$desde, $hasta] = ar_period_bounds($periodo);

$socios = ar_query_all($pdo, "SELECT id, nombre, participacion::text, activo FROM admin_socios WHERE empresa_id = :empresa ORDER BY activo DESC, nombre", ['empresa' => $empresaId]);
$summary = ar_query_one($pdo, "
    SELECT ROUND(COALESCE(SUM(CASE WHEN tipo = 'dividendo' THEN monto ELSE 0 END),0),2)::text AS dividendos,
           ROUND(COALESCE(SUM(CASE WHEN tipo = 'retiro' THEN monto ELSE 0 END),0),2)::text AS retiros,
           ROUND(COALESCE(SUM(CASE WHEN tipo = 'dividendo' THEN monto WHEN tipo = 'retiro' THEN -monto ELSE monto END),0),2)::text AS saldo
    FROM admin_dividendos
    WHERE empresa_id = :empresa AND periodo >= :desde AND periodo < :hasta
", ['empresa' => $empresaId, 'desde' => $desde, 'hasta' => $hasta]) + ['dividendos' => '0', 'retiros' => '0', 'saldo' => '0'];
$movimientos = ar_query_all($pdo, "
    SELECT d.fecha::text, d.periodo::text, d.tipo, d.concepto, ROUND(d.monto,2)::text AS monto, s.nombre AS socio
    FROM admin_dividendos d
    LEFT JOIN admin_socios s ON s.id = d.socio_id
    WHERE d.empresa_id = :empresa AND d.periodo >= :desde AND d.periodo < :hasta
    ORDER BY d.fecha DESC, d.id DESC
    LIMIT 80
", ['empresa' => $empresaId, 'desde' => $desde, 'hasta' => $hasta]);
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dividendos - Starlim</title>
    <link rel="stylesheet" href="../css/global.css"><link rel="stylesheet" href="../css/styleEmpleado.css"><link rel="stylesheet" href="../css/theme.css">
</head>
<body>
<?php $NAV_ACTIVA = 'admin'; $ADMIN_ACTIVA = 'admin.dividendos'; include __DIR__ . '/partials/nav.php'; ?>
<main class="dash-main admin-page">
    <header class="admin-page-head"><div><p class="exec-kicker">Administracion sensible</p><h1>Dividendos</h1><p>Distribucion a socios, retiros e historial con doble permiso sensible.</p></div></header>
    <form class="admin-filterbar" method="GET"><label><span>Periodo</span><input type="month" name="periodo" value="<?= ar_h($periodo) ?>"></label><div class="admin-filter-actions"><button class="exec-btn exec-btn--primary" type="submit">Actualizar</button></div></form>
    <section class="admin-treasury-grid">
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Dividendos</span><small>Periodo seleccionado.</small></div><strong><?= ar_money($summary['dividendos']) ?></strong></article>
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Retiros</span><small>Retiros de socios.</small></div><strong><?= ar_money($summary['retiros']) ?></strong></article>
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Saldo</span><small>Dividendos - retiros + ajustes.</small></div><strong><?= ar_money($summary['saldo']) ?></strong></article>
    </section>
    <section class="admin-treasury-split">
        <article class="admin-card">
            <div class="admin-card-head"><div><h2>Socios</h2><p>Participacion registrada.</p></div></div>
            <?php if (!$socios): ?><p class="exec-empty">Todavia no hay socios registrados.</p><?php else: ?><div class="exec-kpi-list"><?php foreach ($socios as $s): ?><div><span><?= ar_h($s['nombre']) ?><small><?= ((int)$s['activo'] ? 'Activo' : 'Inactivo') ?></small></span><strong><?= ar_decimal($s['participacion'], 2) ?> %</strong></div><?php endforeach; ?></div><?php endif; ?>
            <?php if ($canEdit): ?>
                <form class="admin-mini-form admin-mini-form--compact" method="POST">
                    <input type="hidden" name="csrf_admin" value="<?= ar_h($csrf) ?>"><input type="hidden" name="action" value="socio">
                    <label><span>Nuevo socio</span><input name="nombre" maxlength="160" required></label>
                    <label><span>Participacion %</span><input name="participacion" inputmode="decimal" value="0"></label>
                    <button class="exec-btn exec-btn--ghost" type="submit">Agregar socio</button>
                </form>
            <?php endif; ?>
        </article>
        <article class="admin-card">
            <div class="admin-card-head"><div><h2>Nuevo registro</h2><p>Solo usuarios con edicion sensible.</p></div></div>
            <?php if (!$canEdit): ?><p class="exec-empty">Tu usuario tiene permiso de lectura sensible, no de edicion.</p><?php else: ?>
                <form class="admin-mini-form" method="POST">
                    <input type="hidden" name="csrf_admin" value="<?= ar_h($csrf) ?>"><input type="hidden" name="action" value="movimiento">
                    <label><span>Socio</span><select name="socio_id" required><?php foreach ($socios as $s): ?><option value="<?= (int)$s['id'] ?>"><?= ar_h($s['nombre']) ?></option><?php endforeach; ?></select></label>
                    <label><span>Tipo</span><select name="tipo"><option value="dividendo">Dividendo</option><option value="retiro">Retiro</option><option value="ajuste">Ajuste</option></select></label>
                    <label><span>Periodo</span><input type="month" name="periodo" value="<?= ar_h($periodo) ?>"></label>
                    <label><span>Fecha</span><input type="date" name="fecha" value="<?= date('Y-m-d') ?>"></label>
                    <label><span>Monto</span><input name="monto" inputmode="decimal" required></label>
                    <label><span>Concepto</span><input name="concepto" maxlength="180"></label>
                    <button class="exec-btn exec-btn--primary" type="submit">Registrar</button>
                </form>
            <?php endif; ?>
        </article>
    </section>
    <section class="admin-card">
        <div class="admin-card-head"><div><h2>Historial</h2><p>Movimientos del periodo.</p></div></div>
        <?php if (!$movimientos): ?><p class="exec-empty">Sin movimientos en este periodo.</p><?php else: ?><div class="admin-treasury-table"><div class="admin-treasury-row admin-treasury-row--head"><span>Fecha</span><span>Socio</span><span>Tipo</span><span>Monto</span></div><?php foreach ($movimientos as $m): ?><div class="admin-treasury-row"><span><?= ar_date($m['fecha']) ?></span><strong><?= ar_h($m['socio'] ?? 'Sin socio') ?></strong><span><?= ar_h($m['tipo']) ?></span><b><?= ar_money($m['monto']) ?></b></div><?php endforeach; ?></div><?php endif; ?>
    </section>
</main>
<script src="../js/global.js"></script>
</body>
</html>
