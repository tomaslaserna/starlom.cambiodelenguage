<?php
require_once __DIR__ . '/session_bootstrap.php';
/**
 * crear_empleado_be.php — Alta de empleados/usuarios desde Gestión de Empleados.
 * Solo Jefe1 / Admin. Reutiliza el hash de contraseñas de auth.php.
 *
 * POST: nombre_completo, usuario, correo (opcional), contrasena, rango
 * Redirige de vuelta a gestion_empleados.php con ?ok=1|0&msg=...
 */
require_once __DIR__ . '/auth.php';
include 'conexion_starlim_be.php';
starlim_session_start();

$rango_actual = starlim_normalizar_rango($_SESSION['rango'] ?? '');
if (!isset($_SESSION['usuario']) || !in_array($rango_actual, ['Jefe1', 'Admin'], true)) {
    header('Location: ../frontend/sign.php');
    exit;
}

function volver(bool $ok, string $msg): void {
    header('Location: ../frontend/gestion_empleados.php?ok=' . ($ok ? '1' : '0') . '&msg=' . urlencode($msg));
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') volver(false, 'Solicitud inválida.');

$nombre     = trim($_POST['nombre_completo'] ?? '');
$correo     = trim($_POST['correo'] ?? '');
$usuario    = trim($_POST['usuario'] ?? '');
$contrasena = (string)($_POST['contrasena'] ?? '');
$rango      = $_POST['rango'] ?? 'Empleado';

// Rangos que se pueden crear desde acá. Jefe1 solo lo crea un Admin; Admin nunca por este flujo.
$permitidos = ['Minorista', 'Mayorista', 'Empleado', 'Empleado_1', 'Empleado_2', 'Jefe'];
if ($rango_actual === 'Admin') $permitidos[] = 'Jefe1';
if (!in_array($rango, $permitidos, true)) $rango = 'Empleado';

if ($nombre === '' || $usuario === '' || $contrasena === '') {
    volver(false, 'Completá nombre, usuario y contraseña.');
}
if (mb_strlen($contrasena) < 6) {
    volver(false, 'La contraseña debe tener al menos 6 caracteres.');
}

// Duplicados
$st = $conexion->prepare("SELECT id FROM usuarios WHERE usuario = ?");
$st->bind_param('s', $usuario);
$st->execute();
$dup_user = $st->get_result()->num_rows > 0;
$st->close();
if ($dup_user) volver(false, 'Ese nombre de usuario ya existe.');

if ($correo !== '') {
    $st = $conexion->prepare("SELECT id FROM usuarios WHERE correo = ?");
    $st->bind_param('s', $correo);
    $st->execute();
    $dup_mail = $st->get_result()->num_rows > 0;
    $st->close();
    if ($dup_mail) volver(false, 'Ese correo ya está registrado.');
}

$hash = starlim_hash_password($contrasena);
$st = $conexion->prepare(
    "INSERT INTO usuarios (nombre_completo, correo, usuario, contrasena, rango) VALUES (?, ?, ?, ?, ?)"
);
$st->bind_param('sssss', $nombre, $correo, $usuario, $hash, $rango);
$ok = $st->execute();
$st->close();

volver($ok, $ok ? "Empleado «{$usuario}» creado correctamente." : 'No se pudo crear el empleado.');
