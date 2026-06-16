<?php
$PERMITIDOS = ['Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'];
require __DIR__ . '/partials/guard.php';

include '../php/conexion_starlim_be.php';

// Precios calculados dinámicamente: costo × margen por código de categoría
// precio_4 = precio_3 + 10%  |  precio_minorista_r: lista obsoleta, eliminada
$res = $conexion->query("SELECT nombre,
            precio_0,
            precio_1,
            precio_2,
            precio_3,
            ROUND(precio_3 * 1.10, 2) AS precio_4,
            precio_minorista
     FROM vista_precios
     WHERE precio_1 IS NOT NULL
     ORDER BY nombre ASC"
);

$prods = [];
while ($row = $res->fetch_assoc()) {
    $prods[] = [
        $row['nombre'],
        (float)$row['precio_0'],
        (float)$row['precio_1'],
        (float)$row['precio_2'],
        (float)$row['precio_3'],
        (float)$row['precio_4'],
        (float)$row['precio_minorista'],
    ];
}

$cli_res = $conexion->query("SELECT id, nombre_cliente, lista_precios, nro_id, cond_iva
     FROM clientes ORDER BY nombre_cliente ASC"
);
$clientes_prp = [];
while ($c = $cli_res->fetch_assoc()) {
    $clientes_prp[] = [
        'id'      => (int)$c['id'],
        'nombre'  => $c['nombre_cliente'] ?? '',
        'lista'   => $c['lista_precios']  ?? '',
        'nro_id'  => $c['nro_id']         ?? '',
        'cond_iva'=> $c['cond_iva']       ?? '',
    ];
}
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <title>Ver Precios — Star Lim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <link rel="stylesheet" href="../css/panel_bd.css">
    <link rel="stylesheet" href="../css/style_ver_precios.css">
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body class="cambio-pagina">

<?php $NAV_ACTIVA = 'bd'; include __DIR__ . '/partials/nav.php'; ?>

<main class="dash-main" id="dash-main">
<div class="ventas-layout">

<?php $BD_ACTIVA = 'precios'; include __DIR__ . '/partials/bd_sidebar.php'; ?>

<div class="ventas-content">
    <?php
        $SUBTABS = ['lista' => ['ver_precios.php', 'Lista de precios'], 'margenes' => ['margenes.php', 'Márgenes']];
        $SUB_ACTIVA = 'lista';
        include __DIR__ . '/partials/sub_tabs.php';
    ?>
    <div class="vp-titulo-row">
        <h1 class="vp-titulo">Lista de precios</h1>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
            <a href="#" id="vp-descargar-pdf" class="vp-btn-prp-link">Descargar lista (PDF)</a>
        </div>
    </div>

    <!-- ── Buscador de cliente ───────────────────────────── -->
    <div class="vp-cliente-wrap" id="vp-cliente-wrap">
        <div class="vp-cliente-search-row">
            <div class="vp-cliente-input-wrap">
                <span class="vp-search-icon"></span>
                <input type="text" id="vp-cliente-input" placeholder="Buscar cliente para ver su lista de precios..." autocomplete="off">
                <button class="vp-cliente-clear" id="vp-cliente-clear" title="Quitar cliente">&#10005;</button>
            </div>
            <div class="vp-cliente-badge" id="vp-cliente-badge"></div>
        </div>
        <div class="vp-cliente-dropdown" id="vp-cliente-dropdown"></div>
    </div>

    <!-- ── Tabs de listas de precio ──────────────────────── -->
    <div class="vp-tabs" id="vp-tabs">
        <button class="vp-tab vp-tab--active" data-lista="0">Lista 0</button>
        <button class="vp-tab" data-lista="1">Lista 1</button>
        <button class="vp-tab" data-lista="2">Lista 2</button>
        <button class="vp-tab" data-lista="3">Lista 3</button>
        <button class="vp-tab" data-lista="4">Lista 4 <span class="vp-tab-note">+10%</span></button>
        <button class="vp-tab" data-lista="5">Minorista</button>
    </div>

    <!-- ── Búsqueda y filtros ─────────────────────────────── -->
    <div class="vp-toolbar">
        <div class="vp-search-wrap">
            <span class="vp-search-icon"></span>
            <input type="text" id="vp-search" placeholder="Buscar producto...">
        </div>
        <label class="vp-filter-label" title="Ocultar productos sin precio en esta lista">
            <input type="checkbox" id="vp-solo-precio" checked>
            Solo con precio
        </label>
        <span class="vp-info" id="vp-info"></span>
    </div>

    <!-- ── Tabla ──────────────────────────────────────────── -->
    <div class="vp-table-wrap">
        <table class="vp-table">
            <thead>
                <tr>
                    <th class="vp-th-check">
                        <input type="checkbox" id="vp-check-all" title="Seleccionar / deseleccionar todos los visibles">
                    </th>
                    <th>Nombre del producto</th>
                    <th class="vp-th-precio">Precio</th>
                </tr>
            </thead>
            <tbody id="vp-tbody">
                <tr><td colspan="3" class="vp-empty">Cargando productos&hellip;</td></tr>
            </tbody>
        </table>
    </div>

    <div class="paginacion" id="vp-paginacion"></div>
    <div class="pag-info" id="vp-pag-info"></div>

