<?php
/**
 * nav.php — Barra de navegación compartida del panel + toggle de modo oscuro.
 *
 * Uso (dentro del <body>, en lugar del bloque <nav> copiado):
 *
 *   <?php $NAV_ACTIVA = 'stock'; include __DIR__ . '/partials/nav.php'; ?>
 *
 * Claves de $NAV_ACTIVA: inicio | pedidos | ventas | bd | stock | compras | cobros
 * (omitir o '' si ninguna pestaña corresponde)
 *
 * Requiere guard.php incluido antes (define $usuario, $rango, $can*).
 * La campanita de mensajes necesita $conexion: incluir conexion_starlim_be.php
 * antes de la nav (todas las páginas del panel ya lo hacen).
 */

$NAV_ACTIVA = $NAV_ACTIVA ?? '';

$nav_item = function (string $clave, string $href, string $texto) use ($NAV_ACTIVA): string {
    $clase = 'dash-link' . ($NAV_ACTIVA === $clave ? ' dash-link--active' : '');
    return '<a href="' . $href . '" class="' . $clase . '">' . $texto . '</a>';
};
?>
<nav class="dash-nav">
    <span class="dash-brand"><a href="index.php" class="dash-brand">Star Lim</a></span>

    <div class="dash-links">
        <?= $nav_item('inicio', 'panel_empleados.php', 'Inicio') ?>
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
        <?= $nav_item('cobros', 'panel_cobros_pagos.php', 'Cobros y Pagos') ?>
    </div>

    <div class="dash-actions">
        <span class="dash-user">
            <?= htmlspecialchars($usuario) ?>
            <em><?= htmlspecialchars($rango) ?></em>
        </span>
        <?php include __DIR__ . '/../../php/nav_mensajes.php'; ?>
        <a href="../php/cerrar_sesion.php" class="dash-logout">Cerrar sesión</a>
    </div>
</nav>
