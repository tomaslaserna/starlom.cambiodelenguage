<?php
$PERMITIDOS = ['Empleado_2', 'Jefe', 'Jefe1', 'Admin'];
require __DIR__ . '/partials/guard.php';

include '../php/conexion_starlim_be.php';

$inicio_mes = date('Y-m-01');
$inicio_sig = date('Y-m-d', strtotime($inicio_mes . ' +1 month'));

function ventas_scalar($conexion, string $sql, $default = 0) {
    try {
        $r = $conexion->query($sql);
        if (!$r) return $default;
        $row = $r->fetch_assoc();
        if (!$row) return $default;
        return array_values($row)[0] ?? $default;
    } catch (Throwable $e) {
        return $default;
    }
}

function ventas_row($conexion, string $sql, array $default): array {
    try {
        $r = $conexion->query($sql);
        if (!$r) return $default;
        $row = $r->fetch_assoc();
        return $row ? array_merge($default, $row) : $default;
    } catch (Throwable $e) {
        return $default;
    }
}

function fmt_pesos(float $v): string {
    return '$' . number_format($v, 2, ',', '.');
}

$stats = ventas_row($conexion, "
    SELECT
        COUNT(*)                AS pedidos_entregados,
        COALESCE(SUM(monto), 0) AS facturacion_mes,
        COALESCE(AVG(monto), 0) AS ticket_promedio
    FROM ventas
    WHERE COALESCE(estado_pedido,'entregado') = 'entregado'
      AND fecha >= '$inicio_mes' AND fecha < '$inicio_sig'
", ['pedidos_entregados' => 0, 'facturacion_mes' => 0, 'ticket_promedio' => 0]);

$presup = ventas_row($conexion, "
    SELECT
        COALESCE(SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END), 0) AS pendientes,
        COALESCE(SUM(CASE WHEN estado = 'pendiente' AND fecha_vencimiento < CURRENT_DATE THEN 1 ELSE 0 END), 0) AS vencidos,
        COALESCE(SUM(CASE WHEN estado IN ('aceptada','aprobada') THEN 1 ELSE 0 END), 0) AS aprobados,
        COALESCE(SUM(CASE WHEN estado IN ('denegada','rechazada','cancelada') THEN 1 ELSE 0 END), 0) AS rechazados,
        COALESCE(SUM(CASE WHEN estado = 'pendiente'
                           AND fecha_vencimiento >= CURRENT_DATE
                           AND fecha_vencimiento <= CURRENT_DATE + INTERVAL '3 days'
                          THEN 1 ELSE 0 END), 0) AS seguimiento
    FROM presupuestos
", ['pendientes' => 0, 'vencidos' => 0, 'aprobados' => 0, 'rechazados' => 0, 'seguimiento' => 0]);

$pedidos = ventas_row($conexion, "
    SELECT
        COALESCE(SUM(CASE WHEN estado_pedido = 'recibido' THEN 1 ELSE 0 END), 0) AS recibidos,
        COALESCE(SUM(CASE WHEN estado_pedido = 'en_proceso' THEN 1 ELSE 0 END), 0) AS en_proceso,
        COALESCE(SUM(CASE WHEN estado_pedido = 'pendiente_entrega' THEN 1 ELSE 0 END), 0) AS listos,
        COALESCE(SUM(CASE WHEN estado_pedido = 'entregado' AND fecha >= '$inicio_mes' AND fecha < '$inicio_sig' THEN 1 ELSE 0 END), 0) AS entregados_mes,
        COALESCE(SUM(CASE WHEN estado_pedido IN ('recibido','en_proceso','pendiente_entrega')
                           AND creado_en < NOW() - INTERVAL '2 days'
                          THEN 1 ELSE 0 END), 0) AS demorados
    FROM ventas
", ['recibidos' => 0, 'en_proceso' => 0, 'listos' => 0, 'entregados_mes' => 0, 'demorados' => 0]);

$pedidos_stock = ventas_scalar($conexion, "
    SELECT COUNT(DISTINCT v.id)
    FROM ventas v
    JOIN detalle_ventas dv ON dv.id_venta = v.id
    JOIN productos p ON p.id = dv.id_producto
    WHERE v.estado_pedido IN ('recibido','en_proceso','pendiente_entrega')
      AND dv.cantidad > p.stock
", 0);

$compras = ventas_row($conexion, "
    SELECT
        COALESCE(SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END), 0) AS pendientes,
        COALESCE(SUM(CASE WHEN estado = 'en_camino' THEN 1 ELSE 0 END), 0) AS en_camino,
        COALESCE(SUM(CASE WHEN estado = 'recibida' AND fecha >= CURRENT_DATE - INTERVAL '7 days' THEN 1 ELSE 0 END), 0) AS recibidas_recientes
    FROM compras_registro
", ['pendientes' => 0, 'en_camino' => 0, 'recibidas_recientes' => 0]);

$stock = ventas_row($conexion, "
    SELECT
        COALESCE(SUM(CASE WHEN p.stock > 0 AND p.stock <= 5 THEN 1 ELSE 0 END), 0) AS bajo,
        COALESCE(SUM(CASE WHEN p.stock <= 0 THEN 1 ELSE 0 END), 0) AS sin_stock
    FROM productos p
", ['bajo' => 0, 'sin_stock' => 0]);

$stock_comprometido = ventas_scalar($conexion, "
    SELECT COALESCE(SUM(reservado), 0) FROM vista_stock_disponible
", 0);

$reposicion_alertas = ventas_scalar($conexion, "
    SELECT COUNT(*) FROM vista_stock_disponible WHERE disponible <= 0
", 0);

$alertas = [];
if ((int)$pedidos_stock > 0) {
    $alertas[] = ['alta', 'Pedidos con problema de stock', (int)$pedidos_stock . ' pedido(s) requieren revisar faltantes.'];
}
if ((int)$pedidos['demorados'] > 0) {
    $alertas[] = ['media', 'Pedidos demorados', (int)$pedidos['demorados'] . ' pedido(s) llevan mas de 48 hs sin entregarse.'];
}
if ((int)$presup['seguimiento'] > 0) {
    $alertas[] = ['media', 'Presupuestos por seguir', (int)$presup['seguimiento'] . ' vencen dentro de los proximos 3 dias.'];
}
if ((int)$reposicion_alertas > 0) {
    $alertas[] = ['alta', 'Reposicion critica', (int)$reposicion_alertas . ' producto(s) tienen stock disponible en cero o negativo.'];
}
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ventas - Star Lim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <link rel="stylesheet" href="../css/panel_ventas.css">
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>

<?php $NAV_ACTIVA = 'ventas'; include __DIR__ . '/partials/nav.php'; ?>

<main class="dash-main">
    <div class="ventas-layout">
        <?php $VENTAS_ACTIVA = ''; include __DIR__ . '/partials/ventas_sidebar.php'; ?>

        <div class="ventas-content">
            <div class="ventas-page-head">
                <div>
                    <h1 class="dash-hello">Ventas</h1>
                    <p class="ventas-page-sub">Panel operativo diario para presupuestos, pedidos, compras y stock.</p>
                </div>
                <a class="ventas-primary-action" href="factura_manual.php">Cargar pedido</a>
            </div>

            <div class="dash-grid ventas-dashboard-grid">
                <section class="dash-panel ventas-panel-main">
                    <div class="panel-header-line">
                        <h2 class="panel-title">Ventas del mes</h2>
                        <span class="panel-period"><?= date('m/Y') ?></span>
                    </div>
                    <div class="stats-grid ventas-money-grid">
                        <div class="stat-card">
                            <span class="stat-label">Pedidos entregados</span>
                            <span class="stat-value"><?= (int)$stats['pedidos_entregados'] ?></span>
                        </div>
                        <div class="stat-card stat-wide stat-money">
                            <span class="stat-label">Facturacion mensual</span>
                            <span class="stat-value money-value"><?= fmt_pesos((float)$stats['facturacion_mes']) ?></span>
                        </div>
                        <div class="stat-card stat-wide stat-money stat-money--ticket">
                            <span class="stat-label">Ticket promedio</span>
                            <span class="stat-value money-value c-green"><?= fmt_pesos((float)$stats['ticket_promedio']) ?></span>
                        </div>
                    </div>
                    <p class="ventas-note">Los cobros y saldos se administran desde <a href="panel_cobros_pagos.php">Cobros y Pagos</a>.</p>
                </section>

                <section class="dash-panel ops-alert-panel">
                    <div class="panel-header-line">
                        <h2 class="panel-title">Prioridad de hoy</h2>
                    </div>
                    <?php if (empty($alertas)): ?>
                        <p class="inv-empty inv-empty--ok">Sin alertas operativas criticas.</p>
                    <?php else: ?>
                        <div class="ops-alert-list">
                            <?php foreach ($alertas as [$nivel, $titulo, $texto]): ?>
                                <div class="ops-alert ops-alert--<?= htmlspecialchars($nivel) ?>">
                                    <strong><?= htmlspecialchars($titulo) ?></strong>
                                    <span><?= htmlspecialchars($texto) ?></span>
                                </div>
                            <?php endforeach; ?>
                        </div>
                    <?php endif; ?>
                </section>

                <section class="dash-panel ops-card">
                    <div class="panel-header-line">
                        <h2 class="panel-title">Presupuestos</h2>
                        <a href="presupuestos.php" class="ops-link">Abrir</a>
                    </div>
                    <div class="ops-metric-grid">
                        <div class="ops-metric"><span>Pendientes</span><strong><?= (int)$presup['pendientes'] ?></strong></div>
                        <div class="ops-metric"><span>Aprobados</span><strong class="c-green"><?= (int)$presup['aprobados'] ?></strong></div>
                        <div class="ops-metric"><span>Vencidos</span><strong class="c-red"><?= (int)$presup['vencidos'] ?></strong></div>
                        <div class="ops-metric"><span>Seguimiento</span><strong class="c-yellow"><?= (int)$presup['seguimiento'] ?></strong></div>
                    </div>
                    <p class="ops-footnote"><?= (int)$presup['rechazados'] ?> rechazado(s) o cancelado(s).</p>
                </section>

                <section class="dash-panel ops-card">
                    <div class="panel-header-line">
                        <h2 class="panel-title">Pedidos</h2>
                        <a href="pedidos.php" class="ops-link">Abrir</a>
                    </div>
                    <div class="ops-metric-grid">
                        <div class="ops-metric"><span>Recibidos</span><strong><?= (int)$pedidos['recibidos'] ?></strong></div>
                        <div class="ops-metric"><span>En preparacion</span><strong class="c-yellow"><?= (int)$pedidos['en_proceso'] ?></strong></div>
                        <div class="ops-metric"><span>Listos</span><strong><?= (int)$pedidos['listos'] ?></strong></div>
                        <div class="ops-metric"><span>Demorados</span><strong class="c-red"><?= (int)$pedidos['demorados'] ?></strong></div>
                    </div>
                    <p class="ops-footnote"><?= (int)$pedidos['entregados_mes'] ?> entregado(s) este mes. <?= (int)$pedidos_stock ?> con faltantes.</p>
                </section>

                <section class="dash-panel ops-card">
                    <div class="panel-header-line">
                        <h2 class="panel-title">Compras relacionadas</h2>
                        <a href="compras.php" class="ops-link">Abrir</a>
                    </div>
                    <div class="ops-metric-grid">
                        <div class="ops-metric"><span>Pendientes</span><strong><?= (int)$compras['pendientes'] ?></strong></div>
                        <div class="ops-metric"><span>En camino</span><strong class="c-yellow"><?= (int)$compras['en_camino'] ?></strong></div>
                        <div class="ops-metric"><span>Recibidas 7 dias</span><strong class="c-green"><?= (int)$compras['recibidas_recientes'] ?></strong></div>
                        <div class="ops-metric"><span>Faltantes</span><strong class="c-red"><?= (int)$pedidos_stock ?></strong></div>
                    </div>
                    <p class="ops-footnote">Los faltantes salen de pedidos activos contra stock real.</p>
                </section>

                <section class="dash-panel ops-card">
                    <div class="panel-header-line">
                        <h2 class="panel-title">Stock operativo</h2>
                        <a href="stock.php" class="ops-link">Abrir</a>
                    </div>
                    <div class="ops-metric-grid">
                        <div class="ops-metric"><span>Bajo stock</span><strong class="c-yellow"><?= (int)$stock['bajo'] ?></strong></div>
                        <div class="ops-metric"><span>Sin stock</span><strong class="c-red"><?= (int)$stock['sin_stock'] ?></strong></div>
                        <div class="ops-metric"><span>Comprometido</span><strong><?= (int)$stock_comprometido ?></strong></div>
                        <div class="ops-metric"><span>Reposicion</span><strong class="c-red"><?= (int)$reposicion_alertas ?></strong></div>
                    </div>
                    <p class="ops-footnote">Comprometido = reservado por pedidos vivos aun no entregados.</p>
                </section>
            </div>
        </div>
    </div>
</main>

<script src="../js/global.js"></script>
</body>
</html>
