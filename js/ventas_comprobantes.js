// ventas_comprobantes.js - Modal de comprobantes post-entrega en Ventas.
'use strict';

(function () {
    const ADMIN = ['Jefe1', 'Admin'].includes(window.RANGO_ACTUAL);

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
    .cv-btn{padding:7px 14px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;}
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
    .cv-muted{opacity:.68;font-size:12.5px;line-height:1.45;}
    .cv-form{background:rgba(128,128,128,.06);border-radius:10px;padding:12px;margin-top:8px;}
    .cv-msg{font-size:13px;padding:8px 10px;border-radius:8px;margin-top:8px;}
    .cv-msg-ok{background:#dcfce7;color:#166534;} .cv-msg-err{background:#fee2e2;color:#991b1b;}
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    function esc(s) {
        return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }
    function fmt(n) {
        return '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function estadoFiscalLabel(status) {
        return ({
            ready_for_validation: 'Pendiente de aprobacion',
            pending_authorization: 'En autorizacion ARCA',
            rejected: 'Rechazada por ARCA',
            validation_failed: 'Datos fiscales incompletos',
            authorized: 'Autorizada',
        })[status] || status || 'Pendiente';
    }

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
        if (!m) {
            m = document.createElement('div');
            m.className = 'cv-msg';
            ov.querySelector('.cv-body').prepend(m);
        }
        m.className = 'cv-msg ' + (ok ? 'cv-msg-ok' : 'cv-msg-err');
        m.textContent = texto;
    }

    window.abrirComprobantes = async function (ds) {
        const idVenta = ds.id ? parseInt(ds.id, 10) : 0;
        const idRemito = ds.idremito ? parseInt(ds.idremito, 10) : 0;
        const q = idVenta ? `id_venta=${idVenta}` : `id_remito=${idRemito}`;

        const ov = overlay(`
            <div class="cv-head"><h3>Comprobantes - ${esc(ds.cliente || '')}</h3><button class="cv-x">&times;</button></div>
            <div class="cv-body"><p class="cv-muted">Cargando...</p></div>`);
        ov.querySelector('.cv-x').addEventListener('click', cerrar);

        let data;
        try {
            const res = await fetch(`../php/get_comprobantes_venta.php?${q}`);
            data = await res.json();
        } catch {
            msg(ov, 'Error de conexion', false);
            return;
        }
        if (!data.ok) {
            msg(ov, data.error || 'Error', false);
            return;
        }

        const v = data.venta;
        renderModal(ov, {
            idVenta,
            idRemito,
            esVenta: idVenta > 0,
            conFactura: v.con_factura,
            v,
            detalle: data.detalle || [],
            notas: data.notas || [],
            solicitudPendiente: data.solicitud_pendiente,
        });
    };

    function facturacionHtml(ctx) {
        const { idVenta, esVenta, conFactura, v, solicitudPendiente } = ctx;
        if (!esVenta) {
            return `<p class="cv-muted">Este comprobante no esta vinculado a una venta fiscalizable.</p>`;
        }
        if (conFactura) {
            return `
                <p class="cv-muted">Factura ARCA emitida para esta venta.</p>
                <a class="cv-btn cv-btn-primary" target="_blank" href="../php/generar_pdf_factura.php?id_venta=${idVenta}&view=1">Ver factura PDF</a>`;
        }
        if (!v.entregado) {
            return `<p class="cv-muted">La factura se puede solicitar cuando el pedido este entregado.</p>`;
        }
        if (solicitudPendiente) {
            const errores = Array.isArray(solicitudPendiente.errores) && solicitudPendiente.errores.length
                ? `<p class="cv-msg cv-msg-err">${esc(solicitudPendiente.errores.join(' | '))}</p>`
                : '';
            return `
                <p class="cv-muted">Solicitud #${esc(solicitudPendiente.id)}: ${esc(estadoFiscalLabel(solicitudPendiente.estado))}.</p>
                ${errores}
                ${ADMIN ? '<a class="cv-btn cv-btn-primary" href="facturacion.php">Abrir cola de aprobacion</a>' : '<p class="cv-muted">Queda pendiente hasta que Admin la apruebe.</p>'}`;
        }
        return `
            <p class="cv-muted">Genera una solicitud fiscal. La factura se emite recien cuando Admin la aprueba en Administracion.</p>
            <button class="cv-btn cv-btn-primary" id="cv-solicitar-factura" type="button">Solicitar factura ARCA</button>`;
    }

    function renderModal(ov, ctx) {
        const { idVenta, idRemito, v, detalle, notas } = ctx;
        const body = ov.querySelector('.cv-body');

        const notasHtml = notas.length
            ? notas.map(n => `
                <div class="cv-nota">
                    <span>
                        <span class="cv-chip cv-chip-${esc(String(n.clase).toLowerCase())}">${esc(n.clase)}${n.fiscal ? '' : ' int.'}</span>
                        Nro. ${esc(n.nro)} - ${fmt(n.monto)} ${n.motivo ? '- ' + esc(n.motivo) : ''}
                        <span class="cv-muted">${esc(n.fecha)}</span>
                    </span>
                    <a class="cv-btn cv-btn-ghost" target="_blank" href="../php/generar_pdf_comprobante.php?id=${n.id}&view=1">PDF</a>
                </div>`).join('')
            : '<p class="cv-muted">Sin notas emitidas.</p>';

        const filasProd = detalle.map((d, i) => `
            <tr>
                <td>${esc(d.nombre)}</td>
                <td>${d.cantidad}</td>
                <td><input type="number" min="0" max="${d.cantidad}" value="0" data-idx="${i}" class="cv-cant"></td>
                <td>${fmt(d.precio_unit)}</td>
            </tr>`).join('');

        body.innerHTML = `
            <div class="cv-sec">
                <h4>Facturacion</h4>
                ${facturacionHtml(ctx)}
            </div>
            <div class="cv-sec">
                <h4>Notas de credito / debito</h4>
                <p class="cv-muted">Elegi las cantidades a acreditar (devolucion) o debitar (cargo extra).</p>
                <table class="cv-tabla">
                    <thead><tr><th>Producto</th><th>Original</th><th>Cant.</th><th>P. Unit.</th></tr></thead>
                    <tbody>${filasProd || '<tr><td colspan="4" class="cv-muted">Sin detalle de productos</td></tr>'}</tbody>
                </table>
                <div class="cv-form">
                    <div class="cv-row">
                        <input type="text" class="cv-sel" id="cv-motivo" placeholder="Motivo (ej: devolucion de mercaderia)" style="flex:1;min-width:200px;">
                    </div>
                    <div class="cv-row" style="margin-top:8px;">
                        <button class="cv-btn cv-btn-nc" id="cv-nc">Nota de credito (+stock)</button>
                        <button class="cv-btn cv-btn-nd" id="cv-nd">Nota de debito (-stock)</button>
                    </div>
                </div>
            </div>
            <div class="cv-sec">
                <h4>Notas emitidas</h4>
                ${notasHtml}
            </div>`;

        async function crearNota(clase, btn) {
            const items = [];
            body.querySelectorAll('.cv-cant').forEach(inp => {
                const cant = parseInt(inp.value, 10) || 0;
                if (cant > 0) {
                    const d = detalle[parseInt(inp.dataset.idx, 10)];
                    items.push({ id: d.id, nombre: d.nombre, cantidad: cant, precio_unit: d.precio_unit });
                }
            });
            if (!items.length) {
                msg(ov, 'Indica al menos una cantidad.', false);
                return;
            }

            btn.disabled = true;
            const params = new URLSearchParams({
                clase,
                fiscal: 0,
                motivo: body.querySelector('#cv-motivo').value,
                detalle_json: JSON.stringify(items),
            });
            if (idVenta) params.set('id_venta', idVenta);
            if (idRemito) params.set('id_remito', idRemito);

            try {
                const res = await fetch('../php/crear_nota_venta.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: params,
                });
                const r = await res.json();
                if (!r.ok) throw new Error(r.error || 'Error');

                msg(ov, `${clase === 'NC' ? 'Nota de credito' : 'Nota de debito'} Nro. ${String(r.nro_comprobante).padStart(8, '0')} creada (${fmt(r.monto)}).`, true);
                window.__doFetchVentas?.();
                setTimeout(() => window.abrirComprobantes(idVenta ? { id: idVenta, cliente: v.nombre_cliente } : { idremito: idRemito, cliente: v.nombre_cliente }), 1200);
            } catch (error) {
                msg(ov, error.message || 'Error de conexion', false);
                btn.disabled = false;
            }
        }

        body.querySelector('#cv-nc')?.addEventListener('click', e => crearNota('NC', e.currentTarget));
        body.querySelector('#cv-nd')?.addEventListener('click', e => crearNota('ND', e.currentTarget));
        body.querySelector('#cv-solicitar-factura')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.textContent = 'Enviando...';
            try {
                const params = new URLSearchParams({ id_venta: idVenta });
                const res = await fetch('../php/billing_prepare_draft.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: params,
                });
                const r = await res.json();
                if (!r.ok) throw new Error(r.error || 'No se pudo crear la solicitud fiscal.');

                msg(ov, 'Solicitud fiscal enviada a aprobacion de Admin.', true);
                window.__doFetchVentas?.();
                setTimeout(() => window.abrirComprobantes({ id: idVenta, cliente: v.nombre_cliente }), 900);
            } catch (error) {
                msg(ov, error.message || 'Error de conexion', false);
                btn.disabled = false;
                btn.textContent = 'Solicitar factura ARCA';
            }
        });
    }

    window.abrirSolicitudesPendientes = async function () {
        const ov = overlay(`
            <div class="cv-head"><h3>Solicitudes fiscales</h3><button class="cv-x">&times;</button></div>
            <div class="cv-body">
                <p class="cv-muted">Las facturas ARCA se aprueban desde Administracion.</p>
                <a class="cv-btn cv-btn-primary" href="facturacion.php">Abrir cola de aprobacion</a>
            </div>`);
        ov.querySelector('.cv-x').addEventListener('click', cerrar);
    };
})();
