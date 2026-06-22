<?php
$PERMITIDOS = ['Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'];
require __DIR__ . '/partials/guard.php';

include '../php/conexion_starlim_be.php';
$empresaId = starlim_bootstrap_tenant_context($conexion);

$is_admin = ($rango === 'Admin');

/* Esquema gestionado en supabase_migration.sql + db_fixes.sql */

/* ── Cargar márgenes con conteo de productos ─────────── */
$res = $conexion->query("SELECT m.*,
            (SELECT COUNT(*) FROM productos p WHERE p.codigo = m.codigo AND p.empresa_id = m.empresa_id) AS num_productos
     FROM margenes m
     WHERE m.empresa_id = $empresaId
     ORDER BY m.codigo ASC"
);
$margenes = [];
while ($m = $res->fetch_assoc()) {
    $margenes[] = $m;
}

/* ── Columnas fijas de multiplicadores ───────────────── */
$cols = [
    'precio_0'         => 'Lista 0',
    'precio_1'         => 'Lista 1',
    'precio_2'         => 'Lista 2',
    'precio_3'         => 'Lista 3',
    'margen_minorista' => 'Minorista',
];

/* ── Cargar rubros ───────────────────────────────────── */
$resR = $conexion->query("SELECT codigo, nombre FROM rubros WHERE empresa_id = $empresaId ORDER BY codigo ASC");
$rubrosDB = [];
while ($r = $resR->fetch_assoc()) {
    $rubrosDB[$r['codigo']] = $r['nombre'];
}

/* ── Agrupar categorías por prefijo letra ────────────── */
$grupos = [];  // ['A' => [ [...margen...], ... ], 'B' => [...], ...]
foreach ($margenes as $m) {
    // Extraer prefijo (letras al inicio del código)
    preg_match('/^([A-Za-z]+)/', $m['codigo'], $match);
    $prefix = strtoupper($match[1] ?? '?');
    $grupos[$prefix][] = $m;
}
ksort($grupos);

/* ── Cargar listas personalizadas activas ────────────── */
$resL = $conexion->query("SELECT id, nombre FROM listas_precio WHERE empresa_id = $empresaId AND activa = 1 ORDER BY orden ASC, id ASC"
);
$listasCustom = [];
while ($l = $resL->fetch_assoc()) {
    $listasCustom[] = $l;
}

/* ── Cargar multiplicadores de listas personalizadas ─── */
// Indexado como $listasMult[$codigo][$lista_id] = multiplicador
$listasMult = [];
if (!empty($listasCustom)) {
    $resML = $conexion->query("SELECT ml.codigo, ml.lista_id, ml.multiplicador
         FROM margenes_listas ml
         INNER JOIN listas_precio lp ON lp.id = ml.lista_id AND lp.empresa_id = ml.empresa_id AND lp.activa = 1
         WHERE ml.empresa_id = $empresaId
         ORDER BY ml.lista_id ASC"
    );
    while ($ml = $resML->fetch_assoc()) {
        $listasMult[$ml['codigo']][$ml['lista_id']] = $ml['multiplicador'];
    }
}
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <title>Márgenes — Starlim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <link rel="stylesheet" href="../css/panel_bd.css">
    <link rel="stylesheet" href="../css/style_margenes.css">
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body class="cambio-pagina">

<?php $NAV_ACTIVA = 'bd'; include __DIR__ . '/partials/nav.php'; ?>

<main class="dash-main">
<div class="ventas-layout">

<?php $BD_ACTIVA = 'precios'; include __DIR__ . '/partials/bd_sidebar.php'; ?>

