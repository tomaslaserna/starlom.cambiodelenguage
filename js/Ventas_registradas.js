'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────
const MESES =['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ── State ─────────────────────────────────────────────────────────────────────
let fetchTimeout  = null;
let paginaActual  = 1;
const LIMITE_PAG  = 100;

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Forzar defaults antes de que el navegador restaure valores del caché
    const tipoEl = document.getElementById('filtro-tipo-factura');
    if (tipoEl) tipoEl.value = 'all';

    setupClientInput();
    setupFilters();
    applyUrlParams();   // puede sobreescribir si viene ?tipo_factura= en la URL
    applyRangoVisibility();
    setupFiltrosToggle();
    setupPeriodoSelect();
    fetchGlobalResumen();
    triggerFetch();     // carga automática al entrar/refrescar
});

// ── Filtros toggle ────────────────────────────────────────────────────────────
function setupFiltrosToggle() {
    const btn  = document.getElementById('filtros-toggle');
    const card = document.getElementById('filtros-facturas');
    if (!btn || !card) return;

    const stored    = localStorage.getItem('filtros_collapsed');
    const collapsed = stored !== 'false';
    if (collapsed) card.classList.add('filtros-collapsed');
    _setToggleLabel(btn, collapsed);

    btn.addEventListener('click', () => {
        const isNowCollapsed = card.classList.toggle('filtros-collapsed');
        localStorage.setItem('filtros_collapsed', isNowCollapsed);
        _setToggleLabel(btn, isNowCollapsed);
    });
}

function _setToggleLabel(btn, collapsed) {
    btn.textContent = collapsed ? 'Mostrar filtros ▼' : 'Ocultar filtros ▲';
}

// ── Período select (global resumen) ──────────────────────────────────────────
function setupPeriodoSelect() {
    const sel = document.getElementById('rg-periodo-select');
    if (!sel) return;
    sel.addEventListener('change', fetchGlobalResumen);
}

// ── Global resumen ────────────────────────────────────────────────────────────
async function fetchGlobalResumen() {
    const privados = ['Jefe', 'Jefe1', 'Admin'];
    if (!privados.includes(RANGO_ACTUAL)) return;

    const periodo = document.getElementById('rg-periodo-select')?.value || 'mes';

    try {
        const res = await fetch(`../php/get_resumen_global.php?periodo=${encodeURIComponent(periodo)}`);
        if (!res.ok) return;
        const data = await res.json();
        renderGlobalResumen(data);
    } catch { /* fail silently */ }
}

function renderGlobalResumen(data) {
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setVal('rg-facturas-val',     data.total_facturas);
    setVal('rg-facturadas-val',   '$' + fmtMoney(data.facturadas));
    setVal('rg-nofacturadas-val', '$' + fmtMoney(data.no_facturadas));
    setVal('rg-total-val',        '$' + fmtMoney(data.total_monto));
    setVal('rg-pendiente-val',    '$' + fmtMoney(data.pendiente));

    const vencidoItem = document.getElementById('rg-vencido-item');
    if (data.vencido > 0) {
        setVal('rg-vencido-val', '$' + fmtMoney(data.vencido));
        if (vencidoItem) vencidoItem.hidden = false;
    } else {
        if (vencidoItem) vencidoItem.hidden = true;
    }
}

// ── Rango visibility ──────────────────────────────────────────────────────────
function applyRangoVisibility() {
    const privados = ['Jefe', 'Jefe1', 'Admin'];
    if (!privados.includes(RANGO_ACTUAL)) {
        document.querySelector('.tabla_registro')?.classList.add('hide-financiero');
    }
}

// ── URL params ────────────────────────────────────────────────────────────────
function applyUrlParams() {
    const params = new URLSearchParams(window.location.search);

    const tipo = params.get('tipo_factura');
    if (tipo) {
        const el = document.getElementById('filtro-tipo-factura');
        if (el) el.value = tipo;
    }

    if (tipo) triggerFetch();
}

