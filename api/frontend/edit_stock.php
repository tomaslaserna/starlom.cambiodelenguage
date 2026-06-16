<?php
$PERMITIDOS = ['Empleado_1', 'Empleado_2', 'Jefe1', 'Admin'];
require __DIR__ . '/partials/guard.php';

include '../php/conexion_starlim_be.php';

$limite_pag       = 50;
$pagina           = max(1, intval($_GET['pagina'] ?? 1));
$buscar           = trim($_GET['buscar']    ?? '');
$filtro_proveedor = trim($_GET['proveedor'] ?? '');
$filtro_rubro     = trim($_GET['rubro']     ?? '');

/* ── Construir WHERE dinámico ───────────────────────────────────── */
$conditions = [];
if ($buscar !== '') {
    $s = $buscar;
    $l = '%' . str_replace(['%', '_'], ['\%', '\_'], $s) . '%';
    $conditions[] = "(nombre LIKE '$l' OR CAST(id AS CHAR) LIKE '$l')";
}
if ($filtro_proveedor !== '') {
    $sp = $filtro_proveedor;
    $conditions[] = "proveedor = '$sp'";
}
if ($filtro_rubro !== '') {
    $sr = preg_replace('/[^A-Za-z]/', '', $filtro_rubro);
    if ($sr !== '') $conditions[] = "codigo LIKE '" . $sr . "%'";
}
$where = $conditions ? 'WHERE ' . implode(' AND ', $conditions) : '';

/* ── String de parámetros para paginación ───────────────────────── */
$q_params = [];
if ($buscar !== '')           $q_params[] = 'buscar='    . urlencode($buscar);
if ($filtro_proveedor !== '') $q_params[] = 'proveedor=' . urlencode($filtro_proveedor);
if ($filtro_rubro !== '')     $q_params[] = 'rubro='     . urlencode($filtro_rubro);
$q = $q_params ? '&' . implode('&', $q_params) : '';

$count_res  = $conexion->query("SELECT COUNT(*) AS total FROM productos $where");
$total_prod = (int)$count_res->fetch_assoc()['total'];
$total_pags = max(1, (int)ceil($total_prod / $limite_pag));
$pagina     = min($pagina, $total_pags);
$offset     = ($pagina - 1) * $limite_pag;

$res = $conexion->query("SELECT id, codigo, nombre, descripcion, costo AS precio, stock AS cantidad, imagen, proveedor
     FROM productos
     $where
     ORDER BY id ASC
     LIMIT $limite_pag OFFSET $offset"
);

/* ── Datos para dropdowns de filtro ─────────────────────────────── */
$proveedores_filtro = [];
$r_pf = $conexion->query("SELECT DISTINCT proveedor FROM productos
     WHERE TRIM(COALESCE(proveedor,'')) != ''
     ORDER BY proveedor ASC"
);
if ($r_pf) while ($r = $r_pf->fetch_assoc()) $proveedores_filtro[] = $r['proveedor'];

$rubros_filtro = [];
$chk_rubros = $conexion->query("SHOW TABLES LIKE 'rubros'");
if ($chk_rubros && $chk_rubros->num_rows > 0) {
    $r_rf = $conexion->query("SELECT codigo, nombre FROM rubros ORDER BY codigo ASC");
    if ($r_rf) while ($r = $r_rf->fetch_assoc()) $rubros_filtro[] = $r;
}

$productos = [];
while ($row = $res->fetch_assoc()) {
    $productos[] = $row;
}

