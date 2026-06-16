<?php
/**
 * emitir_factura_manual.php — Carga de PEDIDOS (circuito jun 2026).
 *
 * Antes este script emitía la factura ARCA y descontaba stock al cargar.
 * Ahora la carga SIEMPRE crea un pedido: venta con estado_pedido='recibido'
 * + remito + detalles. El stock se descuenta recién al marcarse 'entregado'
 * (actualizar_estado_pedido.php) y la factura se emite después de la entrega
 * vía solicitudes_factura (solicitar_factura.php / resolver_solicitud_factura.php).
 *
 * El tipo de comprobante elegido en el form se guarda como preferencia en
 * ventas.comprobante_deseado ('remito' | 'factura_a' | 'factura_b').
 */
ini_set('display_errors', 0);
session_start();

// Verificar permisos
if (!isset($_SESSION['usuario'])) {
    header('Location: ../frontend/sign.php');
    die();
}
$rango = $_SESSION['rango'];
if ($rango !== 'Empleado_2' && $rango !== 'Jefe' && $rango !== 'Jefe1' && $rango !== 'Admin') {
    header('Location: ../frontend/panel_empleados.php');
    die();
}

include 'conexion_starlim_be.php';

// ── Página de advertencia de stock con opción de continuar ──
function mostrarAdvertenciaStock(array $advertencias) {
    $msg = nl2br(htmlspecialchars(implode("\n", $advertencias)));
    echo '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
        <title>Advertencia de stock — Star Lim</title>
        <style>
            body{font-family:sans-serif;background:#1a1a1a;color:#e0e0e0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
            .card{background:#2a2a2a;border-radius:12px;padding:2rem 2.5rem;max-width:520px;width:100%;box-shadow:0 4px 24px #0006;}
            h2{margin-top:0;color:#f5c542;}
            .advertencias{background:#333;border-radius:8px;padding:1rem 1.2rem;margin:1rem 0;font-size:.95rem;line-height:1.7;}
            .acciones{display:flex;gap:1rem;margin-top:1.5rem;justify-content:flex-end;}
            .btn{padding:.6rem 1.4rem;border:none;border-radius:8px;cursor:pointer;font-size:1rem;font-weight:600;}
            .btn-continuar{background:#e53935;color:#fff;}
            .btn-continuar:hover{background:#c62828;}
            .btn-cancelar{background:#444;color:#e0e0e0;}
            .btn-cancelar:hover{background:#555;}
        </style></head><body>
        <div class="card">
            <h2>Stock disponible insuficiente</h2>
            <p>Los siguientes productos no tienen stock disponible suficiente (hay unidades reservadas por otros pedidos sin entregar):</p>
            <div class="advertencias">' . $msg . '</div>
            <p>¿Querés cargar el pedido de todas formas?</p>
            <form method="post" action="">'; // re-envía al mismo script

    foreach ($_POST as $key => $val) {
        if ($key === 'skip_stock_check') continue;
        echo '<input type="hidden" name="' . htmlspecialchars($key, ENT_QUOTES) . '" value="' . htmlspecialchars($val, ENT_QUOTES) . '">';
    }

    echo '          <input type="hidden" name="skip_stock_check" value="1">
                <div class="acciones">
                    <button type="button" class="btn btn-cancelar" onclick="history.back()">Cancelar</button>
                    <button type="submit" class="btn btn-continuar">Cargar de todas formas</button>
                </div>
            </form>
        </div></body></html>';
    die();
}

// ── Función para crear remito ──────────────────────────
function crearRemito($conexion, $id_venta, $nombre_cliente, $nro_doc, $fecha, $id_operador, $deposito, $sucursal_cliente, $provincia, $observacion, $condicion_pago, $monto, $productos, $vendedor = '', $lista_precios = '') {
    $res = $conexion->query("SELECT COALESCE(MAX(nro_remito), 0) + 1 AS siguiente FROM remitos");
    $row = $res->fetch_assoc();
    $nro_remito = intval($row['siguiente']);

    $stmt = $conexion->prepare(
        "INSERT INTO remitos (id_venta, nro_remito, nombre_cliente, lista_precios, dni_cliente, fecha, id_operador, deposito, sucursal_cliente, provincia, observacion, condicion_pago, monto, vendedor, estado_pedido)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'recibido')"
    );
    if (!$stmt) die("Error remito: " . $conexion->error);
    $stmt->bind_param("iissssisssssds",
        $id_venta, $nro_remito, $nombre_cliente, $lista_precios, $nro_doc, $fecha,
        $id_operador, $deposito, $sucursal_cliente, $provincia,
        $observacion, $condicion_pago, $monto, $vendedor
    );
    $stmt->execute();
    $id_remito = $conexion->insert_id;
    $stmt->close();

    foreach ($productos as $p) {
        $id_producto     = intval($p['id']);
        $nombre_producto = trim($p['nombre'] ?? '');
        $cantidad        = intval($p['cantidad']);
        $precio_unit     = floatval($p['precio']);
        $descuento       = floatval($p['descuento'] ?? 0);
        $subtotal_p      = round($precio_unit * (1 - $descuento / 100) * $cantidad, 2);

        $stmt2 = $conexion->prepare(
            "INSERT INTO detalle_remitos (id_remito, id_producto, nombre_producto, cantidad, precio_unit, descuento, subtotal)
             VALUES (?, ?, ?, ?, ?, ?, ?)"
        );
        $stmt2->bind_param("iisiddd", $id_remito, $id_producto, $nombre_producto, $cantidad, $precio_unit, $descuento, $subtotal_p);
        $stmt2->execute();
        $stmt2->close();
    }

    return ['id' => $id_remito, 'nro' => $nro_remito];
}

// ── Recibir datos ──────────────────────────────────────
$skip_stock_check = !empty($_POST['skip_stock_check']) && $_POST['skip_stock_check'] === '1';
$tipo_cliente     = $_POST['tipo_cliente_hidden'] ?? '';
$nro_doc          = preg_replace('/[^0-9]/', '', trim($_POST['nro_doc'] ?? ''));
$razon_social     = trim($_POST['razon_social'] ?? '');
$nombre_cliente   = trim($_POST['nombre_cliente'] ?? '');
$tipo_cbte        = intval($_POST['tipo_cbte'] ?? 6);
$condicion_pago   = trim($_POST['condicion_pago'] ?? '');
$id_vendedor      = intval($_POST['id_operador'] ?? 0) ?: null;
$operador         = trim($_POST['vendedor_cl'] ?? '');
$fecha            = trim($_POST['fecha'] ?? '');
$vencimiento_cobro_raw = trim($_POST['vencimiento'] ?? '');
$deposito         = trim($_POST['deposito'] ?? '');
$sucursal_cliente = trim($_POST['sucursal_cliente'] ?? '');
$provincia        = trim($_POST['provincia'] ?? '');
$observacion      = trim($_POST['observacion'] ?? '');
$lista_precios    = trim($_POST['lista_precios'] ?? '');

$monto_total = floatval($_POST['monto_total'] ?? 0);
$monto_neto  = floatval($_POST['monto_neto'] ?? 0);
$monto_iva   = floatval($_POST['monto_iva'] ?? 0);
$productos   = json_decode($_POST['productos_json'] ?? '[]', true);

$vencimiento_cobro = null;
if ($vencimiento_cobro_raw !== '') {
    $ts = strtotime($vencimiento_cobro_raw);
    if ($ts !== false) $vencimiento_cobro = date('Y-m-d H:i:s', $ts);
}

$conexion->query("ALTER TABLE ventas ADD COLUMN IF NOT EXISTS vencimiento_cobro TIMESTAMP");

// Las NC/ND ya no se cargan por acá: se hacen desde Ventas sobre una venta entregada.
if (in_array($tipo_cbte, [2, 3, 7, 8], true)) {
    die("Las notas de crédito/débito se emiten desde Ventas registradas, sobre una venta ya entregada.");
}

// Preferencia de comprobante para la facturación post-entrega
if ($tipo_cliente === 'sin_factura') {
    $comprobante_deseado = 'remito';
} else {
    $comprobante_deseado = ($tipo_cbte === 1) ? 'factura_a' : 'factura_b';
}

// Validaciones básicas
if (empty($productos)) {
    die("Error: No hay productos en el pedido.");
}

if ($tipo_cliente !== 'sin_factura' && $nro_doc === '') {
    die("Error: Falta el número de documento del cliente.");
}

// ── Validar stock DISPONIBLE (real menos reservado por otros pedidos) ──
if (!$skip_stock_check) {
    $errores = [];
    foreach ($productos as $p) {
        $id_producto = intval($p['id']);
        $cantidad    = intval($p['cantidad']);
        $_sp  = $conexion->prepare("SELECT disponible, nombre FROM vista_stock_disponible WHERE id = ?");
        $_sp->bind_param("i", $id_producto); $_sp->execute();
        $prod = $_sp->get_result()->fetch_assoc(); $_sp->close();
        if (!$prod) {
            $errores[] = "Producto ID $id_producto no encontrado.";
        } elseif ($prod['disponible'] < $cantidad) {
            $errores[] = "'{$prod['nombre']}': disponible {$prod['disponible']}, solicitado $cantidad.";
        }
    }
    if (!empty($errores)) mostrarAdvertenciaStock($errores);
}

// ── Crear el pedido: venta 'recibido' + detalle + remito ──
$fecha_venta = $fecha ?: date('Y-m-d');
$stmt = $conexion->prepare(
    "INSERT INTO ventas (id_producto, dni_cliente, nombre_cliente, lista_precios, monto, monto_neto, monto_iva,
                         tipo_cbte, cae, vencimiento_cae, nro_comprobante, condicion_pago, id_operador, fecha, vendedor,
                         estado_pedido, estado_cobro, seguimiento, stock_descontado, observacion, comprobante_deseado,
                         vencimiento_cobro)
     VALUES (NULL, ?, ?, ?, ?, ?, ?, 6, '', '', 0, ?, ?, ?, ?, 'recibido', 'pendiente', 'no_facturada', 0, ?, ?, ?)"
);
if (!$stmt) {
    echo "<script>alert(" . json_encode('Error al guardar el pedido: ' . $conexion->error) . ");history.back();</script>";
    die();
}
$stmt->bind_param("sssdddsisssss",
    $nro_doc, $nombre_cliente, $lista_precios,
    $monto_total, $monto_neto, $monto_iva,
    $condicion_pago, $id_vendedor, $fecha_venta, $operador,
    $observacion, $comprobante_deseado, $vencimiento_cobro
);
$stmt->execute();
$id_venta = $conexion->insert_id;
$stmt->close();

// Detalle del pedido (sin tocar stock: queda reservado vía vista_stock_disponible)
foreach ($productos as $p) {
    $id_producto     = intval($p['id']);
    $nombre_producto = trim($p['nombre'] ?? '');
    $cantidad        = intval($p['cantidad']);
    $precio_unit     = floatval($p['precio']);
    $descuento       = floatval($p['descuento'] ?? 0);
    $subtotal_p      = round($precio_unit * (1 - $descuento / 100) * $cantidad, 2);

    $stmt2 = $conexion->prepare(
        "INSERT INTO detalle_ventas (id_venta, id_producto, nombre_producto, cantidad, precio_unit, descuento, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    $stmt2->bind_param("iisiddd", $id_venta, $id_producto, $nombre_producto, $cantidad, $precio_unit, $descuento, $subtotal_p);
    $stmt2->execute();
    $stmt2->close();
}

// Remito del pedido (la "hoja de armado" que ve depósito)
$remito = crearRemito($conexion, $id_venta, $nombre_cliente, $nro_doc, $fecha_venta, $id_vendedor, $deposito, $sucursal_cliente, $provincia, $observacion, $condicion_pago, $monto_total, $productos, $operador, $lista_precios);

// El pedido se identifica por el nro de remito hasta que se facture
$updNro = $conexion->prepare("UPDATE ventas SET nro_comprobante = ? WHERE id = ?");
$updNro->bind_param("ii", $remito['nro'], $id_venta);
$updNro->execute();
$updNro->close();

// Evento para integraciones (bot WhatsApp via Make)
require_once __DIR__ . '/integracion_eventos.php';
starlim_evento_registrar($conexion, 'pedido.creado', [
    'id'                  => $id_venta,
    'nro_remito'          => $remito['nro'],
    'id_remito'           => $remito['id'],
    'nombre_cliente'      => $nombre_cliente,
    'dni_cliente'         => $nro_doc,
    'monto'               => $monto_total,
    'comprobante_deseado' => $comprobante_deseado,
    'observacion'         => $observacion,
]);

$params = http_build_query([
    'id_remito'  => $remito['id'],
    'nro_remito' => $remito['nro'],
    'total'      => $monto_total,
    'cliente'    => $nombre_cliente ?: $nro_doc,
    'pedido'     => 1,
]);
header("Location: ../frontend/confirmacion_remito.php?$params");
die();
