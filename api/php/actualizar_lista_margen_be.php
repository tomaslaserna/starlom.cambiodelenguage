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

$conexion->query("SET NAMES 'utf8mb4'");

/* ── Crear tabla si no existe ────────────────────────── */
$conexion->query("CREATE TABLE IF NOT EXISTS margenes_listas (
        codigo        VARCHAR(10)    NOT NULL,
        lista_id      INT            NOT NULL,
        multiplicador DECIMAL(5,2)   NOT NULL DEFAULT 1.00,
        empresa_id BIGINT            NOT NULL DEFAULT 1,
        PRIMARY KEY (codigo, lista_id)
    )"
);
$conexion->query("ALTER TABLE margenes_listas ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1");
$conexion->query("CREATE INDEX IF NOT EXISTS idx_margenes_listas_empresa ON margenes_listas(empresa_id)");

/* ── Datos entrantes ──────────────────────────────────── */
$datos = json_decode(file_get_contents('php://input'), true);

$codigo       = strtoupper(trim($datos['codigo']       ?? ''));
$lista_id     = isset($datos['lista_id'])     ? (int)$datos['lista_id']     : 0;
$multiplicador = isset($datos['multiplicador']) ? (float)str_replace(',', '.', $datos['multiplicador']) : 0;

if ($codigo === '') {
    ob_end_clean();
    echo json_encode(['error' => 'Código no recibido.']);
    exit();
}
if ($lista_id <= 0) {
    ob_end_clean();
    echo json_encode(['error' => 'lista_id inválido.']);
    exit();
}
if ($multiplicador < 1.0 || $multiplicador > 9.99) {
    ob_end_clean();
    echo json_encode(['error' => 'El multiplicador debe estar entre 1,00 y 9,99.']);
    exit();
}

/* ── Verificar que codigo exista en margenes ─────────── */
$chk = $conexion->prepare("SELECT codigo FROM margenes WHERE codigo = ? AND empresa_id = ?");
$chk->bind_param('si', $codigo, $empresaId);
$chk->execute();
if ($chk->get_result()->num_rows === 0) {
    ob_end_clean();
    echo json_encode(['error' => "El código \"$codigo\" no existe en margenes."]);
    exit();
}
$chk->close();

/* ── Verificar que la lista exista y esté activa ─────── */
$chkL = $conexion->prepare("SELECT id FROM listas_precio WHERE id = ? AND empresa_id = ? AND activa = 1");
$chkL->bind_param('ii', $lista_id, $empresaId);
$chkL->execute();
if ($chkL->get_result()->num_rows === 0) {
    ob_end_clean();
    echo json_encode(['error' => "La lista con id $lista_id no existe o está inactiva."]);
    exit();
}
$chkL->close();

/* ── Upsert (sintaxis Postgres) ───────────────────────── */
$stmt = $conexion->prepare(
    "INSERT INTO margenes_listas (codigo, lista_id, multiplicador, empresa_id)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (codigo, lista_id) DO UPDATE SET multiplicador = EXCLUDED.multiplicador, empresa_id = EXCLUDED.empresa_id"
);
if (!$stmt) {
    ob_end_clean();
    echo json_encode(['error' => 'Error interno: ' . $conexion->error]);
    exit();
}
$stmt->bind_param('sidi', $codigo, $lista_id, $multiplicador, $empresaId);

if ($stmt->execute()) {
    ob_end_clean();
    echo json_encode(['ok' => true]);
} else {
    ob_end_clean();
    echo json_encode(['error' => 'No se pudo actualizar: ' . $stmt->error]);
}
$stmt->close();
