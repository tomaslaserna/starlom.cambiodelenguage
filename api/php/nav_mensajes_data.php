<?php
require_once __DIR__ . '/session_bootstrap.php';
starlim_session_start();
header('Content-Type: application/json; charset=utf-8');

if (!isset($_SESSION['usuario'])) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'No autenticado']);
    exit;
}

include 'conexion_starlim_be.php';
require_once __DIR__ . '/mensajes_lib.php';
$empresaId = starlim_bootstrap_tenant_context($conexion);
starlim_mensajes_ensure_schema($conexion);

$usuario = trim((string)$_SESSION['usuario']);
$mensajes = [];
$empleados = [];

$stmt = $conexion->prepare(
    "SELECT de, asunto, cuerpo, fecha, leido, tipo
     FROM mensajes WHERE empresa_id = ? AND para = ? ORDER BY fecha DESC LIMIT 15"
);
if ($stmt) {
    $stmt->bind_param('is', $empresaId, $usuario);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($row = $res->fetch_assoc()) {
        $fecha = strtotime((string)($row['fecha'] ?? ''));
        $mensajes[] = [
            'de' => (string)($row['de'] ?? ''),
            'asunto' => (string)($row['asunto'] ?? ''),
            'cuerpo_preview' => mb_substr((string)($row['cuerpo'] ?? ''), 0, 90),
            'fecha_fmt' => $fecha ? date('d/m H:i', $fecha) : '',
            'leido' => (int)($row['leido'] ?? 0),
            'tipo' => (string)($row['tipo'] ?? ''),
        ];
    }
    $stmt->close();
}

$ne = $conexion->query("
    SELECT u.usuario
    FROM usuarios u
    JOIN usuario_empresa ue ON ue.id_usuario = u.id
    WHERE ue.empresa_id = $empresaId
      AND ue.activo = TRUE
      AND COALESCE(ue.rango, u.rango) NOT IN ('Minorista','Mayorista')
    ORDER BY u.usuario ASC
");
if ($ne) {
    while ($er = $ne->fetch_assoc()) {
        $emp = (string)($er['usuario'] ?? '');
        if ($emp !== '' && $emp !== $usuario) $empleados[] = $emp;
    }
}

echo json_encode([
    'ok' => true,
    'mensajes' => $mensajes,
    'empleados' => $empleados,
], JSON_UNESCAPED_UNICODE);
