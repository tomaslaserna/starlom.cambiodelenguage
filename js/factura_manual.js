// factura_manual.js

let productosEnFactura = [];

// Mapeo de valor del select → columna en listas_precios
const MAPA_LISTA = {
    'rev': 'precio_minorista_r',
    '0':   'precio_0',
    '1':   'precio_1',
    '2':   'precio_2',
    '3':   'precio_3',
    '4':   'precio_4',
};

let clienteSeleccionadoActual = null;

function registroPrecioProducto(producto) {
    if (!producto) return null;
    return LISTAS_PRECIOS_DB[String(producto.id)] || LISTAS_PRECIOS_DB[producto.nombre] || null;
}

function etiquetaProducto(producto) {
    return producto.nombre + ' - ' + formatoPeso(producto.precio);
}

function normalizarBusquedaProducto(texto) {
    return String(texto || '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+-\s+\$.*$/, '')
        .replace(/\s+—\s+\$.*$/, '')
        .trim();
}

function buscarProductoSeleccionado(valor) {
    const needle = normalizarBusquedaProducto(valor);
    if (!needle) return null;
    let encontrados = PRODUCTOS_DB.filter(p => {
        const nombre = normalizarBusquedaProducto(p.nombre);
        const label  = normalizarBusquedaProducto(etiquetaProducto(p));
        return nombre === needle || label === needle;
    });
    if (encontrados.length === 1) return encontrados[0];

    encontrados = PRODUCTOS_DB.filter(p => normalizarBusquedaProducto(p.nombre).includes(needle));
    return encontrados.length === 1 ? encontrados[0] : null;
}

// Actualiza precios en PRODUCTOS_DB y en productos ya agregados a la factura
function actualizarPreciosPorLista(lista) {
    const columna = MAPA_LISTA[lista] || null;
    PRODUCTOS_DB.forEach(p => {
        const registro = registroPrecioProducto(p);
        p.precio = (registro && columna) ? (parseFloat(registro[columna]) || 0) : 0;
    });

    productosEnFactura.forEach(pf => {
        if (pf.precioFijado) return; // precio bloqueado desde presupuesto
        const registro = registroPrecioProducto(pf);
        pf.precio = (registro && columna) ? (parseFloat(registro[columna]) || 0) : 0;
    });

    actualizarDatalistProductos();
    renderTabla();
    recalcularTotales();
}

// Regenera el datalist con los productos que tienen precio > 0 en la lista activa
function actualizarDatalistProductos() {
    const datalist   = document.getElementById('lista-productos');
    const inputProd  = document.getElementById('input-producto');
    if (!datalist) return;

    const listaActiva = document.querySelector('[name="lista_precios"]')?.value || '';
    datalist.innerHTML = '';

    if (!listaActiva || !MAPA_LISTA[listaActiva]) {
        if (inputProd) inputProd.placeholder = '— Primero elegí una lista de precios —';
        return;
    }

    const conPrecio = PRODUCTOS_DB.filter(p => parseFloat(p.precio) > 0);

    if (inputProd) {
        inputProd.placeholder = conPrecio.length
            ? '— Escribí para buscar —'
            : 'No hay productos con precio en esta lista — revisá márgenes/costos';
    }

    conPrecio.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.nombre;
        opt.label = formatoPeso(p.precio) + ' | disponible: ' + parseInt(p.cantidad || 0);
        datalist.appendChild(opt);
    });
}

// ── Validación de documento ────────────────────────────
function validarDocumento(tipoId, nroId) {
    const soloDigitos = nroId.replace(/[^0-9]/g, '');
    if (tipoId === 'CUIT' || tipoId === 'CUIL') {
        return soloDigitos.length === 11;
    }
    if (tipoId === 'DNI') {
        return soloDigitos.length >= 7 && soloDigitos.length <= 8;
    }
    return soloDigitos.length > 0;
}