</div><!-- /ventas-content -->
</div><!-- /ventas-layout -->
</main>

<!-- ── Panel de selección (fixed bottom) ────────────────── -->
<div class="vp-panel" id="vp-panel">
    <div class="vp-panel-bar">
        <div class="vp-panel-bar-left">
            <span class="vp-count" id="vp-count">0 seleccionados</span>
            <button class="vp-toggle-btn" id="vp-toggle">Ver lista &#9650;</button>
        </div>
        <div class="vp-panel-bar-right">
            <button class="vp-btn-limpiar" id="vp-limpiar">Limpiar todo</button>
            <button class="vp-btn-copiar" id="vp-copiar">Copiar</button>
        </div>
    </div>
    <div class="vp-panel-body" id="vp-panel-body">
        <div class="vp-panel-left">
            <div class="vp-pfield">
                <label for="vp-intro">Mensaje de introducción</label>
                <textarea id="vp-intro" rows="3">Estos son los precios de los productos que solicitaste:</textarea>
            </div>
            <label class="vp-opt-row">
                <input type="checkbox" id="vp-incl-total" checked>
                Incluir total al final
            </label>
            <div class="vp-preview-label">Vista previa:</div>
            <div class="vp-preview" id="vp-preview"></div>
        </div>
        <div class="vp-panel-right">
            <div class="vp-sel-header" id="vp-sel-header">Productos seleccionados</div>
            <div class="vp-sel-list" id="vp-list"></div>
        </div>
    </div>
</div>


<script src="../js/global.js"></script>
<script>
/* ─── Descargar lista activa en PDF ────────────────────── */
document.getElementById('vp-descargar-pdf').addEventListener('click', function (e) {
    e.preventDefault();
    window.open('../php/generar_pdf_precios.php?lista=' + listaActiva + '&view=1', '_blank');
});

/* ─── Datos (cargados desde PHP) ───────────────────────── */
// Cada entrada: [nombre, p0, p1, p2, p3, p4, pmin, pminr]
const TODOS = <?= json_encode($prods, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP) ?>;
const LISTA_LABELS = ['Lista 0', 'Lista 1', 'Lista 2', 'Lista 3', 'Lista 4 (+10%)', 'Minorista'];
const PER_PAGE = 50;

let listaActiva = 0;   // 0–6 → índice en LISTA_LABELS
let query       = '';
let pagina      = 1;
let soloPrecio  = true;
let expandido   = false;

const seleccion = new Set(); // Set de índices (number) en TODOS

/* ─── Helpers ──────────────────────────────────────────── */
function fmtPrecio(v) {
    if (!v || v <= 0) return '—';
    const n = Math.round(v * 100) / 100;
    const [ent, dec] = n.toFixed(2).split('.');
    const entFmt = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return dec === '00' ? `$${entFmt}` : `$${entFmt},${dec}`;
}

