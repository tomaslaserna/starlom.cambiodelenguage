<?php
session_start();
if (!isset($_SESSION['usuario'])) { http_response_code(403); die(); }

$rango = $_SESSION['rango'];
if ($rango !== 'Empleado_2' && $rango !== 'Jefe' && $rango !== 'Jefe1' && $rango !== 'Admin') {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Sin permiso']);
    die();
}

include 'conexion_starlim_be.php';
header('Content-Type: application/json; charset=utf-8');

$id_venta  = intval($_POST['id_venta']  ?? 0);
$id_remito = intval($_POST['id_remito'] ?? 0);
$campo     = trim($_POST['campo']       ?? '');
$valor     = trim($_POST['valor']       ?? '');

$allowed_venta  = [
    'seguimiento'   => ['facturada', 'no_facturada'],
    'estado_pedido' => ['recibido', 'en_proceso', 'pendiente_entrega', 'entregado'],
];
$allowed_remito = [
    'estado_pedido' => ['recibido', 'en_proceso', 'pendiente_entrega', 'entregado'],
];

$es_remito = ($id_remito > 0 && !$id_venta);
$allowed   = $es_remito ? $allowed_remito : $allowed_venta;
$target_id = $es_remito ? $id_remito : $id_venta;

if (!$target_id || !isset($allowed[$campo]) || !in_array($valor, $allowed[$campo], true)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Datos inválidos']);
    exit;
}

/* $campo viene de la whitelist de arriba: interpolarlo es seguro.
   (Sin backticks: son sintaxis MySQL y Postgres los rechaza) */
if ($es_remito) {
    $stmt = $conexion->prepare("UPDATE remitos SET $campo = ? WHERE id = ?");
} else {
    $stmt = $conexion->prepare("UPDATE ventas SET $campo = ? WHERE id = ?");
}
$stmt->bind_param('si', $valor, $target_id);
$stmt->execute();
$affected = $stmt->affected_rows;
$stmt->close();

/* ── Evento para integraciones (bot WhatsApp via Make) ───────────────── */
require_once __DIR__ . '/integracion_eventos.php';
starlim_evento_registrar($conexion, ($es_remito ? 'remito.' : 'venta.') . $campo . '_cambiado', [
    'id'    => $target_id,
    'campo' => $campo,
    'valor' => $valor,
]);

/* ── Descuento de stock al pasar a "Entregado" (solo ventas) ──────────
   Antes el stock se descontaba en pendiente_entrega; en el circuito de
   pedidos se descuenta recién al entregar (una sola vez, flag atómico). */
if (!$es_remito && $campo === 'estado_pedido' && $valor === 'entregado') {
    require_once 'pedido_stock.php';
    starlim_descontar_stock_venta($conexion, $id_venta);
}

echo json_encode(['ok' => true, 'affected' => $affected]);
