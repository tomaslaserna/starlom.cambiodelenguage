<?php
    $PERMITIDOS = ['Empleado_2', 'Jefe', 'Jefe1', 'Admin'];
    require __DIR__ . '/partials/guard.php';

    include '../php/conexion_starlim_be.php';

    $inicio_mes = date('Y-m-01');
    $inicio_sig = date('Y-m-d', strtotime($inicio_mes . ' +1 month'));

    // Métricas de venta del mes actual. Lo cobrado/vencido vive en Cobros y Pagos.
    $r = $conexion->query("
        SELECT
            COUNT(*)                 AS pedidos_entregados,
            COALESCE(SUM(monto), 0)  AS facturacion_mes,
            COALESCE(AVG(monto), 0)  AS ticket_promedio
        FROM ventas
        WHERE COALESCE(estado_pedido,'entregado') = 'entregado'
          AND fecha >= '$inicio_mes' AND fecha < '$inicio_sig'
    ");
    $stats = $r ? $r->fetch_assoc() : null;

    $top_clientes = [];
    $rtop = $conexion->query("
        SELECT COALESCE(NULLIF(nombre_cliente,''), dni_cliente, 'Sin cliente') AS cliente,
               COUNT(*) AS pedidos,
               COALESCE(SUM(monto), 0) AS total
        FROM ventas
        WHERE COALESCE(estado_pedido,'entregado') = 'entregado'
          AND fecha >= '$inicio_mes' AND fecha < '$inicio_sig'
        GROUP BY COALESCE(NULLIF(nombre_cliente,''), dni_cliente, 'Sin cliente')
        ORDER BY total DESC
        LIMIT 3
    ");
    if ($rtop) while ($row = $rtop->fetch_assoc()) $top_clientes[] = $row;

    $proximas_compras = [];
    try {
        require_once __DIR__ . '/../php/seguimiento_lib.php';
        $seg = starlim_calcular_seguimiento($conexion);
        $candidatos = array_merge($seg['grupos']['contactar'] ?? [], $seg['grupos']['riesgo'] ?? []);
        foreach (array_slice($candidatos, 0, 5) as $c) $proximas_compras[] = $c;
    } catch (Throwable $e) {
        $proximas_compras = [];
    }

    // Pedidos en curso (no entregados) por estado → acceso rápido a logística
    $pedidos_curso = ['recibido' => 0, 'en_proceso' => 0, 'pendiente_entrega' => 0];
    $rp = $conexion->query("
        SELECT estado_pedido, COUNT(*) AS c FROM ventas
        WHERE estado_pedido IN ('recibido','en_proceso','pendiente_entrega')
        GROUP BY estado_pedido
    ");
    if ($rp) while ($row = $rp->fetch_assoc()) $pedidos_curso[$row['estado_pedido']] = (int)$row['c'];
    $pedidos_total = array_sum($pedidos_curso);

    // Presupuestos (sección propia de Ventas, separada de Facturación):
    // vigentes = pendientes sin vencer.
    $presup = ['pendientes' => 0, 'vigentes' => 0, 'aceptados' => 0];
    $rpr = $conexion->query("
        SELECT
            COALESCE(SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END), 0)                                          AS pendientes,
            COALESCE(SUM(CASE WHEN estado = 'pendiente' AND fecha_vencimiento >= CURRENT_DATE THEN 1 ELSE 0 END), 0)    AS vigentes,
            COALESCE(SUM(CASE WHEN estado = 'aceptada' THEN 1 ELSE 0 END), 0)                                           AS aceptados
        FROM presupuestos
    ");
    if ($rpr && ($prow = $rpr->fetch_assoc())) {
        $presup['pendientes'] = (int)$prow['pendientes'];
        $presup['vigentes']   = (int)$prow['vigentes'];
        $presup['aceptados']  = (int)$prow['aceptados'];
    }

    function fmt_pesos(float $v): string {
        return '$' . number_format($v, 2, ',', '.');
    }
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ventas — Star Lim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <link rel="stylesheet" href="../css/panel_ventas.css">
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>

    <?php $NAV_ACTIVA = 'ventas'; include __DIR__ . '/partials/nav.php'; ?>

    <main class="dash-main">

        <div class="ventas-layout">

        <!-- ── Sidebar accesos rápidos ── -->
        <aside class="ventas-sidebar" id="ventas-sidebar">

            <!-- Botón visible cuando está colapsado -->
            <button class="sidebar-open-btn" id="sidebar-open-btn">EXPANDIR &rsaquo;</button>

            <!-- Contenido expandido -->
            <div class="ventas-sidebar-inner">
                <button class="sidebar-close-btn" id="sidebar-close-btn">&lsaquo; MINIMIZAR</button>
                <div class="sidebar-action-cards">
                    <a href="ventas_registradas.php" class="action-card">
                        <div class="action-card-inner">
                            <span class="action-card-title">Ventas Registradas</span>
                            <span class="action-card-sub">Historial completo de facturas y cobros</span>
                        </div>
                        <span class="action-card-arrow">→</span>
                    </a>
                    <a href="factura_manual.php" class="action-card">
                        <div class="action-card-inner">
                            <span class="action-card-title">Cargar pedido</span>
                            <span class="action-card-sub">Nuevo pedido para depósito y entrega</span>
                        </div>
                        <span class="action-card-arrow">→</span>
                    </a>
                    <a href="presupuestos.php" class="action-card">
                        <div class="action-card-inner">
                            <span class="action-card-title">Presupuestos</span>
                            <span class="action-card-sub">Armar presupuestos y seguir los vigentes</span>
                        </div>
                        <span class="action-card-arrow">→</span>
                    </a>
                </div>
            </div>

        </aside>

        <!-- ── Contenido principal ── -->
        <div class="ventas-content">

        <!-- Dashboard -->
        <div class="dash-grid">

            <!-- Panel izquierdo: resumen de ventas -->
            <section class="dash-panel">
                <h2 class="panel-title">Ventas del mes</h2>
                <div class="stats-grid">

                    <div class="stat-card">
                        <span class="stat-label">Pedidos entregados</span>
                        <span class="stat-value"><?= $stats ? (int)$stats['pedidos_entregados'] : 0 ?></span>
                    </div>

                    <div class="stat-card stat-wide">
                        <span class="stat-label">Facturación mensual</span>
                        <span class="stat-value"><?= fmt_pesos((float)($stats['facturacion_mes'] ?? 0)) ?></span>
                    </div>

                    <div class="stat-card">
                        <span class="stat-label">Ticket promedio</span>
                        <span class="stat-value c-green"><?= fmt_pesos((float)($stats['ticket_promedio'] ?? 0)) ?></span>
                    </div>

                </div>
                <p style="margin-top:14px;font-size:13px;opacity:.6;">Mes actual: <?= date('m/Y') ?>. El estado de los cobros se gestiona en <a href="panel_cobros_pagos.php">Cobros y Pagos</a>.</p>
            </section>

            <section class="dash-panel">
                <h2 class="panel-title">Top clientes del mes</h2>
                <?php if (empty($top_clientes)): ?>
                    <p class="inv-empty inv-empty--ok">Sin ventas entregadas este mes.</p>
                <?php else: ?>
                    <div style="display:grid;gap:9px;">
                    <?php foreach ($top_clientes as $idx => $tc): ?>
                        <div class="stat-card" style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
                            <span class="stat-label" style="font-size:12px;"><?= ($idx + 1) ?>. <?= htmlspecialchars($tc['cliente']) ?><br><small><?= (int)$tc['pedidos'] ?> pedido<?= (int)$tc['pedidos'] === 1 ? '' : 's' ?></small></span>
                            <span class="stat-value" style="font-size:18px;"><?= fmt_pesos((float)$tc['total']) ?></span>
                        </div>
                    <?php endforeach; ?>
                    </div>
                <?php endif; ?>
            </section>

            <section class="dash-panel" style="grid-column:1 / -1;">
                <h2 class="panel-title">Predicción de próximas compras</h2>
                <?php if (empty($proximas_compras)): ?>
                    <p class="inv-empty inv-empty--ok">Sin clientes para contactar según el seguimiento actual.</p>
                <?php else: ?>
                    <div class="stats-grid">
                    <?php foreach ($proximas_compras as $pc): ?>
                        <div class="stat-card">
                            <span class="stat-label"><?= htmlspecialchars($pc['nombre_cliente']) ?></span>
                            <span class="stat-value" style="font-size:18px;"><?= htmlspecialchars($pc['proxima']) ?></span>
                            <small style="opacity:.65;">Última: <?= htmlspecialchars($pc['ultima_fmt']) ?> · ritmo <?= (int)$pc['promedio'] ?> días</small>
                        </div>
                    <?php endforeach; ?>
                    </div>
                <?php endif; ?>
                <a href="seguimiento_clientes.php" class="inv-ver-mas">Ver seguimiento →</a>
            </section>

            <!-- Panel derecho: pedidos en curso (logística) -->
            <section class="dash-panel">
                <h2 class="panel-title">Pedidos en curso</h2>
                <div class="stats-grid">
                    <div class="stat-card">
                        <span class="stat-label">Recibidos</span>
                        <span class="stat-value"><?= $pedidos_curso['recibido'] ?></span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-label">En proceso</span>
                        <span class="stat-value c-yellow"><?= $pedidos_curso['en_proceso'] ?></span>
                    </div>
                    <div class="stat-card stat-wide">
                        <span class="stat-label">Pendiente de entrega</span>
                        <span class="stat-value"><?= $pedidos_curso['pendiente_entrega'] ?></span>
                    </div>
                </div>
                <?php if ($pedidos_total === 0): ?>
                    <p class="inv-empty inv-empty--ok" style="margin-top:14px;">No hay pedidos en curso.</p>
                <?php endif; ?>
                <a href="pedidos.php" class="inv-ver-mas">Ir a Pedidos →</a>
            </section>

            <!-- Panel ancho: presupuestos (sección propia, separada de facturación) -->
            <section class="dash-panel" style="grid-column:1 / -1;">
                <h2 class="panel-title">Presupuestos</h2>
                <div class="stats-grid">
                    <div class="stat-card">
                        <span class="stat-label">Vigentes</span>
                        <span class="stat-value c-green"><?= $presup['vigentes'] ?></span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-label">Pendientes</span>
                        <span class="stat-value"><?= $presup['pendientes'] ?></span>
                    </div>
                    <div class="stat-card">
                        <span class="stat-label">Aceptados</span>
                        <span class="stat-value"><?= $presup['aceptados'] ?></span>
                    </div>
                </div>
                <?php if (($presup['pendientes'] + $presup['aceptados']) === 0): ?>
                    <p class="inv-empty inv-empty--ok" style="margin-top:14px;">Todavía no hay presupuestos cargados.</p>
                <?php endif; ?>
                <a href="presupuestos.php" class="inv-ver-mas">Ir a Presupuestos →</a>
            </section>

        </div><!-- /dash-grid -->

        </div><!-- /ventas-content -->

        </div><!-- /ventas-layout -->

    </main>

    <script src="../js/global.js"></script>
    <script>
        const _sidebar    = document.getElementById('ventas-sidebar');
        const _openBtn    = document.getElementById('sidebar-open-btn');
        const _closeBtn   = document.getElementById('sidebar-close-btn');

        // Estado inicial: expandido
        function colapsarSidebar()  { _sidebar.classList.add('sidebar-collapsed'); }
        function expandirSidebar()  { _sidebar.classList.remove('sidebar-collapsed'); }

        _openBtn.addEventListener('click',  expandirSidebar);
        _closeBtn.addEventListener('click', colapsarSidebar);
    </script>
</body>
</html>
