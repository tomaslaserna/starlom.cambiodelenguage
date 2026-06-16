<?php
session_start();
include 'conexion_starlim_be.php';

header('Content-Type: application/json; charset=utf-8');

if (!isset($_SESSION['rango']) || $_SESSION['rango'] !== 'Admin') {
    echo json_encode(['error' => 'Sin permisos.']);
    exit();
}

$datos  = json_decode(file_get_contents('php://input'), true);
$codigo = strtoupper(trim($datos['codigo'] ?? ''));

if ($codigo === '') {
    echo json_encode(['error' => 'Código no recibido.']);
    exit();
}

// Seguridad: no eliminar si hay productos usando este código
$chk = $conexion->prepare("SELECT COUNT(*) AS n FROM productos WHERE codigo = ?");
$chk->bind_param('s', $codigo);
$chk->execute();
$n = (int)$chk->get_result()->fetch_assoc()['n'];
$chk->close();

if ($n > 0) {
    echo json_encode(['error' => "No se puede eliminar: $n producto" . ($n === 1 ? '' : 's') . " usa" . ($n === 1 ? '' : 'n') . " esta categoría."]);
    exit();
}

$stmt = $conexion->prepare("DELETE FROM margenes WHERE codigo = ?");
$stmt->bind_param('s', $codigo);

if ($stmt->execute() && $stmt->affected_rows > 0) {
    echo json_encode(['ok' => true]);
} else {
    echo json_encode(['error' => 'No se pudo eliminar o el código no existe.']);
}
$stmt->close();