<div class="ventas-content">

    <?php
        $SUBTABS = ['lista' => ['ver_precios.php', 'Lista de precios'], 'margenes' => ['margenes.php', 'Márgenes']];
        $SUB_ACTIVA = 'margenes';
        include __DIR__ . '/partials/sub_tabs.php';
    ?>

    <div class="mg-topbar">
        <h1 class="mg-titulo">Márgenes y Categorías</h1>
        <?php if ($is_admin): ?>
        <button class="mg-btn-new" id="btn-nueva">&#43; Nueva categoría</button>
        <?php endif; ?>
    </div>

    <!-- ══════════════════════════════════════════════════
         SECCIÓN A — Listas de precio
         ══════════════════════════════════════════════════ -->
    <div class="mg-section" id="section-listas">
        <div class="mg-section-header">
            <h2 class="mg-section-title">Listas de precio</h2>
            <?php if ($is_admin): ?>
            <button class="mg-btn-add-sm" id="btn-nueva-lista">&#43; Nueva lista</button>
            <?php endif; ?>
        </div>

        <div class="mg-chips" id="chips-listas">
            <!-- Fijas (no eliminables) -->
            <span class="mg-chip mg-chip--fixed">Lista 0</span>
            <span class="mg-chip mg-chip--fixed">Lista 1</span>
            <span class="mg-chip mg-chip--fixed">Lista 2</span>
            <span class="mg-chip mg-chip--fixed">Lista 3</span>
            <span class="mg-chip mg-chip--fixed">Minorista</span>
            <span class="mg-chip mg-chip--fixed" title="Calculada: Lista 3 &times; 1,10">Lista 4 <span style="font-size:0.68rem;opacity:0.6;">(auto)</span></span>

            <!-- Listas personalizadas activas -->
            <?php foreach ($listasCustom as $lc): ?>
            <span class="mg-chip mg-chip--custom" data-lista-id="<?= (int)$lc['id'] ?>">
                <?= htmlspecialchars($lc['nombre']) ?>
                <?php if ($is_admin): ?>
                <button class="mg-chip-del" data-lista-id="<?= (int)$lc['id'] ?>"
                        title="Eliminar lista '<?= htmlspecialchars($lc['nombre']) ?>'"
                        >&#10005;</button>
                <?php endif; ?>
            </span>
            <?php endforeach; ?>
        </div>
    </div>

    <hr class="mg-section-sep">

    <!-- ══════════════════════════════════════════════════
         SECCIÓN B — Rubros y Categorías
         ══════════════════════════════════════════════════ -->
    <div class="mg-section" id="section-rubros">
        <div class="mg-section-header">
            <h2 class="mg-section-title">Rubros y Categorías</h2>
            <?php if ($is_admin): ?>
            <button class="mg-btn-add-sm" id="btn-nuevo-rubro">&#43; Nuevo rubro</button>
            <?php endif; ?>
        </div>

        <div class="mg-accordion" id="mg-accordion">
        <?php
        $firstRubro = true;
        foreach ($grupos as $prefix => $cats):
            $rubroNombre = $rubrosDB[$prefix] ?? null;
            $isOpen      = $firstRubro;
            $firstRubro  = false;
            $catCount    = count($cats);
        ?>
            <div class="mg-rubro-card <?= $isOpen ? 'open' : '' ?>"
                 data-prefix="<?= htmlspecialchars($prefix) ?>">
                <div class="mg-rubro-header">
                    <span class="mg-rubro-code"><?= htmlspecialchars($prefix) ?></span>
                    <span class="mg-rubro-nombre<?= $rubroNombre === null ? ' mg-rubro-nombre--sin' : '' ?>"
                          data-prefix="<?= htmlspecialchars($prefix) ?>"
                          data-nombre="<?= htmlspecialchars($rubroNombre ?? '') ?>">
                        <?= $rubroNombre !== null ? htmlspecialchars($rubroNombre) : '(sin nombre)' ?>
                    </span>
                    <?php if ($is_admin): ?>
                    <button class="mg-edit-btn mg-rubro-edit-btn"
                            data-prefix="<?= htmlspecialchars($prefix) ?>"
                            title="Editar nombre del rubro"
                            onclick="event.stopPropagation()">&#9998;</button>
                    <?php endif; ?>
                    <span class="mg-rubro-count"><?= $catCount ?> categoría<?= $catCount !== 1 ? 's' : '' ?></span>
                    <span class="mg-rubro-arrow">&#9658;</span>
                </div>
                <div class="mg-rubro-body">
                    <div class="mg-cat-grid">
                    <?php foreach ($cats as $cat):
                        $np = (int)$cat['num_productos'];
                        $badgeClass = $np === 0 ? 'mg-prods-0' : 'mg-prods-ok';
                    ?>
                        <div class="mg-cat-item"
                             data-codigo="<?= htmlspecialchars($cat['codigo']) ?>"
                             data-nombre="<?= htmlspecialchars($cat['nombre']) ?>">
                            <span class="mg-cat-item-code"><?= htmlspecialchars($cat['codigo']) ?></span>
                            <span class="mg-cat-item-nombre" title="<?= htmlspecialchars($cat['nombre']) ?>"><?= htmlspecialchars($cat['nombre']) ?></span>
                            <span class="mg-cat-item-badge <?= $badgeClass ?>"><?= $np ?></span>
                            <?php if ($is_admin): ?>
                            <button class="mg-edit-btn mg-cat-edit-btn"
                                    title="Editar nombre de la categoría">&#9998;</button>
                            <?php endif; ?>
                        </div>
                    <?php endforeach; ?>
                    </div>
                </div>
            </div>
        <?php endforeach; ?>
        </div>
    </div>

    <hr class="mg-section-sep">

    <!-- ══════════════════════════════════════════════════
         SECCIÓN C — Categorías y multiplicadores
         ══════════════════════════════════════════════════ -->
    <div class="mg-section" id="section-categorias">
        <div class="mg-section-header">
            <h2 class="mg-section-title">&#9965; Categorías y multiplicadores</h2>
        </div>

        <p class="mg-nota">
            Lista 4 se calcula automáticamente como Lista 3 &times; 1,10 (+10%) y no se almacena aquí.
            <?php if (!$is_admin): ?>
            &nbsp;&mdash;&nbsp; Solo los Admins pueden editar.
            <?php endif; ?>
        </p>

        <div class="mg-table-wrap">
            <table class="mg-table">
                <thead>
                    <tr>
                        <th>Código</th>
                        <th>Categoría</th>
                        <?php foreach ($cols as $campo => $label): ?>
                        <th class="th-mult"><?= $label ?></th>
                        <?php endforeach; ?>
                        <th class="th-mult">Lista 4</th>
                        <?php foreach ($listasCustom as $lc): ?>
                        <th class="th-mult th-mult-dyn" data-lista-id="<?= (int)$lc['id'] ?>"><?= htmlspecialchars($lc['nombre']) ?></th>
                        <?php endforeach; ?>
                        <th class="th-mult">Productos</th>
                        <th></th>
                        <?php if ($is_admin): ?><th></th><?php endif; ?>
                    </tr>
                </thead>
                <tbody id="mg-tbody">
                <?php foreach ($margenes as $m):
                    $numProd   = (int)$m['num_productos'];
                    $prodClass = $numProd === 0 ? 'mg-prods-0' : 'mg-prods-ok';
                    $lista4    = round((float)$m['precio_3'] * 1.10, 2);
                    $lista4pct = round(($lista4 - 1) * 100);
                    $codH      = htmlspecialchars($m['codigo']);
                ?>
                    <tr data-codigo="<?= $codH ?>">
                        <td class="mg-col-codigo"><?= $codH ?></td>
                        <td class="mg-col-nombre"><?= htmlspecialchars($m['nombre']) ?></td>

                        <?php foreach ($cols as $campo => $label):
                            $val = (float)$m[$campo];
                            $pct = round(($val - 1) * 100);
                        ?>
                        <td class="mg-col-mult">
                            <div class="mg-mult-wrap">
                                <input type="number"
                                       class="mg-input"
                                       data-campo="<?= $campo ?>"
                                       data-original="<?= $val ?>"
                                       value="<?= number_format($val, 2, '.', '') ?>"
                                       step="0.01" min="1" max="9.99"
                                       <?= $is_admin ? '' : 'readonly' ?>>
                                <span class="mg-pct">+<?= $pct ?>%</span>
                            </div>
                        </td>
                        <?php endforeach; ?>

                        <!-- Lista 4 (calculada, siempre readonly) -->
                        <td class="mg-col-mult">
                            <div class="mg-mult-wrap">
                                <input type="number" class="mg-input" value="<?= number_format($lista4, 2, '.', '') ?>"
                                       readonly style="opacity:0.45; cursor:default;">
                                <span class="mg-pct">+<?= $lista4pct ?>%</span>
                            </div>
                        </td>

                        <!-- Columnas de listas personalizadas -->
                        <?php foreach ($listasCustom as $lc):
                            $lid  = (int)$lc['id'];
                            $mval = isset($listasMult[$m['codigo']][$lid])
                                    ? (float)$listasMult[$m['codigo']][$lid]
                                    : 1.00;
                            $mpct = round(($mval - 1) * 100);
                        ?>
                        <td class="mg-col-mult mg-col-mult-dyn">
                            <div class="mg-mult-wrap">
                                <input type="number"
                                       class="mg-input mg-input-dyn"
                                       data-lista-id="<?= $lid ?>"
                                       data-original-dyn="<?= $mval ?>"
                                       value="<?= number_format($mval, 2, '.', '') ?>"
                                       step="0.01" min="1" max="9.99"
                                       <?= $is_admin ? '' : 'readonly' ?>>
                                <span class="mg-pct">+<?= $mpct ?>%</span>
                            </div>
                        </td>
                        <?php endforeach; ?>

                        <td class="mg-col-prods">
                            <span class="mg-prods-badge <?= $prodClass ?>"><?= $numProd ?></span>
                        </td>

                        <td class="mg-col-save">
                            <?php if ($is_admin): ?>
                            <button class="mg-btn-save"
                                    data-codigo="<?= $codH ?>"
                                    style="display:none;">Guardar</button>
                            <?php endif; ?>
                        </td>

                        <?php if ($is_admin): ?>
                        <td class="mg-col-del">
                            <button class="mg-btn-del"
                                    data-codigo="<?= $codH ?>"
                                    data-prods="<?= $numProd ?>"
                                    title="Eliminar categoría">&#10005;</button>
                        </td>
                        <?php endif; ?>
                    </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div><!-- /section-categorias -->

