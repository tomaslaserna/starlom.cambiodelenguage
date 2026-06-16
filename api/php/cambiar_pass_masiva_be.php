<?php
ob_start();
ini_set('display_errors', '0');

session_start();
include 'conexion_starlim_be.php';

header('Content-Type: application/json; charset=utf-8');

// Solo Jefe1 puede cambiar la contraseña
if (($_SESSION['rango'] ?? '') !== 'Jefe1') {
    ob_end_clean(); echo json_encode(['error' => 'Solo Jefe1 puede cambiar esta contraseña.']); exit();
}

$passActual = $_POST['pass_actual'] ?? '';
$passNueva  = $_POST['pass_nueva']  ?? '';

if ($passActual === '' || $passNueva === '') {
    ob_end_clean(); echo json_encode(['error' => 'Campos incompletos.']); exit();
}

if (strlen($passNueva) < 6) {
    ob_end_clean(); echo json_encode(['error' => 'La nueva contraseña debe tener al menos 6 caracteres.']); exit();
}

// Verificar contraseña actual
$res = $conexion->query("SELECT valor FROM config_sistema WHERE clave = 'password_carga_masiva' LIMIT 1");
if (!$res || $res->num_rows === 0) {
    ob_end_clean(); echo json_encode(['error' => 'Contraseña no encontrada en el sistema.']); exit();
}
$hashGuardado = $res->fetch_assoc()['valor'];

if (!password_verify($passActual, $hashGuardado)) {
    ob_end_clean(); echo json_encode(['error' => 'La contraseña actual es incorrecta.']); exit();
}

// Guardar nueva contraseña hasheada
$nuevoHash = password_hash($passNueva, PASSWORD_DEFAULT);
$nuevoHash = $nuevoHash;

$upd = $conexion->query("UPDATE config_sistema SET valor = '$nuevoHash' WHERE clave = 'password_carga_masiva'");

ob_end_clean();
if ($upd) {
    echo json_encode(['ok' => true]);
} else {
    echo json_encode(['error' => 'No se pudo actualizar: ' . $conexion->error]);
}
