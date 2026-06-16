<?php
/**
 * presupuestar.php — Armar presupuestos (Ventas › Presupuestos › Nuevo).
 * Dos modos: rápido (WhatsApp, efímero) y formal (PDF + registro con vigencia).
 */
$PERMITIDOS = ['Empleado_2', 'Jefe', 'Jefe1', 'Admin'];
require __DIR__ . '/partials/guard.php';
include '../php/conexion_starlim_be.php';

// Productos con disponible (precio se asigna por lista en el front)
$productos = [];
$res = $conexion->query("SELECT id, nombre, 0 AS precio, disponible AS cantidad FROM vista_stock_disponible ORDER BY nombre ASC");
while ($p = $res->fetch_assoc()) $productos[] = $p;

// Precios por lista (indexados por nombre)
$listas_precios = [];
$res4 = $conexion->query("SELECT id, nombre, precio_0, precio_1, precio_2, precio_3,
        precio_3 AS precio_4, precio_minorista, precio_minorista AS precio_minorista_r
     FROM vista_precios WHERE precio_1 IS NOT NULL");
while ($l = $res4->fetch_assoc()) {
    $listas_precios[(string)$l['id']] = $l;
    $listas_precios[$l['nombre']] = $l;
}

// Clientes activos con datos para autocompletar
$clientes = [];
$res2 = $conexion->query("SELECT nombre_cliente, razon_social, tipo_id, nro_id, cond_iva,
        COALESCE(telefono,'') AS telefono, COALESCE(domicilio,'') AS domicilio,
        COALESCE(lista_precios,'') AS lista_precios, COALESCE(vendedor_cl,'') AS vendedor_cl
     FROM clientes WHERE estado = 'Activo' ORDER BY nombre_cliente ASC");
while ($c = $res2->fetch_assoc()) $clientes[] = $c;
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nuevo presupuesto — Star Lim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <link rel="stylesheet" href="../css/panel_ventas.css">
    <link rel="stylesheet" href="../css/factura_manual.css?v=5">
    <style>
        .pp-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .pp-field { display:flex; flex-direction:column; gap:3px; margin-bottom:10px; }
        .pp-field.full { grid-column:1 / -1; }
        .pp-field label { font-size:11px; text-transform:uppercase; letter-spacing:.04em; opacity:.6; }
        .pp-field input, .pp-field select { padding:8px 10px; border:1.5px solid #d1d5db; border-radius:8px; font-size:13.5px; font-family:inherit; background:#fff; color:#101828; }
        .dark-mode .pp-field input, .dark-mode .pp-field select { background:#0c1322; border-color:rgba(255,255,255,.15); color:#e4e7ec; }
        .pp-add { display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap; margin:6px 0 12px; }
        .pp-table { width:100%; border-collapse:collapse; font-size:13px; }
        .pp-table th { text-align:left; padding:7px 8px; font-size:11px; text-transform:uppercase; opacity:.6; border-bottom:2px solid rgba(128,128,128,.2); }
        .pp-table td { padding:6px 8px; border-bottom:1px solid rgba(128,128,128,.12); }
        .pp-table input { width:64px; padding:4px 6px; border:1.5px solid #d1d5db; border-radius:6px; font-family:inherit; background:#fff; color:#101828; }
        .dark-mode .pp-table input { background:#0c1322; border-color:rgba(255,255,255,.15); color:#e4e7ec; }
        .pp-del { background:rgba(220,38,38,.1); color:#b91c1c; border:none; border-radius:6px; padding:3px 9px; cursor:pointer; font-weight:700; }
        .pp-tot { margin-top:14px; max-width:340px; margin-left:auto; font-size:14px; }
        .pp-tot-row { display:flex; justify-content:space-between; padding:3px 0; }
        .pp-tot-final { font-weight:800; font-size:17px; border-top:2px solid rgba(128,128,128,.25); margin-top:4px; padding-top:6px; }
        .pp-acciones { display:flex; gap:10px; flex-wrap:wrap; margin-top:18px; align-items:center; }
        .pp-btn { padding:11px 18px; border:none; border-radius:10px; font-size:14px; font-weight:700; cursor:pointer; font-family:inherit; }
        .pp-btn-wa { background:#16a34a; color:#fff; } .pp-btn-wa:hover { background:#15803d; }
        .pp-btn-formal { background:#2563eb; color:#fff; } .pp-btn-formal:hover { background:#1d4ed8; }
        .pp-btn:disabled { opacity:.5; cursor:wait; }
        .pp-msg { font-size:13px; margin-top:10px; }
        .pp-vig { width:90px !important; }
    </style>
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>

<?php $NAV_ACTIVA = 'ventas'; include __DIR__ . '/partials/nav.php'; ?>

<main class="dash-main">
<div class="ventas-layout">

<?php $VENTAS_ACTIVA = 'presupuestos'; include __DIR__ . '/partials/ventas_sidebar.php'; ?>

<div class="ventas-content">
    <?php
        $SUBTABS = ['nuevo' => ['presupuestar.php', 'Nuevo presupuesto'], 'seguimiento' => ['presupuestos.php', 'Seguimiento']];
        $SUB_ACTIVA = 'nuevo';
        include __DIR__ . '/partials/sub_tabs.php';
    ?>
    <h1 class="dash-hello">Nuevo presupuesto</h1>

    <section class="dash-panel" style="margin-bottom:18px;">
        <div class="pp-grid">
            <div class="pp-field full">
                <label>Cliente</label>
                <input type="text" id="pp-cliente" list="pp-lista-clientes" autocomplete="off" placeholder="— Escribí para buscar —">
                <datalist id="pp-lista-clientes">
                    <?php foreach ($clientes as $c): ?>
                        <option value="<?= htmlspecialchars($c['nombre_cliente'] . ' (' . $c['tipo_id'] . ': ' . $c['nro_id'] . ')', ENT_QUOTES) ?>">
                    <?php endforeach; ?>
                </datalist>
            </div>
            <div class="pp-field"><label>Teléfono</label><input type="text" id="pp-telefono" placeholder="—"></div>
            <div class="pp-field"><label>Condición IVA</label><input type="text" id="pp-cond-iva" readonly placeholder="—"></div>
            <div class="pp-field">
                <label>Lista de precios</label>
                <select id="pp-lista">
                    <option value="">— Elegí una lista —</option>
                    <option value="rev">REV</option><option value="0">0</option><option value="1">1</option>
                    <option value="2">2</option><option value="3">3</option><option value="4">4</option>
                </select>
            </div>
            <div class="pp-field"><label>Descuento global (%)</label><input type="number" id="pp-descuento" value="0" min="0" max="100"></div>
        </div>
    </section>

    <section class="dash-panel" style="margin-bottom:18px;">
        <h2 class="panel-title">Productos</h2>
        <div class="pp-add">
            <input type="text" id="pp-prod" list="pp-lista-prod" autocomplete="off" placeholder="— Primero elegí una lista —" style="flex:1;min-width:220px;padding:8px 10px;border:1.5px solid #d1d5db;border-radius:8px;font-family:inherit;">
            <datalist id="pp-lista-prod"></datalist>
            <input type="number" id="pp-cant" value="1" min="1" title="Cantidad" style="width:80px;padding:8px;border:1.5px solid #d1d5db;border-radius:8px;font-family:inherit;">
            <button type="button" id="pp-agregar" class="pp-btn pp-btn-formal" style="padding:9px 14px;">+ Agregar</button>
        </div>
        <table class="pp-table" id="pp-tabla">
            <thead><tr><th>Producto</th><th>Cant.</th><th>Bonif. %</th><th>P. Unit.</th><th>Subtotal</th><th></th></tr></thead>
            <tbody id="pp-tbody"><tr><td colspan="6" style="opacity:.5;font-style:italic;padding:14px;">Todavía no agregaste productos</td></tr></tbody>
        </table>

        <div class="pp-tot">
            <div class="pp-tot-row"><span>Neto</span><span id="pp-neto">$0,00</span></div>
            <div class="pp-tot-row"><span>Descuento</span><span id="pp-desc-monto">$0,00</span></div>
            <div class="pp-tot-row"><span>Subtotal</span><span id="pp-subtotal">$0,00</span></div>
            <div class="pp-tot-row"><span><label style="text-transform:none;font-size:14px;opacity:1;"><input type="checkbox" id="pp-iva" checked> IVA 21%</label></span><span id="pp-iva-monto">$0,00</span></div>
            <div class="pp-tot-row pp-tot-final"><span>Total</span><span id="pp-total">$0,00</span></div>
        </div>

        <div class="pp-acciones">
            <button type="button" class="pp-btn pp-btn-wa" id="pp-whatsapp">Enviar por WhatsApp (rápido)</button>
            <span style="display:flex;align-items:center;gap:6px;">
                <label style="font-size:12px;opacity:.7;">Vigencia</label>
                <input type="number" id="pp-vigencia" class="pp-vig" value="15" min="1" max="365" style="padding:8px;border:1.5px solid #d1d5db;border-radius:8px;font-family:inherit;"> <span style="font-size:12px;opacity:.7;">días</span>
            </span>
            <button type="button" class="pp-btn pp-btn-formal" id="pp-formal">Generar presupuesto formal</button>
        </div>
        <div class="pp-msg" id="pp-msg"></div>
    </section>
</div>
</div>
</main>

<script>
    const PRODUCTOS_DB = <?= json_encode($productos) ?>;
    const LISTAS_DB    = <?= json_encode($listas_precios) ?>;
    const CLIENTES_DB  = <?= json_encode($clientes, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE) ?>;
</script>
<script src="../js/global.js"></script>
<script src="../js/presupuestar.js?v=2"></script>
</body>
</html>
