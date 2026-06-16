<?php
/**
 * actualizar_telefono_empleado.php — Setea el teléfono de un empleado
 * (lo usa el reparto para avisar por WhatsApp). Solo Jefe1/Admin.
 */
session_start();
if (!isset($_SESSION['usuario'])) { http_response_code(403); die(); }

include 'conexion_starlim_be.php';
require_once 'auth.php';
header('Content-Type: application/json; charset=utf-8');

$rango = starlim_normalizar_rango($_SESSION['rango'] ?? '');
if (!in_array($rango, ['Jefe1', 'Admin'], true)) {
    echo json_encode(['ok' => false, 'error' => 'Sin permiso']); exit;
}

$id  = (int)($_POST['id'] ?? 0);
$tel = trim($_POST['telefono'] ?? '');
if ($id <= 0)                 { echo json_encode(['ok' => false, 'error' => 'ID inválido']); exit; }
if (mb_strlen($tel) > 30)     { echo json_encode(['ok' => false, 'error' => 'Teléfono demasiado largo']); exit; }

$st = $conexion->prepare("UPDATE usuarios SET telefono = ? WHERE id = ?");
$st->bind_param('si', $tel, $id);
$st->execute();
$st->close();

echo json_encode(['ok' => true, 'telefono' => $tel]);
