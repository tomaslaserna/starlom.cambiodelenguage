// presupuestar.js — Armado de presupuestos (rápido por WhatsApp y formal con PDF).
'use strict';

const MAPA_LISTA = { 'rev':'precio_minorista_r','0':'precio_0','1':'precio_1','2':'precio_2','3':'precio_3','4':'precio_4' };
let carrito = [];          // {id, nombre, precio, cantidad, bonif}
let clienteSel = null;     // objeto cliente seleccionado

const $ = id => document.getElementById(id);
function fmt(n) { return '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function precioRegistroProducto(producto) {
    if (!producto) return null;
    return LISTAS_DB[String(producto.id)] || LISTAS_DB[producto.nombre] || null;
}
function labelProducto(producto) {
    return producto.nombre + ' - ' + fmt(producto.precio);
}
function normalizarProducto(texto) {
    return String(texto || '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+-\s+\$.*$/, '')
        .replace(/\s+—\s+\$.*$/, '')
        .trim();
}
function buscarProducto(valor) {
    const needle = normalizarProducto(valor);
    if (!needle) return null;
    let encontrados = PRODUCTOS_DB.filter(p => {
        const nombre = normalizarProducto(p.nombre);
        const label  = normalizarProducto(labelProducto(p));
        return nombre === needle || label === needle;
    });
    if (encontrados.length === 1) return encontrados[0];

    encontrados = PRODUCTOS_DB.filter(p => normalizarProducto(p.nombre).includes(needle));
    return encontrados.length === 1 ? encontrados[0] : null;
}

// ── Precios por lista ──────────────────────────────────
function listaActiva() { return $('pp-lista').value; }
function aplicarLista() {
    const col = MAPA_LISTA[listaActiva()] || null;
    PRODUCTOS_DB.forEach(p => { const reg = precioRegistroProducto(p); p.precio = (reg && col) ? (parseFloat(reg[col]) || 0) : 0; });
    carrito.forEach(it => { const reg = precioRegistroProducto(it); it.precio = (reg && col) ? (parseFloat(reg[col]) || 0) : 0; });
    rellenarDatalist();
    render();
}
function rellenarDatalist() {
    const dl = $('pp-lista-prod'); const inp = $('pp-prod');
    dl.innerHTML = '';
    if (!MAPA_LISTA[listaActiva()]) { inp.placeholder = '— Primero elegí una lista —'; return; }
    const conPrecio = PRODUCTOS_DB.filter(p => parseFloat(p.precio) > 0);
    inp.placeholder = conPrecio.length
        ? '— Escribí para buscar —'
        : 'No hay productos con precio en esta lista — revisá márgenes/costos';
    conPrecio.forEach(p => {
        const o = document.createElement('option');
        o.value = p.nombre;
        o.label = fmt(p.precio) + ' | disponible: ' + parseInt(p.cantidad || 0);
        dl.appendChild(o);
    });
}
$('pp-lista').addEventListener('change', aplicarLista);

// ── Cliente ────────────────────────────────────────────
$('pp-cliente').addEventListener('input', function () {
    const cli = CLIENTES_DB.find(c => `${c.nombre_cliente} (${c.tipo_id}: ${c.nro_id})` === this.value.trim());
    clienteSel = cli || null;
    $('pp-telefono').value = cli ? (cli.telefono || '') : '';
    $('pp-cond-iva').value = cli ? (cli.cond_iva || '') : '';
    if (cli && cli.lista_precios && MAPA_LISTA[cli.lista_precios]) { $('pp-lista').value = cli.lista_precios; aplicarLista(); }
});

// ── Agregar producto ───────────────────────────────────
$('pp-agregar').addEventListener('click', function () {
    if (!MAPA_LISTA[listaActiva()]) { $('pp-prod').style.borderColor = '#f59e0b'; return; }
    const val = $('pp-prod').value.trim();
    const prod = buscarProducto(val);
    if (!prod) { $('pp-prod').style.borderColor = '#dc2626'; return; }
    $('pp-prod').style.borderColor = '';
    const id = parseInt(prod.id), cant = Math.max(1, parseInt($('pp-cant').value) || 1);
    const ex = carrito.find(i => i.id === id);
    if (ex) ex.cantidad += cant;
    else carrito.push({ id, nombre: prod.nombre, precio: parseFloat(prod.precio), cantidad: cant, bonif: 0 });
    $('pp-prod').value = ''; $('pp-cant').value = 1;
    render();
});

// ── Render carrito + totales ───────────────────────────
function render() {
    const tb = $('pp-tbody');
    if (!carrito.length) { tb.innerHTML = '<tr><td colspan="6" style="opacity:.5;font-style:italic;padding:14px;">Todavía no agregaste productos</td></tr>'; }
    else {
        tb.innerHTML = carrito.map((it, i) => {
            const sub = it.precio * (1 - (it.bonif || 0) / 100) * it.cantidad;
            return `<tr>
                <td>${esc(it.nombre)}</td>
                <td><input type="number" min="1" value="${it.cantidad}" onchange="ppQty(${i},this.value)"></td>
                <td><input type="number" min="0" max="100" value="${it.bonif}" onchange="ppBonif(${i},this.value)"></td>
                <td>${fmt(it.precio)}</td>
                <td>${fmt(sub)}</td>
                <td><button class="pp-del" onclick="ppDel(${i})">×</button></td>
            </tr>`;
        }).join('');
    }
    const neto = carrito.reduce((s, it) => s + it.precio * (1 - (it.bonif || 0) / 100) * it.cantidad, 0);
    const dPct = Math.min(100, Math.max(0, parseFloat($('pp-descuento').value) || 0));
    const dMonto = neto * dPct / 100;
    const subtotal = neto - dMonto;
    const iva = $('pp-iva').checked ? subtotal * 0.21 : 0;
    $('pp-neto').textContent = fmt(neto);
    $('pp-desc-monto').textContent = '- ' + fmt(dMonto);
    $('pp-subtotal').textContent = fmt(subtotal);
    $('pp-iva-monto').textContent = fmt(iva);
    $('pp-total').textContent = fmt(subtotal + iva);
}
function esc(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
window.ppQty   = (i,v) => { carrito[i].cantidad = Math.max(1, parseInt(v)||1); render(); };
window.ppBonif = (i,v) => { carrito[i].bonif = Math.min(100, Math.max(0, parseFloat(v)||0)); render(); };
window.ppDel   = (i)   => { carrito.splice(i,1); render(); };
$('pp-descuento').addEventListener('input', render);
$('pp-iva').addEventListener('change', render);

function payload() {
    return {
        cliente: clienteSel ? {
            nombre: clienteSel.nombre_cliente, razon_social: clienteSel.razon_social || '',
            domicilio: clienteSel.domicilio || '', telefono: clienteSel.telefono || '',
            cond_iva: clienteSel.cond_iva || '', cuit: clienteSel.nro_id || '',
        } : { nombre: $('pp-cliente').value.trim() },
        productos: carrito.map(it => ({ nombre: it.nombre, precio_unit: it.precio, cantidad: it.cantidad, bonif: it.bonif || 0 })),
        descuento: Math.min(100, Math.max(0, parseFloat($('pp-descuento').value) || 0)),
        incluir_iva: $('pp-iva').checked,
        lista_activa: parseInt(listaActiva()) || 0,
        vigencia_dias: Math.min(365, Math.max(1, parseInt($('pp-vigencia').value) || 15)),
    };
}
function msg(t, ok) { const m = $('pp-msg'); m.textContent = t; m.style.color = ok ? '#16a34a' : '#dc2626'; }

// ── Rápido (WhatsApp, efímero) ─────────────────────────
$('pp-whatsapp').addEventListener('click', function () {
    if (!carrito.length) { msg('Agregá al menos un producto.', false); return; }
    let tel = ($('pp-telefono').value || '').replace(/[^0-9]/g, '');
    const dPct = Math.min(100, Math.max(0, parseFloat($('pp-descuento').value) || 0));
    let neto = 0;
    const lineas = ['*Presupuesto Starlim*', ''];
    carrito.forEach(it => {
        const sub = it.precio * (1 - (it.bonif || 0) / 100) * it.cantidad;
        neto += sub;
        lineas.push(`• ${it.nombre} — ${it.cantidad} x ${fmt(it.precio)}${it.bonif ? ` (-${it.bonif}%)` : ''} = ${fmt(sub)}`);
    });
    const dMonto = neto * dPct / 100, subtotal = neto - dMonto;
    const iva = $('pp-iva').checked ? subtotal * 0.21 : 0;
    lineas.push('');
    if (dPct > 0) lineas.push(`Descuento: -${fmt(dMonto)}`);
    if (iva > 0)  lineas.push(`IVA 21%: ${fmt(iva)}`);
    lineas.push(`*Total: ${fmt(subtotal + iva)}*`);
    lineas.push('', `Vigencia: ${Math.min(365, Math.max(1, parseInt($('pp-vigencia').value) || 15))} días.`);
    const texto = encodeURIComponent(lineas.join('\n'));
    if (tel && tel.indexOf('54') !== 0) tel = '54' + tel;
    const url = tel ? `https://wa.me/${tel}?text=${texto}` : `https://wa.me/?text=${texto}`;
    window.open(url, '_blank');
    msg('Se abrió WhatsApp con el presupuesto.', true);
});

// ── Formal (PDF + registro) ────────────────────────────
$('pp-formal').addEventListener('click', async function () {
    if (!carrito.length) { msg('Agregá al menos un producto.', false); return; }
    if (!clienteSel && !$('pp-cliente').value.trim()) { msg('Indicá el cliente.', false); return; }
    this.disabled = true; msg('Generando…', true);
    try {
        const res = await fetch('../php/generar_presupuesto.php', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()),
        });
        if (!res.ok) throw new Error('Error del servidor');
        const blob = await res.blob();
        const id = res.headers.get('X-Presupuesto-ID');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'Presupuesto.pdf';
        document.body.appendChild(a); a.click(); a.remove();
        msg('Presupuesto generado y registrado' + (id ? ` (#${id})` : '') + '. Lo ves en Seguimiento.', true);
        carrito = []; render();
    } catch (e) { msg('No se pudo generar el presupuesto.', false); }
    this.disabled = false;
});

render();
