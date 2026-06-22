<?php
require_once __DIR__ . '/session_bootstrap.php';
/**
 * actualizar_estado_pedido.php — Avance del ciclo de pedido desde la pantalla
 * Pedidos (depósito y logística: TODO el staff puede operar).
 *
 * Acciones (POST):
 *   accion=estado      id_venta, estado → avanza el estado del pedido.
 *                      Solo transiciones hacia adelante:
 *                      recibido → en_proceso → pendiente_entrega → entregado.
 *                      Al pasar a 'entregado' descuenta stock (una sola vez),
 *                      sincroniza el remito y la venta pasa a verse en Ventas.
 *   accion=observacion id_venta, observacion → actualiza la nota del pedido.
 */
starlim_session_start();
if (!isset($_SESSION['usuario'])) { http_response_code(403); die(); }

include 'conexion_starlim_be.php';
require_once 'auth.php';
$empresaId = starlim_bootstrap_tenant_context($conexion);

header('Content-Type: application/json; charset=utf-8');

$rango = starlim_normalizar_rango($_SESSION['rango'] ?? '');
if (!in_array($rango, STARLIM_RANGOS_STAFF, true)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Sin permiso']);
    die();
}

const ORDEN_ESTADOS = ['recibido' => 0, 'en_proceso' => 1, 'pendiente_entrega' => 2, 'entregado' => 3];

$accion   = trim($_POST['accion'] ?? 'estado');
$id_venta = intval($_POST['id_venta'] ?? 0);

if ($id_venta <= 0) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'ID inválido']);
    exit;
}

/* ── Editar observación del pedido ───────────────────────────────────── */
if ($accion === 'observacion') {
    $obs = trim($_POST['observacion'] ?? '');
    if (mb_strlen($obs) > 2000) $obs = mb_substr($obs, 0, 2000);
    $stmt = $conexion->prepare("UPDATE ventas SET observacion = ? WHERE id = ? AND empresa_id = ?");
    $stmt->bind_param('sii', $obs, $id_venta, $empresaId);
    $stmt->execute();
    $stmt->close();
    echo json_encode(['ok' => true]);
    exit;
}

/* ── Avanzar estado del pedido ───────────────────────────────────────── */
$nuevo = trim($_POST['estado'] ?? '');
if (!isset(ORDEN_ESTADOS[$nuevo])) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Estado inválido']);
    exit;
}

$stmt = $conexion->prepare("SELECT estado_pedido FROM ventas WHERE id = ? AND empresa_id = ?");
$stmt->bind_param('ii', $id_venta, $empresaId);
$stmt->execute();
$venta = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$venta) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'Pedido no encontrado']);
    exit;
}

$actual = $venta['estado_pedido'] ?: 'recibido';
if (!isset(ORDEN_ESTADOS[$actual])) $actual = 'recibido'; // valor legacy inesperado

if (ORDEN_ESTADOS[$nuevo] <= ORDEN_ESTADOS[$actual]) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => "El pedido ya está en '$actual'; solo se puede avanzar."]);
    exit;
}

$stmt = $conexion->prepare("UPDATE ventas SET estado_pedido = ? WHERE id = ? AND empresa_id = ?");
$stmt->bind_param('sii', $nuevo, $id_venta, $empresaId);
$stmt->execute();
$stmt->close();

// Mantener el remito del pedido en el mismo estado
$stmt = $conexion->prepare("UPDATE remitos SET estado_pedido = ? WHERE id_venta = ? AND empresa_id = ?");
$stmt->bind_param('sii', $nuevo, $id_venta, $empresaId);
$stmt->execute();
$stmt->close();

$stock_descontado = false;
if ($nuevo === 'entregado') {
    require_once 'pedido_stock.php';
    $stock_descontado = starlim_descontar_stock_venta($conexion, $id_venta);
}

require_once __DIR__ . '/integracion_eventos.php';
starlim_evento_registrar($conexion, $nuevo === 'entregado' ? 'pedido.entregado' : 'pedido.estado_cambiado', [
    'id'              => $id_venta,
    'estado_anterior' => $actual,
    'estado_nuevo'    => $nuevo,
    'usuario'         => $_SESSION['usuario'],
]);

echo json_encode(['ok' => true, 'estado' => $nuevo, 'stock_descontado' => $stock_descontado]);
