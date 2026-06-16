<?php
/**
 * solicitar_factura.php — Solicitar factura sobre una venta ya entregada.
 *
 * El staff de ventas (Empleado_2+) puede pedir que se facture una venta que se
 * cargó como remito o sin CAE. La solicitud queda 'pendiente' hasta que un
 * Jefe1/Admin la apruebe en resolver_solicitud_factura.php. Si quien solicita
 * ya es Jefe1/Admin, se intenta aprobar y emitir en el acto.
 */
session_start();
if (!isset($_SESSION['usuario'])) { http_response_code(403); die(); }

include 'conexion_starlim_be.php';
require_once 'auth.php';
header('Content-Type: application/json; charset=utf-8');

$usuario = $_SESSION['usuario'];
$rango   = starlim_normalizar_rango($_SESSION['rango'] ?? '');
if (!in_array($rango, ['Empleado_2', 'Jefe', 'Jefe1', 'Admin'], true)) {
    echo json_encode(['ok' => false, 'error' => 'Sin permiso']); exit;
}

$id_venta  = (int)($_POST['id_venta'] ?? 0);
$tipo_cbte = (int)($_POST['tipo_cbte'] ?? 6);   // 1 = Factura A, 6 = Factura B
if (!in_array($tipo_cbte, [1, 6], true)) $tipo_cbte = 6;

if ($id_venta <= 0) { echo json_encode(['ok' => false, 'error' => 'ID inválido']); exit; }

// La venta debe existir, estar entregada y no tener factura todavía
$st = $conexion->prepare(
    "SELECT id, COALESCE(cae,'') AS cae, COALESCE(estado_pedido,'entregado') AS estado_pedido,
            COALESCE(dni_cliente,'') AS dni_cliente
     FROM ventas WHERE id = ?"
);
$st->bind_param('i', $id_venta);
$st->execute();
$venta = $st->get_result()->fetch_assoc();
$st->close();

if (!$venta)                            { echo json_encode(['ok' => false, 'error' => 'Venta no encontrada']); exit; }
if ($venta['estado_pedido'] !== 'entregado') { echo json_encode(['ok' => false, 'error' => 'El pedido aún no fue entregado.']); exit; }
if ($venta['cae'] !== '')               { echo json_encode(['ok' => false, 'error' => 'La venta ya tiene factura emitida.']); exit; }
if ($tipo_cbte === 1 && trim($venta['dni_cliente']) === '') {
    echo json_encode(['ok' => false, 'error' => 'Factura A requiere CUIT del cliente.']); exit;
}

// ¿Ya hay una solicitud pendiente para esta venta?
$st = $conexion->prepare("SELECT id FROM solicitudes_factura WHERE id_venta = ? AND estado = 'pendiente' LIMIT 1");
$st->bind_param('i', $id_venta);
$st->execute();
$existe = $st->get_result()->fetch_assoc();
$st->close();
if ($existe) { echo json_encode(['ok' => false, 'error' => 'Ya hay una solicitud pendiente para esta venta.']); exit; }

$st = $conexion->prepare(
    "INSERT INTO solicitudes_factura (id_venta, tipo_cbte, estado, solicitado_por)
     VALUES (?, ?, 'pendiente', ?) RETURNING id"
);
$st->bind_param('iis', $id_venta, $tipo_cbte, $usuario);
$st->execute();
$id_sol = (int)$st->get_result()->fetch_assoc()['id'];
$st->close();

require_once __DIR__ . '/integracion_eventos.php';
starlim_evento_registrar($conexion, 'factura.solicitada', [
    'id_solicitud' => $id_sol, 'id_venta' => $id_venta, 'tipo_cbte' => $tipo_cbte, 'por' => $usuario,
]);

// Jefe1/Admin: aprobar y emitir en el acto
if (in_array($rango, ['Jefe1', 'Admin'], true)) {
    require_once 'resolver_solicitud_factura.php';
    $res = starlim_resolver_solicitud($conexion, $id_sol, 'aprobar', $usuario, '');
    echo json_encode($res);
    exit;
}

echo json_encode(['ok' => true, 'id_solicitud' => $id_sol, 'estado' => 'pendiente',
                  'mensaje' => 'Solicitud enviada. Un administrador la aprobará para emitir la factura.']);
