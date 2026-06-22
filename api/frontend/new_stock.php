<?php
$PERMITIDOS = ['Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'];
require __DIR__ . '/partials/guard.php';

include '../php/conexion_starlim_be.php';
$empresaId = starlim_bootstrap_tenant_context($conexion);

// Cargar categorías de precio (margenes)
$mar_res = $conexion->query("SELECT * FROM margenes WHERE empresa_id = $empresaId ORDER BY codigo");
$margenes_list = [];
while ($m = $mar_res->fetch_assoc()) {
    $margenes_list[] = $m;
}

$status      = $_GET['status']  ?? '';
$status_msg  = $_GET['msg']     ?? '';
$status_name = $_GET['nombre']  ?? '';
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nuevo Stock — Starlim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <link rel="stylesheet" href="../css/panel_bd.css">
    <link rel="stylesheet" href="../css/styleStock.css">
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body class="cambio-pagina">

<?php $NAV_ACTIVA = 'stock'; include __DIR__ . '/partials/nav.php'; ?>

<main class="dash-main">
<div class="ventas-layout">

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
            <a href="new_stock.php" class="bd-card bd-card--active">
                <div class="bd-card-body">
                    <span class="bd-card-title">Nuevo Stock</span>
                    <span class="bd-card-desc">Agregar nuevos productos al inventario</span>
                </div>
                <span class="bd-card-arrow">→</span>
            </a>
            <a href="recontar_stock.php" class="bd-card">
                <div class="bd-card-body">
                    <span class="bd-card-title">Recontar Stock</span>
                    <span class="bd-card-desc">Ajustar stock por reconteo o inventario</span>
                </div>
                <span class="bd-card-arrow">→</span>
            </a>
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

<div class="ventas-content">
    <h1 class="ns-titulo">Nuevo Producto</h1>

    <?php if ($status === 'ok'): ?>
    <div class="ns-notice ns-notice--ok">
        Producto <strong><?= htmlspecialchars($status_name) ?></strong> guardado correctamente.
    </div>
    <?php elseif ($status === 'error'): ?>
    <div class="ns-notice ns-notice--error">
        <?= htmlspecialchars($status_msg ?: 'Ocurrió un error al guardar el producto.') ?>
    </div>
    <?php endif; ?>

    <form id="ns-form" action="../php/stock_upload_be.php" method="POST" enctype="multipart/form-data">

        <!-- ── Sección 1: Datos básicos ───────────────────────── -->
        <div class="ns-card">
            <div class="ns-section-header">Datos básicos</div>
            <div class="ns-row">
                <div class="ns-field ns-field--grow2">
                    <label for="ns-nombre">Nombre <span class="ns-req">*</span></label>
                    <input type="text" id="ns-nombre" name="nombre"
                           placeholder="Ej: Detergente Magistral" required maxlength="255">
                </div>
                <div class="ns-field">
                    <label for="ns-costo">Costo ($) <span class="ns-req">*</span></label>
                    <input type="number" id="ns-costo" name="costo"
                           placeholder="0.00" step="0.01" min="0.01" required>
                </div>
                <div class="ns-field">
                    <label for="ns-stock">Stock inicial</label>
                    <input type="number" id="ns-stock" name="stock"
                           placeholder="0" min="0" value="0">
                </div>
            </div>
        </div>

        <!-- ── Sección 2: Categoría de precio ────────────────── -->
        <div class="ns-card">
            <div class="ns-section-header">
                Categoría de precio
                <span class="ns-section-note">Los precios se calculan automáticamente: costo &times; margen</span>
            </div>
            <div class="ns-row ns-row--top">
                <div class="ns-field ns-field--grow2">
                    <label for="ns-codigo">Categoría <span class="ns-req">*</span></label>
                    <select id="ns-codigo" name="codigo" required>
                        <option value="">— Seleccionar categoría —</option>
                        <?php foreach ($margenes_list as $m): ?>
                        <option value="<?= htmlspecialchars($m['codigo']) ?>">
                            <?= htmlspecialchars($m['codigo']) ?> &mdash; <?= htmlspecialchars($m['nombre']) ?>
                        </option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="ns-field">
                    <label for="ns-proveedor">Proveedor <span class="ns-opt">(opcional)</span></label>
                    <input type="text" id="ns-proveedor" name="proveedor"
                           placeholder="Ej: Distribuidora Pérez" maxlength="100">
                </div>
            </div>
            <!-- Preview dinámico de precios calculados -->
            <div class="ns-precios-preview" id="ns-precios-preview" style="display:none;">
                <span class="ns-preview-label">Precios que tendrá este producto:</span>
                <div class="ns-preview-grid" id="ns-preview-grid"></div>
            </div>
        </div>

        <!-- ── Sección 3: Descripción e imagen ───────────────── -->
        <div class="ns-card">
            <div class="ns-row ns-row--top">
                <div class="ns-field ns-field--grow2">
                    <label for="ns-desc">Descripción <span class="ns-opt">(opcional)</span></label>
                    <textarea id="ns-desc" name="descripcion" rows="4"
                              placeholder="Descripción del producto, características, usos..."></textarea>
                </div>
                <div class="ns-field">
                    <label>Imagen <span class="ns-opt">(opcional)</span></label>
                    <div class="ns-img-wrap">
                        <img id="ns-img-preview" class="ns-img-preview" src="" alt="">
                        <label for="ns-foto" class="ns-img-label">
                            <span id="ns-img-text">Seleccionar imagen&hellip;</span>
                        </label>
                        <input type="file" id="ns-foto" name="foto"
                               accept=".jpg,.jpeg,.png,.gif,.webp" style="display:none">
                    </div>
                </div>
            </div>
        </div>

        <!-- ── Acción ─────────────────────────────────────────── -->
        <div class="ns-actions">
            <button type="submit" class="ns-btn-submit">Guardar en Stock &rarr;</button>
        </div>

    </form>