</div><!-- /ventas-content -->
</div><!-- /ventas-layout -->
</main>

<!-- ════════════════════════════════════════════════════
     MODALES
     ════════════════════════════════════════════════════ -->

<?php if ($is_admin): ?>

<!-- ── Modal nueva categoría ─────────────────────────── -->
<div class="mg-overlay" id="mg-overlay">
    <div class="mg-modal">
        <div class="mg-modal-header">
            <h2 class="mg-modal-title">Nueva categoría de precio</h2>
            <button class="mg-modal-close" id="mg-modal-close">&#10005;</button>
        </div>
        <div class="mg-modal-body">
            <div class="mg-field--row" style="display:flex; gap:12px;">
                <div class="mg-field" style="flex:1;">
                    <label for="new-codigo">Código <span style="color:#dc2626">*</span></label>
                    <input type="text" id="new-codigo" placeholder="Ej: A12"
                           maxlength="10" style="text-transform:uppercase">
                </div>
                <div class="mg-field" style="flex:2;">
                    <label for="new-nombre">Categoría / Nombre <span style="color:#dc2626">*</span></label>
                    <input type="text" id="new-nombre" placeholder="Ej: Cloro en polvo" maxlength="100">
                </div>
            </div>

            <div>
                <div class="mg-field" style="margin-bottom:10px;">
                    <label>Multiplicadores (entre 1,00 y 9,99)</label>
                </div>
                <div class="mg-mult-grid">
                    <div class="mg-mult-item">
                        <label>Lista 0</label>
                        <input type="number" id="new-p0" data-pct="new-pct-p0"
                               step="0.01" min="1" max="9.99" placeholder="1.00">
                        <span class="mg-new-pct" id="new-pct-p0">+0%</span>
                    </div>
                    <div class="mg-mult-item">
                        <label>Lista 1</label>
                        <input type="number" id="new-p1" data-pct="new-pct-p1"
                               step="0.01" min="1" max="9.99" placeholder="1.00">
                        <span class="mg-new-pct" id="new-pct-p1">+0%</span>
                    </div>
                    <div class="mg-mult-item">
                        <label>Lista 2</label>
                        <input type="number" id="new-p2" data-pct="new-pct-p2"
                               step="0.01" min="1" max="9.99" placeholder="1.00">
                        <span class="mg-new-pct" id="new-pct-p2">+0%</span>
                    </div>
                    <div class="mg-mult-item">
                        <label>Lista 3</label>
                        <input type="number" id="new-p3" data-pct="new-pct-p3"
                               step="0.01" min="1" max="9.99" placeholder="1.00">
                        <span class="mg-new-pct" id="new-pct-p3">+0%</span>
                    </div>
                    <div class="mg-mult-item">
                        <label>Minorista</label>
                        <input type="number" id="new-pmin" data-pct="new-pct-pmin"
                               step="0.01" min="1" max="9.99" placeholder="1.00">
                        <span class="mg-new-pct" id="new-pct-pmin">+0%</span>
                    </div>
                </div>
            </div>

            <div class="mg-lista4-note">
                Lista 4 se calculará automáticamente como Lista 3 &times; 1,10
            </div>
        </div>
        <div class="mg-modal-footer">
            <button class="mg-btn-cancel" id="mg-btn-cancel">Cancelar</button>
            <button class="mg-btn-crear" id="mg-btn-crear">Crear categoría</button>
        </div>
    </div>
