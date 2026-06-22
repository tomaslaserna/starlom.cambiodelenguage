<?php
/**
 * panel_base_datos.php — Hub de Base de Datos: 4 bases (Empleados, Precios,
 * Clientes, Proveedores). La mensajería se movió al ícono del nav.
 */
require __DIR__ . '/partials/guard.php';
include '../php/conexion_starlim_be.php';
$empresaId = starlim_bootstrap_tenant_context($conexion);
$canViewFinancialData = starlim_admin_is_admin();

$bd_stats = ['clientes' => 0, 'productos' => 0, 'proveedores' => 0];
$r = $conexion->query("SELECT COUNT(*) AS c FROM clientes WHERE empresa_id = $empresaId AND (estado = 'Activo' OR activo = 'true')");
if ($r) $bd_stats['clientes'] = (int)$r->fetch_assoc()['c'];
$r = $conexion->query("SELECT COUNT(*) AS c FROM productos WHERE empresa_id = $empresaId");
if ($r) $bd_stats['productos'] = (int)$r->fetch_assoc()['c'];
$r = $conexion->query("SELECT COUNT(*) AS c FROM proveedores WHERE empresa_id = $empresaId");
if ($r) $bd_stats['proveedores'] = (int)$r->fetch_assoc()['c'];

$top_clientes = [];
if ($canViewFinancialData) {
    $r = $conexion->query("
        SELECT COALESCE(NULLIF(nombre_cliente,''), dni_cliente, 'Sin cliente') AS nombre,
               COALESCE(SUM(monto),0) AS total
        FROM ventas
        WHERE empresa_id = $empresaId AND COALESCE(estado_pedido,'entregado') = 'entregado'
        GROUP BY COALESCE(NULLIF(nombre_cliente,''), dni_cliente, 'Sin cliente')
        ORDER BY total DESC
        LIMIT 3
    ");
    if ($r) while ($row = $r->fetch_assoc()) $top_clientes[] = $row;
}

$top_proveedores = [];
$compras_ok = false;
if ($canViewFinancialData) {
    $compras_ok = $conexion->query("SHOW TABLES LIKE 'compras_registro'")->num_rows > 0;
    if ($compras_ok) {
        $r = $conexion->query("
            SELECT COALESCE(p.nombre, 'Sin proveedor') AS nombre,
                   COALESCE(SUM(cr.total),0) AS total
            FROM compras_registro cr
            LEFT JOIN proveedores p ON p.id = cr.id_proveedor AND p.empresa_id = cr.empresa_id
            WHERE cr.empresa_id = $empresaId
            GROUP BY COALESCE(p.nombre, 'Sin proveedor')
            ORDER BY total DESC
            LIMIT 3
        ");
    } else {
        $r = $conexion->query("
            SELECT proveedor AS nombre, COUNT(*) AS total
            FROM productos
            WHERE empresa_id = $empresaId AND COALESCE(proveedor,'') <> ''
            GROUP BY proveedor
            ORDER BY COUNT(*) DESC
            LIMIT 3
        ");
    }
    if ($r) while ($row = $r->fetch_assoc()) $top_proveedores[] = $row;
}

function bd_money(float $v): string {
    return '$' . number_format($v, 2, ',', '.');
}

$bases = [];
if (in_array($rango, ['Jefe1', 'Admin'], true)) {
    $bases[] = ['gestion_empleados.php', 'Empleados', 'Datos, teléfono y rango de cada empleado'];
}
$bases[] = ['ver_precios.php',  'Precios',     'Listas de precios y descarga en PDF para clientes'];
$bases[] = ['clientes.php',     'Clientes',    'Base de clientes: alta, edición y búsqueda'];
$bases[] = ['proveedores.php',  'Proveedores', 'Base de proveedores: alta, edición y búsqueda'];
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bases de Datos — Starlim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <link rel="stylesheet" href="../css/panel_bd.css">
    <style>
        .bd-hub { display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:16px; margin-top:18px; }
        .bd-hub-card { display:flex; align-items:center; justify-content:space-between; gap:14px;
            background:var(--surface,#fff); border:1px solid rgba(128,128,128,.18); border-radius:14px;
            padding:20px 22px; text-decoration:none; color:inherit; transition:border-color .15s, transform .1s; }
        .bd-hub-card:hover { border-color:#2563eb; transform:translateY(-2px); }
        .bd-hub-title { font-size:17px; font-weight:800; }
        .bd-hub-desc { font-size:13px; opacity:.6; margin-top:3px; }
        .bd-hub-arrow { font-size:20px; color:#2563eb; }
        .bd-summary { margin:18px 0 10px; }
        .bd-top-list { display:grid; gap:8px; margin-top:10px; }
        .bd-top-row { display:flex; justify-content:space-between; gap:12px; padding:8px 10px; border:1px solid rgba(128,128,128,.14); border-radius:8px; font-size:13px; }
        .bd-top-row strong { max-width:70%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    </style>
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>

    <?php $NAV_ACTIVA = 'bd'; include __DIR__ . '/partials/nav.php'; ?>

    <main class="dash-main">
        <h1 class="dash-hello">Bases de Datos</h1>
        <p style="opacity:.65;font-size:13.5px;margin:-6px 0 4px;">Elegí una base para consultar o editar.</p>

        <section class="dash-panel bd-summary">
            <h2 class="panel-title">Resumen de bases</h2>
            <div class="stats-grid">
                <div class="stat-card">
                    <span class="stat-label">Clientes activos</span>
                    <span class="stat-value"><?= number_format($bd_stats['clientes'], 0, ',', '.') ?></span>
                </div>
                <div class="stat-card">
                    <span class="stat-label">Productos en lista</span>
                    <span class="stat-value"><?= number_format($bd_stats['productos'], 0, ',', '.') ?></span>
                </div>
                <div class="stat-card">
                    <span class="stat-label">Proveedores</span>
                    <span class="stat-value"><?= number_format($bd_stats['proveedores'], 0, ',', '.') ?></span>
                </div>
            </div>
            <?php if ($canViewFinancialData): ?>
                <div class="dash-grid" style="margin-top:14px;">
                    <div>
                        <h3 class="panel-title" style="font-size:14px;">Top 3 clientes</h3>
                        <div class="bd-top-list">
                            <?php if (empty($top_clientes)): ?><div class="bd-top-row"><span>Sin ventas registradas</span></div><?php endif; ?>
                            <?php foreach ($top_clientes as $tc): ?>
                                <div class="bd-top-row"><strong><?= htmlspecialchars($tc['nombre']) ?></strong><span><?= bd_money((float)$tc['total']) ?></span></div>
                            <?php endforeach; ?>
                        </div>
                    </div>
                    <div>
                        <h3 class="panel-title" style="font-size:14px;">Top 3 proveedores</h3>
                        <div class="bd-top-list">
                            <?php if (empty($top_proveedores)): ?><div class="bd-top-row"><span>Sin proveedores registrados</span></div><?php endif; ?>
                            <?php foreach ($top_proveedores as $tp): ?>
                                <div class="bd-top-row"><strong><?= htmlspecialchars($tp['nombre']) ?></strong><span><?= $compras_ok ? bd_money((float)$tp['total']) : number_format((float)$tp['total'], 0, ',', '.') . ' productos' ?></span></div>
                            <?php endforeach; ?>
                        </div>
                    </div>
                </div>
            <?php endif; ?>
        </section>

        <div class="bd-hub">
            <?php foreach ($bases as [$href, $titulo, $desc]): ?>
            <a href="<?= $href ?>" class="bd-hub-card">
                <div>
                    <div class="bd-hub-title"><?= htmlspecialchars($titulo) ?></div>
                    <div class="bd-hub-desc"><?= htmlspecialchars($desc) ?></div>
                </div>
                <span class="bd-hub-arrow">&rarr;</span>
            </a>
            <?php endforeach; ?>
        </div>
    </main>

    <script src="../js/global.js"></script>
</body>
</html>
