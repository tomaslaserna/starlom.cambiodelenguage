<?php
$PERMITIDOS = ['Empleado_2', 'Jefe', 'Jefe1', 'Admin'];
require __DIR__ . '/partials/guard.php';

include '../php/conexion_starlim_be.php';


// Traer productos con stock DISPONIBLE (real menos reservado por pedidos sin
// entregar); el precio se asigna dinámicamente por lista en el frontend
$productos = [];
$res = $conexion->query("SELECT id, nombre, 0 AS precio, disponible AS cantidad FROM vista_stock_disponible ORDER BY nombre ASC");
while ($p = $res->fetch_assoc()) {
    $productos[] = $p;
}

// Precios calculados desde vista_precios (costo × margen por categoría)
// Indexados por nombre de producto para que el JS los encuentre igual que antes
$listas_precios = [];
$res4 = $conexion->query("SELECT id, nombre,
            precio_0,
            precio_1,
            precio_2,
            precio_3,
            precio_3         AS precio_4,           -- sin lista 4 definida, usa lista 3
            precio_minorista,
            precio_minorista AS precio_minorista_r   -- REV = minorista por defecto
     FROM vista_precios
     WHERE precio_1 IS NOT NULL"
);
while ($l = $res4->fetch_assoc()) {
    $listas_precios[(string)$l['id']] = $l;
    $listas_precios[$l['nombre']] = $l;
}

// Traer clientes
$clientes = [];
$res2 = $conexion->query("SELECT id, nombre_cliente, codigo_cliente, tipo_id, nro_id, cond_iva, sucursales, nombre_sucursal, lista_precios, observacion, cbu, vendedor_cl FROM clientes WHERE estado = 'Activo' ORDER BY nombre_cliente ASC");
while ($c = $res2->fetch_assoc()) {
    $clientes[] = $c;
}

// Plazo de pago por cliente (columna nueva). Consulta separada y tolerante: si la
// migración (db_fixes.sql) aún no corrió, cargar pedido sigue funcionando sin autocompletar.
$plazos_cliente = [];
try {
    $rpl = $conexion->query("SELECT id, plazo_pago_dias FROM clientes");
    if ($rpl) while ($row = $rpl->fetch_assoc()) $plazos_cliente[(int)$row['id']] = (int)$row['plazo_pago_dias'];
} catch (Throwable $e) {
    $plazos_cliente = [];
}
foreach ($clientes as &$c) $c['plazo_pago_dias'] = $plazos_cliente[(int)$c['id']] ?? 0;
unset($c);

// Traer vendedores
$vendedores = [];
$res3 = $conexion->query("SELECT id, nombre, apellido FROM operadores ORDER BY nombre ASC");
while ($v = $res3->fetch_assoc()) {
    $vendedores[] = $v;
}
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cargar Pedido — Star Lim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <link rel="stylesheet" href="../css/panel_ventas.css">
    <link rel="stylesheet" href="../css/factura_manual.css?v=5">
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>

<?php $NAV_ACTIVA = 'ventas'; include __DIR__ . '/partials/nav.php'; ?>

<div class="dash-main">
<div class="ventas-layout">

<?php $VENTAS_ACTIVA = 'cargar'; include __DIR__ . '/partials/ventas_sidebar.php'; ?>