</div>

<!-- ── Modal nueva lista de precio ───────────────────── -->
<div class="mg-overlay" id="overlay-lista">
    <div class="mg-modal" style="max-width:380px;">
        <div class="mg-modal-header">
            <h2 class="mg-modal-title">Nueva lista de precio</h2>
            <button class="mg-modal-close" data-close="overlay-lista">&#10005;</button>
        </div>
        <div class="mg-modal-body">
            <div class="mg-field">
                <label for="lista-nombre">Nombre de la lista <span style="color:#dc2626">*</span></label>
                <input type="text" id="lista-nombre" placeholder="Ej: Lista Distribuidor"
                       maxlength="50" autocomplete="off">
            </div>
            <p style="font-size:0.78rem;opacity:0.5;margin:0;">
                Se creará con multiplicador 1,00 para todas las categorías existentes.
                Podrás ajustar los valores en la tabla.
            </p>
        </div>
        <div class="mg-modal-footer">
            <button class="mg-btn-cancel" data-close="overlay-lista">Cancelar</button>
            <button class="mg-btn-crear" id="btn-crear-lista">Crear lista</button>
        </div>
    </div>
</div>

<!-- ── Modal compartido: editar nombre ───────────────── -->
<div class="mg-overlay" id="overlay-edit-nombre">
    <div class="mg-modal" style="max-width:360px;">
        <div class="mg-modal-header">
            <h2 class="mg-modal-title" id="edit-nombre-title">Editar nombre</h2>
            <button class="mg-modal-close" data-close="overlay-edit-nombre">&#10005;</button>
        </div>
        <div class="mg-modal-body">
            <div class="mg-field">
                <label for="edit-nombre-input">Nombre</label>
                <input type="text" id="edit-nombre-input" maxlength="100"
                       placeholder="Nombre..." autocomplete="off">
            </div>
        </div>
        <div class="mg-modal-footer">
            <button class="mg-btn-cancel" data-close="overlay-edit-nombre">Cancelar</button>
            <button class="mg-btn-crear" id="edit-nombre-guardar">Guardar</button>
        </div>
    </div>
</div>