// Cargar lista de categorías para el select del modal
$mar_res = $conexion->query("SELECT codigo, nombre FROM margenes ORDER BY codigo");
$margenes_modal = [];
while ($m = $mar_res->fetch_assoc()) {
    $margenes_modal[] = $m;
}
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <title>Gestión de Stock - Star Lim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <link rel="stylesheet" href="../css/panel_bd.css">
    <link rel="stylesheet" href="../css/style_edit_stock.css">
    <style>
        .es-filter-bar {
            display: flex; align-items: center; flex-wrap: wrap;
            gap: 10px; margin-top: 10px;
        }
        .es-filter-group {
            display: flex; align-items: center; gap: 6px;
        }
        .es-filter-label {
            font-size: 11px; font-weight: 700; letter-spacing: .06em;
            text-transform: uppercase; color: #667085; white-space: nowrap;
        }
        .es-filter-select {
            padding: 7px 10px; border-radius: 7px;
            border: 1px solid rgba(128,128,128,.22);
            background: rgba(128,128,128,.06);
            color: var(--text-color); font-size: 13px;
            font-family: inherit; outline: none;
            cursor: pointer; max-width: 220px;
            transition: border-color .2s;
        }
        .es-filter-select:focus { border-color: #2563eb; }
        .es-filter-select option { background: #101828; }
        .es-filter-clear {
            font-size: 12px; font-weight: 600;
            color: #dc2626; text-decoration: none;
            padding: 5px 10px; border-radius: 6px;
            border: 1px solid rgba(220,38,38,.2);
            transition: background .15s;
            white-space: nowrap;
        }
        .es-filter-clear:hover { background: rgba(220,38,38,.07); }
        .es-filter-active-badge {
            display: inline-block; font-size: 10px; font-weight: 700;
            padding: 2px 8px; border-radius: 99px;
            background: rgba(0,85,204,.12); color: #2563eb;
            margin-left: 4px;
        }
        .dark-mode .es-filter-active-badge { color: #60a5fa; }

        .es-content-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 12px;
            padding-bottom: 1.1rem;
        }
        .es-btn-registro {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            padding: 9px 16px;
            border-radius: 9px;
            background: rgba(37,99,235,0.1);
            border: 1px solid rgba(37,99,235,0.25);
            color: #2563eb;
            font-size: 0.85rem;
            font-weight: 600;
            text-decoration: none;
            transition: background 0.15s, border-color 0.15s;
            white-space: nowrap;
        }
        .es-btn-registro:hover {
            background: rgba(37,99,235,0.18);
            border-color: rgba(37,99,235,0.45);
        }
        .es-btn-registro-icon { font-size: 1rem; }
        .dark-mode .es-btn-registro {
            color: #60a5fa;
            background: rgba(77,159,255,0.1);
            border-color: rgba(77,159,255,0.25);
        }
        .dark-mode .es-btn-registro:hover {
            background: rgba(77,159,255,0.18);
            border-color: rgba(77,159,255,0.45);
        }
    </style>
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
            <a href="edit_stock.php" class="bd-card bd-card--active">
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
            <a href="registro_stock.php" class="bd-card" style="border-left: 3px solid #2563eb;">
                <div class="bd-card-body">
                    <span class="bd-card-title">Registro de Cambios</span>
                    <span class="bd-card-desc">Historial de modificaciones de stock</span>
                </div>
                <span class="bd-card-arrow">→</span>
            </a>
            <?php endif; ?>
        </div>
    </div>
</aside>

<div class="ventas-content">
    <div class="es-content-header">
        <h1 class="es-titulo" style="margin:0;padding:0;">Gestión de Stock</h1>
        <?php if (in_array($rango, ['Jefe', 'Jefe1', 'Admin'], true)): ?>
        <a href="registro_stock.php" class="es-btn-registro">
            <span class="es-btn-registro-icon"></span>
            Registro de modificaciones
        </a>
        <?php endif; ?>
    </div>

    <div class="es-search-bar">
        <div class="es-search-wrap">
            <span class="es-search-icon"></span>
            <input type="text" id="buscar-input"
                   value="<?= htmlspecialchars($buscar) ?>"
                   placeholder="Buscar por nombre o ID... (busca en todos los productos)">
            <?php if ($buscar !== ''): ?>
            <a href="edit_stock.php<?= $filtro_proveedor !== '' || $filtro_rubro !== '' ? '?' . implode('&', array_filter([$filtro_proveedor !== '' ? 'proveedor='.urlencode($filtro_proveedor) : '', $filtro_rubro !== '' ? 'rubro='.urlencode($filtro_rubro) : ''])) : '' ?>"
               class="es-search-clear" title="Limpiar búsqueda">&#10005;</a>
            <?php endif; ?>
        </div>
        <span class="es-search-info">
            <?php
                $info_partes = [];
                if ($buscar !== '')           $info_partes[] = '&ldquo;<strong>' . htmlspecialchars($buscar) . '</strong>&rdquo;';
                if ($filtro_proveedor !== '') $info_partes[] = 'proveedor <strong>' . htmlspecialchars($filtro_proveedor) . '</strong>';
                if ($filtro_rubro !== '')     $info_partes[] = 'rubro <strong>' . htmlspecialchars($filtro_rubro) . '</strong>';
            ?>
            <?= $total_prod ?> producto<?= $total_prod != 1 ? 's' : '' ?>
            <?= $info_partes ? ' · ' . implode(' · ', $info_partes) : ' en total' ?>
        </span>

        <?php if (!empty($proveedores_filtro) || !empty($rubros_filtro)): ?>
        <div class="es-filter-bar">
            <?php if (!empty($proveedores_filtro)): ?>
            <div class="es-filter-group">
                <label class="es-filter-label" for="filtro-proveedor">Proveedor</label>
                <select class="es-filter-select" id="filtro-proveedor">
                    <option value="">Todos</option>
                    <?php foreach ($proveedores_filtro as $pf): ?>
                    <option value="<?= htmlspecialchars($pf) ?>" <?= $filtro_proveedor === $pf ? 'selected' : '' ?>>
                        <?= htmlspecialchars($pf) ?>
                    </option>
                    <?php endforeach; ?>
                </select>
            </div>
            <?php endif; ?>
            <?php if (!empty($rubros_filtro)): ?>
            <div class="es-filter-group">
                <label class="es-filter-label" for="filtro-rubro">Rubro</label>
                <select class="es-filter-select" id="filtro-rubro">
                    <option value="">Todos</option>
                    <?php foreach ($rubros_filtro as $rf): ?>
                    <option value="<?= htmlspecialchars($rf['codigo']) ?>" <?= $filtro_rubro === $rf['codigo'] ? 'selected' : '' ?>>
                        <?= htmlspecialchars($rf['codigo']) ?> — <?= htmlspecialchars($rf['nombre']) ?>
                    </option>
                    <?php endforeach; ?>
                </select>
            </div>
            <?php endif; ?>
            <?php if ($filtro_proveedor !== '' || $filtro_rubro !== ''): ?>
            <a href="edit_stock.php<?= $buscar !== '' ? '?buscar='.urlencode($buscar) : '' ?>"
               class="es-filter-clear">Limpiar filtros</a>
            <?php endif; ?>
        </div>
        <?php endif; ?>
    </div>

    <?php if (empty($productos)): ?>
    <div class="es-empty">
        <p>No se encontraron productos<?= $buscar !== '' ? ' para &ldquo;' . htmlspecialchars($buscar) . '&rdquo;' : '' ?>.</p>
    </div>
    <?php else: ?>

    <div class="es-table-wrap">
        <table class="es-table">
            <thead>
                <tr>
                    <th class="col-id">#</th>
                    <th class="col-img"></th>
                    <th class="col-nombre">Nombre</th>
                    <th class="col-precio">Precio</th>
                    <th class="col-stock">Stock</th>
                    <th class="col-accion"></th>
                </tr>
            </thead>
            <tbody>
            <?php foreach ($productos as $p):
                $qty       = (int)$p['cantidad'];
                $qty_class = $qty === 0 ? 'qty-cero' : ($qty <= 5 ? 'qty-bajo' : 'qty-ok');
            ?>
                <tr class="es-row" data-id="<?= (int)$p['id'] ?>">
                    <td class="col-id"><?= (int)$p['id'] ?></td>
                    <td class="col-img">
                        <img class="es-thumb"
                             src="<?= htmlspecialchars(str_starts_with($p['imagen'] ?? '', 'http') ? $p['imagen'] : '../' . $p['imagen']) ?>"
                             alt=""
                             onerror="this.style.opacity='0.15'">
                    </td>
                    <td class="col-nombre"><?= htmlspecialchars($p['nombre']) ?></td>
                    <td class="col-precio">$<?= number_format((float)$p['precio'], 2) ?></td>
                    <td class="col-stock">
                        <span class="qty-badge <?= $qty_class ?>"><?= $qty ?></span>
                    </td>
                    <td class="col-accion"><span class="es-edit-hint">&#9998;</span></td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
    </div>

    <?php if ($total_pags > 1):
        $start = max(1, $pagina - 2);
        $end   = min($total_pags, $pagina + 2);
    ?>
    <div class="paginacion">
        <?php if ($pagina > 1): ?>
            <a href="?pagina=1<?= $q ?>" class="pag-btn" title="Primera">&#171;</a>
            <a href="?pagina=<?= $pagina - 1 ?><?= $q ?>" class="pag-btn" title="Anterior">&#8249;</a>
        <?php endif; ?>

        <?php if ($start > 1): ?><span class="pag-ellipsis">&hellip;</span><?php endif; ?>

        <?php for ($i = $start; $i <= $end; $i++): ?>
            <?php if ($i === $pagina): ?>
                <span class="pag-btn pag-btn--activo"><?= $i ?></span>
            <?php else: ?>
                <a href="?pagina=<?= $i ?><?= $q ?>" class="pag-btn"><?= $i ?></a>
            <?php endif; ?>
        <?php endfor; ?>

        <?php if ($end < $total_pags): ?><span class="pag-ellipsis">&hellip;</span><?php endif; ?>

        <?php if ($pagina < $total_pags): ?>
            <a href="?pagina=<?= $pagina + 1 ?><?= $q ?>" class="pag-btn" title="Siguiente">&#8250;</a>
            <a href="?pagina=<?= $total_pags ?><?= $q ?>" class="pag-btn" title="Última">&#187;</a>
        <?php endif; ?>
    </div>
    <div class="pag-info">
        Página <?= $pagina ?> de <?= $total_pags ?> &mdash; mostrando <?= count($productos) ?> de <?= $total_prod ?> productos
    </div>
    <?php endif; ?>

    <?php endif; ?>
</div><!-- /ventas-content -->
</div><!-- /ventas-layout -->
</main>

<!-- ── Modal de edición ─────────────────────────────────── -->
<div class="es-modal-overlay" id="modal-overlay">
    <div class="es-modal-card" id="modal-card">
        <div class="es-modal-header">
            <h2 class="es-modal-title" id="modal-title">Editar producto</h2>
            <button class="es-modal-close" id="modal-close" aria-label="Cerrar">&#10005;</button>
        </div>
        <div class="es-modal-body">
            <div class="es-modal-img-col">
                <img class="es-modal-img" id="modal-img-preview" src="" alt="Vista previa">
                <div class="es-field">
                    <label for="modal-imagen">Ruta de imagen</label>
                    <input type="text" id="modal-imagen" placeholder="imagenesProductos/foto.jpg">
                </div>
            </div>
            <div class="es-modal-fields">
                <input type="hidden" id="modal-id">
                <div class="es-field">
                    <label for="modal-nombre">Nombre</label>
                    <input type="text" id="modal-nombre">
                </div>
                <div class="es-field es-field--row">
                    <div>
                        <label for="modal-precio">Costo ($)</label>
                        <input type="number" step="0.01" min="0" id="modal-precio">
                    </div>
                    <div>
                        <label for="modal-cantidad">Stock</label>
                        <input type="number" min="0" id="modal-cantidad">
                    </div>
                </div>
                <div class="es-field">
                    <label for="modal-codigo">Categoría de precio</label>
                    <select id="modal-codigo">
                        <option value="">— Sin categoría —</option>
                        <?php foreach ($margenes_modal as $m): ?>
                        <option value="<?= htmlspecialchars($m['codigo']) ?>">
                            <?= htmlspecialchars($m['codigo']) ?> &mdash; <?= htmlspecialchars($m['nombre']) ?>
                        </option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="es-field">
                    <label for="modal-descripcion">Descripción</label>
                    <textarea id="modal-descripcion" rows="3" placeholder="Descripción del producto..."></textarea>
                </div>
                <div class="es-field">
                    <label for="modal-justificacion">Justificación del cambio <span style="color:#dc2626;font-style:normal">*</span></label>
                    <textarea id="modal-justificacion" rows="2" placeholder="¿Por qué se realiza este cambio?" style="border-color: rgba(220,38,38,0.35);"></textarea>
                </div>
            </div>
        </div>
        <div class="es-modal-footer">
            <button class="es-btn-cancel" id="btn-cancel">Cancelar</button>
            <button class="es-btn-save" id="btn-save">Guardar cambios</button>
        </div>
    </div>
</div>

<!-- Toast de notificación -->
<div class="es-toast" id="toast"></div>

<script src="../js/global.js"></script>
<script>
/* ── Sidebar ─────────────────────────────────────────── */
const _sidebar  = document.getElementById('ventas-sidebar');
const _openBtn  = document.getElementById('sidebar-open-btn');
const _closeBtn = document.getElementById('sidebar-close-btn');
_openBtn .addEventListener('click', () => _sidebar.classList.remove('sidebar-collapsed'));
_closeBtn.addEventListener('click', () => _sidebar.classList.add('sidebar-collapsed'));

/* ── Datos de productos ──────────────────────────────── */
const productosData = <?= json_encode(
    array_map(fn($p) => [
        'id'          => (int)$p['id'],
        'codigo'      => $p['codigo']      ?? '',
        'nombre'      => $p['nombre'],
        'precio'      => (float)$p['precio'],
        'descripcion' => $p['descripcion'] ?? '',
        'cantidad'    => (int)$p['cantidad'],
        'imagen'      => $p['imagen']      ?? '',
    ], $productos),
    JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP
) ?>;

/* ── Filtros: helper para navegar preservando todos los params ── */
function applyFilters() {
    const url = new URL(window.location.href);
    const buscarVal   = document.getElementById('buscar-input')?.value.trim()       ?? '';
    const proveedorEl = document.getElementById('filtro-proveedor');
    const rubroEl     = document.getElementById('filtro-rubro');

    if (buscarVal) url.searchParams.set('buscar', buscarVal);
    else           url.searchParams.delete('buscar');

    if (proveedorEl?.value) url.searchParams.set('proveedor', proveedorEl.value);
    else                    url.searchParams.delete('proveedor');

    if (rubroEl?.value) url.searchParams.set('rubro', rubroEl.value);
    else                url.searchParams.delete('rubro');

    url.searchParams.set('pagina', '1');
    window.location.href = url.toString();
}

/* ── Búsqueda con debounce (server-side) ─────────────── */
let searchTimer;
document.getElementById('buscar-input').addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applyFilters, 500);
});

