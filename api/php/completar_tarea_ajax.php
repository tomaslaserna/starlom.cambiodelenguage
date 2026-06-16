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

$id_tarea = (int)($_POST['id'] ?? 0);
$mensaje  = trim($_POST['mensaje'] ?? '');
$usuario  = $_SESSION['usuario'];

if ($id_tarea <= 0) {
    echo json_encode(['ok' => false, 'error' => 'ID inválido']);
    exit;
}

include 'conexion_starlim_be.php';

// Verificar que la tarea esté asignada al usuario actual y pendiente
$stmt = $conexion->prepare(
    "SELECT id, titulo, asignado_por FROM tareas_asignadas
     WHERE id = ? AND asignado_a = ? AND completado = 0"
);
$stmt->bind_param('is', $id_tarea, $usuario);
$stmt->execute();
$res = $stmt->get_result();
if ($res->num_rows === 0) {
    echo json_encode(['ok' => false, 'error' => 'Tarea no encontrada o no autorizada']);
    exit;
}
$tarea = $res->fetch_assoc();
$stmt->close();

// Marcar como completada
$stmt = $conexion->prepare(
    "UPDATE tareas_asignadas
     SET completado = 1, mensaje_completado = ?, fecha_completado = NOW()
     WHERE id = ?"
);
$stmt->bind_param('si', $mensaje, $id_tarea);
$stmt->execute();
$stmt->close();

// Enviar mensaje del sistema al que asignó la tarea
$de_sistema = 'Sistema';
$para       = $tarea['asignado_por'];
$titulo_tar = $tarea['titulo'];
$asunto     = "Tarea completada: $titulo_tar";

if ($mensaje !== '') {
    $cuerpo = "Tarea completada por el usuario $usuario.\n\nEl usuario $usuario dejó un mensaje: $mensaje";
} else {
    $cuerpo = "Tarea completada por el usuario $usuario.";
}

$tipo = 'tarea_completada';

$stmt = $conexion->prepare(
    "INSERT INTO mensajes (de, para, asunto, cuerpo, tipo) VALUES (?, ?, ?, ?, ?)"
);
$stmt->bind_param('sssss', $de_sistema, $para, $asunto, $cuerpo, $tipo);
$stmt->execute();
$stmt->close();

echo json_encode(['ok' => true]);
