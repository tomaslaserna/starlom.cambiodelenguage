<?php
ob_start();
ini_set('display_errors', '0');

session_start();
include 'conexion_starlim_be.php';

header('Content-Type: application/json; charset=utf-8');

if (!isset($_SESSION['rango']) || $_SESSION['rango'] !== 'Admin') {
    ob_end_clean();
    echo json_encode(['error' => 'Sin permisos.']);
    exit();
}

$conexion->query("SET NAMES 'utf8mb4'");

/* ── Datos entrantes ──────────────────────────────────── */
$datos    = json_decode(file_get_contents('php://input'), true);
$lista_id = isset($datos['lista_id']) ? (int)$datos['lista_id'] : 0;

if ($lista_id <= 0) {
    ob_end_clean();
    echo json_encode(['error' => 'lista_id inválido.']);
    exit();
}

/* ── Verificar que la lista exista ───────────────────── */
$chk = $conexion->prepare("SELECT id, nombre FROM listas_precio WHERE id = ?");
$chk->bind_param('i', $lista_id);
$chk->execute();
$row = $chk->get_result()->fetch_assoc();
$chk->close();

if (!$row) {
    ob_end_clean();
    echo json_encode(['error' => "La lista con id $lista_id no existe."]);
    exit();
}

/* ── Soft-delete: activa = 0 ─────────────────────────── */
$stmt = $conexion->prepare("UPDATE listas_precio SET activa = 0 WHERE id = ?");
if (!$stmt) {
    ob_end_clean();
    echo json_encode(['error' => 'Error interno: ' . $conexion->error]);
    exit();
}
$stmt->bind_param('i', $lista_id);

if ($stmt->execute() && $stmt->affected_rows > 0) {
    ob_end_clean();
    echo json_encode(['ok' => true]);
} else {
    ob_end_clean();
    echo json_encode(['error' => 'No se pudo desactivar la lista o ya estaba inactiva.']);
}
$stmt->close();