function escH(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ─── Filtrado ─────────────────────────────────────────── */
function getFiltered() {
    const q = query.toLowerCase();
    const idxs = [];
    for (let i = 0; i < TODOS.length; i++) {
        const p = TODOS[i];
        if (soloPrecio && p[listaActiva + 1] <= 0) continue;
        if (q && !p[0].toLowerCase().includes(q)) continue;
        idxs.push(i);
    }
    return idxs;
}

/* ─── Render tabla ─────────────────────────────────────── */
function renderTabla() {
    const filtered = getFiltered();
    const total    = filtered.length;
    const totalPag = Math.max(1, Math.ceil(total / PER_PAGE));
    if (pagina > totalPag) pagina = 1;

    const start = (pagina - 1) * PER_PAGE;
    const slice = filtered.slice(start, start + PER_PAGE);
    const tbody = document.getElementById('vp-tbody');

    if (slice.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="vp-empty">No se encontraron productos.</td></tr>`;
        document.getElementById('vp-info').textContent = '0 resultados';
        document.getElementById('vp-pag-info').textContent = '';
        document.getElementById('vp-paginacion').innerHTML = '';
        setCheckAll(0, 0);
        return;
    }

    let html         = '';
    let visibleSel   = 0;
    let visibleTotal = slice.length;

    for (const idx of slice) {
        const prod    = TODOS[idx];
        const precio  = prod[listaActiva + 1];
        const checked = seleccion.has(idx);
        if (checked) visibleSel++;

        html += `<tr class="vp-row${checked ? ' vp-row--sel' : ''}" data-idx="${idx}">
            <td class="vp-col-check"><input type="checkbox" class="vp-check"${checked ? ' checked' : ''}></td>
            <td class="vp-col-nombre">${escH(prod[0])}</td>
            <td class="vp-col-precio">${fmtPrecio(precio)}</td>
        </tr>`;
    }

    tbody.innerHTML = html;

    tbody.querySelectorAll('.vp-row').forEach(row => {
        row.addEventListener('click', function(e) {
            if (e.target.tagName === 'INPUT') return;
            const chk = this.querySelector('.vp-check');
            chk.checked = !chk.checked;
            toggleItem(parseInt(this.dataset.idx), chk.checked);
        });
        row.querySelector('.vp-check').addEventListener('change', function() {
            toggleItem(parseInt(row.dataset.idx), this.checked);
        });
    });

    setCheckAll(visibleSel, visibleTotal);

    document.getElementById('vp-info').textContent =
        query ? `${total} resultado${total !== 1 ? 's' : ''}` : `${total} producto${total !== 1 ? 's' : ''}`;

    renderPaginacion(total, totalPag);
}

/* ─── Check-all ────────────────────────────────────────── */
function setCheckAll(sel, total) {
    const el = document.getElementById('vp-check-all');
    el.indeterminate = sel > 0 && sel < total;
    el.checked       = total > 0 && sel === total;
}

document.getElementById('vp-check-all').addEventListener('change', function() {
    const filtered = getFiltered();
    const start    = (pagina - 1) * PER_PAGE;
    const slice    = filtered.slice(start, start + PER_PAGE);
    slice.forEach(i => this.checked ? seleccion.add(i) : seleccion.delete(i));
    renderTabla();
    renderPanel();
});

/* ─── Toggle selección individual ──────────────────────── */
function toggleItem(idx, checked) {
    checked ? seleccion.add(idx) : seleccion.delete(idx);
    const row = document.querySelector(`.vp-row[data-idx="${idx}"]`);
    if (row) row.classList.toggle('vp-row--sel', checked);
    const visibleSel = document.querySelectorAll('.vp-row--sel').length;
    setCheckAll(visibleSel, document.querySelectorAll('.vp-row').length);
    renderPanel();
}

/* ─── Paginación ───────────────────────────────────────── */
function renderPaginacion(total, totalPag) {
    const start = (pagina - 1) * PER_PAGE + 1;
    const end   = Math.min(pagina * PER_PAGE, total);
    document.getElementById('vp-pag-info').textContent =
        total > 0 ? `Mostrando ${start}–${end} de ${total}` : '';

    if (totalPag <= 1) { document.getElementById('vp-paginacion').innerHTML = ''; return; }

    const s = Math.max(1, pagina - 2);
    const e = Math.min(totalPag, pagina + 2);
    let html = '';

    if (pagina > 1)     html += `<button class="pag-btn" onclick="goPage(1)">&#171;</button><button class="pag-btn" onclick="goPage(${pagina - 1})">&#8249;</button>`;
    if (s > 1)          html += `<span class="pag-ellipsis">&hellip;</span>`;
    for (let i = s; i <= e; i++)
        html += i === pagina
            ? `<span class="pag-btn pag-btn--activo">${i}</span>`
            : `<button class="pag-btn" onclick="goPage(${i})">${i}</button>`;
    if (e < totalPag)   html += `<span class="pag-ellipsis">&hellip;</span>`;
    if (pagina < totalPag) html += `<button class="pag-btn" onclick="goPage(${pagina + 1})">&#8250;</button><button class="pag-btn" onclick="goPage(${totalPag})">&#187;</button>`;

    document.getElementById('vp-paginacion').innerHTML = html;
}

function goPage(p) {
    pagina = p;
    renderTabla();
    document.querySelector('.vp-table-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ─── Panel de selección ───────────────────────────────── */
function buildTexto() {
    const intro     = document.getElementById('vp-intro').value.trim();
    const inclTotal = document.getElementById('vp-incl-total').checked;
    const lines     = [];
    let   total     = 0;

    seleccion.forEach(idx => {
        const prod   = TODOS[idx];
        const precio = prod[listaActiva + 1];
        total += precio;
        lines.push(`* ${prod[0]} - ${fmtPrecio(precio)}`);
    });

    let txt = intro ? intro + '\n\n' : '';
    txt += lines.join('\n');
    if (inclTotal && seleccion.size > 0) txt += `\n\nTotal: ${fmtPrecio(total)}`;
    return txt;
}

function renderPanel() {
    const count   = seleccion.size;
    const panel   = document.getElementById('vp-panel');
    const listEl  = document.getElementById('vp-list');
    const copyBtn = document.getElementById('vp-copiar');

    document.getElementById('vp-count').textContent =
        `${count} producto${count !== 1 ? 's' : ''} seleccionado${count !== 1 ? 's' : ''}`;

    copyBtn.textContent = count > 0 ? `Copiar (${count})` : 'Copiar';


    if (count === 0) {
        panel.classList.remove('vp-panel--active');
        document.getElementById('dash-main').style.paddingBottom = '';
        if (expandido) toggleExpand(false);
        return;
    }

    panel.classList.add('vp-panel--active');
    document.getElementById('dash-main').style.paddingBottom =
        expandido ? `${document.getElementById('vp-panel').offsetHeight}px` : '58px';

    // Lista de seleccionados
    let listHtml = '';
    seleccion.forEach(idx => {
        const prod   = TODOS[idx];
        const precio = prod[listaActiva + 1];
        listHtml += `<div class="vp-sel-item">
            <span class="vp-sel-nombre">${escH(prod[0])}</span>
            <span class="vp-sel-precio">${fmtPrecio(precio)}</span>
            <button class="vp-sel-rm" data-idx="${idx}" title="Quitar">&#10005;</button>
        </div>`;
    });
    listEl.innerHTML = listHtml;

    listEl.querySelectorAll('.vp-sel-rm').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx);
            seleccion.delete(idx);
            const row = document.querySelector(`.vp-row[data-idx="${idx}"]`);
            if (row) { row.querySelector('.vp-check').checked = false; row.classList.remove('vp-row--sel'); }
            const visibleSel = document.querySelectorAll('.vp-row--sel').length;
            setCheckAll(visibleSel, document.querySelectorAll('.vp-row').length);
            renderPanel();
        });
    });

    // Vista previa del texto
    const previewEl = document.getElementById('vp-preview');
    previewEl.textContent = buildTexto();
}

