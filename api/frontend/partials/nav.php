<?php
/**
 * nav.php — Barra de navegación compartida del panel + toggle de modo oscuro.
 *
 * Uso (dentro del <body>, en lugar del bloque <nav> copiado):
 *
 *   <?php $NAV_ACTIVA = 'stock'; include __DIR__ . '/partials/nav.php'; ?>
 *
 * Claves de $NAV_ACTIVA: inicio | pedidos | ventas | facturacion | bd | stock | compras | cobros | metricas
 * (omitir o '' si ninguna pestaña corresponde)
 *
 * Requiere guard.php incluido antes (define $usuario, $rango, $can*).
 * La campanita de mensajes necesita $conexion: incluir conexion_starlim_be.php
 * antes de la nav (todas las páginas del panel ya lo hacen).
 */

$NAV_ACTIVA = $NAV_ACTIVA ?? '';
$ADMIN_ACTIVA = $ADMIN_ACTIVA ?? '';

require_once __DIR__ . '/../../php/admin_permissions.php';

$nav_icons = [
    'admin' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/><path d="M8 5v14"/><path d="M16 5v14"/></svg>',
    'inicio' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>',
    'pedidos' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12l1 13H5L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>',
    'ventas' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16"/><path d="M7 9h10"/><path d="M8 13h8"/><path d="M10 17h4"/><path d="M12 3v18"/></svg>',
    'facturacion' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v18H7z"/><path d="M9 7h6"/><path d="M9 11h6"/><path d="M9 15h3"/><path d="M15 18l2 2 3-4"/></svg>',
    'metricas' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 16v-5"/><path d="M12 16V8"/><path d="M16 16v-3"/></svg>',
    'bd' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7c0 2 16 2 16 0S4 5 4 7Z"/><path d="M4 7v10c0 2 16 2 16 0V7"/><path d="M4 12c0 2 16 2 16 0"/></svg>',
    'stock' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 7l8 4 8-4-8-4Z"/><path d="M4 7v10l8 4 8-4V7"/><path d="M12 11v10"/></svg>',
    'compras' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h15l-2 8H8L6 6Z"/><path d="M6 6 5 3H2"/><path d="M9 20h.01"/><path d="M18 20h.01"/></svg>',
    'cobros' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v10H4z"/><path d="M7 11h4"/><path d="M16 14h1"/><path d="M16 10h1"/></svg>',
];

