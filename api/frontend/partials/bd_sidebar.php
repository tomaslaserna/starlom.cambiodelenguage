<?php
/**
 * bd_sidebar.php — Sidebar compartido de las pantallas de Base de Datos.
 * Uso:  <?php $BD_ACTIVA = 'clientes'; include __DIR__ . '/partials/bd_sidebar.php'; ?>
 * Claves de $BD_ACTIVA: empleados | precios | clientes | proveedores
 * Requiere guard.php incluido antes (define $canBD, $canEmpleados, $canRangos).
 */
$BD_ACTIVA = $BD_ACTIVA ?? '';
$bd_card = function (string $clave, string $href, string $titulo, string $desc) use ($BD_ACTIVA): string {
    $activa = $BD_ACTIVA === $clave ? ' bd-card--active' : '';
    return '<a href="' . $href . '" class="bd-card' . $activa . '">'
         . '<div class="bd-card-body"><span class="bd-card-title">' . htmlspecialchars($titulo) . '</span>'
         . '<span class="bd-card-desc">' . htmlspecialchars($desc) . '</span></div>'
         . '<span class="bd-card-arrow">&rarr;</span></a>';
};
?>
<aside class="ventas-sidebar" id="ventas-sidebar">
    <button class="sidebar-open-btn" id="sidebar-open-btn">EXPANDIR &rsaquo;</button>
    <div class="ventas-sidebar-inner">
        <button class="sidebar-close-btn" id="sidebar-close-btn">&lsaquo; MINIMIZAR</button>
        <div class="bd-cards">
            <?php if (!empty($canEmpleados)): ?>
                <?= $bd_card('empleados', 'gestion_empleados.php', 'Empleados', 'Datos, teléfono y rango de cada empleado') ?>
            <?php endif; ?>
            <?= $bd_card('precios', 'ver_precios.php', 'Precios', 'Listas de precios y descarga en PDF') ?>
            <?= $bd_card('clientes', 'clientes.php', 'Clientes', 'Base de clientes') ?>
            <?= $bd_card('proveedores', 'proveedores.php', 'Proveedores', 'Base de proveedores') ?>
        </div>
    </div>
</aside>
<?php
// Toggle del sidebar (compartido)
echo '<script>(function(){var s=document.getElementById("ventas-sidebar"),o=document.getElementById("sidebar-open-btn"),c=document.getElementById("sidebar-close-btn");if(o&&c&&s){o.addEventListener("click",function(){s.classList.remove("sidebar-collapsed");});c.addEventListener("click",function(){s.classList.add("sidebar-collapsed");});}})();</script>';