<!-- ── Modal nuevo rubro ─────────────────────────────── -->
<div class="mg-overlay" id="overlay-rubro">
    <div class="mg-modal" style="max-width:420px;">
        <div class="mg-modal-header">
            <h2 class="mg-modal-title">Nuevo rubro</h2>
            <button class="mg-modal-close" data-close="overlay-rubro">&#10005;</button>
        </div>
        <div class="mg-modal-body">
            <div class="mg-field--row" style="display:flex; gap:12px;">
                <div class="mg-field" style="flex:1;">
                    <label for="rubro-codigo">Código <span style="color:#dc2626">*</span></label>
                    <input type="text" id="rubro-codigo" placeholder="Ej: D"
                           maxlength="10" style="text-transform:uppercase" autocomplete="off">
                </div>
                <div class="mg-field" style="flex:3;">
                    <label for="rubro-nombre">Nombre <span style="color:#dc2626">*</span></label>
                    <input type="text" id="rubro-nombre" placeholder="Ej: Desinfectantes"
                           maxlength="100" autocomplete="off">
                </div>
            </div>
            <p style="font-size:0.78rem;opacity:0.5;margin:0;">
                Si el rubro ya existe, su nombre será actualizado.
            </p>
        </div>
        <div class="mg-modal-footer">
            <button class="mg-btn-cancel" data-close="overlay-rubro">Cancelar</button>
            <button class="mg-btn-crear" id="btn-crear-rubro">Guardar rubro</button>
        </div>
    </div>
</div>

<?php endif; ?>

<!-- Toast -->
<div class="mg-toast" id="mg-toast"></div>

<script src="../js/global.js"></script>
<script>
/* Sidebar toggle: lo maneja partials/bd_sidebar.php */

/* ═══════════════════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════════════════ */
const toastEl = document.getElementById('mg-toast');
let toastTimer;
function showToast(msg, type = 'ok') {
    clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.className = `mg-toast mg-toast--${type} mg-toast--show`;
    toastTimer = setTimeout(() => toastEl.classList.remove('mg-toast--show'), 3500);
}

/* ═══════════════════════════════════════════════════════
   ACCORDION — Rubros
   ═══════════════════════════════════════════════════════ */
document.querySelectorAll('.mg-rubro-header').forEach(header => {
    header.addEventListener('click', function () {
        const card = this.closest('.mg-rubro-card');
        card.classList.toggle('open');
    });
});

/* ═══════════════════════════════════════════════════════
   HELPERS DE MODAL
   ═══════════════════════════════════════════════════════ */
function openOverlay(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}
function closeOverlay(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
}

// Cerrar con × data-close y clic en overlay backdrop
document.querySelectorAll('.mg-modal-close[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeOverlay(btn.dataset.close));
});
document.querySelectorAll('.mg-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
        if (e.target === overlay) overlay.classList.remove('active');
    });
});
// Escape cierra cualquier overlay activo
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.mg-overlay.active').forEach(o => o.classList.remove('active'));
    }
});
// Botones cancelar con data-close
document.querySelectorAll('.mg-btn-cancel[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeOverlay(btn.dataset.close));
});

<?php if ($is_admin): ?>

/* ═══════════════════════════════════════════════════════
   EDICIÓN INLINE — Multiplicadores fijos
   ═══════════════════════════════════════════════════════ */
document.querySelectorAll('#mg-tbody .mg-input:not([readonly]):not(.mg-input-dyn)').forEach(input => {
    input.addEventListener('input', function () {
        const original = parseFloat(this.dataset.original);
        const actual   = parseFloat(this.value) || 0;
        const fila     = this.closest('tr');
        const btn      = fila.querySelector('.mg-btn-save');

        this.classList.toggle('mg-input--dirty', actual !== original);

        const pct = Math.round((actual - 1) * 100);
        this.closest('.mg-mult-wrap').querySelector('.mg-pct').textContent = '+' + pct + '%';

        // Actualizar Lista 4 si cambió precio_3
        if (this.dataset.campo === 'precio_3') {
            const lista4Input = fila.querySelector('input[readonly][style*="opacity:0.45"]');
            if (lista4Input) {
                const l4val = Math.round(actual * 1.10 * 100) / 100;
                lista4Input.value = l4val.toFixed(2);
                const l4pct = Math.round((l4val - 1) * 100);
                lista4Input.closest('.mg-mult-wrap').querySelector('.mg-pct').textContent = '+' + l4pct + '%';
            }
        }

        const hayDirty = fila.querySelectorAll('.mg-input--dirty').length > 0;
        if (btn) btn.style.display = hayDirty ? 'inline-block' : 'none';
    });
});

/* ═══════════════════════════════════════════════════════
   EDICIÓN INLINE — Multiplicadores dinámicos (listas custom)
   ═══════════════════════════════════════════════════════ */
document.querySelectorAll('#mg-tbody .mg-input-dyn:not([readonly])').forEach(input => {
    input.addEventListener('input', function () {
        const original = parseFloat(this.dataset.originalDyn);
        const actual   = parseFloat(this.value) || 0;
        const fila     = this.closest('tr');
        const btn      = fila.querySelector('.mg-btn-save');

        this.classList.toggle('mg-input--dirty', actual !== original);

        const pct = Math.round((actual - 1) * 100);
        this.closest('.mg-mult-wrap').querySelector('.mg-pct').textContent = '+' + pct + '%';

        const hayDirty = fila.querySelectorAll('.mg-input--dirty').length > 0;
        if (btn) btn.style.display = hayDirty ? 'inline-block' : 'none';
    });
});

