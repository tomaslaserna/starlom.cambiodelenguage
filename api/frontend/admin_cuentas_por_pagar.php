<?php
$PERMITIDOS = ['Empleado', 'Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'];
require __DIR__ . '/partials/guard.php';
include '../php/conexion_starlim_be.php';
require_once __DIR__ . '/../php/admin_reports.php';

[$pdo, $empresaId] = admin_report_bootstrap($conexion, 'admin.cuentas_por_pagar');
date_default_timezone_set('America/Argentina/Buenos_Aires');

$estado = in_array((string)($_GET['estado'] ?? ''), ['todos', 'vencidas', 'proximas'], true) ? (string)$_GET['estado'] : 'todos';
$today = date('Y-m-d');
$next7 = date('Y-m-d', strtotime('+7 days'));

$filterSql = '';
if ($estado === 'vencidas') $filterSql = "AND fecha < CURRENT_DATE";
if ($estado === 'proximas') $filterSql = "AND fecha >= CURRENT_DATE AND fecha <= CURRENT_DATE + interval '7 days'";

$summary = ar_query_one($pdo, "
    WITH pendientes AS (
        SELECT GREATEST(total - COALESCE(monto_pagado,0), 0) AS saldo, fecha
        FROM compras_registro
        WHERE empresa_id = :empresa
          AND COALESCE(pagado,0) = 0
          AND COALESCE(estado,'') <> 'cancelada'
          AND GREATEST(total - COALESCE(monto_pagado,0), 0) > 0
    )
    SELECT ROUND(COALESCE(SUM(saldo),0),2)::text AS total,
           ROUND(COALESCE(SUM(CASE WHEN fecha < CURRENT_DATE THEN saldo ELSE 0 END),0),2)::text AS vencido,
           ROUND(COALESCE(SUM(CASE WHEN fecha >= CURRENT_DATE AND fecha <= CURRENT_DATE + interval '7 days' THEN saldo ELSE 0 END),0),2)::text AS proximo,
           COUNT(*)::text AS cantidad
    FROM pendientes
", ['empresa' => $empresaId]) + ['total' => '0', 'vencido' => '0', 'proximo' => '0', 'cantidad' => '0'];

$items = ar_query_all($pdo, "
    SELECT cr.id,
           COALESCE(p.nombre, cr.descripcion, 'Proveedor') AS proveedor,
           COALESCE(cr.descripcion, 'Compra pendiente') AS concepto,
           ROUND(cr.total,2)::text AS total,
           ROUND(COALESCE(cr.monto_pagado,0),2)::text AS pagado,
           ROUND(GREATEST(cr.total - COALESCE(cr.monto_pagado,0), 0),2)::text AS saldo,
           cr.fecha::text AS fecha,
           cr.estado
    FROM compras_registro cr
    LEFT JOIN proveedores p ON p.id = cr.id_proveedor AND p.empresa_id = cr.empresa_id
    WHERE cr.empresa_id = :empresa
      AND COALESCE(cr.pagado,0) = 0
      AND COALESCE(cr.estado,'') <> 'cancelada'
      AND GREATEST(cr.total - COALESCE(cr.monto_pagado,0), 0) > 0
      $filterSql
    ORDER BY cr.fecha ASC, cr.id ASC
    LIMIT 120
", ['empresa' => $empresaId]);
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cuentas por pagar - Starlim</title>
    <link rel="stylesheet" href="../css/global.css"><link rel="stylesheet" href="../css/styleEmpleado.css"><link rel="stylesheet" href="../css/theme.css">
</head>
<body>
<?php $NAV_ACTIVA = 'admin'; $ADMIN_ACTIVA = 'admin.cuentas_por_pagar'; include __DIR__ . '/partials/nav.php'; ?>
<main class="dash-main admin-page">
    <header class="admin-page-head"><div><p class="exec-kicker">Administracion</p><h1>Cuentas por pagar</h1><p>Deudas a proveedores desde compras pendientes y pagos aplicados.</p></div><a class="exec-btn exec-btn--ghost" href="panel_cobros_pagos.php?tab=pagos">Ir a pagos</a></header>
    <form class="admin-filterbar" method="GET">
        <label><span>Estado</span><select name="estado"><option value="todos" <?= $estado==='todos'?'selected':'' ?>>Todas</option><option value="vencidas" <?= $estado==='vencidas'?'selected':'' ?>>Vencidas</option><option value="proximas" <?= $estado==='proximas'?'selected':'' ?>>Proximos 7 dias</option></select></label>
        <div class="admin-filter-actions"><button class="exec-btn exec-btn--primary" type="submit">Filtrar</button></div>
    </form>
    <section class="admin-treasury-grid">
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Saldo proveedor</span><small><?= ar_int($summary['cantidad']) ?> compras pendientes.</small></div><strong><?= ar_money($summary['total']) ?></strong></article>
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Vencido</span><small>Fecha anterior a <?= ar_date($today) ?>.</small></div><strong><?= ar_money($summary['vencido']) ?></strong></article>
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Vence proximos 7 dias</span><small>Hasta <?= ar_date($next7) ?>.</small></div><strong><?= ar_money($summary['proximo']) ?></strong></article>
    </section>
    <section class="admin-card">
        <div class="admin-card-head"><div><h2>Deudas abiertas</h2><p>Compras no canceladas con saldo pendiente.</p></div></div>
        <?php if (!$items): ?><p class="exec-empty">No hay cuentas por pagar para el filtro seleccionado.</p><?php else: ?>
            <div class="admin-treasury-table">
                <div class="admin-treasury-row admin-treasury-row--head"><span>Vencimiento</span><span>Proveedor</span><span>Estado</span><span>Saldo</span></div>
                <?php foreach ($items as $it): ?><a class="admin-treasury-row" href="panel_cobros_pagos.php?tab=pagos"><span><?= ar_date($it['fecha']) ?></span><strong><?= ar_h($it['proveedor']) ?></strong><span><?= ar_h($it['estado']) ?></span><b><?= ar_money($it['saldo']) ?></b></a><?php endforeach; ?>
            </div>
        <?php endif; ?>
    </section>
</main>
<script src="../js/global.js"></script>
</body>
</html>
