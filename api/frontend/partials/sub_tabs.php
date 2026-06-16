<?php
/**
 * sub_tabs.php — Barra de sub-pestañas dentro de una base de Base de Datos.
 * Uso:
 *   $SUBTABS    = ['lista' => ['ver_precios.php','Lista de precios'], 'margenes' => ['margenes.php','Márgenes']];
 *   $SUB_ACTIVA = 'lista';
 *   include __DIR__ . '/partials/sub_tabs.php';
 */
$SUBTABS    = $SUBTABS ?? [];
$SUB_ACTIVA = $SUB_ACTIVA ?? '';
?>
<style>
.sub-tabs { display:flex; gap:6px; border-bottom:1px solid rgba(128,128,128,.18); margin:2px 0 18px; flex-wrap:wrap; }
.sub-tab { padding:8px 16px; text-decoration:none; color:inherit; font-size:13.5px; font-weight:600; opacity:.6; border-bottom:2px solid transparent; }
.sub-tab:hover { opacity:1; }
.sub-tab.active { opacity:1; color:#2563eb; border-bottom-color:#2563eb; }
</style>
<nav class="sub-tabs">
    <?php foreach ($SUBTABS as $clave => [$href, $label]): ?>
        <a href="<?= $href ?>" class="sub-tab<?= $SUB_ACTIVA === $clave ? ' active' : '' ?>"><?= htmlspecialchars($label) ?></a>
    <?php endforeach; ?>
</nav>