/* ═══════════════════════════════════════════════════════
   GUARDAR FILA
   ═══════════════════════════════════════════════════════ */
document.querySelectorAll('.mg-btn-save').forEach(btn => {
    btn.addEventListener('click', async function () {
        const codigo = this.dataset.codigo;
        const fila   = this.closest('tr');

        this.disabled    = true;
        this.textContent = '…';

        let allOk  = true;
        let errMsg = '';

        /* — Guardar campos fijos modificados — */
        const fixedDirty = fila.querySelectorAll('.mg-input:not([readonly]):not(.mg-input-dyn).mg-input--dirty');
        if (fixedDirty.length > 0) {
            const datos = { codigo };
            fixedDirty.forEach(i => { datos[i.dataset.campo] = i.value; });
            try {
                const r = await (await fetch('../php/actualizar_margen_be.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(datos),
                })).json();
                if (r.ok) {
                    fixedDirty.forEach(i => {
                        i.dataset.original = i.value;
                        i.classList.remove('mg-input--dirty');
                    });
                } else {
                    allOk  = false;
                    errMsg = r.error || 'Error al guardar campos fijos.';
                }
            } catch {
                allOk  = false;
                errMsg = 'Error de conexión (campos fijos).';
            }
        }

        /* — Guardar campos dinámicos modificados — */
        const dynDirty = fila.querySelectorAll('.mg-input-dyn:not([readonly]).mg-input--dirty');
        for (const input of dynDirty) {
            if (!allOk) break;
            const listaId     = parseInt(input.dataset.listaId);
            const multiplicador = parseFloat(input.value);
            try {
                const r = await (await fetch('../php/actualizar_lista_margen_be.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ codigo, lista_id: listaId, multiplicador }),
                })).json();
                if (r.ok) {
                    input.dataset.originalDyn = input.value;
                    input.classList.remove('mg-input--dirty');
                } else {
                    allOk  = false;
                    errMsg = r.error || 'Error al guardar lista personalizada.';
                }
            } catch {
                allOk  = false;
                errMsg = 'Error de conexión (lista personalizada).';
            }
        }

        if (allOk) {
            this.textContent = '';
            this.classList.add('mg-btn-save--ok');
            showToast('Márgenes de ' + codigo + ' actualizados ');
            setTimeout(() => {
                this.textContent = 'Guardar';
                this.classList.remove('mg-btn-save--ok');
                this.style.display = 'none';
            }, 2000);
        } else {
            showToast('Error: ' + errMsg, 'error');
            this.textContent = 'Guardar';
        }
        this.disabled = false;
    });
});

/* ═══════════════════════════════════════════════════════
   ELIMINAR CATEGORÍA
   ═══════════════════════════════════════════════════════ */
document.querySelectorAll('.mg-btn-del').forEach(btn => {
    btn.addEventListener('click', async function () {
        const codigo = this.dataset.codigo;
        const prods  = parseInt(this.dataset.prods);

        if (prods > 0) {
            showToast(`No se puede eliminar: ${prods} producto${prods > 1 ? 's' : ''} usa${prods > 1 ? 'n' : ''} esta categoría.`, 'error');
            return;
        }
        if (!confirm(`¿Eliminar la categoría "${codigo}"? Esta acción no se puede deshacer.`)) return;

        try {
            const r = await (await fetch('../php/eliminar_margen_be.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ codigo }),
            })).json();
            if (r.ok) {
                this.closest('tr').remove();
                showToast(`Categoría "${codigo}" eliminada.`);
            } else {
                showToast('Error: ' + r.error, 'error');
            }
        } catch {
            showToast('Error de conexión', 'error');
        }
    });
});

/* ═══════════════════════════════════════════════════════
   MODAL — Nueva categoría (modal original)
   ═══════════════════════════════════════════════════════ */
const overlayCateg = document.getElementById('mg-overlay');
const btnNueva     = document.getElementById('btn-nueva');
const btnClose     = document.getElementById('mg-modal-close');
const btnCancel    = document.getElementById('mg-btn-cancel');
const btnCrear     = document.getElementById('mg-btn-crear');

function openModalCateg() {
    ['new-codigo','new-nombre','new-p0','new-p1','new-p2','new-p3','new-pmin']
        .forEach(id => { document.getElementById(id).value = ''; });
    ['new-pct-p0','new-pct-p1','new-pct-p2','new-pct-p3','new-pct-pmin']
        .forEach(id => { document.getElementById(id).textContent = '+0%'; });
    overlayCateg.classList.add('active');
    document.getElementById('new-codigo').focus();
}
function closeModalCateg() { overlayCateg.classList.remove('active'); }

btnNueva?.addEventListener('click', openModalCateg);
btnClose.addEventListener('click', closeModalCateg);
btnCancel.addEventListener('click', closeModalCateg);
overlayCateg.addEventListener('click', e => { if (e.target === overlayCateg) closeModalCateg(); });

