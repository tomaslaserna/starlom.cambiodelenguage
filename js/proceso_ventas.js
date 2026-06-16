// proceso_ventas.js

// ══════════════════════════════════════════════════════
// SHOW / HIDE PANELES
// ══════════════════════════════════════════════════════

function mostrar(id) { document.getElementById(id)?.classList.remove('panel-oculto'); }
function ocultar(id) { document.getElementById(id)?.classList.add('panel-oculto'); }

function togglePanel(checkboxId, panelId) {
    document.getElementById(checkboxId)?.addEventListener('change', function () {
        this.checked ? mostrar(panelId) : ocultar(panelId);
    });
}

// ── Tipo de entrega ────────────────────────────────────
document.querySelectorAll('input[name="tipo_entrega"]').forEach(radio => {
    radio.addEventListener('change', function () {
        if (this.value === 'domicilio') {
            mostrar('panel-domicilio');
            ocultar('panel-retiro');
        } else {
            ocultar('panel-domicilio');
            mostrar('panel-retiro');
        }
    });
});

// ── Paneles condicionales ──────────────────────────────
togglePanel('chk-factura-a',       'panel-factura-a');
togglePanel('chk-dif-facturacion', 'panel-dif-facturacion');
togglePanel('chk-retira-otro',     'panel-retira-otro');

// ── Sin número / Sin teléfono ──────────────────────────
function toggleNumero(inputId, checkbox) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.disabled = checkbox.checked;
    input.value    = checkbox.checked ? 'S/N' : '';
}

function toggleTel(inputId, checkbox) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.disabled = checkbox.checked;
    input.value    = checkbox.checked ? '' : input.value;
}

// ── Método de pago ─────────────────────────────────────
const panelesPago = {
    tarjeta      : document.getElementById('panel-tarjeta'),
    transferencia: document.getElementById('panel-transferencia'),
    qr           : document.getElementById('panel-qr'),
    efectivo     : document.getElementById('panel-efectivo'),
};

document.querySelectorAll('input[name="tipo_pago"]').forEach(radio => {
    radio.addEventListener('change', function () {
        Object.values(panelesPago).forEach(p => p?.classList.add('panel-oculto'));
        panelesPago[this.value]?.classList.remove('panel-oculto');
        if (this.value === 'qr') generarQR();
    });
});

// ── Documento dinámico (DNI / CUIT) ───────────────────
document.getElementById('select-tipo-doc')?.addEventListener('change', function () {
    document.getElementById('label-tipo-doc').textContent = this.value;
    document.getElementById('input-nro-doc').placeholder  = 'Número de ' + this.value;
});

// ── Formato número de tarjeta ──────────────────────────
document.getElementById('input-num-tarjeta')?.addEventListener('input', function () {
    let val = this.value.replace(/\D/g, '').substring(0, 16);
    this.value = val.match(/.{1,4}/g)?.join(' ') || val;
});

// ── Generar QR ─────────────────────────────────────────
function generarQR() {
    const container = document.getElementById('qr-container');
    if (!container || container.innerHTML !== '') return;
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    script.onload = function () {
        new QRCode(container, {
            text: 'https://',
            width: 180,
            height: 180,
        });
    };
    document.head.appendChild(script);
}

// ══════════════════════════════════════════════════════
// VALIDACIONES
// ══════════════════════════════════════════════════════

function marcarInvalido(input) {
    if (!input) return;
    input.style.borderColor = '#dc2626';
}

function marcarValido(input) {
    if (!input) return;
    input.style.borderColor = '';
}

function validarCampo(input) {
    if (!input || input.disabled) return true;
    const vacio = input.value.trim() === '';
    vacio ? marcarInvalido(input) : marcarValido(input);
    return !vacio;
}

function validarGrupo(nombres) {
    let valido = true;
    nombres.forEach(name => {
        const input = document.querySelector(`[name="${name}"]`);
        if (!validarCampo(input)) valido = false;
    });
    return valido;
}

// Limpiar borde rojo al escribir
document.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('input',  function () { marcarValido(this); });
    el.addEventListener('change', function () { marcarValido(this); });
});

