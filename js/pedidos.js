// pedidos.js — interacción de la ventana Pedidos (depósito y logística)

const ESTADO_LABELS = {
    recibido:          'Recibido',
    en_proceso:        'En proceso',
    pendiente_entrega: 'Pendiente de entrega',
    entregado:         'Entregado',
};

// ── Filtro por estado ──────────────────────────────────
document.querySelectorAll('#filtros-estado .filter-pill').forEach(pill => {
    pill.addEventListener('click', function () {
        document.querySelectorAll('#filtros-estado .filter-pill').forEach(p => p.classList.remove('active'));
        this.classList.add('active');
        const estado = this.dataset.estado;
        document.querySelectorAll('.ped-row').forEach(row => {
            row.style.display = (!estado || row.dataset.estado === estado) ? '' : 'none';
        });
        // los detalles abiertos se cierran al filtrar
        document.querySelectorAll('.ped-detalle.open').forEach(d => d.classList.remove('open'));
    });
});

// ── Detalle expandible ─────────────────────────────────
document.querySelectorAll('.btn-detalle').forEach(btn => {
    btn.addEventListener('click', function () {
        document.getElementById('detalle-' + this.dataset.id)?.classList.toggle('open');
    });
});

// ── Avanzar estado ─────────────────────────────────────
document.querySelectorAll('.btn-avanzar').forEach(btn => {
    btn.addEventListener('click', async function () {
        const id        = this.dataset.id;
        const siguiente = this.dataset.siguiente;

        if (siguiente === 'entregado' &&
            !confirm('¿Marcar el pedido como ENTREGADO?\n\nSe descuenta el stock y el pedido pasa a Ventas registradas.')) {
            return;
        }

        this.disabled = true;
        try {
            const res  = await fetch('../php/actualizar_estado_pedido.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ accion: 'estado', id_venta: id, estado: siguiente }),
            });
            const data = await res.json();
            if (!data.ok) {
                alert(data.error || 'No se pudo actualizar el estado.');
                this.disabled = false;
                return;
            }
            // Recargar: actualiza contadores, badges y saca los entregados
            window.location.reload();
        } catch (e) {
            alert('Error de conexión.');
            this.disabled = false;
        }
    });
});

// ── Armado de reparto (logística) ──────────────────────
const _checks      = () => Array.from(document.querySelectorAll('.check-pedido'));
const _seleccion   = () => _checks().filter(c => c.checked).map(c => c.value);
const _repartidor  = () => document.getElementById('reparto-repartidor');
const _btnReparto  = () => document.getElementById('btn-generar-reparto');

function actualizarReparto() {
    const sel = _seleccion();
    const cnt = document.getElementById('reparto-count');
    if (cnt) cnt.textContent = sel.length;
    const btn = _btnReparto();
    if (btn) btn.disabled = !(sel.length > 0 && _repartidor()?.value);
}

document.querySelectorAll('.check-pedido').forEach(c => c.addEventListener('change', actualizarReparto));
_repartidor()?.addEventListener('change', actualizarReparto);

document.getElementById('check-todos')?.addEventListener('change', function () {
    // Solo marca los pedidos visibles (respeta el filtro de estado activo)
    _checks().forEach(c => {
        const row = c.closest('.ped-row');
        if (row && row.style.display !== 'none') c.checked = this.checked;
    });
    actualizarReparto();
});

_btnReparto()?.addEventListener('click', async function () {
    const ids = _seleccion();
    const idRep = _repartidor().value;
    if (!ids.length || !idRep) return;

    this.disabled = true;
    try {
        const res = await fetch('../php/crear_reparto.php', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ id_repartidor: idRep, ids: ids.join(',') }),
        });
        const data = await res.json();
        if (!data.ok) { alert(data.error || 'No se pudo armar el reparto.'); this.disabled = false; return; }
        // Abrir WhatsApp con el mensaje prearmado para el repartidor
        window.open(data.wa_link, '_blank');
        alert(`Reparto armado: ${data.cantidad} pedido(s) para ${data.repartidor}.\nSe abrió WhatsApp con el mensaje listo para enviar.`);
        window.location.reload();
    } catch (e) {
        alert('Error de conexión.');
        this.disabled = false;
    }
});

// ── Observación inline ─────────────────────────────────
function toggleObs(id, abrir) {
    document.getElementById('obs-edit-' + id)?.classList.toggle('open', abrir);
    const txt = document.getElementById('obs-txt-' + id);
    if (txt) txt.style.display = abrir ? 'none' : '';
}

async function guardarObs(id) {
    const input = document.getElementById('obs-input-' + id);
    if (!input) return;
    try {
        const res  = await fetch('../php/actualizar_estado_pedido.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ accion: 'observacion', id_venta: id, observacion: input.value }),
        });
        const data = await res.json();
        if (!data.ok) { alert(data.error || 'No se pudo guardar.'); return; }
        const txt = document.getElementById('obs-txt-' + id);
        if (txt) {
            const val = input.value.trim();
            txt.textContent = val || 'Sin observación';
            txt.classList.toggle('obs-vacia', !val);
        }
        toggleObs(id, false);
    } catch (e) {
        alert('Error de conexión.');
    }
}
