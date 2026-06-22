<?php
$PERMITIDOS = ['Empleado', 'Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'];
require __DIR__ . '/partials/guard.php';
include '../php/conexion_starlim_be.php';
require_once __DIR__ . '/../php/admin_reports.php';

[$pdo, $empresaId] = admin_report_bootstrap($conexion, 'admin.balance');
date_default_timezone_set('America/Argentina/Buenos_Aires');

$month = ar_month_param('mes', date('Y-m'));
[$desde, $hasta] = ar_period_bounds($month);

$summary = ar_query_one($pdo, "
    WITH ventas_periodo AS (
        SELECT COALESCE(SUM(monto),0) ventas,
               COALESCE(SUM(COALESCE(costo,0)),0) costo,
               COALESCE(SUM(COALESCE(ganancia, monto - COALESCE(costo,0))),0) ganancia,
               COUNT(*) operaciones
        FROM ventas
        WHERE empresa_id = :empresa_v
          AND fecha >= :desde_v AND fecha < :hasta_v
          AND COALESCE(estado_pedido,'') <> 'cancelado'
    ),
    costos AS (
        SELECT COALESCE(SUM(monto),0) total
        FROM costos_operativos
        WHERE empresa_id = :empresa_c
          AND fecha >= :desde_c AND fecha < :hasta_c
    ),
    compras AS (
        SELECT COALESCE(SUM(total),0) total
        FROM compras_registro
        WHERE empresa_id = :empresa_p
          AND fecha >= :desde_p AND fecha < :hasta_p
          AND COALESCE(estado,'') <> 'cancelada'
    )
    SELECT ROUND((SELECT ventas FROM ventas_periodo),2)::text AS ventas,
           ROUND((SELECT costo FROM ventas_periodo),2)::text AS costo_ventas,
           ROUND((SELECT ganancia FROM ventas_periodo),2)::text AS ganancia_bruta,
           ROUND((SELECT total FROM costos),2)::text AS costos_operativos,
           ROUND((SELECT total FROM compras),2)::text AS compras_periodo,
           ROUND((SELECT ganancia FROM ventas_periodo) - (SELECT total FROM costos),2)::text AS resultado_operativo,
           (SELECT operaciones FROM ventas_periodo)::text AS operaciones
", [
    'empresa_v' => $empresaId, 'desde_v' => $desde, 'hasta_v' => $hasta,
    'empresa_c' => $empresaId, 'desde_c' => $desde, 'hasta_c' => $hasta,
    'empresa_p' => $empresaId, 'desde_p' => $desde, 'hasta_p' => $hasta,
]) + ['ventas' => '0', 'costo_ventas' => '0', 'ganancia_bruta' => '0', 'costos_operativos' => '0', 'compras_periodo' => '0', 'resultado_operativo' => '0', 'operaciones' => '0'];

$costos = ar_query_all($pdo, "
    SELECT concepto, categoria, ROUND(monto,2)::text AS monto, fecha::text AS fecha
    FROM costos_operativos
    WHERE empresa_id = :empresa
      AND fecha >= :desde AND fecha < :hasta
    ORDER BY fecha DESC, id DESC
    LIMIT 30
", ['empresa' => $empresaId, 'desde' => $desde, 'hasta' => $hasta]);
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Balance - Starlim</title>
    <link rel="stylesheet" href="../css/global.css"><link rel="stylesheet" href="../css/styleEmpleado.css"><link rel="stylesheet" href="../css/theme.css">
</head>
<body>
<?php $NAV_ACTIVA = 'admin'; $ADMIN_ACTIVA = 'admin.balance'; include __DIR__ . '/partials/nav.php'; ?>
<main class="dash-main admin-page">
    <header class="admin-page-head"><div><p class="exec-kicker">Administracion</p><h1>Balance</h1><p>Balance mensual con ventas, costos de venta, compras y costos operativos reales.</p></div><a class="exec-btn exec-btn--ghost" href="planilla_admin.php">Editar costos</a></header>
    <form class="admin-filterbar" method="GET">
        <label><span>Mes</span><input type="month" name="mes" value="<?= ar_h($month) ?>"></label>
        <div class="admin-filter-actions"><button class="exec-btn exec-btn--primary" type="submit">Actualizar</button></div>
    </form>
    <section class="admin-treasury-grid">
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Ventas</span><small><?= ar_int($summary['operaciones']) ?> operaciones.</small></div><strong><?= ar_money($summary['ventas']) ?></strong></article>
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Costo de ventas</span><small>Campo costo de ventas.</small></div><strong><?= ar_money($summary['costo_ventas']) ?></strong></article>
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Costos operativos</span><small>Cargados en Metricas.</small></div><strong><?= ar_money($summary['costos_operativos']) ?></strong></article>
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Resultado operativo</span><small>Ganancia bruta - costos operativos.</small></div><strong><?= ar_money($summary['resultado_operativo']) ?></strong></article>
    </section>
    <section class="admin-treasury-split">
        <article class="admin-card">
            <div class="admin-card-head"><div><h2>Resumen contable</h2><p>Lectura del periodo <?= ar_h($month) ?>.</p></div></div>
            <div class="exec-kpi-list">
                <div><span>Ganancia bruta</span><strong><?= ar_money($summary['ganancia_bruta']) ?></strong></div>
                <div><span>Compras registradas</span><strong><?= ar_money($summary['compras_periodo']) ?></strong></div>
                <div><span>Resultado operativo</span><strong><?= ar_money($summary['resultado_operativo']) ?></strong></div>
            </div>
        </article>
        <article class="admin-card">
            <div class="admin-card-head"><div><h2>Costos operativos</h2><p>Ultimos costos del mes.</p></div></div>
            <?php if (!$costos): ?><p class="exec-empty">Sin costos operativos registrados para este mes.</p><?php else: ?>
                <div class="exec-kpi-list">
                    <?php foreach ($costos as $c): ?><div><span><?= ar_h($c['concepto']) ?><small><?= ar_date($c['fecha']) ?> · <?= ar_h($c['categoria']) ?></small></span><strong><?= ar_money($c['monto']) ?></strong></div><?php endforeach; ?>
                </div>
            <?php endif; ?>
        </article>
    </section>
</main>
<script src="../js/global.js"></script>
</body>
</html>