<div class="ventas-content">
<main class="fm-layout">

    <!-- ── Columna izquierda: formulario ── -->
    <section class="fm-form-col">
        <div class="fm-header">
            <a href="ventas.php" class="fm-back">← Volver</a>
            <h1 class="fm-titulo">Nuevo pedido</h1>
        </div>

        <form id="form-factura" action="../php/emitir_factura_manual.php" method="post">

            <!-- Comprobante deseado (preferencia: la factura se emite después de la entrega) -->
            <div class="fm-section">
                <h2 class="fm-section-title">Comprobante deseado</h2>
                <p style="font-size:.8rem;opacity:.65;margin:0 0 10px;">El pedido entra a depósito y la factura (si corresponde) se emite desde Ventas una vez entregado.</p>
                <div class="fm-tipo-grupo">
                    <label class="fm-tipo-opcion">
                        <input type="radio" name="tipo_cliente" value="sin_factura" id="radio-sf">
                        <span>Solo remito<br><small>Sin factura</small></span>
                    </label>
                    <label class="fm-tipo-opcion" style="flex:2">
                        <select name="tipo_comprobante" id="select-tipo-comprobante">
                            <option value="" selected>— Elija un tipo de comprobante —</option>
                            <option value="factura_a">Factura A</option>
                            <option value="factura_b">Factura B</option>
                        </select>
                    </label>
                </div>
            </div>

            <div class="fm-section" id="seccion-datos-fecha">
                <h2 class="fm-section-title fm-collapsible fm-collapsed">Datos de venta <span class="fm-chevron">▼</span></h2>
                <div class="fm-section-body fm-collapsed">

                <div class="fm-campo">
                    <label>Fecha *</label>
                    <input type="date" name="fecha" id="" value="<?php echo (new DateTime('now', new DateTimeZone('America/Argentina/Buenos_Aires')))->format('Y-m-d'); ?>">
                </div>
                <div class="fm-campo">
                    <label>Vencimiento del cobro</label>
                    <input type="datetime-local" name="vencimiento" id="">
                </div>
                <div class="fm-campo">
                    <label>Vendedor</label>
                    <select name="vendedor_cl" id="select-vendedor">
                        <option value="" selected>— Sin asignar —</option>
                        <?php
                        $vendedoresVistos = [];
                        foreach ($clientes as $c):
                            if (empty($c['vendedor_cl']) || in_array($c['vendedor_cl'], $vendedoresVistos)) continue;
                            $vendedoresVistos[] = $c['vendedor_cl'];
                        ?>
                            <option value="<?php echo htmlspecialchars($c['vendedor_cl'], ENT_QUOTES); ?>">
                                <?php echo htmlspecialchars($c['vendedor_cl']); ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="fm-campo">
                    <label>Operador</label>
                    <select name="id_operador">
                        <option value="" selected>— Sin asignar —</option>
                        <?php foreach ($vendedores as $v): ?>
                            <option value="<?php echo $v['id']; ?>">
                                <?php echo htmlspecialchars($v['nombre'] . ' ' . $v['apellido']); ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="fm-campo">
                    <label>Punto de venta *</label>
                    <select name="punto_de_venta">
                        <option value="1">00001 - Default</option>
                    </select>
                </div>
                <div class="fm-campo">
                    <label>Lista precios *</label>
                    <select name="lista_precios">
                        <option value="" selected>--Seleccione una lista de precio--</option>
                        <option value="rev">REV</option>
                        <option value="0">0</option>
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                        <option value="nueva">-Nueva-</option>
                    </select>
                </div>
                <div class="fm-campo">
                    <label>Descuento (El numero se aplicará de manera automatica a todos los productos)</label>
                    <input type="number" name="descuento" value="0">
                </div>

                </div><!-- /fm-section-body -->
            </div>

            <!-- Datos del cliente -->
            <div class="fm-section" id="seccion-datos-cliente">
                <h2 class="fm-section-title fm-collapsible fm-collapsed">Datos del cliente <span class="fm-chevron">▼</span></h2>
                <div class="fm-section-body fm-collapsed">

                <div class="fm-campo">
                    <label>Cliente *</label>
                    <input type="text" id="input-cliente" list="lista-clientes"
                           autocomplete="off" placeholder="— Escribí para buscar —">
                    <datalist id="lista-clientes">
                        <?php foreach ($clientes as $c): ?>
                            <option value="<?php echo htmlspecialchars($c['nombre_cliente'], ENT_QUOTES); ?> (<?php echo htmlspecialchars($c['tipo_id'], ENT_QUOTES); ?>: <?php echo htmlspecialchars($c['nro_id'], ENT_QUOTES); ?>)">
                        <?php endforeach; ?>
                    </datalist>
                    <input type="hidden" name="id_cliente" id="hidden-id-cliente">
                </div>

                <!-- Datos autocompletados (solo lectura) -->
                <div class="fm-campo-fila">
                    <div class="fm-campo">
                        <label>Tipo documento</label>
                        <input type="text" id="display-tipo-id" readonly placeholder="—">
                    </div>
                    <div class="fm-campo">
                        <label>Nro. documento</label>
                        <input type="text" id="display-nro-id" readonly placeholder="—">
                    </div>
                </div>

                <div class="fm-campo">
                    <label>Condición IVA</label>
                    <input type="text" id="display-cond-iva" readonly placeholder="—">
                </div>

                <div class="fm-campo" id="campo-sucursal" style="display:none">
                    <label>Sucursal</label>
                    <input type="text" id="display-sucursal" readonly placeholder="—">
                </div>

                

                <div class="fm-campo">
                    <label>Condición de pago *</label>
                    <input list="lista-cond-pago" type="text" name="condicion_pago">
                    <datalist id="lista-cond-pago">
                        <option value="Cuenta corriente">
                        <option value="Contado">
                        <option value="Tarjeta de débito">
                        <option value="Tarjeta de crédito">
                        <option value="Cheque">
                        <option value="Ticket">
                    </datalist>
                </div>


                <!-- Campos ocultos -->
                <input type="hidden" name="tipo_cbte"          id="tipo-cbte"          value="6">
                <input type="hidden" name="tipo_doc"            id="tipo-doc"           value="96">
                <input type="hidden" name="tipo_cliente_hidden" id="tipo-cliente-hidden" value="consumidor_final">
                <input type="hidden" name="nro_doc"             id="nro-doc"            value="">
                <input type="hidden" name="nombre_cliente"      id="nombre-cliente"     value="">

                </div><!-- /fm-section-body -->
            </div>


            <div class="fm-section" id="seccion-datos-extra">
                <h2 class="fm-section-title fm-collapsible fm-collapsed">Extra <span class="fm-chevron">▼</span></h2>
                <div class="fm-section-body fm-collapsed">

                <div class="fm-campo">
                    <label>Depósito *</label>
                    <input list="lista-deposito" type="text" name="deposito" value="Depósito Universal">

                    <datalist id="lista-deposito">
                        <option value="Depósito Universal">
                        <option value="-Nuevo-"> 
                    </datalist>
                </div>
                <div class="fm-campo">
                    <label>Moneda *</label>
                    <select name="moneda">
                        <option value="pesos_argentinos" selected>Pesos Argentinos</option>
                        <option value="euros">Euros</option>
                        <option value="dolares_estadounidenses">Dólares Estadounidenses</option>
                        <option value="agregar_otra_moneda">-Agregar otra moneda-</option>
                    </select>
                </div>
                <div class="fm-campo">
                    <label>Provincia Destino</label>
                    <input list="lista-provincia" type="text" name="provincia" value="Córdoba">

                    <datalist id="lista-provincia">
                        <option value="Córdoba" selected>
                        <option value="-Nueva-"> 
                    </datalist>
                </div>
                
                <div class="fm-campo">
                    <label>Observación del pedido</label>
                    <textarea name="observacion" rows="3"
                            placeholder="Ej: el cliente tiene apuro, pide mercadería de primera calidad..."></textarea>
                </div>

                </div><!-- /fm-section-body -->
            </div>

        <!-- Agregar productos -->
        <div class="fm-section">
            <h2 class="fm-section-title">Productos</h2>

            <div class="fm-agregar-producto">
                <input type="text" id="input-producto" list="lista-productos"
                       autocomplete="off" placeholder="— Escribí para buscar —">
                <datalist id="lista-productos">
                    <!-- opciones generadas dinámicamente por JS según lista seleccionada -->
                </datalist>
                <input type="number" id="input-cantidad-agregar" value="1" min="1" placeholder="Cant.">
                <button type="button" id="btn-agregar" class="fm-btn-agregar">+ Agregar</button>
            </div>

            <!-- Tabla de productos agregados -->
            <table class="fm-tabla" id="tabla-productos">
                <thead>
                    <tr>
                        <th>Producto</th>
                        <th>Cant.</th>
                        <th>Cant. MAX</th>
                        <th>Precio unit.</th>
                        <th>Desc. %</th>
                        <th>Subtotal</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody id="tbody-productos">
                    <tr id="fila-vacia">
                        <td colspan="6" class="fm-tabla-vacia">
                            Todavía no agregaste productos
                        </td>
                    </tr>
                </tbody>
            </table>

            <!-- Campo oculto con los productos en JSON -->
            <input type="hidden" name="productos_json" id="productos-json">
        </div>

        <!-- Totales -->
        <div class="fm-section fm-totales">
            <div class="fm-total-fila">
                <span>Subtotal neto</span>
                <span id="display-subtotal">$0,00</span>
            </div>
            <div class="fm-total-fila" id="fila-iva">
                <span>IVA 21%</span>
                <span id="display-iva">$0,00</span>
            </div>
            <div class="fm-total-fila fm-total-final">
                <span>Total</span>
                <span id="display-total">$0,00</span>
            </div>
            <input type="hidden" name="monto_total" id="monto-total" value="0">
            <input type="hidden" name="monto_neto" id="monto-neto" value="0">
            <input type="hidden" name="monto_iva" id="monto-iva" value="0">
        </div>

        <button type="submit" class="fm-btn-emitir" id="btn-emitir" disabled>
            Cargar pedido
        </button>

    </form>
