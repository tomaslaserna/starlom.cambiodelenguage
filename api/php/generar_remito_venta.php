<?php
session_start();
if (!isset($_SESSION['usuario'])) { http_response_code(403); die(); }

$rango = $_SESSION['rango'];
if (!in_array($rango, ['Empleado_2','Jefe','Jefe1','Admin'], true)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Sin permiso']);
    die();
}

include 'conexion_starlim_be.php';
header('Content-Type: application/json; charset=utf-8');

$id_venta = intval($_POST['id_venta'] ?? 0);
if (!$id_venta) {
    echo json_encode(['ok' => false, 'error' => 'id_venta inválido']);
    exit;
}

/* ── Verificar que la venta existe y no tiene remito ── */
$stmt = $conexion->prepare(
    "SELECT v.nombre_cliente, v.dni_cliente, v.fecha, v.monto,
            v.condicion_pago, v.vendedor,
            COALESCE(v.lista_precios, '') AS lista_precios
     FROM ventas v WHERE v.id = ?"
);
$stmt->bind_param('i', $id_venta);
$stmt->execute();
$venta = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$venta) {
    echo json_encode(['ok' => false, 'error' => 'Venta no encontrada']);
    exit;
}

$chk = $conexion->prepare("SELECT id FROM remitos WHERE id_venta = ? LIMIT 1");
$chk->bind_param('i', $id_venta);
$chk->execute();
if ($chk->get_result()->num_rows > 0) {
    $chk->close();
    echo json_encode(['ok' => false, 'error' => 'Esta venta ya tiene un remito']);
    exit;
}
$chk->close();

/* ── Obtener detalle de la venta ── */
$detalles = [];
$chk_det = $conexion->query("SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'detalle_ventas'");
if ($chk_det && $chk_det->num_rows > 0) {
    $stmt2 = $conexion->prepare(
        "SELECT id_producto, nombre_producto, cantidad, precio_unit,
                COALESCE(descuento, 0) AS descuento, subtotal
         FROM detalle_ventas WHERE id_venta = ? ORDER BY id ASC"
    );
    $stmt2->bind_param('i', $id_venta);
    $stmt2->execute();
    $res2 = $stmt2->get_result();
    while ($row = $res2->fetch_assoc()) $detalles[] = $row;
    $stmt2->close();
}

/* ── Siguiente nro_remito ── */
$res_nro    = $conexion->query("SELECT COALESCE(MAX(nro_remito), 0) + 1 AS sig FROM remitos");
$nro_remito = (int)$res_nro->fetch_assoc()['sig'];

/* ── Insertar remito (fecha = fecha de la venta) ── */
$stmt3 = $conexion->prepare(
    "INSERT INTO remitos
        (id_venta, nro_remito, nombre_cliente, lista_precios, dni_cliente,
         fecha, condicion_pago, monto, vendedor)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
);
$stmt3->bind_param(
    'iisssssds',
    $id_venta, $nro_remito,
    $venta['nombre_cliente'], $venta['lista_precios'],
    $venta['dni_cliente'],    $venta['fecha'],
    $venta['condicion_pago'], $venta['monto'], $venta['vendedor']
);
$stmt3->execute();
$id_remito = $conexion->insert_id;
$stmt3->close();

/* ── Insertar detalle_remitos ── */
foreach ($detalles as $d) {
    $stmt4 = $conexion->prepare(
        "INSERT INTO detalle_remitos
            (id_remito, id_producto, nombre_producto, cantidad, precio_unit, descuento, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    $stmt4->bind_param(
        'iisiddd',
        $id_remito,       $d['id_producto'], $d['nombre_producto'],
        $d['cantidad'],   $d['precio_unit'], $d['descuento'], $d['subtotal']
    );
    $stmt4->execute();
    $stmt4->close();
}

/* ── Evento para integraciones (bot WhatsApp via Make) ── */
require_once __DIR__ . '/integracion_eventos.php';
starlim_evento_registrar($conexion, 'remito.creado', [
    'id'             => $id_remito,
    'nro_remito'     => $nro_remito,
    'id_venta'       => $id_venta,
    'nombre_cliente' => $venta['nombre_cliente'],
    'dni_cliente'    => $venta['dni_cliente'],
    'monto'          => $venta['monto'],
]);

echo json_encode(['ok' => true, 'id_remito' => $id_remito, 'nro_remito' => $nro_remito]);
