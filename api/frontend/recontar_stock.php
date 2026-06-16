<?php
$PERMITIDOS = ['Empleado_1', 'Empleado_2', 'Jefe1', 'Admin'];
require __DIR__ . '/partials/guard.php';

include '../php/conexion_starlim_be.php';

$res = $conexion->query("SELECT id, nombre, stock FROM productos ORDER BY nombre ASC"
);
$productos = [];
while ($p = $res->fetch_assoc()) {
    $productos[] = [
        'id'    => (int)$p['id'],
        'nombre'=> $p['nombre'],
        'stock' => (int)$p['stock'],
    ];
}
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Recontar Stock — Star Lim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <link rel="stylesheet" href="../css/panel_bd.css">
    <link rel="stylesheet" href="../css/style_recontar_stock.css">
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
            <a href="new_stock.php" class="bd-card">
                <div class="bd-card-body">
                    <span class="bd-card-title">Nuevo Stock</span>
                    <span class="bd-card-desc">Agregar nuevos productos al inventario</span>
                </div>
                <span class="bd-card-arrow">→</span>
            </a>
            <a href="recontar_stock.php" class="bd-card bd-card--active">
                <div class="bd-card-body">
                    <span class="bd-card-title">Recontar Stock</span>
                    <span class="bd-card-desc">Ajustar stock por reconteo o inventario</span>
                </div>
                <span class="bd-card-arrow">→</span>
            </a>
            <?php if (in_array($rango, ['Jefe1', 'Admin'], true)): ?>
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
<div class="rs-wrap">

    <!-- Encabezado -->
    <div class="rs-header">
        <a href="stock.php" class="rs-back">← Volver</a>
        <h1 class="rs-titulo">Recontar Stock</h1>
    </div>

    <!-- Motivo -->
    <div class="rs-motivo-wrap">
        <label class="rs-motivo-label" for="rs-motivo">Motivo del reconteo (opcional)</label>
        <input type="text" id="rs-motivo" class="rs-motivo-input"
               placeholder="Ej: Inventario semanal, ajuste por rotura, entrega de proveedor…"
               maxlength="200">
    </div>

    <!-- Buscador -->
    <div class="rs-search-area" id="rs-search-area">
        <div class="rs-search-wrap" id="rs-search-wrap">
            <span class="rs-search-icon"></span>
            <input type="text" id="rs-search" placeholder="Buscar producto para agregar…" autocomplete="off">
            <div class="rs-dropdown" id="rs-dropdown" hidden></div>
        </div>
    </div>

    <!-- Modo de ajuste -->
    <div class="rs-modo-wrap">
        <span class="rs-modo-label">Modo:</span>
        <button class="rs-modo-btn rs-modo-btn--active" id="btn-modo-delta" onclick="setModo('delta')">
            Ajuste ±
        </button>
        <button class="rs-modo-btn" id="btn-modo-exacto" onclick="setModo('exacto')">
            Stock exacto
        </button>
        <span class="rs-modo-hint" id="rs-modo-hint">Sumá o restá unidades al stock actual</span>
    </div>

    <!-- Tabla de reconteo -->
    <div class="rs-table-wrap">
        <table class="rs-table" id="rs-table">
            <thead>
                <tr>
                    <th>Producto</th>
                    <th class="rs-col-stk">Stock actual</th>
                    <th class="rs-col-ajuste" id="th-ajuste">Ajuste ±</th>
                    <th class="rs-col-result">Stock result.</th>
                    <th class="rs-col-rm"></th>
                </tr>
            </thead>
            <tbody id="rs-tbody">
                <tr id="rs-fila-vacia">
                    <td colspan="5" class="rs-empty">
                        Buscá un producto arriba para agregarlo al reconteo
                    </td>
                </tr>
            </tbody>
        </table>
    </div>

    <!-- Footer -->
    <div class="rs-footer">
        <span class="rs-counter" id="rs-counter">0 productos en la lista</span>
        <button class="rs-btn-aplicar" id="rs-btn-aplicar" disabled
                onclick="aplicarCambios()">
            Aplicar cambios
        </button>
    </div>

</div><!-- /rs-wrap -->
</div><!-- /ventas-content -->
</div><!-- /ventas-layout -->
</main>

<!-- Toast de confirmación -->
<div class="rs-toast" id="rs-toast"></div>

<script src="../js/global.js"></script>
<script>
/* ─── Sidebar ──────────────────────────────────────────── */
const _sb   = document.getElementById('ventas-sidebar');
const _oBtn = document.getElementById('sidebar-open-btn');
const _cBtn = document.getElementById('sidebar-close-btn');
_oBtn.addEventListener('click', () => _sb.classList.remove('sidebar-collapsed'));
_cBtn.addEventListener('click', () => _sb.classList.add('sidebar-collapsed'));

