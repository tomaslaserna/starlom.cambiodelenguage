<?php
require_once __DIR__ . '/session_bootstrap.php';
include 'conexion_starlim_be.php';
starlim_session_start();
$empresaId = starlim_bootstrap_tenant_context($conexion);

$id = intval($_GET['id'] ?? 0);
if (!$id) { echo json_encode([]); die(); }

$stmt = $conexion->prepare("SELECT * FROM clientes WHERE id = ? AND empresa_id = ? AND (activo = 'true' OR estado = 'Activo')");
$stmt->bind_param('ii', $id, $empresaId);
$stmt->execute();
$cliente = $stmt->get_result()->fetch_assoc();

echo json_encode($cliente);