function mostrarErrorDoc(mensaje) {
    let aviso = document.getElementById('aviso-doc');
    if (!aviso) {
        aviso = document.createElement('p');
        aviso.id = 'aviso-doc';
        aviso.style.cssText = 'color:#dc2626;font-size:12px;margin:4px 0 0;';
        document.getElementById('display-nro-id').after(aviso);
    }
    aviso.textContent = mensaje;
    document.getElementById('display-nro-id').style.borderColor = mensaje ? '#dc2626' : '';
}

function setVencimientoPorCliente(cliente) {
    const vto = document.querySelector('[name="vencimiento"]');
    if (!vto || !cliente) return;

    const plazo = parseInt(cliente.plazo_pago_dias) || 0;
    if (plazo <= 0) {
        vto.value = '';
        return;
    }

    const fechaPedido = document.querySelector('[name="fecha"]')?.value || '';
    const base = fechaPedido ? new Date(fechaPedido + 'T12:00:00') : new Date();
    if (Number.isNaN(base.getTime())) return;
    base.setDate(base.getDate() + plazo);

    const pad = n => String(n).padStart(2, '0');
    vto.value = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}T${pad(base.getHours())}:${pad(base.getMinutes())}`;
}

// ── Helpers de formato ─────────────────────────────────
function formatoPeso(numero) {
    return '$' + parseFloat(numero).toLocaleString('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

// ── Tipo de cliente ────────────────────────────────────
function configurarModoRemito() {
    document.getElementById('tipo-cbte').value = '6';
    document.getElementById('tipo-cliente-hidden').value = 'sin_factura';
    document.getElementById('nro-doc').required = false;
    document.getElementById('btn-emitir').textContent = 'Cargar pedido';
    document.getElementById('preview-tipo-cbte').textContent = 'Remito';
    document.getElementById('fila-iva').style.display = 'none';
    document.getElementById('preview-fila-iva').style.display = 'none';
}

configurarModoRemito();

// ── Preview: datos del cliente ─────────────────────────
document.getElementById('nro-doc')?.addEventListener('input', function () {
    document.getElementById('preview-doc').textContent = this.value || '—';
});

document.querySelector('[name="nombre_cliente"]')?.addEventListener('input', function () {
    document.getElementById('preview-cliente').textContent = this.value || '—';
});

// ── Agregar producto ───────────────────────────────────
document.getElementById('btn-agregar')?.addEventListener('click', function () {
    const inputProd   = document.getElementById('input-producto');
    const inputCant   = document.getElementById('input-cantidad-agregar');
    const inputVal    = inputProd.value.trim();
    const listaActiva = document.querySelector('[name="lista_precios"]')?.value || '';

    if (!listaActiva || !MAPA_LISTA[listaActiva]) {
        inputProd.style.borderColor = '#f59e0b';
        inputProd.placeholder = '— Primero elegí una lista de precios —';
        return;
    }

    const producto = buscarProductoSeleccionado(inputVal);

    if (!producto) {
        inputProd.style.borderColor = '#dc2626';
        return;
    }
    inputProd.style.borderColor = '';

    const id     = parseInt(producto.id);
    const nombre = producto.nombre;
    const precio = parseFloat(producto.precio);
    const stock  = parseInt(producto.cantidad);
    let cantidad = parseInt(inputCant.value) || 1;

    if (cantidad < 1) cantidad = 1;
    if (cantidad > stock) {
        inputCant.style.borderColor = '#f59e0b';
    }

    // Si el producto ya está, sumar cantidad
    const existente = productosEnFactura.find(p => p.id === id);
    if (existente) {
        const nuevaCant = existente.cantidad + cantidad;
        existente.cantidad = Math.min(nuevaCant, stock);
    } else {
        const globalDescuento = Math.min(100, Math.max(0, parseFloat(document.querySelector('[name="descuento"]')?.value) || 0));
        productosEnFactura.push({ id, nombre, precio, cantidad, descuento: globalDescuento });
    }

    inputCant.value  = 1;
    inputProd.value  = '';
    renderTabla();
    recalcularTotales();
});

// ── Renderizar tabla ───────────────────────────────────
function renderTabla() {
    const tbody        = document.getElementById('tbody-productos');
    const previewTbody = document.getElementById('preview-tbody');

    tbody.innerHTML        = '';
    previewTbody.innerHTML = '';

    if (productosEnFactura.length === 0) {
        tbody.innerHTML = `<tr id="fila-vacia">
            <td colspan="6" class="fm-tabla-vacia">Todavía no agregaste productos</td>
        </tr>`;
        return;
    }

    productosEnFactura.forEach((p, index) => {
        const subtotal = p.precio * (1 - (p.descuento || 0) / 100) * p.cantidad;
        const stockMax = parseInt(PRODUCTOS_DB.find(db => parseInt(db.id) === p.id)?.cantidad ?? 9999);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.nombre}</td>
            <td>
                <input type="number" value="${p.cantidad}" min="1"
                    style="width:60px; padding:4px 6px;"
                    onchange="cambiarCantidad(${index}, this.value)">
            </td>
            <td>${stockMax}</td>
            <td>${formatoPeso(p.precio)}${p.precioFijado ? ' <span title="Precio del presupuesto (bloqueado)" style="font-size:.7rem;opacity:.5;cursor:default"></span>' : ''}</td>
            <td>
                <input type="number" value="${p.descuento || 0}" min="0" max="100"
                    style="width:60px; padding:4px 6px;"
                    onchange="cambiarDescuento(${index}, this.value)">
            </td>
            <td>${formatoPeso(subtotal)}</td>
            <td>
                <button type="button" class="fm-btn-eliminar"
                        onclick="eliminarProducto(${index})">×</button>
            </td>
        `;
        tbody.appendChild(tr);

        // Fila en preview
        const trPrev = document.createElement('tr');
        trPrev.innerHTML = `
            <td>${p.nombre}</td>
            <td>${p.cantidad}</td>
            <td>${formatoPeso(subtotal)}</td>
        `;
        previewTbody.appendChild(trPrev);
    });

    actualizarJSON();
}