/* ─── Datos de productos desde PHP ────────────────────── */
const PRODUCTOS = <?= json_encode($productos, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP) ?>;

/* ─── Estado ────────────────────────────────────────────── */
let modo  = 'delta';    // 'delta' | 'exacto'
let items = [];         // { id, nombre, stockActual, valor }

/* ─── Modo toggle ───────────────────────────────────────── */
function setModo(m) {
    modo = m;
    document.getElementById('btn-modo-delta').classList.toggle('rs-modo-btn--active',  m === 'delta');
    document.getElementById('btn-modo-exacto').classList.toggle('rs-modo-btn--active', m === 'exacto');
    document.getElementById('th-ajuste').textContent = m === 'delta' ? 'Ajuste ±' : 'Stock exacto';
    document.getElementById('rs-modo-hint').textContent = m === 'delta'
        ? 'Sumá o restá unidades al stock actual'
        : 'Escribí el stock real que contaste (reemplaza el valor actual)';
    renderTabla();
}

/* ─── Buscador ──────────────────────────────────────────── */
const searchInput = document.getElementById('rs-search');
const dropdown    = document.getElementById('rs-dropdown');

function escH(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderDropdown(q) {
    if (!q) { dropdown.hidden = true; dropdown.innerHTML = ''; return; }
    const ql = q.toLowerCase();
    const matches = PRODUCTOS
        .filter(p => p.nombre.toLowerCase().includes(ql))
        .slice(0, 10);

    if (!matches.length) { dropdown.hidden = true; dropdown.innerHTML = ''; return; }

    dropdown.innerHTML = matches.map(p => {
        const yaEsta = items.some(i => i.id === p.id);
        return `<div class="rs-drop-item${yaEsta ? ' rs-drop-item--ya' : ''}"
                     data-id="${p.id}" title="${yaEsta ? 'Ya está en la lista' : ''}">
            <span class="rs-drop-nombre">${escH(p.nombre)}</span>
            <span class="rs-drop-stock">Stock: ${p.stock}</span>
        </div>`;
    }).join('');
    dropdown.hidden = false;

    dropdown.querySelectorAll('.rs-drop-item:not(.rs-drop-item--ya)').forEach(el => {
        el.addEventListener('mousedown', e => {
            e.preventDefault();
            const prod = PRODUCTOS.find(p => p.id === parseInt(el.dataset.id));
            if (prod) agregarProducto(prod);
        });
    });
}

let searchTimer;
searchInput.addEventListener('input', function() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderDropdown(this.value.trim()), 160);
});
searchInput.addEventListener('blur', () => {
    setTimeout(() => { dropdown.hidden = true; }, 150);
});
searchInput.addEventListener('focus', function() {
    if (this.value.trim()) renderDropdown(this.value.trim());
});
searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { dropdown.hidden = true; this.blur(); }
});

/* ─── Agregar producto ──────────────────────────────────── */
function agregarProducto(prod) {
    if (items.some(i => i.id === prod.id)) return;
    items.push({ id: prod.id, nombre: prod.nombre, stockActual: prod.stock, valor: 0 });
    searchInput.value = '';
    dropdown.hidden   = true;
    dropdown.innerHTML = '';
    renderTabla();
}

/* ─── Quitar producto ───────────────────────────────────── */
function quitarProducto(id) {
    items = items.filter(i => i.id !== id);
    renderTabla();
}

/* ─── Actualizar valor ──────────────────────────────────── */
function actualizarValor(id, val) {
    const item = items.find(i => i.id === id);
    if (item) { item.valor = parseFloat(val) || 0; }
    actualizarFilaResult(id);
    actualizarFooter();
}

function calcResultado(item) {
    if (modo === 'exacto') return Math.max(0, item.valor);
    return item.stockActual + item.valor;
}

function actualizarFilaResult(id) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const res    = calcResultado(item);
    const esNeg  = res < 0;
    const resEff = Math.max(0, res);

    const row     = document.querySelector(`.rs-row[data-id="${id}"]`);
    const resCell = row?.querySelector('.rs-result-val');
    if (!row || !resCell) return;

    resCell.textContent = resEff;
    resCell.className   = 'rs-result-val ' + (
        esNeg                ? 'rs-result--neg'  :
        resEff === 0         ? 'rs-result--warn' :
        resEff > item.stockActual ? 'rs-result--ok' : ''
    );
    row.classList.toggle('rs-row--neg', esNeg);
}

