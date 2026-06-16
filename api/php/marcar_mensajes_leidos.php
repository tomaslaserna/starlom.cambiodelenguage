<?php
/**
 * marcar_mensajes_leidos.php — Marca como leídos los mensajes del usuario actual.
 * Lo llama el dropdown de mensajería del nav al abrirse.
 */
session_start();
if (!isset($_SESSION['usuario'])) { http_response_code(403); die(); }

include 'conexion_starlim_be.php';
header('Content-Type: application/json; charset=utf-8');

$usuario = $_SESSION['usuario'];
$st = $conexion->prepare("UPDATE mensajes SET leido = 1 WHERE para = ? AND leido = 0");
$st->bind_param('s', $usuario);
$st->execute();
$st->close();

echo json_encode(['ok' => true]);
