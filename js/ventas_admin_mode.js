'use strict';
/**
 * Edición de ventas (solo Jefe1/Admin). Este script solo se carga para esos
 * rangos, así que la edición queda habilitada directamente (sin contraseña ni
 * toggle). Cada cambio queda asentado en el registro de auditoría
 * (ventas_modificaciones, vía modo_admin_ventas_be.php). El registro se consulta
 * desde la pantalla de Facturación (administración).
 */
(() => {
    const BE = '../php/modo_admin_ventas_be.php';

    const COBRO_OPTS = {
        pendiente: 'Pendiente', en_proceso: 'En proceso', recibido: 'Recibido',
        vencido: 'Vencido', cancelado: 'Cancelado',
    };
    const PEDIDO_OPTS = {
        recibido: 'Recibido', en_proceso: 'En proceso', pendiente_entrega: 'Pendiente de entrega', entregado: 'Entregado',
    };
    const SEGUIMIENTO_OPTS = { facturada: 'Facturada', no_facturada: 'No facturada' };
    const TIPO_OPTS = {
        1: 'Factura A', 6: 'Factura B', 2: 'Nota de débito (A)',
        7: 'Nota de débito (B)', 3: 'Nota de crédito (A)', 8: 'Nota de crédito (B)',
    };

    async function post(accion, data = {}) {
        const fd = new FormData();
        fd.append('accion', accion);
        for (const [k, v] of Object.entries(data)) fd.append(k, v);
        const res = await fetch(BE, { method: 'POST', body: fd });
        return res.json();
    }

    function esc(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function toast(msg, esError = false) {
        const t = document.createElement('div');
        t.className = 'vam-toast' + (esError ? ' vam-toast--error' : '');
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.classList.add('vam-toast--visible'), 20);
        setTimeout(() => { t.classList.remove('vam-toast--visible'); setTimeout(() => t.remove(), 350); }, 3200);
    }

    function abrirModal(html, { ancho = 520 } = {}) {
        cerrarModal();
        const overlay = document.createElement('div');
        overlay.className = 'vam-overlay';
        overlay.id = 'vam-overlay';
        overlay.innerHTML = `<div class="vam-modal" style="max-width:${ancho}px">${html}</div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) cerrarModal(); });
        document.addEventListener('keydown', escListener);
        return overlay.querySelector('.vam-modal');
    }
    function cerrarModal() {
        document.getElementById('vam-overlay')?.remove();
        document.removeEventListener('keydown', escListener);
    }
    function escListener(e) { if (e.key === 'Escape') cerrarModal(); }

    function selectHtml(id, opts, actual) {
        return `<select class="vam-input" id="${id}">` + Object.entries(opts).map(([v, l]) =>
            `<option value="${v}"${String(v) === String(actual) ? ' selected' : ''}>${esc(l)}</option>`
        ).join('') + '</select>';
    }

    window.abrirEdicionVenta = async function (idVenta) {
        let data;
        try { data = await post('obtener_venta', { id_venta: idVenta }); }
        catch { toast('Error de conexión.', true); return; }
        if (!data.ok) { toast(data.error || 'Error.', true); return; }
        const v = data.venta;

        const m = abrirModal(`
            <div class="vam-modal-header">
                <h2>Editar venta #${esc(String(v.nro_comprobante).padStart(8, '0'))}</h2>
                <button class="vam-close" data-vam-close>&#10005;</button>
            </div>
            <div class="vam-modal-body vam-form-grid">
                <div><label class="vam-label">Cliente *</label>
                    <input class="vam-input" id="vam-f-nombre_cliente" value="${esc(v.nombre_cliente)}"></div>
                <div><label class="vam-label">CUIT/DNI</label>
                    <input class="vam-input" id="vam-f-dni_cliente" value="${esc(v.dni_cliente)}"></div>
                <div><label class="vam-label">Nro. comprobante</label>
                    <input class="vam-input" id="vam-f-nro_comprobante" type="number" min="0" value="${esc(v.nro_comprobante)}"></div>
                <div><label class="vam-label">Tipo de comprobante</label>
                    ${selectHtml('vam-f-tipo_cbte', TIPO_OPTS, v.tipo_cbte)}</div>
                <div><label class="vam-label">Fecha</label>
                    <input class="vam-input" id="vam-f-fecha" type="date" value="${esc(v.fecha)}"></div>
                <div><label class="vam-label">Monto ($)</label>
                    <input class="vam-input" id="vam-f-monto" type="number" min="0" step="0.01" value="${esc(v.monto)}"></div>
                <div><label class="vam-label">Estado de cobro</label>
                    ${selectHtml('vam-f-estado_cobro', COBRO_OPTS, v.estado_cobro)}</div>
                <div><label class="vam-label">Estado de pedido</label>
                    ${selectHtml('vam-f-estado_pedido', PEDIDO_OPTS, v.estado_pedido)}</div>
                <div><label class="vam-label">Seguimiento</label>
                    ${selectHtml('vam-f-seguimiento', SEGUIMIENTO_OPTS, v.seguimiento)}</div>
                <div><label class="vam-label">Condición de pago</label>
                    <input class="vam-input" id="vam-f-condicion_pago" value="${esc(v.condicion_pago)}"></div>
                <div><label class="vam-label">Vendedor</label>
                    <input class="vam-input" id="vam-f-vendedor" value="${esc(v.vendedor)}"></div>
            </div>
            <p class="vam-msg" id="vam-edit-msg" style="padding:0 24px;"></p>
            <div class="vam-modal-footer">
                <button class="vam-btn vam-btn--ghost" data-vam-close>Cancelar</button>
                <button class="vam-btn vam-btn--primary" id="vam-btn-guardar">Guardar cambios</button>
            </div>`, { ancho: 640 });
        m.querySelectorAll('[data-vam-close]').forEach(b => b.addEventListener('click', cerrarModal));

        m.querySelector('#vam-btn-guardar').addEventListener('click', async function () {
            const campos = ['nombre_cliente', 'dni_cliente', 'nro_comprobante', 'tipo_cbte', 'fecha',
                            'monto', 'estado_cobro', 'estado_pedido', 'seguimiento', 'condicion_pago', 'vendedor'];
            const payload = { id_venta: idVenta };
            campos.forEach(c => payload[c] = m.querySelector(`#vam-f-${c}`).value);

            this.disabled = true;
            const msg = m.querySelector('#vam-edit-msg');
            msg.textContent = 'Guardando…';
            try {
                const res = await post('editar_venta', payload);
                if (res.ok) {
                    cerrarModal();
                    toast(res.sin_cambios ? 'No había cambios para guardar.' : `Venta actualizada (${res.cambios} campo/s).`);
                    window.__doFetchVentas?.();
                } else { msg.textContent = res.error || 'Error al guardar.'; }
            } catch { msg.textContent = 'Error de conexión.'; }
            this.disabled = false;
        });
    };

    /* ── Init: edición habilitada directamente para Jefe1/Admin ──────────── */
    document.addEventListener('DOMContentLoaded', () => {
        window.ADMIN_MODE = true;
        window.__doFetchVentas?.();
    });
})();