$nav_item = function (string $clave, string $href, string $texto) use ($NAV_ACTIVA, $nav_icons): string {
    $clase = 'dash-link' . ($NAV_ACTIVA === $clave ? ' dash-link--active' : '');
    $icono = $nav_icons[$clave] ?? $nav_icons['inicio'];
    return '<a href="' . $href . '" class="' . $clase . '" data-nav="' . htmlspecialchars($clave, ENT_QUOTES, 'UTF-8') . '">'
        . '<span class="dash-link-icon">' . $icono . '</span>'
        . '<span class="dash-link-text">' . $texto . '</span>'
        . '</a>';
};
$admin_hidden_resources = [
    'admin.obligaciones_fiscales' => true,
    'admin.conciliacion_bancaria' => true,
    'admin.cashflow' => true,
];
$admin_items = isset($conexion) ? array_values(array_filter(
    starlim_admin_accessible_resources($conexion),
    fn($item) => empty($admin_hidden_resources[(string)($item['clave'] ?? '')])
        && !empty($item['ruta'])
        && is_file(__DIR__ . '/../' . $item['ruta'])
)) : [];
if (isset($conexion)) {
    $canAdminFacturacion = starlim_admin_can($conexion, 'admin.facturacion', 'ver')
        || starlim_admin_can_sensitive($conexion, 'admin.obligaciones_fiscales', 'ver')
        || in_array((string)($rango ?? ''), ['Jefe1', 'Admin'], true);
    $hasAdminFacturacion = (bool)array_filter($admin_items, fn($item) => (string)($item['clave'] ?? '') === 'admin.facturacion');
    if ($canAdminFacturacion && !$hasAdminFacturacion && is_file(__DIR__ . '/../facturacion.php')) {
        $admin_items[] = [
            'clave' => 'admin.facturacion',
            'nombre' => 'Facturacion',
            'descripcion' => 'Aprobacion y control de comprobantes fiscales.',
            'ruta' => 'facturacion.php',
            'orden' => 110,
            'sensible' => false,
            'fuente' => 'fiscal',
        ];
    }
    usort($admin_items, fn($a, $b) => ((int)($a['orden'] ?? 0) <=> (int)($b['orden'] ?? 0)) ?: strcmp((string)($a['nombre'] ?? ''), (string)($b['nombre'] ?? '')));
}
$admin_open = $NAV_ACTIVA === 'admin' || $NAV_ACTIVA === 'inicio';
?>
<nav class="dash-nav">
    <span class="dash-brand"><a href="index.php" class="dash-brand">Starlim</a></span>

    <div class="dash-links">
        <?php if ($admin_items): ?>
            <details class="dash-nav-group" <?= $admin_open ? 'open' : '' ?>>
                <summary class="dash-link dash-link--group <?= $admin_open ? 'dash-link--active' : '' ?>">
                    <span class="dash-link-icon"><?= $nav_icons['admin'] ?></span>
                    <span class="dash-link-text">Administracion</span>
                    <span class="dash-link-caret">v</span>
                </summary>
                <div class="dash-subnav">
                    <?php foreach ($admin_items as $item): ?>
                        <?php
                            $href = (string)$item['ruta'];
                            $active = $ADMIN_ACTIVA === (string)$item['clave'] || ($ADMIN_ACTIVA === '' && $href !== '' && basename($_SERVER['SCRIPT_NAME'] ?? '') === $href);
                        ?>
                        <a href="<?= htmlspecialchars($href) ?>" class="dash-subnav-link <?= $active ? 'dash-subnav-link--active' : '' ?>">
                            <?= htmlspecialchars((string)$item['nombre']) ?>
                        </a>
                    <?php endforeach; ?>
                </div>
            </details>
        <?php endif; ?>
        <?= $nav_item('pedidos', 'pedidos.php', 'Pedidos') ?>
        <?php if ($canVentas): ?>
            <?= $nav_item('ventas', 'ventas.php', 'Ventas') ?>
        <?php endif; ?>
        <?php if ($canBD): ?>
            <?= $nav_item('bd', 'panel_base_datos.php', 'Bases de Datos') ?>
        <?php endif; ?>
        <?php if ($canStock): ?>
            <?= $nav_item('stock', 'stock.php', 'Stock') ?>
        <?php endif; ?>
        <?= $nav_item('compras', 'compras.php', 'Compras') ?>
        <?php if (starlim_admin_is_admin()): ?>
            <?= $nav_item('cobros', 'panel_cobros_pagos.php', 'Cobros y Pagos') ?>
        <?php endif; ?>
    </div>

    <div class="dash-sidebar-card">
        <strong>Tu operaci&oacute;n, 100% conectada</strong>
        <span>Ventas, stock, pedidos y log&iacute;stica sincronizados en tiempo real.</span>
    </div>

    <div class="dash-actions">
        <span class="dash-user">
            <?= htmlspecialchars($usuario) ?>
            <em><?= htmlspecialchars(($empresaNombre ?? ($_SESSION['empresa_nombre'] ?? 'Starlim')) . ' - ' . $rango) ?></em>
        </span>
        <?php include __DIR__ . '/../../php/nav_mensajes.php'; ?>
        <a href="../php/cerrar_sesion.php" class="dash-logout">Cerrar sesión</a>
    </div>
</nav>
<script>
(() => {
    if (window.__starlimSessionKeepalive) return;
    window.__starlimSessionKeepalive = true;

    const ping = () => {
        if (document.visibilityState && document.visibilityState !== 'visible') return;
        fetch('../php/session_keepalive.php', {
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
            keepalive: true
        }).catch(() => {});
    };

    window.setInterval(ping, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') ping();
    });
})();
</script>