// ── Cambiar cantidad desde la tabla ───────────────────
function cambiarCantidad(index, valor) {
    const producto = productosEnFactura[index];
    let cant = parseInt(valor);

    if (isNaN(cant) || cant < 1) cant = 1;

    producto.cantidad = cant;
    renderTabla();        // actualiza columna Subtotal por fila
    recalcularTotales();
}

// ── Cambiar descuento desde la tabla ──────────────────
function cambiarDescuento(index, valor) {
    let desc = parseFloat(valor);
    if (isNaN(desc) || desc < 0) desc = 0;
    if (desc > 100) desc = 100;
    productosEnFactura[index].descuento = desc;

    const p = productosEnFactura[index];
    const subtotal = p.precio * (1 - desc / 100) * p.cantidad;

    const rows = document.getElementById('tbody-productos').rows;
    if (rows[index]) rows[index].cells[5].textContent = formatoPeso(subtotal);

    const previewRows = document.getElementById('preview-tbody').rows;
    if (previewRows[index]) previewRows[index].cells[2].textContent = formatoPeso(subtotal);

    recalcularTotales();
    actualizarJSON();
}

// ── Eliminar producto ──────────────────────────────────
function eliminarProducto(index) {
    productosEnFactura.splice(index, 1);
    renderTabla();
    recalcularTotales();
}

