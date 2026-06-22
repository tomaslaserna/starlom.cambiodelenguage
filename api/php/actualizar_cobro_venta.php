<?php
require_once __DIR__ . '/session_bootstrap.php';
starlim_session_start();
if (!isset($_SESSION['usuario'])) { http_response_code(403); die(); }

$rango = $_SESSION['rango'];
if ($rango !== 'Empleado_2' && $rango !== 'Jefe' && $rango !== 'Jefe1' && $rango !== 'Admin') {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Sin permiso']);
    die();
}

include 'conexion_starlim_be.php';
$empresaId = starlim_bootstrap_tenant_context($conexion);
header('Content-Type: application/json; charset=utf-8');

$id_venta     = intval($_POST['id_venta']     ?? 0);
$estado_cobro = trim($_POST['estado_cobro']   ?? '');

$valid = ['pendiente', 'cancelado'];
if (!$id_venta || !in_array($estado_cobro, $valid, true)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'El cobro se registra desde Cobros y Pagos y se aprueba por administracion.']);
    exit;
}

$stmt = $conexion->prepare("UPDATE ventas SET estado_cobro = ? WHERE id = ? AND empresa_id = ?");
$stmt->bind_param('sii', $estado_cobro, $id_venta, $empresaId);
$stmt->execute();
$affected = $stmt->affected_rows;
$stmt->close();

echo json_encode(['ok' => true, 'affected' => $affected]);
