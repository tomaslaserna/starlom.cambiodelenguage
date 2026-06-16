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

/* ── Crear tablas si no existen ──────────────────────── */
$conexion->query("CREATE TABLE IF NOT EXISTS listas_precio (
        id     SERIAL PRIMARY KEY,
        nombre VARCHAR(50) NOT NULL,
        activa SMALLINT    NOT NULL DEFAULT 1,
        orden  INT         NOT NULL DEFAULT 0
    )"
);

$conexion->query("CREATE TABLE IF NOT EXISTS margenes_listas (
        codigo      VARCHAR(10)    NOT NULL,
        lista_id    INT            NOT NULL,
        multiplicador DECIMAL(5,2) NOT NULL DEFAULT 1.00,
        PRIMARY KEY (codigo, lista_id)
    )"
);

/* ── Datos entrantes ──────────────────────────────────── */
$datos  = json_decode(file_get_contents('php://input'), true);
$nombre = trim($datos['nombre'] ?? '');

if ($nombre === '') {
    ob_end_clean();
    echo json_encode(['error' => 'El nombre no puede estar vacío.']);
    exit();
}
if (mb_strlen($nombre) > 50) {
    ob_end_clean();
    echo json_encode(['error' => 'El nombre no puede superar los 50 caracteres.']);
    exit();
}

/* ── Insertar en listas_precio ───────────────────────── */
$stmt = $conexion->prepare(
    "INSERT INTO listas_precio (nombre, activa, orden) VALUES (?, 1, 0) RETURNING id"
);
if (!$stmt) {
    ob_end_clean();
    echo json_encode(['error' => 'Error interno: ' . $conexion->error]);
    exit();
}
$stmt->bind_param('s', $nombre);

if (!$stmt->execute()) {
    ob_end_clean();
    echo json_encode(['error' => 'Error al crear la lista: ' . $stmt->error]);
    exit();
}
$insertado = $stmt->get_result()->fetch_assoc();
$nuevaId = (int)($insertado['id'] ?? 0);
$stmt->close();

if ($nuevaId <= 0) {
    ob_end_clean();
    echo json_encode(['error' => 'No se pudo recuperar el ID de la lista creada.']);
    exit();
}

/* ── Crear filas por defecto en margenes_listas ─────── */
$codigos = [];
$res = $conexion->query("SELECT codigo FROM margenes ORDER BY codigo ASC");
while ($row = $res->fetch_assoc()) {
    $codigos[] = $row['codigo'];
}

if (!empty($codigos)) {
    $stmtML = $conexion->prepare(
        "INSERT INTO margenes_listas (codigo, lista_id, multiplicador)
         VALUES (?, ?, 1.00)
         ON CONFLICT (codigo, lista_id) DO NOTHING"
    );
    if ($stmtML) {
        foreach ($codigos as $cod) {
            $stmtML->bind_param('si', $cod, $nuevaId);
            $stmtML->execute();
        }
        $stmtML->close();
    }
}

ob_end_clean();
echo json_encode(['ok' => true, 'id' => $nuevaId, 'nombre' => $nombre]);