// ── Recalcular totales ─────────────────────────────────
function recalcularTotales() {
    const subtotal = productosEnFactura.reduce((acc, p) => acc + p.precio * (1 - (p.descuento || 0) / 100) * p.cantidad, 0);
    const iva      = 0;
    const total    = subtotal + iva;

    // Actualizar formulario
    document.getElementById('display-subtotal').textContent = formatoPeso(subtotal);
    document.getElementById('display-iva').textContent      = formatoPeso(iva);
    document.getElementById('display-total').textContent    = formatoPeso(total);

    // Actualizar preview
    document.getElementById('preview-subtotal').textContent = formatoPeso(subtotal);
    document.getElementById('preview-iva').textContent      = formatoPeso(iva);
    document.getElementById('preview-total').textContent    = formatoPeso(total);

    // Campos ocultos para el backend
    document.getElementById('monto-total').value = total.toFixed(2);
    document.getElementById('monto-neto').value  = subtotal.toFixed(2);
    document.getElementById('monto-iva').value   = iva.toFixed(2);

    // Habilitar botón solo si hay productos
    document.getElementById('btn-emitir').disabled = productosEnFactura.length === 0;
}

// ── Validar formulario antes de enviar ─────────────────
document.getElementById('form-factura')?.addEventListener('submit', function (e) {
    if (!document.getElementById('hidden-id-cliente').value) {
        e.preventDefault();
        alert('Por favor, seleccioná un cliente.');
        document.getElementById('input-cliente').focus();
        return;
    }
});


// ── Guardar productos en JSON para el backend ──────────
function actualizarJSON() {
    document.getElementById('productos-json').value = JSON.stringify(productosEnFactura);
}


// ── Descuento global ───────────────────────────────────
document.querySelector('[name="descuento"]')?.addEventListener('input', function () {
    const val = Math.min(100, Math.max(0, parseFloat(this.value) || 0));
    productosEnFactura.forEach(p => p.descuento = val);
    renderTabla();
    recalcularTotales();
});

// ── Autocompletar datos del cliente ───────────────────
document.getElementById('input-cliente')?.addEventListener('input', function () {
    const inputVal = this.value.trim();

    if (!inputVal) {
        clienteSeleccionadoActual = null;
        document.getElementById('hidden-id-cliente').value = '';
        document.getElementById('display-tipo-id').value   = '';
        document.getElementById('display-nro-id').value    = '';
        document.getElementById('display-cond-iva').value  = '';
        document.getElementById('campo-sucursal').style.display = 'none';
        document.getElementById('preview-cliente').textContent  = '—';
        document.getElementById('preview-doc').textContent      = '—';
        document.getElementById('nombre-cliente').value         = '';
        mostrarErrorDoc('');
        const selectLista = document.querySelector('[name="lista_precios"]');
        if (selectLista) {
            selectLista.value = '';
            actualizarPreciosPorLista('');
        }
        const textarea = document.querySelector('[name="observacion"]');
        if (textarea) textarea.value = '';
        const vtoReset = document.querySelector('[name="vencimiento"]');
        if (vtoReset) vtoReset.value = '';
        return;
    }

    const cliente = CLIENTES_DB.find(c =>
        c.nombre_cliente + ' (' + c.tipo_id + ': ' + c.nro_id + ')' === inputVal
    );
    if (!cliente) return;
    clienteSeleccionadoActual = cliente;

    const selectVendedor = document.getElementById('select-vendedor');
    if (selectVendedor) {
        selectVendedor.value = cliente.vendedor_cl || '';
        filtrarClientesPorVendedor(cliente.vendedor_cl || '');
    }

    document.getElementById('hidden-id-cliente').value = cliente.id;

    const tipoId         = cliente.tipo_id;
    const nroId          = cliente.nro_id;
    const condIva        = cliente.cond_iva;
    const sucursales     = cliente.sucursales;
    const nombreSucursal = cliente.nombre_sucursal;
    const listaPrecios   = cliente.lista_precios;
    const observacion    = cliente.observacion;

    document.getElementById('display-tipo-id').value  = tipoId;
    document.getElementById('display-nro-id').value   = nroId;
    document.getElementById('display-cond-iva').value = condIva;

    const campSuc = document.getElementById('campo-sucursal');
    if ((sucursales === 'true' || sucursales === '1') && nombreSucursal) {
        campSuc.style.display = 'block';
        document.getElementById('display-sucursal').value = nombreSucursal;
    } else {
        campSuc.style.display = 'none';
    }

    if (!validarDocumento(tipoId, nroId)) {
        const digitos = tipoId === 'CUIT' || tipoId === 'CUIL' ? '11' : '7 u 8';
        mostrarErrorDoc(`${tipoId} inválido — debe tener ${digitos} dígitos. Actualizá el cliente antes de emitir.`);
    } else {
        mostrarErrorDoc('');
    }

    document.getElementById('nro-doc').value  = nroId;
    document.getElementById('tipo-doc').value = tipoId === 'CUIT' ? '80' : '96';

    configurarModoRemito();

    const selectLista = document.querySelector('[name="lista_precios"]');
    if (selectLista) {
        selectLista.value = listaPrecios || '';
        actualizarPreciosPorLista(listaPrecios || '');
    }
    const textarea = document.querySelector('[name="observacion"]');
    if (textarea) textarea.value = observacion || '';

    // Vencimiento del cobro automático según el plazo acordado del cliente (días)
    setVencimientoPorCliente(cliente);

    recalcularTotales();
});

