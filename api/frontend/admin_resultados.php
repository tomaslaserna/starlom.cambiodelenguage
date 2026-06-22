<?php
$PERMITIDOS = ['Empleado', 'Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'];
require __DIR__ . '/partials/guard.php';
include '../php/conexion_starlim_be.php';
require_once __DIR__ . '/../php/admin_reports.php';

[$pdo, $empresaId] = admin_report_bootstrap($conexion, 'admin.resultados');
date_default_timezone_set('America/Argentina/Buenos_Aires');

$year = preg_match('/^\d{4}$/', (string)($_GET['anio'] ?? '')) ? (string)$_GET['anio'] : date('Y');
$desde = $year . '-01-01';
$hasta = ((int)$year + 1) . '-01-01';

$rows = ar_query_all($pdo, "
    WITH meses AS (
        SELECT generate_series(date_trunc('year', CAST(:desde AS date)), date_trunc('year', CAST(:desde AS date)) + interval '11 months', interval '1 month')::date AS mes
    ),
    ventas_mes AS (
        SELECT date_trunc('month', fecha)::date AS mes,
               SUM(monto) ventas,
               SUM(COALESCE(costo,0)) costo,
               SUM(COALESCE(ganancia, monto - COALESCE(costo,0))) ganancia
        FROM ventas
        WHERE empresa_id = :empresa_v
          AND fecha >= :desde_v AND fecha < :hasta_v
          AND COALESCE(estado_pedido,'') <> 'cancelado'
        GROUP BY 1
    ),
    costos_mes AS (
        SELECT date_trunc('month', fecha)::date AS mes, SUM(monto) costos
        FROM costos_operativos
        WHERE empresa_id = :empresa_c
          AND fecha >= :desde_c AND fecha < :hasta_c
        GROUP BY 1
    )
    SELECT m.mes::text,
           ROUND(COALESCE(v.ventas,0),2)::text AS ventas,
           ROUND(COALESCE(v.costo,0),2)::text AS costo_ventas,
           ROUND(COALESCE(v.ganancia,0),2)::text AS ganancia_bruta,
           ROUND(COALESCE(c.costos,0),2)::text AS costos_operativos,
           ROUND(COALESCE(v.ganancia,0) - COALESCE(c.costos,0),2)::text AS resultado
    FROM meses m
    LEFT JOIN ventas_mes v ON v.mes = m.mes
    LEFT JOIN costos_mes c ON c.mes = m.mes
    ORDER BY m.mes
", [
    'desde' => $desde,
    'empresa_v' => $empresaId, 'desde_v' => $desde, 'hasta_v' => $hasta,
    'empresa_c' => $empresaId, 'desde_c' => $desde, 'hasta_c' => $hasta,
]);

$total = ar_query_one($pdo, "
    WITH ventas_anio AS (
        SELECT COALESCE(SUM(monto),0) ventas,
               COALESCE(SUM(COALESCE(costo,0)),0) costo,
               COALESCE(SUM(COALESCE(ganancia, monto - COALESCE(costo,0))),0) ganancia
        FROM ventas
        WHERE empresa_id = :empresa_v
          AND fecha >= :desde_v AND fecha < :hasta_v
          AND COALESCE(estado_pedido,'') <> 'cancelado'
    ),
    costos_anio AS (
        SELECT COALESCE(SUM(monto),0) costos
        FROM costos_operativos
        WHERE empresa_id = :empresa_c
          AND fecha >= :desde_c AND fecha < :hasta_c
    )
    SELECT ROUND((SELECT ventas FROM ventas_anio),2)::text AS ventas,
           ROUND((SELECT costo FROM ventas_anio),2)::text AS costo_ventas,
           ROUND((SELECT ganancia FROM ventas_anio),2)::text AS ganancia_bruta,
           ROUND((SELECT costos FROM costos_anio),2)::text AS costos_operativos,
           ROUND((SELECT ganancia FROM ventas_anio) - (SELECT costos FROM costos_anio),2)::text AS resultado
", [
    'empresa_v' => $empresaId, 'desde_v' => $desde, 'hasta_v' => $hasta,
    'empresa_c' => $empresaId, 'desde_c' => $desde, 'hasta_c' => $hasta,
]) + ['ventas' => '0', 'costo_ventas' => '0', 'ganancia_bruta' => '0', 'costos_operativos' => '0', 'resultado' => '0'];
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Estado de resultados - Starlim</title>
    <link rel="stylesheet" href="../css/global.css"><link rel="stylesheet" href="../css/styleEmpleado.css"><link rel="stylesheet" href="../css/theme.css">
</head>
<body>
<?php $NAV_ACTIVA = 'admin'; $ADMIN_ACTIVA = 'admin.resultados'; include __DIR__ . '/partials/nav.php'; ?>
<main class="dash-main admin-page">
    <header class="admin-page-head"><div><p class="exec-kicker">Administracion</p><h1>Estado de resultados</h1><p>P&L anual: ventas, costo de ventas, ganancia bruta, costos operativos y resultado.</p></div></header>
    <form class="admin-filterbar" method="GET"><label><span>Anio</span><input type="number" name="anio" min="2020" max="2100" value="<?= ar_h($year) ?>"></label><div class="admin-filter-actions"><button class="exec-btn exec-btn--primary" type="submit">Actualizar</button></div></form>
    <section class="admin-treasury-grid">
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Ventas anuales</span><small>Ventas validas del anio.</small></div><strong><?= ar_money($total['ventas']) ?></strong></article>
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Ganancia bruta</span><small>Segun campo ganancia/costo.</small></div><strong><?= ar_money($total['ganancia_bruta']) ?></strong></article>
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Costos operativos</span><small>Costos cargados.</small></div><strong><?= ar_money($total['costos_operativos']) ?></strong></article>
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Resultado</span><small>Ganancia bruta - costos.</small></div><strong><?= ar_money($total['resultado']) ?></strong></article>
    </section>
    <section class="admin-card">
        <div class="admin-card-head"><div><h2>Resultado mensual</h2><p>Sin datos inventados: los meses sin operaciones se muestran en cero por consulta ejecutada.</p></div></div>
        <div class="admin-treasury-table">
            <div class="admin-treasury-row admin-treasury-row--head"><span>Mes</span><span>Ventas</span><span>Ganancia bruta</span><span>Resultado</span></div>
            <?php foreach ($rows as $r): ?>
                <div class="admin-treasury-row"><strong><?= ar_date($r['mes']) ?></strong><span><?= ar_money($r['ventas']) ?></span><span><?= ar_money($r['ganancia_bruta']) ?></span><b><?= ar_money($r['resultado']) ?></b></div>
            <?php endforeach; ?>
        </div>
    </section>
</main>
<script src="../js/global.js"></script>
</body>
</html>
