<?php
/**
 * ventas_sidebar.php — Sidebar compartido de las pantallas de Ventas.
 * Uso:  <?php $VENTAS_ACTIVA = 'registradas'; include __DIR__ . '/partials/ventas_sidebar.php'; ?>
 * Claves de $VENTAS_ACTIVA: registradas | cargar | presupuestos
 * (Pedidos vive como pestaña propia del nav, no acá.)
 */
$VENTAS_ACTIVA = $VENTAS_ACTIVA ?? '';
$vs_card = function (string $clave, string $href, string $titulo, string $sub) use ($VENTAS_ACTIVA): string {
    $activa = $VENTAS_ACTIVA === $clave ? ' action-card--active' : '';
    return '<a href="' . $href . '" class="action-card' . $activa . '">'
         . '<div class="action-card-inner"><span class="action-card-title">' . htmlspecialchars($titulo) . '</span>'
         . '<span class="action-card-sub">' . htmlspecialchars($sub) . '</span></div>'
         . '<span class="action-card-arrow">&rarr;</span></a>';
};
?>
<aside class="ventas-sidebar" id="ventas-sidebar">
    <button class="sidebar-open-btn" id="sidebar-open-btn">EXPANDIR &rsaquo;</button>
    <div class="ventas-sidebar-inner">
        <button class="sidebar-close-btn" id="sidebar-close-btn">&lsaquo; MINIMIZAR</button>
        <div class="sidebar-action-cards">
            <?= $vs_card('registradas', 'ventas_registradas.php', 'Ventas Registradas', 'Historial de ventas entregadas y comprobantes') ?>
            <?= $vs_card('cargar', 'factura_manual.php', 'Cargar pedido', 'El pedido pasa por depósito y se factura al entregarse') ?>
            <?= $vs_card('presupuestos', 'presupuestos.php', 'Presupuestos', 'Armar presupuestos y seguir los vigentes') ?>
        </div>
    </div>
</aside>
<?php
echo '<script>(function(){var s=document.getElementById("ventas-sidebar"),o=document.getElementById("sidebar-open-btn"),c=document.getElementById("sidebar-close-btn");if(o&&c&&s){o.addEventListener("click",function(){s.classList.remove("sidebar-collapsed");});c.addEventListener("click",function(){s.classList.add("sidebar-collapsed");});}})();</script>';