// ── Client autocomplete ───────────────────────────────────────────────────────
function setupClientInput() {
    const input  = document.getElementById('input-cliente');
    const hidden = document.getElementById('hidden-id-cliente');
    const span   = document.getElementById('span-nombre-cliente-tabla');

    function resolve() {
        const val = input.value.trim();
        if (!val) {
            hidden.value     = '';
            span.textContent = '—';
            triggerFetch();
            return;
        }
        const found = (window.CLIENTES_DATA || []).find(c =>
            `${c.nombre_cliente} (${c.tipo_id}: ${c.nro_id})` === val
        );
        if (found) {
            hidden.value     = found.nro_id;
            span.textContent = found.nombre_cliente;
        } else {
            hidden.value     = '';
            span.textContent = val;
        }
        triggerFetch();
    }

    input.addEventListener('change', resolve);
    input.addEventListener('input',  resolve);
}

// ── Filters ───────────────────────────────────────────────────────────────────
function setupFilters() {
    [
        'filtro-nro-factura', 'filtro-tipo-factura',
        'filtro-dia-factura', 'filtro-mes-factura', 'filtro-anio-factura',
        'filtro-lista-precios',
        'filtro-seguimiento', 'filtro-divisor',
    ].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input',  () => triggerFetch());
        el.addEventListener('change', () => triggerFetch());
    });

    document.getElementById('filtro-divisor')?.addEventListener('change', updateDivisorLabel);
    updateDivisorLabel();
}

function updateDivisorLabel() {
    const val   = document.getElementById('filtro-divisor')?.value || 'mes';
    const label = document.getElementById('divisor-label');
    if (label) label.textContent = val === 'anio' ? 'año' : 'mes';
}

function triggerFetch(resetPagina = true) {
    if (resetPagina) paginaActual = 1;
    clearTimeout(fetchTimeout);
    fetchTimeout = setTimeout(doFetch, 420);
}

function buildParams() {
    const p = new URLSearchParams();

    const nroId = document.getElementById('hidden-id-cliente').value.trim();
    if (nroId) p.set('nro_id', nroId);

    const nroFac = document.getElementById('filtro-nro-factura').value.trim();
    if (nroFac) p.set('nro_factura', nroFac);

    const tipo = document.getElementById('filtro-tipo-factura').value;
    if (tipo) p.set('tipo_factura', tipo);

    const dia  = document.getElementById('filtro-dia-factura').value.trim();
    const mes  = document.getElementById('filtro-mes-factura').value.trim();
    const anio = document.getElementById('filtro-anio-factura').value.trim();
    if (dia)  p.set('dia',  dia);
    if (mes)  p.set('mes',  mes);
    if (anio) p.set('anio', anio);

    const seguimiento = document.getElementById('filtro-seguimiento')?.value || '';
    if (seguimiento) p.set('seguimiento', seguimiento);

    const lista = document.getElementById('filtro-lista-precios').value;
    if (lista) p.set('lista_precios', lista);

    p.set('pagina', paginaActual);
    p.set('limite', LIMITE_PAG);

    return p;
}

