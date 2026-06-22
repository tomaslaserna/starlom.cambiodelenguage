<?php
$PERMITIDOS = ['Empleado', 'Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'];
require __DIR__ . '/partials/guard.php';
include '../php/conexion_starlim_be.php';
require_once __DIR__ . '/../php/admin_reports.php';

[$pdo, $empresaId] = admin_report_bootstrap($conexion, 'admin.sueldos', true);
date_default_timezone_set('America/Argentina/Buenos_Aires');
$canEdit = ar_can_edit($conexion, 'admin.sueldos', true);
$csrf = ar_csrf_token();

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $canEdit) {
    ar_check_csrf();
    $action = (string)($_POST['action'] ?? '');
    $userId = ctype_digit((string)($_POST['id_usuario'] ?? '')) ? (int)$_POST['id_usuario'] : 0;
    if ($action === 'config' && $userId > 0) {
        $sueldo = str_replace(',', '.', (string)($_POST['sueldo_mensual'] ?? '0'));
        if (is_numeric($sueldo)) {
            $stmt = $pdo->prepare("
                INSERT INTO admin_sueldos_config (empresa_id, id_usuario, sueldo_mensual, modalidad, notas, updated_by)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (empresa_id, id_usuario) DO UPDATE
                SET sueldo_mensual = EXCLUDED.sueldo_mensual,
                    modalidad = EXCLUDED.modalidad,
                    notas = EXCLUDED.notas,
                    updated_by = EXCLUDED.updated_by,
                    activo = TRUE,
                    updated_at = CURRENT_TIMESTAMP
            ");
            $stmt->execute([$empresaId, $userId, $sueldo, trim((string)($_POST['modalidad'] ?? 'mensual')), trim((string)($_POST['notas'] ?? '')), (string)($_SESSION['usuario'] ?? '')]);
            starlim_admin_audit($conexion, 'admin.sueldos', 'actualizar_sueldo', 'usuario', $userId, ['sueldo_mensual' => $sueldo]);
        }
    }
    if ($action === 'movimiento' && $userId > 0) {
        $periodoInput = (string)($_POST['periodo'] ?? date('Y-m'));
        $periodo = (preg_match('/^\d{4}-\d{2}$/', $periodoInput) ? $periodoInput : date('Y-m')) . '-01';
        $fecha = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($_POST['fecha'] ?? '')) ? (string)$_POST['fecha'] : date('Y-m-d');
        $tipo = in_array((string)($_POST['tipo'] ?? ''), ['retiro', 'pago', 'ajuste'], true) ? (string)$_POST['tipo'] : 'retiro';
        $monto = str_replace(',', '.', (string)($_POST['monto'] ?? '0'));
        if (is_numeric($monto)) {
            $stmt = $pdo->prepare("INSERT INTO admin_sueldo_movimientos (empresa_id, id_usuario, periodo, fecha, tipo, concepto, monto, notas, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$empresaId, $userId, $periodo, $fecha, $tipo, trim((string)($_POST['concepto'] ?? '')), $monto, trim((string)($_POST['notas'] ?? '')), (string)($_SESSION['usuario'] ?? '')]);
            starlim_admin_audit($conexion, 'admin.sueldos', 'crear_movimiento', 'usuario', $userId, ['tipo' => $tipo, 'monto' => $monto]);
        }
    }
    header('Location: admin_sueldos.php');
    exit;
}

$periodo = ar_month_param('periodo', date('Y-m'));
[$desde, $hasta] = ar_period_bounds($periodo);

$empleados = ar_query_all($pdo, "
    SELECT u.id,
           COALESCE(NULLIF(u.nombre_completo,''), NULLIF(u.usuario,''), u.correo, 'Usuario #' || u.id::text) AS nombre,
           u.rango,
           COALESCE(c.sueldo_mensual,0)::text AS sueldo_mensual,
           COALESCE(c.modalidad,'sin_configurar') AS modalidad,
           ROUND(COALESCE(SUM(CASE WHEN m.tipo IN ('retiro','pago') THEN m.monto WHEN m.tipo='ajuste' THEN -m.monto ELSE 0 END),0),2)::text AS retirado
    FROM usuarios u
    JOIN usuario_empresa ue ON ue.id_usuario = u.id AND ue.empresa_id = :empresa_ue AND ue.activo = TRUE
    LEFT JOIN admin_sueldos_config c ON c.id_usuario = u.id AND c.empresa_id = :empresa_c
    LEFT JOIN admin_sueldo_movimientos m ON m.id_usuario = u.id AND m.empresa_id = :empresa_m AND m.periodo >= :desde_m AND m.periodo < :hasta_m
    WHERE COALESCE(u.activo,1) = 1
    GROUP BY u.id, u.nombre_completo, u.usuario, u.correo, u.rango, c.sueldo_mensual, c.modalidad
    ORDER BY nombre
", ['empresa_ue' => $empresaId, 'empresa_c' => $empresaId, 'empresa_m' => $empresaId, 'desde_m' => $desde, 'hasta_m' => $hasta]);

$summary = ar_query_one($pdo, "
    SELECT ROUND(COALESCE(SUM(c.sueldo_mensual),0),2)::text AS sueldos_configurados,
           ROUND(COALESCE((SELECT SUM(monto) FROM admin_sueldo_movimientos WHERE empresa_id = :empresa_m AND periodo >= :desde_m AND periodo < :hasta_m AND tipo IN ('retiro','pago')),0),2)::text AS retirado,
           COUNT(*)::text AS empleados_configurados
    FROM admin_sueldos_config c
    WHERE c.empresa_id = :empresa_c AND c.activo = TRUE
", ['empresa_c' => $empresaId, 'empresa_m' => $empresaId, 'desde_m' => $desde, 'hasta_m' => $hasta]) + ['sueldos_configurados' => '0', 'retirado' => '0', 'empleados_configurados' => '0'];
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sueldos - Starlim</title>
    <link rel="stylesheet" href="../css/global.css"><link rel="stylesheet" href="../css/styleEmpleado.css"><link rel="stylesheet" href="../css/theme.css">
</head>
<body>
<?php $NAV_ACTIVA = 'admin'; $ADMIN_ACTIVA = 'admin.sueldos'; include __DIR__ . '/partials/nav.php'; ?>
<main class="dash-main admin-page">
    <header class="admin-page-head"><div><p class="exec-kicker">Administracion sensible</p><h1>Sueldos</h1><p>Sueldos, retiros, pagos en cuotas e historial con doble permiso sensible.</p></div></header>
    <form class="admin-filterbar" method="GET"><label><span>Periodo</span><input type="month" name="periodo" value="<?= ar_h($periodo) ?>"></label><div class="admin-filter-actions"><button class="exec-btn exec-btn--primary" type="submit">Actualizar</button></div></form>
    <section class="admin-treasury-grid">
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Sueldos configurados</span><small><?= ar_int($summary['empleados_configurados']) ?> empleados.</small></div><strong><?= ar_money($summary['sueldos_configurados']) ?></strong></article>
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Retirado/pagado</span><small>Periodo seleccionado.</small></div><strong><?= ar_money($summary['retirado']) ?></strong></article>
    </section>
    <section class="admin-treasury-split">
        <article class="admin-card">
            <div class="admin-card-head"><div><h2>Empleados</h2><p>Configuracion y retiros del periodo.</p></div></div>
            <?php if (!$empleados): ?><p class="exec-empty">No hay empleados activos asociados a la empresa.</p><?php else: ?>
                <div class="admin-treasury-table">
                    <div class="admin-treasury-row admin-treasury-row--head"><span>Empleado</span><span>Sueldo</span><span>Retirado</span><span>Modalidad</span></div>
                    <?php foreach ($empleados as $e): ?><div class="admin-treasury-row"><strong><?= ar_h($e['nombre']) ?></strong><span><?= ar_money($e['sueldo_mensual']) ?></span><b><?= ar_money($e['retirado']) ?></b><span><?= ar_h($e['modalidad']) ?></span></div><?php endforeach; ?>
                </div>
            <?php endif; ?>
        </article>
        <article class="admin-card">
            <div class="admin-card-head"><div><h2>Registrar</h2><p>Configuracion o movimiento.</p></div></div>
            <?php if (!$canEdit): ?><p class="exec-empty">Tu usuario tiene permiso de lectura sensible, no de edicion.</p><?php else: ?>
                <form class="admin-mini-form" method="POST">
                    <input type="hidden" name="csrf_admin" value="<?= ar_h($csrf) ?>">
                    <label><span>Accion</span><select name="action"><option value="movimiento">Movimiento</option><option value="config">Configurar sueldo</option></select></label>
                    <label><span>Empleado</span><select name="id_usuario" required><?php foreach ($empleados as $e): ?><option value="<?= (int)$e['id'] ?>"><?= ar_h($e['nombre']) ?></option><?php endforeach; ?></select></label>
                    <label><span>Tipo</span><select name="tipo"><option value="retiro">Retiro</option><option value="pago">Pago</option><option value="ajuste">Ajuste</option></select></label>
                    <label><span>Periodo</span><input type="month" name="periodo" value="<?= ar_h($periodo) ?>"></label>
                    <label><span>Fecha</span><input type="date" name="fecha" value="<?= date('Y-m-d') ?>"></label>
                    <label><span>Monto / sueldo</span><input name="monto" inputmode="decimal"><input name="sueldo_mensual" inputmode="decimal" placeholder="Sueldo mensual"></label>
                    <label><span>Concepto</span><input name="concepto" maxlength="180"></label>
                    <label><span>Modalidad</span><input name="modalidad" value="mensual"></label>
                    <button class="exec-btn exec-btn--primary" type="submit">Guardar</button>
                </form>
            <?php endif; ?>
        </article>
    </section>
</main>
<script src="../js/global.js"></script>
</body>
</html>