document.getElementById('filtro-proveedor')?.addEventListener('change', applyFilters);
document.getElementById('filtro-rubro')?.addEventListener('change', applyFilters);

/* ── Referencias al modal ────────────────────────────── */
const overlay             = document.getElementById('modal-overlay');
const modalTitle          = document.getElementById('modal-title');
const modalId             = document.getElementById('modal-id');
const modalNombre         = document.getElementById('modal-nombre');
const modalPrecio         = document.getElementById('modal-precio');
const modalDescripcion    = document.getElementById('modal-descripcion');
const modalCantidad       = document.getElementById('modal-cantidad');
const modalCodigo         = document.getElementById('modal-codigo');
const modalImagen         = document.getElementById('modal-imagen');
const modalImgPreview     = document.getElementById('modal-img-preview');
const modalJustificacion  = document.getElementById('modal-justificacion');
const btnSave             = document.getElementById('btn-save');

/* ── Abrir modal ─────────────────────────────────────── */
function openModal(id) {
    const p = productosData.find(x => x.id == id);
    if (!p) return;

    modalId.value          = p.id;
    modalTitle.textContent = `#${p.id} — ${p.nombre}`;
    modalNombre.value      = p.nombre;
    modalPrecio.value      = p.precio;
    modalDescripcion.value = p.descripcion;
    modalCantidad.value    = p.cantidad;
    modalCodigo.value      = p.codigo || '';
    modalImagen.value      = p.imagen;
    modalImgPreview.src    = p.imagen.startsWith('http') ? p.imagen : `../${p.imagen}`;

    modalJustificacion.value = '';
    modalJustificacion.style.borderColor = 'rgba(220,38,38,0.35)';

    overlay.classList.add('active');
    setTimeout(() => modalNombre.focus(), 60);
}