</div><!-- /ventas-content -->
</div><!-- /ventas-layout -->
</main>

<script src="../js/global.js"></script>
<script>
/* ── Sidebar ─────────────────────────────────────────── */
const _sidebar  = document.getElementById('ventas-sidebar');
const _openBtn  = document.getElementById('sidebar-open-btn');
const _closeBtn = document.getElementById('sidebar-close-btn');
_openBtn .addEventListener('click', () => _sidebar.classList.remove('sidebar-collapsed'));
_closeBtn.addEventListener('click', () => _sidebar.classList.add('sidebar-collapsed'));

/* ── Datos de márgenes (desde PHP) ───────────────────── */
const margenesData = <?= json_encode(
    array_reduce($margenes_list, function($carry, $m) {
        $carry[$m['codigo']] = [
            'p0'  => (float)$m['precio_0'],
            'p1'  => (float)$m['precio_1'],
            'p2'  => (float)$m['precio_2'],
            'p3'  => (float)$m['precio_3'],
            'min' => (float)$m['margen_minorista'],
        ];
        return $carry;
    }, []),
    JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP
) ?>;

/* ── Formateo de precio (estilo argentino) ───────────── */
function fmtP(v) {
    if (!v || v <= 0) return '—';
    const n = Math.round(v * 100) / 100;
    const [ent, dec] = n.toFixed(2).split('.');
    const entFmt = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return dec === '00' ? `$${entFmt}` : `$${entFmt},${dec}`;
}

/* ── Preview de precios calculados ───────────────────── */
function updatePreview() {
    const costo  = parseFloat(document.getElementById('ns-costo').value) || 0;
    const codigo = document.getElementById('ns-codigo').value;
    const wrap   = document.getElementById('ns-precios-preview');
    const grid   = document.getElementById('ns-preview-grid');

    if (!costo || !codigo || !margenesData[codigo]) {
        wrap.style.display = 'none';
        return;
    }

    const m = margenesData[codigo];
    grid.innerHTML = [
        ['Lista 0',    m.p0  * costo],
        ['Lista 1',    m.p1  * costo],
        ['Lista 2',    m.p2  * costo],
        ['Lista 3',    m.p3  * costo],
        ['Minorista',  m.min * costo],
    ].map(([label, val]) =>
        `<div class="ns-preview-item">
            <span class="ns-preview-name">${label}</span>
            <span class="ns-preview-val">${fmtP(val)}</span>
        </div>`
    ).join('');

    wrap.style.display = 'block';
}

document.getElementById('ns-costo') .addEventListener('input',  updatePreview);
document.getElementById('ns-codigo').addEventListener('change', updatePreview);

/* ── Preview de imagen ───────────────────────────────── */
document.getElementById('ns-foto').addEventListener('change', function () {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const preview = document.getElementById('ns-img-preview');
        preview.src = e.target.result;
        preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
    document.getElementById('ns-img-text').textContent = file.name;
});

/* ── Auto-dismiss del notice ─────────────────────────── */
const notice = document.querySelector('.ns-notice');
if (notice) setTimeout(() => notice.style.opacity = '0', 5000);
</script>
</body>
</html>