function toggleExpand(force) {
    expandido = force !== undefined ? force : !expandido;
    const body    = document.getElementById('vp-panel-body');
    const toggleBtn = document.getElementById('vp-toggle');
    body.classList.toggle('vp-panel-body--open', expandido);
    toggleBtn.innerHTML = expandido ? 'Ocultar &#9660;' : 'Ver lista &#9650;';
    setTimeout(() => {
        if (seleccion.size > 0)
            document.getElementById('dash-main').style.paddingBottom =
                expandido ? `${document.getElementById('vp-panel').offsetHeight}px` : '58px';
    }, 260); // wait for CSS transition
}

document.getElementById('vp-toggle').addEventListener('click', () => toggleExpand());

/* ─── Copiar ───────────────────────────────────────────── */
document.getElementById('vp-copiar').addEventListener('click', async function() {
    if (seleccion.size === 0) return;
    const texto = buildTexto();

    try {
        await navigator.clipboard.writeText(texto);
    } catch {
        // Fallback para contextos sin HTTPS
        const ta = document.createElement('textarea');
        ta.value = texto;
        ta.style.cssText = 'position:fixed;top:-9999px;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    }

    this.textContent = '&#10003; Copiado!';
    this.classList.add('vp-btn-copiar--ok');
    setTimeout(() => {
        this.textContent = `Copiar (${seleccion.size})`;
        this.classList.remove('vp-btn-copiar--ok');
    }, 2500);
});

/* ─── Limpiar ──────────────────────────────────────────── */
document.getElementById('vp-limpiar').addEventListener('click', () => {
    seleccion.clear();
    renderTabla();
    renderPanel();
    toggleExpand(false);
});

/* ─── Búsqueda ─────────────────────────────────────────── */
let searchTimer;
document.getElementById('vp-search').addEventListener('input', function() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { query = this.value.trim(); pagina = 1; renderTabla(); }, 200);
});

/* ─── Filtro solo-con-precio ────────────────────────────── */
document.getElementById('vp-solo-precio').addEventListener('change', function() {
    soloPrecio = this.checked;
    pagina = 1;
    renderTabla();
});

