<?php
    require __DIR__ . '/partials/guard.php';

    include '../php/conexion_starlim_be.php';

    /* ── Recordatorios ──────────────────────────────────────────────── */
    $recordatorios = [];
    $r_rec = $conexion->query("
        SELECT id, titulo, descripcion, prioridad, fecha_creacion, fecha_limite
        FROM recordatorios
        WHERE completado = 0
        ORDER BY
            CASE WHEN fecha_limite IS NOT NULL AND fecha_limite < NOW() THEN 0 ELSE 1 END,
            CASE WHEN prioridad = 'urgente' THEN 0 WHEN prioridad = 'alta' THEN 1 ELSE 2 END,
            fecha_creacion DESC
        LIMIT 5
    ");
    if ($r_rec) {
        while ($row = $r_rec->fetch_assoc()) {
            if ($row['fecha_limite'] && strtotime($row['fecha_limite']) < time()) {
                $row['status'] = 'vencido';
            } else {
                $row['status'] = $row['prioridad'];
            }
            $row['fecha_c_fmt'] = date('d/m/Y h:i A', strtotime($row['fecha_creacion']));
            $row['fecha_l_fmt'] = $row['fecha_limite']
                ? date('d/m/Y h:i A', strtotime($row['fecha_limite']))
                : '-/-/-';
            $recordatorios[] = $row;
        }
    }
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Panel — Star Lim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <link rel="stylesheet" href="../css/panel_ventas.css">
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>

    <?php $NAV_ACTIVA = 'inicio'; include __DIR__ . '/partials/nav.php'; ?>

    <main class="dash-main">

        <h1 class="dash-hello">¡Hola <span class="dash-hello-name"><?= htmlspecialchars($usuario) ?></span>!</h1>

        <div class="ventas-layout">

            <!-- ── Sidebar accesos rápidos ── -->
            <aside class="ventas-sidebar" id="panel-sidebar">

                <button class="sidebar-open-btn" id="sidebar-open-btn">EXPANDIR &rsaquo;</button>

                <div class="ventas-sidebar-inner">
                    <button class="sidebar-close-btn" id="sidebar-close-btn">&lsaquo; MINIMIZAR</button>

                    <div class="sidebar-action-cards">
                        <?php if ($canVentas): ?>
                        <a href="planilla_admin.php" class="action-card">
                            <div class="action-card-inner">
                                <span class="action-card-title">Planilla de Administración</span>
                                <span class="action-card-sub">Gráficos y reportes</span>
                            </div>
                            <span class="action-card-arrow">→</span>
                        </a>
                        <?php endif; ?>
                        <?php if (in_array($rango, ['Jefe1', 'Admin'], true)): ?>
                        <a href="facturacion.php" class="action-card">
                            <div class="action-card-inner">
                                <span class="action-card-title">Facturación (AFIP)</span>
                                <span class="action-card-sub">Aprobar facturas, comprobantes e IVA</span>
                            </div>
                            <span class="action-card-arrow">→</span>
                        </a>
                        <?php endif; ?>
                        <?php if ($canVentas): ?>
                        <a href="ventas.php" class="action-card">
                            <div class="action-card-inner">
                                <span class="action-card-title">Ventas</span>
                                <span class="action-card-sub">Generar y gestionar ventas</span>
                            </div>
                            <span class="action-card-arrow">→</span>
                        </a>
                        <?php endif; ?>
                        <?php if ($canBD): ?>
                        <a href="panel_base_datos.php" class="action-card">
                            <div class="action-card-inner">
                                <span class="action-card-title">Bases de Datos</span>
                                <span class="action-card-sub">Clientes y operadores</span>
                            </div>
                            <span class="action-card-arrow">→</span>
                        </a>
                        <?php endif; ?>
                        <?php if ($canStock): ?>
                        <a href="stock.php" class="action-card">
                            <div class="action-card-inner">
                                <span class="action-card-title">Stock</span>
                                <span class="action-card-sub">Control de inventario</span>
                            </div>
                            <span class="action-card-arrow">→</span>
                        </a>
                        <?php endif; ?>
                        <a href="compras.php" class="action-card">
                            <div class="action-card-inner">
                                <span class="action-card-title">Compras</span>
                                <span class="action-card-sub">Gestión de pedidos</span>
                            </div>
                            <span class="action-card-arrow">→</span>
                        </a>
                    </div>
                </div>

            </aside>

            <!-- ── Contenido principal ── -->
            <div class="ventas-content">

                <!-- Recordatorios -->
                <section class="dash-panel recordatorios-panel">
                    <h2 class="panel-title">Recordatorios</h2>

                    <?php if (empty($recordatorios)): ?>
                        <p class="inv-empty">Sin recordatorios activos</p>
                    <?php else: ?>
                        <?php foreach ($recordatorios as $rec): ?>
                        <div class="rec-card rec-card--<?= htmlspecialchars($rec['status']) ?>">
                            <div class="rec-header">
                                <span class="rec-title">
                                    <strong>Titulo:</strong> <?= htmlspecialchars($rec['titulo']) ?>
                                </span>
                                <span class="rec-badge rec-badge--<?= htmlspecialchars($rec['status']) ?>">
                                    <?= strtoupper(htmlspecialchars($rec['status'])) ?>
                                </span>
                            </div>
                            <?php if (!empty($rec['descripcion'])): ?>
                                <a href="recordatorios.php" class="rec-link">Haz click aquí para ver más</a>
                            <?php else: ?>
                                <span class="rec-link-placeholder"></span>
                            <?php endif; ?>
                            <div class="rec-meta">
                                <span><?= htmlspecialchars($rec['fecha_c_fmt']) ?></span>
                                <span>Fecha limite: <?= htmlspecialchars($rec['fecha_l_fmt']) ?></span>
                            </div>
                        </div>
                        <?php endforeach; ?>
                    <?php endif; ?>

                    <a href="recordatorios.php" class="inv-ver-mas">Ver más →</a>
                </section>

            </div><!-- /.ventas-content -->

        </div><!-- /.ventas-layout -->

    </main>

    <script>
        const sidebar  = document.getElementById('panel-sidebar');
        const btnClose = document.getElementById('sidebar-close-btn');
        const btnOpen  = document.getElementById('sidebar-open-btn');

        btnClose.addEventListener('click', () => sidebar.classList.add('sidebar-collapsed'));
        btnOpen.addEventListener('click',  () => sidebar.classList.remove('sidebar-collapsed'));
    </script>

    <script src="../js/global.js"></script>
</body>
</html>
