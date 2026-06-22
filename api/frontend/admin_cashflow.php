<?php
$PERMITIDOS = ['Empleado', 'Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'];
require __DIR__ . '/partials/guard.php';
include '../php/conexion_starlim_be.php';
require_once __DIR__ . '/../php/admin_reports.php';

[$pdo, $empresaId] = admin_report_bootstrap($conexion, 'admin.cashflow');
date_default_timezone_set('America/Argentina/Buenos_Aires');

$desde = ar_date_param('desde', date('Y-m-d'));
$hasta = ar_date_param('hasta', date('Y-m-d', strtotime('+60 days')));
$hastaExclusive = date('Y-m-d', strtotime($hasta . ' +1 day'));

$summary = ar_query_one($pdo, "
    WITH ingresos AS (
        SELECT COALESCE(SUM(GREATEST(monto - COALESCE(cobro_monto_registrado,0), 0)), 0) AS total
        FROM ventas
        WHERE empresa_id = :empresa_i
          AND COALESCE(estado_cobro,'pendiente') IN ('pendiente','vencido','en_proceso','pendiente_aprobacion')
          AND COALESCE(estado_pedido,'entregado') = 'entregado'
          AND COALESCE(vencimiento_cobro::date, fecha) >= :desde_i
          AND COALESCE(vencimiento_cobro::date, fecha) < :hasta_i
    ),
    egresos AS (
        SELECT COALESCE(SUM(GREATEST(total - COALESCE(monto_pagado,0), 0)), 0) AS total
        FROM compras_registro
        WHERE empresa_id = :empresa_e
          AND COALESCE(pagado,0) = 0
          AND COALESCE(estado,'') <> 'cancelada'
          AND fecha >= :desde_e
          AND fecha < :hasta_e
    ),
    saldo AS (
        SELECT COALESCE(SUM(CASE WHEN tipo = 'cobro' THEN monto ELSE -monto END), 0) AS total
        FROM pagos_registro
        WHERE empresa_id = :empresa_s
          AND fecha < :hasta_s
    )
    SELECT ROUND((SELECT total FROM saldo), 2)::text AS saldo_actual,
           ROUND((SELECT total FROM ingresos), 2)::text AS ingresos_esperados,
           ROUND((SELECT total FROM egresos), 2)::text AS egresos_esperados,
           ROUND((SELECT total FROM saldo) + (SELECT total FROM ingresos) - (SELECT total FROM egresos), 2)::text AS saldo_proyectado
", [
    'empresa_i' => $empresaId, 'desde_i' => $desde, 'hasta_i' => $hastaExclusive,
    'empresa_e' => $empresaId, 'desde_e' => $desde, 'hasta_e' => $hastaExclusive,
    'empresa_s' => $empresaId, 'hasta_s' => $hastaExclusive,
]) + ['saldo_actual' => '0', 'ingresos_esperados' => '0', 'egresos_esperados' => '0', 'saldo_proyectado' => '0'];