/* ── Cerrar modal ────────────────────────────────────── */
function closeModal() {
    overlay.classList.remove('active');
}

document.querySelectorAll('.es-row').forEach(row => {
    row.addEventListener('click', () => openModal(row.dataset.id));
});

document.getElementById('btn-cancel').addEventListener('click', closeModal);
document.getElementById('modal-close').addEventListener('click', closeModal);
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

document.addEventListener('keydown', e => {
    if (!overlay.classList.contains('active')) return;
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Enter' && document.activeElement.tagName !== 'TEXTAREA') {
        btnSave.click();
    }
});

/* ── Preview de imagen en vivo ───────────────────────── */
let imgTimer;
modalImagen.addEventListener('input', function () {
    clearTimeout(imgTimer);
    imgTimer = setTimeout(() => {
        const val = this.value.trim();
        modalImgPreview.src = val ? `../${val}` : '';
    }, 400);
});

/* ── Toast ───────────────────────────────────────────── */
const toastEl = document.getElementById('toast');
let toastTimer;
function showToast(msg, type = 'success') {
    clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.className   = `es-toast es-toast--${type} es-toast--show`;
    toastTimer = setTimeout(() => toastEl.classList.remove('es-toast--show'), 3500);
}

/* ── Guardar vía AJAX ────────────────────────────────── */
modalJustificacion.addEventListener('input', function () {
    this.style.borderColor = this.value.trim()
        ? 'rgba(37,99,235,0.5)'
        : 'rgba(220,38,38,0.35)';
});

