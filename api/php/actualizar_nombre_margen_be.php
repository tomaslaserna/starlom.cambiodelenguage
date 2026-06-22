<?php
require_once __DIR__ . '/session_bootstrap.php';
starlim_session_start();
include 'conexion_starlim_be.php';
$empresaId = starlim_bootstrap_tenant_context($conexion);

header('Content-Type: application/json; charset=utf-8');

if (!isset($_SESSION['rango']) || $_SESSION['rango'] !== 'Admin') {
    echo json_encode(['error' => 'Sin permisos.']);
    exit();
}

$datos  = json_decode(file_get_contents('php://input'), true);
$codigo = strtoupper(trim($datos['codigo'] ?? ''));
$nombre = trim($datos['nombre'] ?? '');

if ($codigo === '') {
    echo json_encode(['error' => 'Código no recibido.']);
    exit();
}
if ($nombre === '') {
    echo json_encode(['error' => 'El nombre no puede estar vacío.']);
    exit();
}
if (mb_strlen($nombre) > 100) {
    echo json_encode(['error' => 'El nombre no puede superar los 100 caracteres.']);
    exit();
}

$stmt = $conexion->prepare("UPDATE margenes SET nombre = ? WHERE codigo = ? AND empresa_id = ?");
if (!$stmt) {
    echo json_encode(['error' => 'Error interno: ' . $conexion->error]);
    exit();
}

$stmt->bind_param('ssi', $nombre, $codigo, $empresaId);

if ($stmt->execute() && $stmt->affected_rows > 0) {
    echo json_encode(['ok' => true]);
} else {
    echo json_encode(['error' => 'No se encontró la categoría o el nombre es el mismo.']);
}
$stmt->close();