$movimientos = ar_query_all($pdo, "
    SELECT 'Ingreso esperado' AS tipo,
           nombre_cliente AS entidad,
           'Venta pendiente de cobro' AS concepto,
           ROUND(GREATEST(monto - COALESCE(cobro_monto_registrado,0), 0), 2)::text AS monto,
           COALESCE(vencimiento_cobro::date, fecha)::text AS fecha,
           'ventas.php' AS href
    FROM ventas
    WHERE empresa_id = :empresa_v
      AND COALESCE(estado_cobro,'pendiente') IN ('pendiente','vencido','en_proceso','pendiente_aprobacion')
      AND COALESCE(estado_pedido,'entregado') = 'entregado'
      AND COALESCE(vencimiento_cobro::date, fecha) >= :desde_v
      AND COALESCE(vencimiento_cobro::date, fecha) < :hasta_v
      AND GREATEST(monto - COALESCE(cobro_monto_registrado,0), 0) > 0
    UNION ALL
    SELECT 'Egreso esperado',
           COALESCE(p.nombre, cr.descripcion, 'Proveedor'),
           COALESCE(cr.descripcion, 'Compra pendiente'),
           ROUND(GREATEST(cr.total - COALESCE(cr.monto_pagado,0), 0), 2)::text,
           cr.fecha::text,
           'panel_cobros_pagos.php?tab=pagos'
    FROM compras_registro cr
    LEFT JOIN proveedores p ON p.id = cr.id_proveedor AND p.empresa_id = cr.empresa_id
    WHERE cr.empresa_id = :empresa_c
      AND COALESCE(cr.pagado,0) = 0
      AND COALESCE(cr.estado,'') <> 'cancelada'
      AND cr.fecha >= :desde_c
      AND cr.fecha < :hasta_c
      AND GREATEST(cr.total - COALESCE(cr.monto_pagado,0), 0) > 0
    ORDER BY fecha ASC, tipo DESC
    LIMIT 80
", [
    'empresa_v' => $empresaId, 'desde_v' => $desde, 'hasta_v' => $hastaExclusive,
    'empresa_c' => $empresaId, 'desde_c' => $desde, 'hasta_c' => $hastaExclusive,
]);
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cash flow - Starlim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>
<?php $NAV_ACTIVA = 'admin'; $ADMIN_ACTIVA = 'admin.cashflow'; include __DIR__ . '/partials/nav.php'; ?>
<main class="dash-main admin-page">
    <header class="admin-page-head"><div><p class="exec-kicker">Administracion</p><h1>Cash flow</h1><p>Flujo proyectado con cobranzas pendientes y pagos futuros reales del sistema.</p></div></header>
    <form class="admin-filterbar" method="GET">
        <label><span>Desde</span><input type="date" name="desde" value="<?= ar_h($desde) ?>"></label>
        <label><span>Hasta</span><input type="date" name="hasta" value="<?= ar_h($hasta) ?>"></label>
        <div class="admin-filter-actions"><button class="exec-btn exec-btn--primary" type="submit">Actualizar</button><a class="exec-btn exec-btn--ghost" href="admin_cashflow.php">60 dias</a></div>
    </form>
    <section class="admin-treasury-grid">
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Saldo actual</span><small>Cobros menos pagos registrados.</small></div><strong><?= ar_money($summary['saldo_actual']) ?></strong></article>
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Ingresos esperados</span><small>Ventas entregadas pendientes de cobro.</small></div><strong><?= ar_money($summary['ingresos_esperados']) ?></strong></article>
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Egresos esperados</span><small>Compras pendientes de pago.</small></div><strong><?= ar_money($summary['egresos_esperados']) ?></strong></article>
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Saldo proyectado</span><small>Saldo actual + ingresos - egresos.</small></div><strong><?= ar_money($summary['saldo_proyectado']) ?></strong></article>
    </section>
    <section class="admin-card">
        <div class="admin-card-head"><div><h2>Linea de movimientos</h2><p><?= ar_int(count($movimientos)) ?> vencimientos reales encontrados.</p></div></div>
        <?php if (!$movimientos): ?>
            <p class="exec-empty">No hay vencimientos de cobro o pago para este rango.</p>
        <?php else: ?>
            <div class="admin-treasury-table">
                <div class="admin-treasury-row admin-treasury-row--head"><span>Fecha</span><span>Tipo</span><span>Entidad</span><span>Monto</span></div>
                <?php foreach ($movimientos as $row): ?>
                    <a class="admin-treasury-row" href="<?= ar_h($row['href']) ?>"><span><?= ar_date($row['fecha']) ?></span><strong><?= ar_h($row['tipo']) ?></strong><span><?= ar_h($row['entidad']) ?></span><b><?= ar_money($row['monto']) ?></b></a>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>
    </section>
</main>
<script src="../js/global.js"></script>
</body>
</html>
