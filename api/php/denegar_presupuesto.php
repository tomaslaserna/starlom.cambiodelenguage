<?php
session_start();
header('Content-Type: application/json');

if (!isset($_SESSION['usuario'])) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'No autorizado']);
    die();
}

include 'conexion_starlim_be.php';

$id = intval($_POST['id'] ?? 0);
if (!$id) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'ID inválido']);
    die();
}

$id_esc = (int)$id;
$conexion->query("DELETE FROM presupuestos WHERE id = $id_esc");

echo json_encode(['ok' => true]);
