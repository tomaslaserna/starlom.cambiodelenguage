<?php
session_start();
header('Content-Type: application/json');

$allowed = ['Empleado_1', 'Empleado_2', 'Jefe1', 'Admin'];
if (!isset($_SESSION['usuario']) || !in_array($_SESSION['rango'] ?? '', $allowed)) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'No autorizado']);
    die();
}

include 'conexion_starlim_be.php';
$conexion->query("SET NAMES 'utf8mb4'");

$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!$data || empty($data['items'])) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Sin datos']);
    die();
}

$modo  = ($data['modo'] ?? 'delta') === 'exacto' ? 'exacto' : 'delta';
$items = $data['items'];

$actualizados = 0;
$errores      = [];

foreach ($items as $item) {
    $id    = intval($item['id']   ?? 0);
    $valor = floatval($item['valor'] ?? 0);

    if ($id <= 0) continue;

    if ($modo === 'exacto') {
        // Fijar stock al valor exacto (mínimo 0)
        $val = max(0, $valor);
        $sql = "UPDATE productos SET stock = $val WHERE id = $id";
    } else {
        // Sumar/restar delta, clampeando a 0 para evitar stock negativo
        $delta = $valor;
        $sql   = "UPDATE productos SET stock = GREATEST(0, stock + ($delta)) WHERE id = $id";
    }

    if ($conexion->query($sql) && $conexion->affected_rows > 0) {
        $actualizados++;
    } else {
        $errores[] = $id;
    }
}

echo json_encode([
    'ok'          => true,
    'actualizados' => $actualizados,
    'errores'      => $errores,
]);
