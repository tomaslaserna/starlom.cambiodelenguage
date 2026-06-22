<?php
require_once __DIR__ . '/session_bootstrap.php';
starlim_session_start();
header('Content-Type: application/json');

if (!isset($_SESSION['usuario'])) {
    http_response_code(401);
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
require_once __DIR__ . '/mensajes_lib.php';
$empresaId = starlim_bootstrap_tenant_context($conexion);
starlim_mensajes_ensure_schema($conexion);

// Verificar que el destinatario existe
$chk = $conexion->prepare("
    SELECT u.id
    FROM usuarios u
    JOIN usuario_empresa ue ON ue.id_usuario = u.id
    WHERE u.usuario = ? AND ue.empresa_id = ? AND ue.activo = TRUE
    LIMIT 1
");
$chk->bind_param("si", $para, $empresaId);
$chk->execute();
if ($chk->get_result()->num_rows === 0) {
    echo json_encode(['ok' => false, 'error' => 'El destinatario no existe']);
    exit;
}
$chk->close();

$stmt = $conexion->prepare(
    "INSERT INTO mensajes (de, para, asunto, cuerpo, tipo, empresa_id) VALUES (?, ?, ?, ?, 'directo', ?)"
);
$stmt->bind_param("ssssi", $de, $para, $asunto, $cuerpo, $empresaId);

if ($stmt->execute()) {
    echo json_encode(['ok' => true]);
} else {
    echo json_encode(['ok' => false, 'error' => 'Error al guardar el mensaje']);
}
