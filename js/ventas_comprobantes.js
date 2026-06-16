// ventas_comprobantes.js — Modal de comprobantes post-entrega en Ventas
// (solicitar factura, notas de crédito/débito fiscales e internas).
'use strict';

(function () {
    const ADMIN = ['Jefe1', 'Admin'].includes(window.RANGO_ACTUAL);

    // ── Estilos (una vez) ──────────────────────────────────────────────
    const css = `
    .cv-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;}
    .cv-modal{background:var(--surface,#fff);color:var(--text,#101828);border-radius:14px;max-width:680px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);}
    .cv-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid rgba(128,128,128,.18);position:sticky;top:0;background:inherit;}
    .cv-head h3{margin:0;font-size:17px;}
    .cv-x{background:none;border:none;font-size:22px;cursor:pointer;color:inherit;line-height:1;}
    .cv-body{padding:18px 20px;}
    .cv-sec{margin-bottom:20px;}
    .cv-sec h4{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.05em;opacity:.6;}
    .cv-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
    .cv-btn{padding:7px 14px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;}
    .cv-btn-primary{background:#2563eb;color:#fff;} .cv-btn-primary:hover{background:#1d4ed8;}
    .cv-btn-nc{background:#16a34a;color:#fff;} .cv-btn-nd{background:#b45309;color:#fff;}
    .cv-btn-ghost{background:rgba(128,128,128,.12);color:inherit;}
    .cv-btn:disabled{opacity:.5;cursor:wait;}
    .cv-sel{padding:6px 10px;border-radius:7px;border:1.5px solid #d1d5db;font-family:inherit;font-size:13px;background:#fff;color:#101828;}
    .dark-mode .cv-sel{background:#0c1322;border-color:rgba(255,255,255,.15);color:#e4e7ec;}
    .cv-tabla{width:100%;border-collapse:collapse;font-size:13px;margin-top:6px;}
    .cv-tabla th,.cv-tabla td{padding:5px 8px;text-align:left;border-bottom:1px solid rgba(128,128,128,.12);}
    .cv-tabla input{width:62px;padding:3px 6px;border:1.5px solid #d1d5db;border-radius:6px;font-family:inherit;background:#fff;color:#101828;}
    .dark-mode .cv-tabla input{background:#0c1322;border-color:rgba(255,255,255,.15);color:#e4e7ec;}
    .cv-nota{font-size:12.5px;padding:6px 0;border-bottom:1px solid rgba(128,128,128,.1);display:flex;justify-content:space-between;gap:10px;}
    .cv-chip{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;}
    .cv-chip-nc{background:#dcfce7;color:#166534;} .cv-chip-nd{background:#fef3c7;color:#92400e;}
    .cv-muted{opacity:.6;font-size:12.5px;}
    .cv-form{background:rgba(128,128,128,.06);border-radius:10px;padding:12px;margin-top:8px;}
    .cv-msg{font-size:13px;padding:8px 10px;border-radius:8px;margin-top:8px;}
    .cv-msg-ok{background:#dcfce7;color:#166534;} .cv-msg-err{background:#fee2e2;color:#991b1b;}
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
    function fmt(n) { return '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

    function cerrar() { document.querySelector('.cv-overlay')?.remove(); }

    function overlay(inner) {
        cerrar();
        const ov = document.createElement('div');
        ov.className = 'cv-overlay';
        ov.innerHTML = `<div class="cv-modal">${inner}</div>`;
        ov.addEventListener('click', e => { if (e.target === ov) cerrar(); });
        document.body.appendChild(ov);
        return ov;
    }

    function msg(ov, texto, ok) {
        let m = ov.querySelector('.cv-msg');
        if (!m) { m = document.createElement('div'); m.className = 'cv-msg'; ov.querySelector('.cv-body').prepend(m); }
        m.className = 'cv-msg ' + (ok ? 'cv-msg-ok' : 'cv-msg-err');
        m.textContent = texto;
    }

    // ── Modal principal de comprobantes ────────────────────────────────
    window.abrirComprobantes = async function (ds) {
        const idVenta  = ds.id ? parseInt(ds.id, 10) : 0;
        const idRemito = ds.idremito ? parseInt(ds.idremito, 10) : 0;
        const q = idVenta ? `id_venta=${idVenta}` : `id_remito=${idRemito}`;

        const ov = overlay(`
            <div class="cv-head"><h3>Comprobantes — ${esc(ds.cliente || '')}</h3><button class="cv-x">&times;</button></div>
            <div class="cv-body"><p class="cv-muted">Cargando…</p></div>`);
        ov.querySelector('.cv-x').addEventListener('click', cerrar);

        let data;
        try {
            const res = await fetch(`../php/get_comprobantes_venta.php?${q}`);
            data = await res.json();
        } catch { msg(ov, 'Error de conexión', false); return; }
        if (!data.ok) { msg(ov, data.error || 'Error', false); return; }

        const v = data.venta;
        const conFactura = v.con_factura;
        const esVenta = idVenta > 0;
        renderModal(ov, { idVenta, idRemito, esVenta, conFactura, v, detalle: data.detalle, notas: data.notas, solicitudPendiente: data.solicitud_pendiente });
    };

    function renderModal(ov, ctx) {
        const { idVenta, idRemito, esVenta, conFactura, v, detalle, notas, solicitudPendiente } = ctx;
        const body = ov.querySelector('.cv-body');

        // Sección facturación (solo ventas sin factura)
        let facHtml = '';
        if (esVenta && !conFactura) {
            if (solicitudPendiente) {
                facHtml = `<p class="cv-muted">Ya hay una solicitud de factura pendiente de aprobación.</p>`;
            } else {
                facHtml = `
                <div class="cv-row">
                    <select class="cv-sel" id="cv-tipo-fac">
                        <option value="6">Factura B</option>
                        <option value="1">Factura A</option>
                    </select>
                    <button class="cv-btn cv-btn-primary" id="cv-solicitar">
                        ${ADMIN ? 'Emitir factura' : 'Solicitar factura'}
                    </button>
                    <span class="cv-muted">${ADMIN ? 'Se emite por ARCA en el acto.' : 'La aprueba un administrador.'}</span>
                </div>`;
            }
        } else if (esVenta && conFactura) {
            facHtml = `<p class="cv-muted">Esta venta ya tiene factura emitida (CAE). Podés emitir notas fiscales sobre ella.</p>`;
        } else {
            facHtml = `<p class="cv-muted">Remito sin factura: solo admite notas internas.</p>`;
        }

        // Notas existentes
        const notasHtml = notas.length
            ? notas.map(n => `
                <div class="cv-nota">
                    <span>
                        <span class="cv-chip cv-chip-${n.clase.toLowerCase()}">${n.clase}${n.fiscal ? '' : ' int.'}</span>
                        Nº ${esc(n.nro)} · ${fmt(n.monto)} ${n.motivo ? '· ' + esc(n.motivo) : ''}
                        <span class="cv-muted">${esc(n.fecha)}</span>
                    </span>
                    <a class="cv-btn cv-btn-ghost" target="_blank" href="../php/generar_pdf_comprobante.php?id=${n.id}&view=1">PDF</a>
                </div>`).join('')
            : '<p class="cv-muted">Sin notas emitidas.</p>';

        // Filas de productos para NC/ND
        const filasProd = detalle.map((d, i) => `
            <tr>
                <td>${esc(d.nombre)}</td>
                <td>${d.cantidad}</td>
                <td><input type="number" min="0" max="${d.cantidad}" value="0" data-idx="${i}" class="cv-cant"></td>
                <td>${fmt(d.precio_unit)}</td>
            </tr>`).join('');

        // Permisos de notas fiscales: solo admin y solo si la venta tiene factura
        const puedeFiscal = ADMIN && esVenta && conFactura;

        body.innerHTML = `
            <div class="cv-sec">
                <h4>Facturación</h4>
                ${facHtml}
            </div>
            <div class="cv-sec">
                <h4>Notas de crédito / débito</h4>
                <p class="cv-muted">Elegí las cantidades a acreditar (devolución) o debitar (cargo extra).</p>
                <table class="cv-tabla">
                    <thead><tr><th>Producto</th><th>Original</th><th>Cant.</th><th>P. Unit.</th></tr></thead>
                    <tbody>${filasProd || '<tr><td colspan="4" class="cv-muted">Sin detalle de productos</td></tr>'}</tbody>
                </table>
                <div class="cv-form">
                    <div class="cv-row">
                        <input type="text" class="cv-sel" id="cv-motivo" placeholder="Motivo (ej: devolución de mercadería)" style="flex:1;min-width:200px;">
                    </div>
                    <div class="cv-row" style="margin-top:8px;">
                        ${puedeFiscal ? `<label class="cv-muted"><input type="checkbox" id="cv-fiscal"> Fiscal (ARCA)</label>` : ''}
                        <button class="cv-btn cv-btn-nc" id="cv-nc">Nota de crédito (+stock)</button>
                        <button class="cv-btn cv-btn-nd" id="cv-nd">Nota de débito (−stock)</button>
                    </div>
                </div>
            </div>
            <div class="cv-sec">
                <h4>Notas emitidas</h4>
                ${notasHtml}
            </div>`;

        // ── Solicitar / emitir factura ──
        body.querySelector('#cv-solicitar')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget; btn.disabled = true;
            const tipo = body.querySelector('#cv-tipo-fac').value;
            try {
                const res = await fetch('../php/solicitar_factura.php', {
                    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ id_venta: idVenta, tipo_cbte: tipo }),
                });
                const r = await res.json();
                if (r.ok) {
                    msg(ov, r.cae ? `Factura emitida. CAE ${r.cae}` : (r.mensaje || 'Solicitud enviada.'), true);
                    if (r.cae) { window.__doFetchVentas?.(); setTimeout(cerrar, 1500); }
                    else btn.disabled = false;
                } else { msg(ov, r.error || 'Error', false); btn.disabled = false; }
            } catch { msg(ov, 'Error de conexión', false); btn.disabled = false; }
        });

        // ── Crear nota ──
        async function crearNota(clase, btn) {
            const items = [];
            body.querySelectorAll('.cv-cant').forEach(inp => {
                const cant = parseInt(inp.value, 10) || 0;
                if (cant > 0) {
                    const d = detalle[parseInt(inp.dataset.idx, 10)];
                    items.push({ id: d.id, nombre: d.nombre, cantidad: cant, precio_unit: d.precio_unit });
                }
            });
            if (!items.length) { msg(ov, 'Indicá al menos una cantidad.', false); return; }

            btn.disabled = true;
            const fiscal = body.querySelector('#cv-fiscal')?.checked ? 1 : 0;
            const params = new URLSearchParams({
                clase, fiscal, motivo: body.querySelector('#cv-motivo').value,
                detalle_json: JSON.stringify(items),
            });
            if (idVenta)  params.set('id_venta', idVenta);
            if (idRemito) params.set('id_remito', idRemito);

            try {
                const res = await fetch('../php/crear_nota_venta.php', {
                    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params,
                });
                const r = await res.json();
                if (r.ok) {
                    msg(ov, `${clase === 'NC' ? 'Nota de crédito' : 'Nota de débito'} Nº ${String(r.nro_comprobante).padStart(8,'0')} creada (${fmt(r.monto)}).`, true);
                    window.__doFetchVentas?.();
                    setTimeout(() => window.abrirComprobantes(idVenta ? { id: idVenta, cliente: v.nombre_cliente } : { idremito: idRemito, cliente: v.nombre_cliente }), 1200);
                } else { msg(ov, r.error || 'Error', false); btn.disabled = false; }
            } catch { msg(ov, 'Error de conexión', false); btn.disabled = false; }
        }
        body.querySelector('#cv-nc')?.addEventListener('click', e => crearNota('NC', e.currentTarget));
        body.querySelector('#cv-nd')?.addEventListener('click', e => crearNota('ND', e.currentTarget));
    }

    // ── Solicitudes pendientes (Jefe1/Admin) ───────────────────────────
    window.abrirSolicitudesPendientes = async function () {
        const ov = overlay(`
            <div class="cv-head"><h3>Solicitudes de factura pendientes</h3><button class="cv-x">&times;</button></div>
            <div class="cv-body"><p class="cv-muted">Cargando…</p></div>`);
        ov.querySelector('.cv-x').addEventListener('click', cerrar);

        let data;
        try { data = await (await fetch('../php/get_comprobantes_venta.php?pendientes=1')).json(); }
        catch { msg(ov, 'Error de conexión', false); return; }
        if (!data.ok) { msg(ov, data.error || 'Error', false); return; }

        const body = ov.querySelector('.cv-body');
        if (!data.solicitudes.length) { body.innerHTML = '<p class="cv-muted">No hay solicitudes pendientes.</p>'; return; }

        body.innerHTML = data.solicitudes.map(s => `
            <div class="cv-nota" data-sol="${s.id}">
                <span>
                    <strong>${esc(s.nombre_cliente)}</strong> · ${s.tipo_label} · ${fmt(s.monto)}
                    <span class="cv-muted">pedido #${esc(s.nro_remito)} · pidió ${esc(s.solicitado_por)}</span>
                </span>
                <span class="cv-row">
                    <button class="cv-btn cv-btn-primary" data-acc="aprobar" data-id="${s.id}">Aprobar y emitir</button>
                    <button class="cv-btn cv-btn-ghost" data-acc="rechazar" data-id="${s.id}">Rechazar</button>
                </span>
            </div>`).join('');

        body.querySelectorAll('[data-acc]').forEach(btn => btn.addEventListener('click', async () => {
            const acc = btn.dataset.acc, id = btn.dataset.id;
            let motivo = '';
            if (acc === 'rechazar') { motivo = prompt('Motivo del rechazo:') || ''; if (motivo === '') return; }
            btn.disabled = true;
            try {
                const res = await fetch('../php/resolver_solicitud_factura.php', {
                    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ accion: acc, id_solicitud: id, motivo }),
                });
                const r = await res.json();
                if (r.ok) {
                    body.querySelector(`[data-sol="${id}"]`)?.remove();
                    window.__doFetchVentas?.();
                    if (!body.querySelector('[data-sol]')) body.innerHTML = '<p class="cv-muted">No hay solicitudes pendientes.</p>';
                } else { msg(ov, r.error || 'Error', false); btn.disabled = false; }
            } catch { msg(ov, 'Error de conexión', false); btn.disabled = false; }
        }));
    };
})();