// Auto-uppercase en código de categoría
document.getElementById('new-codigo').addEventListener('input', function() {
    const pos = this.selectionStart;
    this.value = this.value.toUpperCase();
    this.setSelectionRange(pos, pos);
});

// Actualizar % en el modal
document.querySelectorAll('.mg-mult-item input').forEach(input => {
    input.addEventListener('input', function() {
        const v   = parseFloat(this.value) || 0;
        const pct = v >= 1 ? Math.round((v - 1) * 100) : 0;
        document.getElementById(this.dataset.pct).textContent = '+' + pct + '%';
    });
});

// Crear nueva categoría
btnCrear.addEventListener('click', async function () {
    const datos = {
        codigo:           document.getElementById('new-codigo').value.trim().toUpperCase(),
        nombre:           document.getElementById('new-nombre').value.trim(),
        precio_0:         document.getElementById('new-p0').value,
        precio_1:         document.getElementById('new-p1').value,
        precio_2:         document.getElementById('new-p2').value,
        precio_3:         document.getElementById('new-p3').value,
        margen_minorista: document.getElementById('new-pmin').value,
    };
    if (!datos.codigo || !datos.nombre) {
        showToast('Código y nombre son obligatorios.', 'error'); return;
    }
    const mults = [datos.precio_0, datos.precio_1, datos.precio_2, datos.precio_3, datos.margen_minorista];
    if (mults.some(v => !v || parseFloat(v) < 1)) {
        showToast('Todos los multiplicadores deben ser ≥ 1,00.', 'error'); return;
    }
    this.disabled    = true;
    this.textContent = 'Creando…';
    try {
        const r = await (await fetch('../php/crear_margen_be.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos),
        })).json();
        if (r.ok) {
            showToast(`Categoría "${datos.codigo}" creada `);
            closeModalCateg();
            setTimeout(() => window.location.reload(), 800);
        } else {
            showToast('Error: ' + r.error, 'error');
        }
    } catch {
        showToast('Error de conexión', 'error');
    } finally {
        this.disabled    = false;
        this.textContent = 'Crear categoría';
    }
});

/* ═══════════════════════════════════════════════════════
   MODAL — Nueva lista de precio
   ═══════════════════════════════════════════════════════ */
const btnNuevaLista = document.getElementById('btn-nueva-lista');
const btnCrearLista = document.getElementById('btn-crear-lista');

btnNuevaLista?.addEventListener('click', () => {
    document.getElementById('lista-nombre').value = '';
    openOverlay('overlay-lista');
    setTimeout(() => document.getElementById('lista-nombre').focus(), 80);
});

btnCrearLista?.addEventListener('click', async function () {
    const nombre = document.getElementById('lista-nombre').value.trim();
    if (!nombre) { showToast('El nombre no puede estar vacío.', 'error'); return; }

    this.disabled    = true;
    this.textContent = 'Creando…';
    try {
        const r = await (await fetch('../php/crear_lista_precio_be.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre }),
        })).json();
        if (r.ok) {
            showToast(`Lista "${r.nombre}" creada `);
            closeOverlay('overlay-lista');
            setTimeout(() => window.location.reload(), 800);
        } else {
            showToast('Error: ' + r.error, 'error');
        }
    } catch {
        showToast('Error de conexión', 'error');
    } finally {
        this.disabled    = false;
        this.textContent = 'Crear lista';
    }
});

/* ═══════════════════════════════════════════════════════
   ELIMINAR LISTA (soft-delete)
   ═══════════════════════════════════════════════════════ */
document.querySelectorAll('.mg-chip-del').forEach(btn => {
    btn.addEventListener('click', async function (e) {
        e.stopPropagation();
        const listaId   = parseInt(this.dataset.listaId);
        const chip      = this.closest('.mg-chip');
        const nombre    = chip ? chip.textContent.trim().replace('','').trim() : `id ${listaId}`;

        if (!confirm(`¿Desactivar la lista "${nombre}"?\nLos datos de multiplicadores se conservarán.`)) return;

        try {
            const r = await (await fetch('../php/eliminar_lista_precio_be.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lista_id: listaId }),
            })).json();
            if (r.ok) {
                showToast(`Lista "${nombre}" desactivada.`);
                setTimeout(() => window.location.reload(), 700);
            } else {
                showToast('Error: ' + r.error, 'error');
            }
        } catch {
            showToast('Error de conexión', 'error');
        }
    });
});

/* ═══════════════════════════════════════════════════════
   MODAL — Nuevo rubro
   ═══════════════════════════════════════════════════════ */
const btnNuevoRubro = document.getElementById('btn-nuevo-rubro');
const btnCrearRubro = document.getElementById('btn-crear-rubro');

btnNuevoRubro?.addEventListener('click', () => {
    document.getElementById('rubro-codigo').value = '';
    document.getElementById('rubro-nombre').value = '';
    openOverlay('overlay-rubro');
    setTimeout(() => document.getElementById('rubro-codigo').focus(), 80);
});