btnSave.addEventListener('click', async () => {
    const id = parseInt(modalId.value);
    if (!id) return;

    if (!modalJustificacion.value.trim()) {
        showToast('Debe ingresar una justificación', 'error');
        modalJustificacion.focus();
        modalJustificacion.style.borderColor = '#dc2626';
        return;
    }

    const payload = new FormData();
    payload.append('id',             id);
    payload.append('nombre',         modalNombre.value.trim());
    payload.append('precio',         modalPrecio.value);
    payload.append('descripcion',    modalDescripcion.value.trim());
    payload.append('cantidad',       modalCantidad.value);
    payload.append('codigo',         modalCodigo.value.trim());
    payload.append('imagen',         modalImagen.value.trim());
    payload.append('justificacion',  modalJustificacion.value.trim());

    btnSave.disabled    = true;
    btnSave.textContent = 'Guardando…';

    try {
        const res  = await fetch('../php/actualizar_producto_ajax.php', { method: 'POST', body: payload });
        const data = await res.json();

        if (data.ok) {
            showToast('Guardado correctamente ');
            updateRow(id, payload);
            closeModal();
        } else {
            showToast('Error: ' + data.msg, 'error');
        }
    } catch (_) {
        showToast('Error de conexión', 'error');
    } finally {
        btnSave.disabled    = false;
        btnSave.textContent = 'Guardar cambios';
    }
});

/* ── Actualizar fila tras guardar ────────────────────── */
function updateRow(id, fd) {
    const row = document.querySelector(`.es-row[data-id="${id}"]`);
    if (!row) return;

    const nombre   = fd.get('nombre');
    const precio   = parseFloat(fd.get('precio'));
    const cantidad = parseInt(fd.get('cantidad'));
    const imagen   = fd.get('imagen');

    const p = productosData.find(x => x.id == id);
    if (p) {
        p.codigo      = fd.get('codigo');
        p.nombre      = nombre;
        p.precio      = precio;
        p.cantidad    = cantidad;
        p.imagen      = imagen;
        p.descripcion = fd.get('descripcion');
    }

    row.querySelector('.col-img img').src        = `../${imagen}`;
    row.querySelector('.col-nombre').textContent = nombre;
    row.querySelector('.col-precio').textContent = `$${precio.toFixed(2)}`;

    const badge    = row.querySelector('.qty-badge');
    badge.textContent = cantidad;
    badge.className   = 'qty-badge ' + (cantidad === 0 ? 'qty-cero' : cantidad <= 5 ? 'qty-bajo' : 'qty-ok');
}
</script>
</body>
</html>