</section>

<!-- ── Columna derecha: preview ── -->
<aside class="fm-preview-col">
    <div class="fm-preview-header">
        <h2>Vista previa</h2>
        <span id="preview-tipo-cbte" class="fm-badge">Factura B</span>
    </div>
    <div class="fm-preview-body">
        <div class="fm-preview-empresa">
            <strong>Star Lim</strong>
            <span>CUIT: 20-46656757-5</span>
            <span>Punto de venta: 0001</span>
        </div>
        <div class="fm-preview-cliente">
            <p><strong>Cliente:</strong> <span id="preview-cliente">—</span></p>
            <p><strong>DNI/CUIT:</strong> <span id="preview-doc">—</span></p>
        </div>
        <table class="fm-tabla fm-preview-tabla">
            <thead>
                <tr>
                    <th>Producto</th>
                    <th>Cant.</th>
                    <th>Subtotal</th>
                </tr>
            </thead>
            <tbody id="preview-tbody"></tbody>
        </table>
        <div class="fm-preview-totales">
            <div class="fm-total-fila">
                <span>Subtotal neto</span>
                <span id="preview-subtotal">$0,00</span>
            </div>
            <div class="fm-total-fila" id="preview-fila-iva">
                <span>IVA 21%</span>
                <span id="preview-iva">$0,00</span>
            </div>
            <div class="fm-total-fila fm-total-final">
                <span>Total</span>
                <span id="preview-total">$0,00</span>
            </div>
        </div>
    </div>