// ── Validar sección 1 ──────────────────────────────────
function validarSeccion1() {
    let valido = true;

    // Correo
    const correo = document.getElementById('correo');
    const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const correoOk = correo && regexEmail.test(correo.value.trim());
    correoOk ? marcarValido(correo) : marcarInvalido(correo);
    document.getElementById('err-correo').style.display = correoOk ? 'none' : 'block';
    if (!correoOk) valido = false;

    // CP
    const cp = document.getElementById('cp');
    const cpOk = cp && cp.value.trim() !== '';
    cpOk ? marcarValido(cp) : marcarInvalido(cp);
    document.getElementById('err-cp').style.display = cpOk ? 'none' : 'block';
    if (!cpOk) valido = false;

    // DNI
    const dni = document.getElementById('dni_cliente');
    const dniOk = dni && dni.value.trim() !== '' && !isNaN(dni.value);
    dniOk ? marcarValido(dni) : marcarInvalido(dni);
    document.getElementById('err-dni').style.display = dniOk ? 'none' : 'block';
    if (!dniOk) valido = false;

    // Entrega
    const tipoEntrega = document.querySelector('input[name="tipo_entrega"]:checked')?.value;

    if (tipoEntrega === 'domicilio') {
        if (!validarGrupo(['dest_nombre', 'dest_apellido', 'dest_telefono', 'dest_calle'])) valido = false;

        if (!document.getElementById('sin-numero-dest')?.checked) {
            if (!validarCampo(document.querySelector('[name="dest_numero"]'))) valido = false;
        }

        if (document.getElementById('chk-factura-a')?.checked) {
            if (!validarGrupo(['cuit', 'razon_social'])) valido = false;
        }

        if (document.getElementById('chk-dif-facturacion')?.checked) {
            if (!validarGrupo(['fact_nombre', 'fact_apellido', 'fact_telefono', 'fact_calle', 'fact_ciudad', 'fact_cp'])) valido = false;
            if (!document.getElementById('sin-numero-fact')?.checked) {
                if (!validarCampo(document.querySelector('[name="fact_numero"]'))) valido = false;
            }
        }

    } else if (tipoEntrega === 'retiro') {
        if (!validarGrupo(['ret_nombre', 'ret_apellido', 'ret_telefono'])) valido = false;

        if (document.getElementById('chk-retira-otro')?.checked) {
            if (!validarGrupo(['otro_nombre', 'otro_apellido'])) valido = false;
            const sinTel = document.querySelector('#otro_telefono')
                ?.closest('.campo')
                ?.querySelector('input[type="checkbox"]');
            if (!sinTel?.checked) {
                if (!validarCampo(document.getElementById('otro_telefono'))) valido = false;
            }
        }

        if (!validarGrupo(['ret_calle', 'ret_numero', 'ret_ciudad', 'ret_cp'])) valido = false;
    }

    // Scroll al primer campo inválido
    if (!valido) {
        document.querySelector('input[style*="d32f2f"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return valido;
}

// ── Validar sección 2 ──────────────────────────────────
function validarSeccion2() {
    let valido = true;

    const tipoPago = document.querySelector('input[name="tipo_pago"]:checked')?.value;
    const grupoPago = document.querySelector('.tipo-pago-grupo');

    if (!tipoPago) {
        grupoPago.style.outline = '2px solid #dc2626';
        grupoPago.style.borderRadius = '8px';
        return false;
    } else {
        grupoPago.style.outline = '';
    }

    if (tipoPago === 'tarjeta') {
        if (!validarGrupo(['num_tarjeta', 'titular_tarjeta', 'venc_tarjeta', 'cvv_tarjeta', 'nro_doc_tarjeta', 'telefono_tarjeta'])) valido = false;
    }

    return valido;
}

// ── Botón Continuar ────────────────────────────────────
document.getElementById('btn-continuar')?.addEventListener('click', function () {
    if (!validarSeccion1()) return;

    ocultar('seccion-datos');
    ocultar('seccion-envio');
    mostrar('seccion-pago');
    document.getElementById('seccion-pago').scrollIntoView({ behavior: 'smooth' });
});

// ── Submit / Pagar ─────────────────────────────────────
document.getElementById('form-pago')?.addEventListener('submit', function (e) {
    e.preventDefault();
    if (validarSeccion2()) this.submit();
});

// ── Cantidad de productos ──────────────────────────────
const btnMenos       = document.getElementById('btn-menos');
const btnMas         = document.getElementById('btn-mas');
const cantidadDisplay = document.getElementById('cantidad-display');
const cantidadInput  = document.getElementById('cantidad-input');
const precioTotal    = document.getElementById('precio-total');
const precioUnitario = parseFloat(document.getElementById('precio-unitario')?.value || 0);

const CANTIDAD_MAX = parseInt(document.getElementById('stock-maximo')?.value || 0);
const CANTIDAD_MIN = 1;

let cantidad = 1;

function actualizarCantidad(nueva) {
    cantidad = nueva;
    cantidadDisplay.value  = cantidad;
    cantidadInput.value    = cantidad;

    // Actualizar precio
    const total = (precioUnitario * cantidad).toLocaleString('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    precioTotal.textContent = '$' + total;

    // También actualizar el campo oculto de monto en el form
    document.querySelector('[name="monto"]').value = (precioUnitario * cantidad).toFixed(2);

    // Deshabilitar botones en los límites
    btnMenos.disabled = cantidad <= CANTIDAD_MIN;
    btnMas.disabled   = cantidad >= CANTIDAD_MAX;
}

btnMenos?.addEventListener('click', () => actualizarCantidad(cantidad - 1));
btnMas?.addEventListener('click',   () => actualizarCantidad(cantidad + 1));

// Inicializar estado del botón menos
if (btnMenos) btnMenos.disabled = true;

// Escribir cantidad manualmente
document.getElementById('cantidad-display')?.addEventListener('change', function () {
    let val = parseInt(this.value);
    if (isNaN(val) || val < CANTIDAD_MIN) val = CANTIDAD_MIN;
    if (val > CANTIDAD_MAX) val = CANTIDAD_MAX;
    actualizarCantidad(val);
});