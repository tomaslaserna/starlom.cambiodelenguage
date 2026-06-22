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

$datos = json_decode(file_get_contents('php://input'), true);

$codigo = strtoupper(trim($datos['codigo'] ?? ''));
$nombre = trim($datos['nombre'] ?? '');

if ($codigo === '' || $nombre === '') {
    echo json_encode(['error' => 'Código y nombre son obligatorios.']);
    exit();
}

// Validar formato de código (letras + números, máx 10 chars)
if (!preg_match('/^[A-Z]{1,4}[0-9]{1,6}$/', $codigo)) {
    echo json_encode(['error' => 'Formato de código inválido. Debe ser letra(s) seguida de número(s). Ej: A11, BC3.']);
    exit();
}

// Verificar que no exista
$chk = $conexion->prepare("SELECT codigo FROM margenes WHERE codigo = ? AND empresa_id = ?");
$chk->bind_param('si', $codigo, $empresaId);
$chk->execute();
if ($chk->get_result()->num_rows > 0) {
    echo json_encode(['error' => "El código \"$codigo\" ya existe."]);
    exit();
}
$chk->close();

$campos = ['precio_0', 'precio_1', 'precio_2', 'precio_3', 'margen_minorista'];
$vals   = [];

foreach ($campos as $c) {
    $v = (float)str_replace(',', '.', $datos[$c] ?? '0');
    if ($v < 1.0 || $v > 9.99) {
        echo json_encode(['error' => "Valor fuera de rango para $c: $v (debe estar entre 1,00 y 9,99)"]);
        exit();
    }
    $vals[$c] = $v;
}

// codigo(s), nombre(s), p0(d), p1(d), p2(d), p3(d), min(d)
$stmt = $conexion->prepare(
    "INSERT INTO margenes (codigo, nombre, precio_0, precio_1, precio_2, precio_3, margen_minorista, empresa_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
);
if (!$stmt) {
    echo json_encode(['error' => 'Error interno: ' . $conexion->error]);
    exit();
}

$stmt->bind_param('ssdddddi',
    $codigo, $nombre,
    $vals['precio_0'], $vals['precio_1'],
    $vals['precio_2'], $vals['precio_3'],
    $vals['margen_minorista'], $empresaId
);

if ($stmt->execute()) {
    echo json_encode(['ok' => true, 'codigo' => $codigo, 'nombre' => $nombre]);
} else {
    echo json_encode(['error' => 'Error al insertar: ' . $stmt->error]);
}
$stmt->close();
