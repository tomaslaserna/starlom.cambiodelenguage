<?php
require_once __DIR__ . '/session_bootstrap.php';
ob_start();
ini_set('display_errors', '0');

starlim_session_start();
include 'conexion_starlim_be.php';
$empresaId = starlim_bootstrap_tenant_context($conexion);

header('Content-Type: application/json; charset=utf-8');

if (!isset($_SESSION['rango']) || $_SESSION['rango'] !== 'Admin') {
    ob_end_clean();
    echo json_encode(['error' => 'Sin permisos.']);
    exit();
}

$datos = json_decode(file_get_contents('php://input'), true);

if (empty($datos['codigo'])) {
    ob_end_clean();
    echo json_encode(['error' => 'Código no recibido.']);
    exit();
}

$campos = ['precio_1', 'margen_minorista', 'precio_2', 'precio_3', 'precio_0'];

$codigo = $datos['codigo'] ?? '';

$sets = [];
foreach ($campos as $campo) {
    if (isset($datos[$campo])) {
        $val = (float) str_replace(',', '.', $datos[$campo]);
        // Validar rango razonable (entre 1.00 y 9.99)
        if ($val < 1.0 || $val > 9.99) {
            ob_end_clean();
            echo json_encode(['error' => "Valor fuera de rango para $campo: $val (debe ser entre 1,00 y 9,99)"]);
            exit();
        }
        $sets[] = "$campo = $val";
    }
}

if (empty($sets)) {
    ob_end_clean();
    echo json_encode(['error' => 'No se recibieron campos para actualizar.']);
    exit();
}

$query = "UPDATE margenes SET " . implode(', ', $sets) . " WHERE codigo = ? AND empresa_id = ?";
$stmt  = $conexion->prepare($query);
$stmt->bind_param('si', $codigo, $empresaId);
$stmt->execute();

if ($stmt->affected_rows > 0) {
    ob_end_clean();
    echo json_encode(['ok' => true]);
} else {
    ob_end_clean();
    echo json_encode(['error' => 'No se pudo actualizar: ' . $conexion->error]);
}