document.querySelector('[name="fecha"]')?.addEventListener('change', function () {
    if (clienteSeleccionadoActual) setVencimientoPorCliente(clienteSeleccionadoActual);
});


// ── Filtrado de clientes por vendedor ─────────────────
function normalizarVendedor(valor) {
    return String(valor || '')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('es-AR');
}

function vendedorTieneClientes(vendedor) {
    const key = normalizarVendedor(vendedor);
    return key !== '' && CLIENTES_DB.some(c => normalizarVendedor(c.vendedor_cl) === key);
}

function filtrarClientesPorVendedor(vendedor) {
    const datalist = document.getElementById('lista-clientes');
    datalist.innerHTML = '';
    const debeFiltrar = vendedorTieneClientes(vendedor);
    const vendedorKey = normalizarVendedor(vendedor);
    const filtrados = debeFiltrar
        ? CLIENTES_DB.filter(c => normalizarVendedor(c.vendedor_cl) === vendedorKey)
        : CLIENTES_DB;
    filtrados.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.nombre_cliente + ' (' + c.tipo_id + ': ' + c.nro_id + ')';
        datalist.appendChild(opt);
    });
}

document.getElementById('select-vendedor')?.addEventListener('change', function () {
    filtrarClientesPorVendedor(this.value);

    const inputCliente = document.getElementById('input-cliente');
    if (inputCliente.value && this.value && vendedorTieneClientes(this.value)) {
        const clienteActual = CLIENTES_DB.find(c =>
            c.nombre_cliente + ' (' + c.tipo_id + ': ' + c.nro_id + ')' === inputCliente.value
        );
        if (clienteActual && normalizarVendedor(clienteActual.vendedor_cl) !== normalizarVendedor(this.value)) {
            inputCliente.value = '';
            inputCliente.dispatchEvent(new Event('input'));
        }
    }
});

// ── Lista de precios → actualizar precios de productos ────
document.querySelector('[name="id_operador"]')?.addEventListener('change', function () {
    const selected = this.options[this.selectedIndex];
    const operadorNombre = document.getElementById('operador-nombre');
    if (operadorNombre) operadorNombre.value = selected?.dataset?.operadorNombre || '';
});

const _selectLista = document.querySelector('[name="lista_precios"]');
_selectLista?.addEventListener('change', function () {
    actualizarPreciosPorLista(this.value);
});

// ── Secciones colapsables ─────────────────────────────────
document.querySelectorAll('.fm-collapsible').forEach(titulo => {
    titulo.addEventListener('click', function () {
        const body = this.nextElementSibling;
        if (!body || !body.classList.contains('fm-section-body')) return;
        const ahora = body.classList.toggle('fm-collapsed');
        this.classList.toggle('fm-collapsed', ahora);
    });
});
