<?php
session_start();
header('Content-Type: application/json');

if (!isset($_SESSION['usuario'])) {
    echo json_encode(['ok' => false, 'error' => 'No autenticado']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Método no permitido']);
    exit;
}

$de     = trim($_SESSION['usuario']);
$para   = trim($_POST['para']   ?? '');
$asunto = trim($_POST['asunto'] ?? '');
$cuerpo = trim($_POST['cuerpo'] ?? '');

if (!$para || !$asunto || !$cuerpo) {
    echo json_encode(['ok' => false, 'error' => 'Todos los campos son obligatorios']);
    exit;
}

if (mb_strlen($asunto) > 255) {
    echo json_encode(['ok' => false, 'error' => 'El asunto no puede superar los 255 caracteres']);
    exit;
}

include 'conexion_starlim_be.php';

// Crear tabla si no existe (idempotente)
$conexion->query("
    CREATE TABLE IF NOT EXISTS mensajes (
        id     SERIAL       PRIMARY KEY,
        de     VARCHAR(255) NOT NULL,
        para   VARCHAR(255) NOT NULL,
        asunto VARCHAR(255) NOT NULL DEFAULT '',
        cuerpo TEXT         NOT NULL,
        fecha  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        leido  SMALLINT     NOT NULL DEFAULT 0
    )
");

// Verificar que el destinatario existe
$chk = $conexion->prepare("SELECT id FROM usuarios WHERE usuario = ?");
$chk->bind_param("s", $para);
$chk->execute();
if ($chk->get_result()->num_rows === 0) {
    echo json_encode(['ok' => false, 'error' => 'El destinatario no existe']);
    exit;
}
$chk->close();

$stmt = $conexion->prepare(
    "INSERT INTO mensajes (de, para, asunto, cuerpo) VALUES (?, ?, ?, ?)"
);
$stmt->bind_param("ssss", $de, $para, $asunto, $cuerpo);

if ($stmt->execute()) {
    echo json_encode(['ok' => true]);
} else {
    echo json_encode(['ok' => false, 'error' => 'Error al guardar el mensaje']);
}
