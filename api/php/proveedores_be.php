<?php
require_once __DIR__ . '/session_bootstrap.php';
/**
 * proveedores_be.php — Alta/edición/baja de proveedores (Base de Datos).
 * Acciones (POST): add_proveedor | edit_proveedor | del_proveedor.
 * (Lógica movida desde compras.php.)
 */
starlim_session_start();
if (!isset($_SESSION['usuario'])) { http_response_code(403); die(); }

include 'conexion_starlim_be.php';
require_once 'auth.php';
require_once __DIR__ . '/tenant.php';
header('Content-Type: application/json; charset=utf-8');
$empresa_id = starlim_bootstrap_tenant_context($conexion);

$rango = starlim_normalizar_rango($_SESSION['rango'] ?? '');
if (!in_array($rango, ['Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'], true)) {
    echo json_encode(['ok' => false, 'error' => 'Sin permiso']); exit;
}

$accion    = $_POST['accion']    ?? '';
$id        = (int)($_POST['id']  ?? 0);
$nombre    = trim($_POST['nombre']    ?? '');
$contacto  = trim($_POST['contacto']  ?? '');
$telefono  = trim($_POST['telefono']  ?? '');
$email     = trim($_POST['email']     ?? '');
$direccion = trim($_POST['direccion'] ?? '');
$notas     = trim($_POST['notas']     ?? '');

if ($accion === 'add_proveedor') {
    if ($nombre === '') { echo json_encode(['ok' => false, 'error' => 'El nombre es obligatorio']); exit; }
    $s = $conexion->prepare(
        "INSERT INTO proveedores (nombre,contacto,telefono,email,direccion,notas,empresa_id) VALUES (?,?,?,?,?,?,?) RETURNING id"
    );
    $s->bind_param('ssssssi', $nombre, $contacto, $telefono, $email, $direccion, $notas, $empresa_id);
    $s->execute();
    $nid = (int)$s->get_result()->fetch_assoc()['id'];
    $s->close();
    echo json_encode(['ok' => true, 'id' => $nid]);
    exit;
}

if ($accion === 'edit_proveedor') {
    if ($id <= 0 || $nombre === '') { echo json_encode(['ok' => false, 'error' => 'Datos inválidos']); exit; }
    $s = $conexion->prepare(
        "UPDATE proveedores SET nombre=?,contacto=?,telefono=?,email=?,direccion=?,notas=? WHERE id=? AND empresa_id=?"
    );
    $s->bind_param('ssssssii', $nombre, $contacto, $telefono, $email, $direccion, $notas, $id, $empresa_id);
    $s->execute(); $s->close();
    echo json_encode(['ok' => true]);
    exit;
}

if ($accion === 'del_proveedor') {
    if ($id <= 0) { echo json_encode(['ok' => false, 'error' => 'ID inválido']); exit; }
    $s = $conexion->prepare("DELETE FROM proveedores WHERE id = ? AND empresa_id = ?");
    $s->bind_param('ii', $id, $empresa_id); $s->execute(); $s->close();
    echo json_encode(['ok' => true]);
    exit;
}

echo json_encode(['ok' => false, 'error' => 'Acción desconocida']);