// Auto-uppercase en código de rubro
document.getElementById('rubro-codigo')?.addEventListener('input', function() {
    const pos = this.selectionStart;
    this.value = this.value.toUpperCase();
    this.setSelectionRange(pos, pos);
});

btnCrearRubro?.addEventListener('click', async function () {
    const codigo = document.getElementById('rubro-codigo').value.trim().toUpperCase();
    const nombre = document.getElementById('rubro-nombre').value.trim();

    if (!codigo || !nombre) {
        showToast('Código y nombre son obligatorios.', 'error'); return;
    }
    this.disabled    = true;
    this.textContent = 'Guardando…';
    try {
        const r = await (await fetch('../php/crear_rubro_be.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codigo, nombre }),
        })).json();
        if (r.ok) {
            showToast(`Rubro "${r.codigo}" guardado `);
            closeOverlay('overlay-rubro');
            // Actualizar el nombre visible en el accordion sin recargar
            const card = document.querySelector(`.mg-rubro-card[data-prefix="${r.codigo}"]`);
            if (card) {
                const nameEl = card.querySelector('.mg-rubro-nombre');
                if (nameEl) {
                    nameEl.textContent = r.nombre;
                    nameEl.classList.remove('mg-rubro-nombre--sin');
                }
            } else {
                // Rubro nuevo (no hay categorías aún), recargar para reflejar
                setTimeout(() => window.location.reload(), 700);
            }
        } else {
            showToast('Error: ' + r.error, 'error');
        }
    } catch {
        showToast('Error de conexión', 'error');
    } finally {
        this.disabled    = false;
        this.textContent = 'Guardar rubro';
    }
});

/* ═══════════════════════════════════════════════════════
   EDITOR DE NOMBRES (rubro y categoría)
   ═══════════════════════════════════════════════════════ */
let _editCallback = null;

function openEditNombre(title, currentName, callback) {
    _editCallback = callback;
    document.getElementById('edit-nombre-title').textContent = title;
    const inp = document.getElementById('edit-nombre-input');
    inp.value = currentName;
    openOverlay('overlay-edit-nombre');
    setTimeout(() => { inp.focus(); inp.select(); }, 80);
}

// Enter confirma
document.getElementById('edit-nombre-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('edit-nombre-guardar').click();
});

// Guardar
document.getElementById('edit-nombre-guardar').addEventListener('click', async function () {
    if (!_editCallback) return;
    const nombre = document.getElementById('edit-nombre-input').value.trim();
    if (!nombre) { showToast('El nombre no puede estar vacío.', 'error'); return; }
    this.disabled    = true;
    this.textContent = 'Guardando…';
    try { await _editCallback(nombre); }
    finally { this.disabled = false; this.textContent = 'Guardar'; }
});

// Lápiz de rubro
document.querySelectorAll('.mg-rubro-edit-btn').forEach(btn => {
    btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const prefix   = this.dataset.prefix;
        const nombreEl = this.closest('.mg-rubro-card').querySelector('.mg-rubro-nombre');
        const actual   = nombreEl.dataset.nombre || '';

        openEditNombre(`Rubro ${prefix}`, actual, async (nombre) => {
            const r = await (await fetch('../php/crear_rubro_be.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ codigo: prefix, nombre }),
            })).json();
            if (r.ok) {
                nombreEl.textContent      = nombre;
                nombreEl.dataset.nombre   = nombre;
                nombreEl.classList.remove('mg-rubro-nombre--sin');
                closeOverlay('overlay-edit-nombre');
                showToast(`Rubro "${prefix}" actualizado `);
            } else {
                showToast('Error: ' + r.error, 'error');
            }
        });
    });
});

// Lápiz de categoría
document.querySelectorAll('.mg-cat-edit-btn').forEach(btn => {
    btn.addEventListener('click', function () {
        const item     = this.closest('.mg-cat-item');
        const codigo   = item.dataset.codigo;
        const nombreEl = item.querySelector('.mg-cat-item-nombre');
        const actual   = item.dataset.nombre || nombreEl.textContent.trim();

        openEditNombre(`Categoría ${codigo}`, actual, async (nombre) => {
            const r = await (await fetch('../php/actualizar_nombre_margen_be.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ codigo, nombre }),
            })).json();
            if (r.ok) {
                nombreEl.textContent  = nombre;
                nombreEl.title        = nombre;
                item.dataset.nombre   = nombre;
                // Sincronizar columna "Categoría" en la tabla de multiplicadores
                const tr = document.querySelector(`#mg-tbody tr[data-codigo="${CSS.escape(codigo)}"]`);
                if (tr) {
                    const td = tr.querySelector('.mg-col-nombre');
                    if (td) td.textContent = nombre;
                }
                closeOverlay('overlay-edit-nombre');
                showToast(`Categoría "${codigo}" actualizada `);
            } else {
                showToast('Error: ' + r.error, 'error');
            }
        });
    });
});

<?php endif; ?>
</script>
</body>
</html>
