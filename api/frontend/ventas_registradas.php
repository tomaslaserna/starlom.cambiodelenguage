<?php
$PERMITIDOS = ['Empleado_2', 'Jefe', 'Jefe1', 'Admin'];
require __DIR__ . '/partials/guard.php';

include '../php/conexion_starlim_be.php';
$empresaId = starlim_bootstrap_tenant_context($conexion);


// Traer productos
$productos = [];
$res = $conexion->query("SELECT id, nombre, costo AS precio, stock AS cantidad FROM productos WHERE empresa_id = $empresaId AND stock > 0 ORDER BY nombre ASC");
while ($p = $res->fetch_assoc()) {
    $productos[] = $p;
}

// Traer clientes
$clientes = [];
$res2 = $conexion->query("SELECT id, nombre_cliente, codigo_cliente, tipo_id, nro_id, cond_iva, sucursales, nombre_sucursal, lista_precios, observacion FROM clientes WHERE empresa_id = $empresaId AND estado = 'Activo' ORDER BY nombre_cliente ASC");
while ($c = $res2->fetch_assoc()) {
    $clientes[] = $c;
}

// Traer vendedores
$vendedores = [];
$res3 = $conexion->query("SELECT id, nombre, apellido FROM operadores WHERE empresa_id = $empresaId ORDER BY nombre ASC");
while ($v = $res3->fetch_assoc()) {
    $vendedores[] = $v;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ventas Registradas — Starlim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <link rel="stylesheet" href="../css/panel_ventas.css">
    <link rel="stylesheet" href="../css/ventas_registradas.css?v=14">
    <?php if (in_array($rango, ['Jefe1', 'Admin'], true)): ?>
    <link rel="stylesheet" href="../css/ventas_admin.css?v=1">
    <?php endif; ?>
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>

<?php $NAV_ACTIVA = 'ventas'; include __DIR__ . '/partials/nav.php'; ?>

<main class="dash-main">
<div class="ventas-layout">

<?php $VENTAS_ACTIVA = 'registradas'; include __DIR__ . '/partials/ventas_sidebar.php'; ?>

<div class="ventas-content">

    <?php if (in_array($rango, ['Jefe', 'Jefe1', 'Admin'])): ?>
    <div class="resumen-global" id="resumen-global">
        <div class="rg-header">
            <div class="resumen-global-title">Resumen</div>
            <div class="rg-periodo-wrap">
                <label class="rg-periodo-label">Ver</label>
                <select id="rg-periodo-select" class="rg-periodo-select">
                    <option value="mes"   selected>Este mes</option>
                    <option value="anio">Este año</option>
                    <option value="todos">Travesía</option>
                </select>
            </div>
        </div>
        <div class="resumen-item">
            <span class="resumen-label">Facturas</span>
            <span class="resumen-valor" id="rg-facturas-val">—</span>
        </div>
        <div class="resumen-item">
            <span class="resumen-label">Facturadas</span>
            <span class="resumen-valor" id="rg-facturadas-val">—</span>
        </div>
        <div class="resumen-item">
            <span class="resumen-label">No Facturadas</span>
            <span class="resumen-valor" id="rg-nofacturadas-val">—</span>
        </div>
        <div class="resumen-item">
            <span class="resumen-label">Total facturado</span>
            <span class="resumen-valor" id="rg-total-val">—</span>
        </div>
        <div class="resumen-item resumen-pendiente">
            <span class="resumen-label">Pendiente</span>
            <span class="resumen-valor" id="rg-pendiente-val">—</span>
        </div>
        <div class="resumen-item resumen-vencido" id="rg-vencido-item" hidden>
            <span class="resumen-label">Vencido</span>
            <span class="resumen-valor" id="rg-vencido-val">—</span>
        </div>
    </div>
    <?php endif; ?>

    <div class="filtros_facturas" id="filtros-facturas">
        <div class="filtros-header">
            <h4>FILTROS DEL REGISTRO</h4>
            <button class="filtros-toggle-btn" id="filtros-toggle">Mostrar filtros ▼</button>
        </div>
        <div class="filtros-body" id="filtros-body">
        <div class="campo">
            <label>Cliente</label>
            <input type="text" id="input-cliente" list="lista-clientes"
                    autocomplete="off" placeholder="— Escribí para buscar —">
            <datalist id="lista-clientes">
                <?php foreach ($clientes as $c): ?>
                    <option value="<?php echo htmlspecialchars($c['nombre_cliente'], ENT_QUOTES); ?> (<?php echo htmlspecialchars($c['tipo_id'], ENT_QUOTES); ?>: <?php echo htmlspecialchars($c['nro_id'], ENT_QUOTES); ?>)">
                <?php endforeach; ?>
            </datalist>
            <input type="hidden" name="id_cliente" id="hidden-id-cliente">
        </div>
        <div class="campo-fila">
            <div class="campo">
                <label>Número de<br>factura</label>
                <input type="text" id="filtro-nro-factura" placeholder="Ej. 00000001">
            </div>
            <div class="campo">
                <label>Tipo de<br>documento</label>
                <select id="filtro-tipo-factura" autocomplete="off">
                    <option value="">--Seleccionar--</option>
                    <option value="all" selected>Todos</option>
                    <option value="remito">Remito</option>
                    <option value="a">A</option>
                    <option value="b">B</option>
                    <option value="nc">Nota de credito</option>
                    <option value="nd">Nota de debito</option>
                </select>
            </div>
            <div class="campo">
                <label>Día de<br>facturación</label>
                <input type="text" id="filtro-dia-factura" placeholder="dd">
            </div>
            <div class="campo">
                <label>Mes de<br>facturación</label>
                <input type="text" id="filtro-mes-factura" placeholder="mm">
            </div>
            <div class="campo">
                <label>Año de<br>facturación</label>
                <input type="text" id="filtro-anio-factura" placeholder="aaaa">
            </div>
            <div class="campo">
                <label>Lista de<br>precios</label>
                <select id="filtro-lista-precios">
                    <option value="" selected>--Seleccionar--</option>
                    <option value="all">Todos</option>
                    <option value="rev">REV</option>
                    <option value="1">Lista 1</option>
                    <option value="2">Lista 2</option>
                    <option value="3">Lista 3</option>
                    <option value="4">Lista 4</option>
                </select>
            </div>
            <div class="campo">
                <label>Divisor de<br>facturas</label>
                <select id="filtro-divisor">
                    <option value="mes" selected>Mes</option>
                    <option value="anio">Año</option>
                </select>
            </div>
        </div>
        </div><!-- /filtros-body -->
    </div>
    <div class="tabla_registro">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <h3>Registro</h3>
        </div>
        <div class="tabla-div-labels">
            <p class="tabla-div-label">Facturas de: <strong id="span-nombre-cliente-tabla">—</strong></p>
            <p class="tabla-div-label">Dividir facturas por: <strong id="divisor-label">mes</strong></p>
        </div>

        <table class="tabla">
            <thead>
                <tr>
                    <th></th>
                    <th>ID</th>
                    <th>Nro. Factura</th>
                    <th>Cliente</th>
                    <th>Tipo</th>
                    <th>Fecha</th>
                    <th class="col-financiero">Total</th>
                    <th>Comprobantes</th>
                </tr>
            </thead>
            <tbody id="tbody-facturas">
                <tr>
                    <td colspan="8" class="tabla-vacia">Seleccioná un cliente o usá los filtros para buscar</td>
                </tr>
            </tbody>
        </table>
        <div id="paginacion-facturas"></div>
        <div id="resumen-facturas" hidden></div>
        <input type="hidden" name="id_factura_referencia" id="id-factura-referencia">
    </div>

    <script>
        const RANGO_ACTUAL  = '<?= htmlspecialchars($rango, ENT_QUOTES) ?>';
        const CLIENTES_DATA = <?= json_encode($clientes, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE) ?>;
    </script>
    <script src="../js/global.js"></script>
    <script src="../js/Ventas_registradas.js?v=22"></script>
    <script src="../js/ventas_comprobantes.js?v=2"></script>
    <?php if (in_array($rango, ['Jefe1', 'Admin'], true)): ?>
    <script src="../js/ventas_admin_mode.js?v=1"></script>
    <?php endif; ?>
</div><!-- /ventas-content -->
</div><!-- /ventas-layout -->
</main>
</body>
</html>
