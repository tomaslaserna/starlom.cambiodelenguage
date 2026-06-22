<?php
require_once __DIR__ . '/session_bootstrap.php';
/**
 * marcar_mensajes_leidos.php — Marca como leídos los mensajes del usuario actual.
 * Lo llama el dropdown de mensajería del nav al abrirse.
 */
starlim_session_start();
if (!isset($_SESSION['usuario'])) { http_response_code(403); die(); }

include 'conexion_starlim_be.php';
require_once __DIR__ . '/mensajes_lib.php';
$empresaId = starlim_bootstrap_tenant_context($conexion);
starlim_mensajes_ensure_schema($conexion);
header('Content-Type: application/json; charset=utf-8');

$usuario = $_SESSION['usuario'];
$st = $conexion->prepare("UPDATE mensajes SET leido = 1 WHERE empresa_id = ? AND para = ? AND leido = 0");
$st->bind_param('is', $empresaId, $usuario);
$st->execute();
$st->close();

echo json_encode(['ok' => true]);