// ── Fetch ─────────────────────────────────────────────────────────────────────
async function doFetch() {
    const params = buildParams();
    const tbody  = document.getElementById('tbody-facturas');

    tbody.innerHTML = `<tr><td colspan="8" class="tabla-vacia tabla-cargando">Cargando…</td></tr>`;

    try {
        const res      = await fetch(`../php/get_facturas_cliente.php?${params}`);
        const json     = await res.json();
        const facturas = Array.isArray(json) ? json : (json.data ?? []);
        const total    = json.total ?? facturas.length;
        renderTable(facturas);
        renderPaginacion(total, paginaActual);
    } catch {
        tbody.innerHTML = `<tr><td colspan="8" class="tabla-vacia tabla-error">Error al cargar datos. Verificá la conexión.</td></tr>`;
        renderPaginacion(0, 1);
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function fmtMoney(n) {
    return Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getGrupo(fecha, divisor) {
    const parts = fecha.split('-');
    if (parts.length < 3) return '';
    const [, m, y] = parts;
    if (divisor === 'anio') return y;
    return `${MESES[parseInt(m, 10) - 1]} ${y}`;
}

function isCurrentGroup(grupo, divisor) {
    const now = new Date();
    if (divisor === 'anio') return grupo === String(now.getFullYear());
    return grupo === `${MESES[now.getMonth()]} ${now.getFullYear()}`;
}

function computeGroupStats(gFacturas) {
    const count        = gFacturas.length;
    const total        = gFacturas.reduce((s, f) => s + f.monto, 0);
    // Facturada = tiene factura ARCA emitida (CAE); No facturada = solo remito
    const facturadas   = gFacturas.filter(f => f.con_factura).reduce((s, f) => s + f.monto, 0);
    const noFacturadas = gFacturas.filter(f => !f.con_factura).reduce((s, f) => s + f.monto, 0);
    const pendiente    = gFacturas
        .filter(f => f.estado_cobro === 'pendiente' || f.estado_cobro === 'en_proceso')
        .reduce((s, f) => s + f.monto, 0);
    const vencido      = gFacturas
        .filter(f => f.estado_cobro === 'vencido')
        .reduce((s, f) => s + f.monto, 0);
    return { count, total, facturadas, noFacturadas, pendiente, vencido };
}

// ── Render table ──────────────────────────────────────────────────────────────
function renderTable(facturas) {
    const tbody      = document.getElementById('tbody-facturas');
    const resumen    = document.getElementById('resumen-facturas');
    const divisor    = document.getElementById('filtro-divisor')?.value || 'mes';
    const showFinanc = ['Jefe', 'Jefe1', 'Admin'].includes(RANGO_ACTUAL);

    if (!facturas.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="tabla-vacia">Sin resultados para los filtros aplicados</td></tr>`;
        if (resumen) resumen.hidden = true;
        return;
    }

    // ── Agrupar facturas ───────────────────────────────────────────────────────
    const grupos   = [];
    const grupoMap = new Map();

    facturas.forEach(f => {
        const g = getGrupo(f.fecha, divisor);
        if (!grupoMap.has(g)) {
            const obj = { label: g, facturas: [], isCurrent: isCurrentGroup(g, divisor) };
            grupoMap.set(g, obj);
            grupos.push(obj);
        }
        grupoMap.get(g).facturas.push(f);
    });

    let html = '';

    grupos.forEach((grp, idx) => {
        const grupoId    = `grp-${idx}`;
        const collapsed  = !grp.isCurrent;
        const hiddenCls  = collapsed ? ' grp-hidden' : '';
        const toggleIcon = collapsed ? '▶' : '▼';

        // ── Fila divisor (header del grupo) ───────────────────────────────────
        html += `
        <tr class="fila-divisor">
            <td colspan="8" class="td-divisor">
                <button class="btn-grupo-toggle" data-grupoid="${grupoId}">${toggleIcon}</button>
                ${esc(grp.label)}
            </td>
        </tr>`;

        // ── Filas de datos ────────────────────────────────────────────────────
        grp.facturas.forEach(f => {
            const esRemito   = (f.id === null);               // standalone remito
            const tipoCls    = f.tipo.toLowerCase().replace(/[^a-z]/g, '');

            // Unique row/detail-row keys
            const rowKey    = esRemito ? `r-${f.id_remito}` : f.id;
            const detRowId  = esRemito ? `fila-det-r-${f.id_remito}` : `fila-det-${f.id}`;

            // Expand button: carries tipo so onExpandClick knows which endpoint to call
            const expandBtn = esRemito
                ? `<button class="btn-expand" data-tipo="remito" data-id="${f.id_remito}" title="Ver productos">▼</button>`
                : `<button class="btn-expand" data-tipo="venta"  data-id="${f.id}"        title="Ver productos">▼</button>`;

            // Comprobantes: PDFs existentes + acciones post-entrega
            const facturaBtn = (!esRemito && f.con_factura)
                ? `<a href="../php/generar_pdf_factura.php?id_venta=${f.id}&view=1"
                      target="_blank" class="btn-pdf btn-pdf-fac">Factura</a>`
                : '';
            const remitoBtn  = f.id_remito
                ? `<a href="../php/generar_pdf_remito.php?id_remito=${f.id_remito}&view=1"
                      target="_blank" class="btn-pdf btn-pdf-rem" title="Ver remito N° ${esc(f.nro_remito)}">Remito</a>`
                : '';
            const genRemitoBtn = (!esRemito && !f.id_remito)
                ? `<button class="btn-pdf btn-gen-remito" data-id="${f.id}">Generar remito</button>`
                : '';

            // Acciones de comprobantes post-entrega (ventas_comprobantes.js)
            const compBtn = !esRemito
                ? `<button class="btn-pdf btn-comprobantes" data-id="${f.id}"
                       data-cliente="${esc(f.nombre_cliente)}" data-monto="${f.monto}"
                       data-confactura="${f.con_factura ? 1 : 0}" data-tipocbte="${esc(f.tipo)}"
                       title="Facturar / Notas de crédito y débito">+ Comprobante</button>`
                : `<button class="btn-pdf btn-comprobantes" data-idremito="${f.id_remito}"
                       data-cliente="${esc(f.nombre_cliente)}" data-monto="${f.monto}"
                       data-confactura="0" data-tipocbte="Remito"
                       title="Notas internas sobre el remito">+ Comprobante</button>`;

            // Modo Administrador (js/ventas_admin_mode.js): edición total de la venta
            const adminEditBtn = (!esRemito && window.ADMIN_MODE)
                ? `<button class="btn-pdf btn-admin-edit" data-id="${f.id}" title="Editar venta">Editar</button>`
                : '';

            html += `
            <tr data-id="${rowKey}" class="fila-grupo${hiddenCls}" data-grupoid="${grupoId}">
                <td class="td-expand">${expandBtn}</td>
                <td class="td-id">${esRemito ? '—' : f.id}</td>
                <td class="td-nro">${esRemito ? esc(f.nro_remito ?? '—') : esc(f.nro_comprobante)}</td>
                <td class="td-cliente">
                    ${esc(f.nombre_cliente)}
                    <br><small class="txt-dni">${esc(f.dni_cliente)}</small>
                </td>
                <td><span class="badge-tipo badge-tipo-${tipoCls}">${esc(f.tipo)}</span></td>
                <td class="td-fecha">${f.fecha}</td>
                <td class="td-monto col-financiero">$${fmtMoney(f.monto)}</td>
                <td class="td-pdf">${facturaBtn}${remitoBtn}${genRemitoBtn}${compBtn}${adminEditBtn}</td>
            </tr>
            <tr class="fila-detalle fila-grupo${hiddenCls}" data-grupoid="${grupoId}" id="${detRowId}" hidden>
                <td colspan="8" class="td-detalle">
                    <em class="det-cargando">Cargando detalle…</em>
                </td>
            </tr>`;
        });

        // ── Mini-calculadora del grupo (solo Jefe/Jefe1/Admin) ─────────────────
        if (showFinanc) {
            const s = computeGroupStats(grp.facturas);
            html += `
            <tr class="fila-resumen-grupo fila-grupo${hiddenCls}" data-grupoid="${grupoId}">
                <td colspan="8">
                    <div class="resumen-mini">
                        <div class="resumen-mini-item">
                            <span class="resumen-mini-label">Facturas</span>
                            <span class="resumen-mini-valor">${s.count}</span>
                        </div>
                        <div class="resumen-mini-item">
                            <span class="resumen-mini-label">Facturadas</span>
                            <span class="resumen-mini-valor">$${fmtMoney(s.facturadas)}</span>
                        </div>
                        <div class="resumen-mini-item">
                            <span class="resumen-mini-label">No Facturadas</span>
                            <span class="resumen-mini-valor">$${fmtMoney(s.noFacturadas)}</span>
                        </div>
                        <div class="resumen-mini-item">
                            <span class="resumen-mini-label">Total</span>
                            <span class="resumen-mini-valor">$${fmtMoney(s.total)}</span>
                        </div>
                        ${s.pendiente > 0 ? `
                        <div class="resumen-mini-item resumen-mini-pendiente">
                            <span class="resumen-mini-label">Pendiente</span>
                            <span class="resumen-mini-valor">$${fmtMoney(s.pendiente)}</span>
                        </div>` : ''}
                        ${s.vencido > 0 ? `
                        <div class="resumen-mini-item resumen-mini-vencido">
                            <span class="resumen-mini-label">Vencido</span>
                            <span class="resumen-mini-valor">$${fmtMoney(s.vencido)}</span>
                        </div>` : ''}
                    </div>
                </td>
            </tr>`;
        }
    });

    tbody.innerHTML = html;

    if (showFinanc) renderResumen(facturas);
    else if (resumen) resumen.hidden = true;

    tbody.querySelectorAll('.btn-expand').forEach(b => b.addEventListener('click', onExpandClick));
    tbody.querySelectorAll('.btn-grupo-toggle').forEach(b => b.addEventListener('click', onGrupoToggle));
    tbody.querySelectorAll('.btn-gen-remito').forEach(b => b.addEventListener('click', onGenRemitoClick));
    tbody.querySelectorAll('.btn-comprobantes').forEach(b => b.addEventListener('click', e =>
        window.abrirComprobantes?.(e.currentTarget.dataset)
    ));
    tbody.querySelectorAll('.btn-admin-edit').forEach(b => b.addEventListener('click', e =>
        window.abrirEdicionVenta?.(parseInt(e.currentTarget.dataset.id, 10))
    ));
}

// ── Resumen filtrado (fondo de tabla) ─────────────────────────────────────────
function renderResumen(facturas) {
    const resumen = document.getElementById('resumen-facturas');
    if (!resumen) return;

    const count        = facturas.length;
    const total        = facturas.reduce((s, f) => s + f.monto, 0);
    // Facturada = tiene factura ARCA emitida (CAE); No facturada = solo remito
    const facturadas   = facturas.filter(f => f.con_factura).reduce((s, f) => s + f.monto, 0);
    const noFacturadas = facturas.filter(f => !f.con_factura).reduce((s, f) => s + f.monto, 0);
    const pendiente    = facturas
        .filter(f => f.estado_cobro === 'pendiente' || f.estado_cobro === 'en_proceso')
        .reduce((s, f) => s + f.monto, 0);
    const vencido      = facturas
        .filter(f => f.estado_cobro === 'vencido')
        .reduce((s, f) => s + f.monto, 0);

    resumen.innerHTML = `
        <div class="resumen-item">
            <span class="resumen-label">Facturas</span>
            <span class="resumen-valor">${count}</span>
        </div>
        <div class="resumen-item">
            <span class="resumen-label">Facturadas</span>
            <span class="resumen-valor">$${fmtMoney(facturadas)}</span>
        </div>
        <div class="resumen-item">
            <span class="resumen-label">No Facturadas</span>
            <span class="resumen-valor">$${fmtMoney(noFacturadas)}</span>
        </div>
        <div class="resumen-item">
            <span class="resumen-label">Total facturado</span>
            <span class="resumen-valor">$${fmtMoney(total)}</span>
        </div>
        <div class="resumen-item resumen-pendiente">
            <span class="resumen-label">Pendiente</span>
            <span class="resumen-valor">$${fmtMoney(pendiente)}</span>
        </div>
        ${vencido > 0 ? `
        <div class="resumen-item resumen-vencido">
            <span class="resumen-label">Vencido</span>
            <span class="resumen-valor">$${fmtMoney(vencido)}</span>
        </div>` : ''}
    `;
    resumen.hidden = false;
}

// ── Paginación ────────────────────────────────────────────────────────────────
function renderPaginacion(total, pagina) {
    const cont = document.getElementById('paginacion-facturas');
    if (!cont) return;

    const totalPags = Math.ceil(total / LIMITE_PAG);
    if (totalPags <= 1) { cont.innerHTML = ''; return; }

    let html = '<div class="paginacion">';
    for (let i = 1; i <= totalPags; i++) {
        const activo = i === pagina;
        html += `<button class="pag-btn${activo ? ' pag-btn--activo' : ''}" data-pag="${i}"${activo ? ' disabled' : ''}>${i}</button>`;
    }
    html += '</div>';
    html += `<div class="pag-info">Página ${pagina} de ${totalPags} — ${total} resultados totales</div>`;
    cont.innerHTML = html;

    cont.querySelectorAll('.pag-btn:not([disabled])').forEach(btn =>
        btn.addEventListener('click', () => {
            paginaActual = parseInt(btn.dataset.pag, 10);
            doFetch();
            document.querySelector('.tabla_registro')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        })
    );
}

// ── Toggle grupo (colapsar/expandir mes) ──────────────────────────────────────
function onGrupoToggle(e) {
    const btn     = e.currentTarget;
    const grupoId = btn.dataset.grupoid;
    const rows    = document.querySelectorAll(`#tbody-facturas tr.fila-grupo[data-grupoid="${grupoId}"]`);

    const opening = btn.textContent.trim() === '▶';
    btn.textContent = opening ? '▼' : '▶';
    rows.forEach(tr => tr.classList.toggle('grp-hidden', !opening));
}

// ── Expand row (sin precios) ──────────────────────────────────────────────────
async function onExpandClick(e) {
    const btn    = e.currentTarget;
    const id     = btn.dataset.id;
    const tipo   = btn.dataset.tipo;  // 'venta' | 'remito'
    const detId  = tipo === 'remito' ? `fila-det-r-${id}` : `fila-det-${id}`;
    const fila   = document.getElementById(detId);

    if (!fila.hidden) {
        fila.hidden     = true;
        btn.textContent = '▼';
        btn.classList.remove('btn-expand-activo');
        return;
    }

    fila.hidden     = false;
    btn.textContent = '▲';
    btn.classList.add('btn-expand-activo');

    const td = fila.querySelector('.td-detalle');

    try {
        const url  = tipo === 'remito'
            ? `../php/get_detalle_remito.php?id_remito=${id}`
            : `../php/get_detalle_venta.php?id_venta=${id}`;
        const res  = await fetch(url);
        const data = await res.json();

        if (!data.length) {
            td.innerHTML = '<em>Sin detalle registrado</em>';
            return;
        }
        td.innerHTML = `
            <table class="tabla-detalle">
                <thead>
                    <tr>
                        <th>Producto</th>
                        <th>Cant.</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(d => `
                    <tr>
                        <td>${esc(d.nombre)}</td>
                        <td>${d.cantidad}</td>
                    </tr>`).join('')}
                </tbody>
            </table>`;
    } catch {
        td.innerHTML = '<em class="tabla-error">Error al cargar el detalle</em>';
    }
}

// ── Generar remito desde venta sin remito ─────────────────────────────────────
async function onGenRemitoClick(e) {
    const btn = e.currentTarget;
    const id  = btn.dataset.id;

    btn.disabled    = true;
    btn.textContent = 'Generando…';

    const body = new FormData();
    body.append('id_venta', id);

    try {
        const res  = await fetch('../php/generar_remito_venta.php', { method: 'POST', body });
        const data = await res.json();

        if (data.ok) {
            const nroFmt = String(data.nro_remito).padStart(8, '0');
            const link   = document.createElement('a');
            link.href      = `../php/generar_pdf_remito.php?id_remito=${data.id_remito}&view=1`;
            link.target    = '_blank';
            link.className = 'btn-pdf btn-pdf-rem';
            link.title     = `Ver remito N° ${nroFmt}`;
            link.textContent = 'Remito';
            btn.replaceWith(link);
        } else {
            alert('No se pudo generar el remito: ' + (data.error ?? ''));
            btn.disabled    = false;
            btn.textContent = 'Generar remito';
        }
    } catch {
        alert('Error de red al generar el remito.');
        btn.disabled    = false;
        btn.textContent = 'Generar remito';
    }
}

// Refetch usado por el Modo Administrador tras guardar una edición
window.__doFetchVentas = doFetch;