</aside>

</main>

<!-- Datos para JS -->
<script>
    const PRODUCTOS_DB      = <?php echo json_encode($productos); ?>;
    const CLIENTES_DB       = <?php echo json_encode($clientes); ?>;
    const LISTAS_PRECIOS_DB = <?php echo json_encode($listas_precios); ?>;
</script>
<script src="../js/global.js"></script>
<script src="../js/factura_manual.js?v=14"></script>
<?php
// Pre-llenado desde presupuesto
$presupuesto_id = intval($_GET['presupuesto_id'] ?? 0);
if ($presupuesto_id > 0):
    $prp_res  = $conexion->query("SELECT * FROM presupuestos WHERE id = $presupuesto_id LIMIT 1");
    $prp_data = $prp_res->fetch_assoc();
    if ($prp_data):
        $prp_data['productos'] = json_decode($prp_data['productos_json'], true) ?: [];
        unset($prp_data['productos_json']);
?>
<script>
(function() {
    const PRP = <?= json_encode($prp_data, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP) ?>;

    // Mostrar banner informativo
    const banner = document.createElement('div');
    banner.style.cssText = 'background:#7c3aed;color:#fff;padding:10px 20px;font-size:.85rem;font-weight:600;display:flex;align-items:center;gap:12px;';
    banner.innerHTML = 'Precios tomados del presupuesto #' + PRP.id
        + ' — ' + (PRP.cliente_nombre || 'Sin cliente')
        + ' — Los precios están bloqueados al valor de emisión.'
        + '<a href="../php/ver_presupuesto_pdf.php?id=' + PRP.id + '" target="_blank" style="color:#fff;opacity:.8;font-size:.78rem;margin-left:auto;white-space:nowrap;">Ver PDF original ↗</a>';
    document.querySelector('.dash-main')?.prepend(banner);

    // Intentar seleccionar el cliente por CUIT
    const cuit = (PRP.cliente_cuit || '').replace(/[^0-9]/g, '');
    if (cuit) {
        const cli = CLIENTES_DB.find(c => c.nro_id.replace(/[^0-9]/g, '') === cuit);
        if (cli) {
            const inp = document.getElementById('input-cliente');
            if (inp) {
                inp.value = cli.nombre_cliente + ' (' + cli.tipo_id + ': ' + cli.nro_id + ')';
                inp.dispatchEvent(new Event('input'));
            }
        }
    }

    // Cargar productos con precios del presupuesto (bloqueados)
    const descPct = parseFloat(PRP.descuento_pct) || 0;
    (PRP.productos || []).forEach(function(p) {
        const dbProd = PRODUCTOS_DB.find(function(db) { return db.nombre === p.nombre; });
        productosEnFactura.push({
            id:          dbProd ? parseInt(dbProd.id) : 0,
            nombre:      p.nombre,
            precio:      parseFloat(p._pu_net  ?? p.precio_unit ?? 0),
            cantidad:    parseFloat(p._qty     ?? p.cantidad    ?? 1),
            descuento:   descPct,
            precioFijado: true,
        });
    });

    renderTabla();
    recalcularTotales();

    // Marcar descuento global en el campo visible
    const descInput = document.querySelector('[name="descuento"]');
    if (descInput) descInput.value = descPct;
})();
</script>
<?php endif; endif; ?>
</div><!-- /ventas-content -->
</div><!-- /ventas-layout -->
</div><!-- /dash-main -->
</body>
</html>

<!--   -->
