<?php
    require __DIR__ . '/partials/guard.php';

    include '../php/conexion_starlim_be.php';

    function fmt_pesos_s(float $v): string {
        return '$' . number_format($v, 2, ',', '.');
    }

    $stock_stats = [
        'valor' => 0.0,
        'unidades_reales' => 0,
        'reservadas' => 0,
        'disponibles' => 0,
        'productos_bajos' => 0,
        'mov_mes' => 0,
        'mov_pasado' => 0,
    ];
    $rs = $conexion->query("
        SELECT
            COALESCE(SUM(stock_real * costo), 0) AS valor,
            COALESCE(SUM(stock_real), 0)         AS unidades_reales,
            COALESCE(SUM(reservado), 0)          AS reservadas,
            COALESCE(SUM(disponible), 0)         AS disponibles,
            COALESCE(SUM(CASE WHEN disponible <= 0 THEN 1 ELSE 0 END), 0) AS productos_bajos
        FROM vista_stock_disponible
    ");
    if ($rs && ($row = $rs->fetch_assoc())) {
        $stock_stats['valor']           = (float)$row['valor'];
        $stock_stats['unidades_reales'] = (int)$row['unidades_reales'];
        $stock_stats['reservadas']      = (int)$row['reservadas'];
        $stock_stats['disponibles']     = (int)$row['disponibles'];
        $stock_stats['productos_bajos'] = (int)$row['productos_bajos'];
    }

    $stock_logs = [];
    $stock_logs_ok = $conexion->query("SHOW TABLES LIKE 'stock_modificaciones'")->num_rows > 0;
    if ($stock_logs_ok) {
        $rm = $conexion->query("
            SELECT
                SUM(CASE WHEN fecha >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 ELSE 0 END) AS mov_mes,
                SUM(CASE WHEN fecha >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
                          AND fecha <  DATE_TRUNC('month', CURRENT_DATE) THEN 1 ELSE 0 END) AS mov_pasado
            FROM stock_modificaciones
        ");
        if ($rm && ($m = $rm->fetch_assoc())) {
            $stock_stats['mov_mes']    = (int)($m['mov_mes'] ?? 0);
            $stock_stats['mov_pasado'] = (int)($m['mov_pasado'] ?? 0);
        }

        $rl = $conexion->query("
            SELECT empleado, producto_nombre, cambios, justificacion, fecha
            FROM stock_modificaciones
            ORDER BY fecha DESC
            LIMIT 6
        ");
        if ($rl) while ($log = $rl->fetch_assoc()) $stock_logs[] = $log;
    }

    $stock_delta_mov = $stock_stats['mov_mes'] - $stock_stats['mov_pasado'];

    /* ── Tabla "Reponer" ──────────────────────────────────────────────
     *
     * Algoritmo:
     *   1. Para cada producto, suma las unidades vendidas en los últimos
     *      6 meses (de detalle_ventas + ventas).
     *   2. Calcula el promedio mensual:
     *        avg_mensual = total_vendido / meses_con_datos   (mín. 1 mes)
     *   3. Cantidad recomendada = CEIL(avg_mensual × 2)
     *      (buffer de 2 meses de ventas).
     *   4. Solo muestra productos cuyo stock actual < cnt_recomendada,
     *      ordenados por urgencia (mayor déficit primero).
     *
     * Fallback: si no hay tabla detalle_ventas o no hay datos de ventas,
     *   muestra los productos con cantidad = 0.
     * ──────────────────────────────────────────────────────────────── */
    $reponer      = [];
    $reponer_mode = 'sales'; // 'sales' | 'fallback'

    $tableCheck = $conexion->query("SHOW TABLES LIKE 'detalle_ventas'");
    if ($tableCheck && $tableCheck->num_rows > 0) {

        $sql = "
            SELECT
                base.id,
                base.imagen,
                base.nombre,
                base.stock_actual,
                base.reservado,
                base.disponible,
                base.costo,
                base.cnt_recomendada
            FROM (
                SELECT
                    p.id,
                    p.imagen,
                    p.nombre,
                    vsd.stock_real                                      AS stock_actual,
                    vsd.reservado,
                    vsd.disponible,
                    p.costo,
                    CEIL(
                        GREATEST(
                            SUM(dv.cantidad)::numeric
                            / GREATEST(
                                EXTRACT(YEAR FROM age(CURRENT_DATE, MIN(v.fecha))) * 12
                                + EXTRACT(MONTH FROM age(CURRENT_DATE, MIN(v.fecha))),
                                1
                            )
                            * 2,
                            1
                        )
                    )                                                   AS cnt_recomendada
                FROM productos p
                JOIN vista_stock_disponible vsd ON vsd.id = p.id
                JOIN detalle_ventas  dv ON dv.id_producto = p.id
                JOIN ventas          v  ON v.id = dv.id_venta
                WHERE v.fecha >= CURRENT_DATE - INTERVAL '6 months'
                GROUP BY p.id, p.imagen, p.nombre, vsd.stock_real, vsd.reservado, vsd.disponible, p.costo
            ) AS base
            WHERE base.disponible < base.cnt_recomendada
            ORDER BY (base.cnt_recomendada - base.disponible) DESC
            LIMIT 20
        ";

        $r = $conexion->query($sql);
        if ($r) {
            while ($row = $r->fetch_assoc()) $reponer[] = $row;
        }
    }

    // Fallback: productos sin stock
    if (empty($reponer)) {
        $reponer_mode = 'fallback';
        $r2 = $conexion->query("
            SELECT id, imagen, nombre,
                   stock_real AS stock_actual,
                   reservado,
                   disponible,
                   costo,
                   NULL  AS cnt_recomendada
            FROM vista_stock_disponible
            WHERE disponible <= 0
            ORDER BY nombre ASC
            LIMIT 20
        ");
        if ($r2) {
            while ($row = $r2->fetch_assoc()) $reponer[] = $row;
        }
    }
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stock — Star Lim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <link rel="stylesheet" href="../css/panel_bd.css">
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>

    <?php $NAV_ACTIVA = 'stock'; include __DIR__ . '/partials/nav.php'; ?>

    <main class="dash-main">

        <div class="ventas-layout">

        <!-- ── Sidebar accesos rápidos ── -->
        <aside class="ventas-sidebar" id="ventas-sidebar">
            <button class="sidebar-open-btn" id="sidebar-open-btn">EXPANDIR &rsaquo;</button>
            <div class="ventas-sidebar-inner">
                <button class="sidebar-close-btn" id="sidebar-close-btn">&lsaquo; MINIMIZAR</button>
                <div class="bd-cards">
                    <a href="edit_stock.php" class="bd-card">
                        <div class="bd-card-body">
                            <span class="bd-card-title">Cambiar Stock</span>
                            <span class="bd-card-desc">Editar productos existentes del inventario</span>
                        </div>
                        <span class="bd-card-arrow">→</span>
                    </a>
                    <a href="new_stock.php" class="bd-card">
                        <div class="bd-card-body">
                            <span class="bd-card-title">Nuevo Stock</span>
                            <span class="bd-card-desc">Agregar nuevos productos al inventario</span>
                        </div>
                        <span class="bd-card-arrow">→</span>
                    </a>
                    <?php if (in_array($rango, ['Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'], true)): ?>
                    <a href="recontar_stock.php" class="bd-card">
                        <div class="bd-card-body">
                            <span class="bd-card-title">Recontar Stock</span>
                            <span class="bd-card-desc">Ajustar stock por reconteo o inventario</span>
                        </div>
                        <span class="bd-card-arrow">→</span>
                    </a>
                    <?php endif; ?>
                    <?php if (in_array($rango, ['Jefe', 'Jefe1', 'Admin'], true)): ?>
                    <a href="carga_masiva.php" class="bd-card" style="border-left: 3px solid #f59e0b;">
                        <div class="bd-card-body">
                            <span class="bd-card-title">Carga Masiva</span>
                            <span class="bd-card-desc">Reemplazar toda la base de productos</span>
                        </div>
                        <span class="bd-card-arrow">→</span>
                    </a>
                    <?php endif; ?>
                </div>
            </div>
        </aside>

        <!-- ── Contenido principal ── -->
        <div class="ventas-content">

        <section class="bd-panel stock-dashboard">
            <div class="reponer-head">
                <div>
                    <h2 class="reponer-title">Dashboard de stock</h2>
                    <p class="reponer-help">Resumen rápido del inventario físico, reservado y disponible.</p>
                </div>
                <a href="registro_stock.php" class="reponer-ver-mas" style="margin:0;">Registro de variaciones →</a>
            </div>

            <div class="stats-grid">
                <div class="stat-card stat-wide">
                    <span class="stat-label">Valor monetario en stock</span>
                    <span class="stat-value"><?= fmt_pesos_s($stock_stats['valor']) ?></span>
                </div>
                <div class="stat-card">
                    <span class="stat-label">Unidades reales</span>
                    <span class="stat-value"><?= number_format($stock_stats['unidades_reales'], 0, ',', '.') ?></span>
                </div>
                <div class="stat-card">
                    <span class="stat-label">Reservadas</span>
                    <span class="stat-value c-yellow"><?= number_format($stock_stats['reservadas'], 0, ',', '.') ?></span>
                </div>
                <div class="stat-card">
                    <span class="stat-label">Disponibles</span>
                    <span class="stat-value c-green"><?= number_format($stock_stats['disponibles'], 0, ',', '.') ?></span>
                </div>
                <div class="stat-card">
                    <span class="stat-label">Productos sin disponible</span>
                    <span class="stat-value"><?= number_format($stock_stats['productos_bajos'], 0, ',', '.') ?></span>
                </div>
                <div class="stat-card">
                    <span class="stat-label">Variaciones mes</span>
                    <span class="stat-value"><?= number_format($stock_stats['mov_mes'], 0, ',', '.') ?></span>
                    <small style="opacity:.65;"><?= $stock_delta_mov >= 0 ? '+' : '' ?><?= $stock_delta_mov ?> vs mes pasado</small>
                </div>
            </div>

            <div class="reponer-demo" aria-label="Últimas variaciones de stock">
                <span class="reponer-demo-label">Últimas variaciones</span>
                <?php if (empty($stock_logs)): ?>
                    <span>Sin movimientos registrados todavía.</span>
                <?php else: foreach ($stock_logs as $log): ?>
                    <span><strong><?= htmlspecialchars($log['producto_nombre']) ?></strong> <?= htmlspecialchars($log['empleado']) ?> · <?= date('d/m H:i', strtotime($log['fecha'])) ?></span>
                <?php endforeach; endif; ?>
            </div>
        </section>

        <!-- Tabla Reponer -->
        <section class="bd-panel reponer-panel">
            <div class="reponer-head">
                <div>
                    <h2 class="reponer-title">Reponer</h2>
                    <p class="reponer-help">Productos con stock disponible bajo o agotado, priorizados para compra.</p>
                </div>
                <span class="reponer-count"><?= count($reponer) ?> item<?= count($reponer) === 1 ? '' : 's' ?></span>
            </div>

            <div class="reponer-demo" aria-label="Demo de lectura de reposición">
                <span class="reponer-demo-label">Demo de lectura</span>
                <span><strong>Real</strong> stock físico</span>
                <span><strong>Reservado</strong> pedidos pendientes</span>
                <span><strong>Disponible</strong> listo para vender</span>
                <span><strong>Faltante</strong> sugerencia de compra</span>
            </div>

            <?php if (empty($reponer)): ?>
                <p class="reponer-empty">
                    <?= $reponer_mode === 'fallback'
                        ? 'Todos los productos tienen stock suficiente.'
                        : 'Sin datos de ventas disponibles para calcular reposición.' ?>
                </p>
            <?php else: ?>

            <?php if ($reponer_mode === 'fallback'): ?>
                <p class="reponer-note">
                    Sin historial de ventas — mostrando productos sin stock.
                </p>
            <?php endif; ?>

            <div class="reponer-table-wrap">
            <table class="reponer-table">
                <thead>
                    <tr>
                        <th>Producto</th>
                        <th>Real</th>
                        <th>Reservado</th>
                        <th>Disponible</th>
                        <th>Recomendado</th>
                        <th>Faltante</th>
                        <th>Precio</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($reponer as $p):
                        $stock    = (int)$p['stock_actual'];
                        $reservado = (int)($p['reservado'] ?? 0);
                        $disp     = isset($p['disponible']) ? (int)$p['disponible'] : $stock;
                        $rec      = $p['cnt_recomendada'] !== null ? (int)$p['cnt_recomendada'] : null;
                        $faltante = $rec !== null ? max(0, $rec - $disp) : null;

                        // Color según urgencia: lo que importa es el DISPONIBLE
                        $qtyClass = '';
                        if ($disp <= 0)          $qtyClass = 'reponer-qty--critical';
                        elseif ($rec && $disp < $rec * 0.3) $qtyClass = 'reponer-qty--critical';
                        elseif ($rec && $disp < $rec * 0.6) $qtyClass = 'reponer-qty--low';
                    ?>
                    <tr class="reponer-row">
                        <td class="reponer-producto-cell">
                            <div class="reponer-producto">
                            <?php if (!empty($p['imagen'])): ?>
                            <img src="<?= htmlspecialchars(str_starts_with($p['imagen'], 'http') ? $p['imagen'] : '../' . $p['imagen']) ?>"
                                 alt="<?= htmlspecialchars($p['nombre']) ?>"
                                 class="reponer-img"
                                 onerror="this.style.display='none'">
                            <?php else: ?>
                            <div class="reponer-img reponer-img--empty"></div>
                            <?php endif; ?>
                                <div class="reponer-producto-info">
                                    <span class="reponer-nombre"><?= htmlspecialchars($p['nombre']) ?></span>
                                    <span class="reponer-id">ID <?= (int)$p['id'] ?></span>
                                </div>
                            </div>
                        </td>
                        <td><span class="reponer-number"><?= $stock ?></span></td>
                        <td><span class="reponer-number <?= $reservado > 0 ? 'reponer-reservado' : 'reponer-muted' ?>"><?= $reservado ?></span></td>
                        <td><span class="reponer-pill <?= $qtyClass ?>"><?= $disp ?></span></td>
                        <td><span class="reponer-number reponer-rec"><?= $rec !== null ? $rec : '—' ?></span></td>
                        <td><span class="reponer-pill reponer-faltante"><?= $faltante !== null ? $faltante : '—' ?></span></td>
                        <td class="reponer-precio"><?= fmt_pesos_s((float)($p['costo'] ?? 0)) ?></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
            </div>

            <?php endif; ?>

            <a href="edit_stock.php" class="reponer-ver-mas">Ver más →</a>
        </section>

        </div><!-- /ventas-content -->

        </div><!-- /ventas-layout -->

    </main>

    <script src="../js/global.js"></script>
    <script>
        const _sidebar  = document.getElementById('ventas-sidebar');
        const _openBtn  = document.getElementById('sidebar-open-btn');
        const _closeBtn = document.getElementById('sidebar-close-btn');
        _openBtn.addEventListener('click',  () => _sidebar.classList.remove('sidebar-collapsed'));
        _closeBtn.addEventListener('click', () => _sidebar.classList.add('sidebar-collapsed'));
    </script>
</body>
</html>
