<?php
require_once __DIR__ . '/session_bootstrap.php';
starlim_session_start();
header('Content-Type: application/json');

if (!isset($_SESSION['usuario'])) {
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

$stmt = $conexion->prepare("DELETE FROM presupuestos WHERE id = ? AND empresa_id = ?");
$stmt->bind_param('ii', $id, $empresaId);
$stmt->execute();

echo json_encode(['ok' => true]);