/* ─── Renderizar tabla ──────────────────────────────────── */
function renderTabla() {
    const tbody = document.getElementById('rs-tbody');

    if (items.length === 0) {
        tbody.innerHTML = `<tr id="rs-fila-vacia">
            <td colspan="5" class="rs-empty">Buscá un producto arriba para agregarlo al reconteo</td>
        </tr>`;
        actualizarFooter();
        return;
    }

    const step        = modo === 'delta' ? 'any' : '1';
    const minVal      = modo === 'delta' ? '' : 'min="0"';
    const placeholder = modo === 'delta' ? '0' : String(0);

    tbody.innerHTML = items.map(item => {
        const res    = calcResultado(item);
        const esNeg  = res < 0;
        const resEff = Math.max(0, res);
        const resCls = esNeg ? 'rs-result--neg' : resEff === 0 ? 'rs-result--warn' : res > item.stockActual ? 'rs-result--ok' : '';

        return `<tr class="rs-row${esNeg ? ' rs-row--neg' : ''}" data-id="${item.id}">
            <td class="rs-col-nombre">${escH(item.nombre)}</td>
            <td class="rs-col-stk">${item.stockActual}</td>
            <td class="rs-col-ajuste">
                <input type="number" class="rs-ajuste-input"
                       value="${item.valor}" step="${step}" ${minVal}
                       placeholder="${placeholder}"
                       oninput="actualizarValor(${item.id}, this.value)">
            </td>
            <td class="rs-col-result rs-result-val ${resCls}">${resEff}</td>
            <td class="rs-col-rm">
                <button class="rs-btn-rm" onclick="quitarProducto(${item.id})" title="Quitar">&#10005;</button>
            </td>
        </tr>`;
    }).join('');

    actualizarFooter();
}

/* ─── Footer ────────────────────────────────────────────── */
function actualizarFooter() {
    const n       = items.length;
    const hayNegs = items.some(i => calcResultado(i) < 0);
    const btn     = document.getElementById('rs-btn-aplicar');
    const counter = document.getElementById('rs-counter');

    counter.textContent = n === 0 ? '0 productos en la lista'
        : `${n} producto${n !== 1 ? 's' : ''} en la lista`;

    btn.disabled = n === 0;
    btn.classList.toggle('rs-btn-aplicar--warn', hayNegs && n > 0);

    if (n === 0) {
        btn.textContent = 'Aplicar cambios';
    } else if (hayNegs) {
        btn.textContent = `Aplicar cambios (${n}) — hay stock negativo, se ajustará a 0`;
    } else {
        btn.textContent = `Aplicar cambios (${n} producto${n !== 1 ? 's' : ''})`;
    }
}

/* ─── Aplicar ───────────────────────────────────────────── */
async function aplicarCambios() {
    if (items.length === 0) return;

    const hayNegs  = items.some(i => calcResultado(i) < 0);
    const msg = hayNegs
        ? `¿Aplicar los ${items.length} cambios de stock?\nAlgunos resultados son negativos y quedarán en 0.`
        : `¿Aplicar los ${items.length} cambios de stock?`;

    if (!confirm(msg)) return;

    const btn = document.getElementById('rs-btn-aplicar');
    btn.disabled    = true;
    btn.textContent = 'Aplicando…';

    const payload = {
        modo,
        motivo: document.getElementById('rs-motivo').value.trim(),
        items:  items.map(i => ({ id: i.id, valor: i.valor })),
    };

    try {
        const resp = await fetch('../php/aplicar_reconteo.php', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload),
        });
        const json = await resp.json();
        if (!json.ok) throw new Error(json.error || 'Error desconocido');

        // Actualizar stockActual en PRODUCTOS y en items (para reflejar cambio)
        items.forEach(item => {
            const prodDB = PRODUCTOS.find(p => p.id === item.id);
            const nuevo  = Math.max(0, calcResultado(item));
            item.stockActual = nuevo;
            item.valor       = 0;
            if (prodDB) prodDB.stock = nuevo;
        });

        mostrarToast(`${json.actualizados} producto${json.actualizados !== 1 ? 's' : ''} actualizados correctamente`);

        // Limpiar tabla después del éxito
        items = [];
        renderTabla();
        document.getElementById('rs-motivo').value = '';

    } catch (err) {
        alert('Error al aplicar cambios: ' + err.message);
        actualizarFooter();
    }
}

/* ─── Toast ─────────────────────────────────────────────── */
function mostrarToast(msg) {
    const t = document.getElementById('rs-toast');
    t.textContent = msg;
    t.classList.add('rs-toast--show');
    setTimeout(() => t.classList.remove('rs-toast--show'), 3000);
}
</script>
</body>
</html>
