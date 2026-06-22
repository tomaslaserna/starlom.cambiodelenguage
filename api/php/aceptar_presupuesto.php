<?php
require_once __DIR__ . '/session_bootstrap.php';
starlim_session_start();
header('Content-Type: application/json');

$allowed = ['Empleado_2', 'Jefe', 'Jefe1', 'Admin'];
if (!isset($_SESSION['usuario']) || !in_array($_SESSION['rango'] ?? '', $allowed)) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'No autorizado']);
    die();
}

include 'conexion_starlim_be.php';
$empresaId = starlim_bootstrap_tenant_context($conexion);

$id = intval($_POST['id'] ?? 0);
if (!$id) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'ID inválido']);
    die();
}

$stmt = $conexion->prepare("UPDATE presupuestos SET estado = 'aceptada' WHERE id = ? AND empresa_id = ?");
$stmt->bind_param('ii', $id, $empresaId);
$stmt->execute();

echo json_encode(['ok' => true, 'redirect' => 'factura_manual.php?presupuesto_id=' . $id]);