/* ─── Tabs ─────────────────────────────────────────────── */
document.querySelectorAll('.vp-tab').forEach(tab => {
    tab.addEventListener('click', function() {
        document.querySelectorAll('.vp-tab').forEach(t => t.classList.remove('vp-tab--active'));
        this.classList.add('vp-tab--active');
        listaActiva = parseInt(this.dataset.lista);
        pagina = 1;
        renderTabla();
        if (seleccion.size > 0) renderPanel();
    });
});

/* ─── Actualizar preview en vivo ────────────────────────── */
document.getElementById('vp-intro').addEventListener('input', () => {
    if (expandido) document.getElementById('vp-preview').textContent = buildTexto();
});
document.getElementById('vp-incl-total').addEventListener('change', () => {
    renderPanel();
});

/* ─── Init ─────────────────────────────────────────────── */
renderTabla();

/* ═══════════════════════════════════════════════════════════
   DATOS DE CLIENTES
   ═══════════════════════════════════════════════════════════ */
const CLIENTES = <?= json_encode($clientes_prp, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP) ?>;

const LISTA_IDX_MAP = {
    'lista 0': 0, 'lista 1': 1, 'lista 2': 2,
    'lista 3': 3, 'lista 4': 4, 'minorista': 5,
};
function listaToIndex(lista) {
    return LISTA_IDX_MAP[(lista || '').toLowerCase().trim()] ?? null;
}

/* ─── Buscador de cliente (toolbar) ────────────────────── */
let clienteActivo = null; // objeto cliente seleccionado

const cliInput    = document.getElementById('vp-cliente-input');
const cliDropdown = document.getElementById('vp-cliente-dropdown');
const cliBadge    = document.getElementById('vp-cliente-badge');
const cliClear    = document.getElementById('vp-cliente-clear');

function renderCliDropdown(q) {
    if (!q) { cliDropdown.hidden = true; cliDropdown.innerHTML = ''; return; }
    const ql = q.toLowerCase();
    const matches = CLIENTES.filter(c => c.nombre.toLowerCase().includes(ql)).slice(0, 8);
    if (!matches.length) { cliDropdown.hidden = true; cliDropdown.innerHTML = ''; return; }

    cliDropdown.innerHTML = matches.map(c => {
        const lista = c.lista ? `<span class="vp-cdrop-lista">${escH(c.lista)}</span>` : '';
        return `<div class="vp-cdrop-item" data-id="${c.id}">${escH(c.nombre)}${lista}</div>`;
    }).join('');
    cliDropdown.hidden = false;

    cliDropdown.querySelectorAll('.vp-cdrop-item').forEach(el => {
        el.addEventListener('mousedown', e => {
            e.preventDefault();
            const cli = CLIENTES.find(c => c.id === parseInt(el.dataset.id));
            if (cli) selectCliente(cli);
        });
    });
}

function selectCliente(cli) {
    clienteActivo = cli;
    cliInput.value = '';
    cliDropdown.hidden = true;
    cliDropdown.innerHTML = '';

    const idx = listaToIndex(cli.lista);
    cliBadge.innerHTML = `<span class="vp-cbadge-name">${escH(cli.nombre)}</span>`
        + (cli.lista ? `<span class="vp-cbadge-lista">${escH(cli.lista)}</span>` : '')
        + (idx === null ? `<span class="vp-cbadge-warn" title="Lista no reconocida"></span>` : '');
    cliBadge.hidden = false;
    cliClear.hidden = false;

    if (idx !== null) {
        document.querySelectorAll('.vp-tab').forEach(t => t.classList.remove('vp-tab--active'));
        document.querySelector(`.vp-tab[data-lista="${idx}"]`).classList.add('vp-tab--active');
        listaActiva = idx;
        pagina = 1;
        renderTabla();
        if (seleccion.size > 0) renderPanel();
    }
}

function clearCliente() {
    clienteActivo = null;
    cliInput.value = '';
    cliDropdown.hidden = true;
    cliDropdown.innerHTML = '';
    cliBadge.hidden = true;
    cliBadge.innerHTML = '';
    cliClear.hidden = true;
}

let cliTimer;
cliInput.addEventListener('input', function() {
    clearTimeout(cliTimer);
    cliTimer = setTimeout(() => renderCliDropdown(this.value.trim()), 180);
});
cliInput.addEventListener('blur', () => setTimeout(() => { cliDropdown.hidden = true; }, 150));
cliInput.addEventListener('focus', function() { if (this.value.trim()) renderCliDropdown(this.value.trim()); });
cliClear.addEventListener('click', clearCliente);

</script>
</body>
</html>
