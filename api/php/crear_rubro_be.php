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

/* ── Crear tabla si no existe ────────────────────────── */
$conexion->query("CREATE TABLE IF NOT EXISTS rubros (
        codigo VARCHAR(10)  NOT NULL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL DEFAULT ''
    )"
);

/* ── Datos entrantes ──────────────────────────────────── */
$datos  = json_decode(file_get_contents('php://input'), true);
$codigo = strtoupper(trim($datos['codigo'] ?? ''));
$nombre = trim($datos['nombre'] ?? '');

if ($codigo === '') {
    ob_end_clean();
    echo json_encode(['error' => 'El código del rubro no puede estar vacío.']);
    exit();
}
if ($nombre === '') {
    ob_end_clean();
    echo json_encode(['error' => 'El nombre del rubro no puede estar vacío.']);
    exit();
}
if (!preg_match('/^[A-Z]{1,10}$/', $codigo)) {
    ob_end_clean();
    echo json_encode(['error' => 'El código debe contener solo letras (máx. 10). Ej: A, BC, DIST.']);
    exit();
}
if (mb_strlen($nombre) > 100) {
    ob_end_clean();
    echo json_encode(['error' => 'El nombre no puede superar los 100 caracteres.']);
    exit();
}

/* ── Upsert (sintaxis Postgres) ───────────────────────── */
$stmt = $conexion->prepare(
    "INSERT INTO rubros (codigo, nombre)
     VALUES (?, ?)
     ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre"
);
if (!$stmt) {
    ob_end_clean();
    echo json_encode(['error' => 'Error interno: ' . $conexion->error]);
    exit();
}
$stmt->bind_param('ss', $codigo, $nombre);

if ($stmt->execute()) {
    ob_end_clean();
    echo json_encode(['ok' => true, 'codigo' => $codigo, 'nombre' => $nombre]);
} else {
    ob_end_clean();
    echo json_encode(['error' => 'No se pudo guardar el rubro: ' . $stmt->error]);
}
$stmt->close();
