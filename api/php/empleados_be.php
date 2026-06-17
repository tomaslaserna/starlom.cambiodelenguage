<?php
/**
 * empleados_be.php - Alta/edicion/estado/permisos de empleados.
 */
require_once __DIR__ . '/auth.php';
include 'conexion_starlim_be.php';
require_once __DIR__ . '/empleados_lib.php';

if (session_status() === PHP_SESSION_NONE) session_start();

$rangoActual = starlim_normalizar_rango($_SESSION['rango'] ?? '');
if (!isset($_SESSION['usuario']) || !in_array($rangoActual, ['Jefe1', 'Admin'], true)) {
    header('Location: ../frontend/sign.php');
    exit;
}

$pdo = $conexion->getPDO();
starlim_empleados_ensure_schema($pdo);

function empleados_volver(bool $ok, string $msg): void {
    header('Location: ../frontend/gestion_empleados.php?ok=' . ($ok ? '1' : '0') . '&msg=' . urlencode($msg));
    exit;
}

function empleados_rangos_permitidos(string $rangoActual): array {
    $rangos = ['Empleado', 'Empleado_1', 'Empleado_2', 'Jefe'];
    if ($rangoActual === 'Admin') $rangos[] = 'Jefe1';
    if ($rangoActual === 'Admin') $rangos[] = 'Admin';
    return $rangos;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    empleados_volver(false, 'Solicitud invalida.');
}

$accion = trim($_POST['accion'] ?? '');
$id = (int)($_POST['id'] ?? 0);

try {
    if ($accion === 'toggle_estado') {
        if ($id <= 0) empleados_volver(false, 'ID invalido.');

        $stmt = $pdo->prepare("SELECT id, usuario, rango FROM usuarios WHERE id = ?");
        $stmt->execute([$id]);
        $target = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$target) empleados_volver(false, 'Empleado no encontrado.');
        if ($target['usuario'] === ($_SESSION['usuario'] ?? '')) empleados_volver(false, 'No podes desactivar tu propio usuario.');
        if ($target['rango'] === 'Admin' && $rangoActual !== 'Admin') empleados_volver(false, 'No tenes permiso para modificar un Admin.');

        $stmt = $pdo->prepare("UPDATE usuarios SET activo = CASE WHEN COALESCE(activo, 1) = 1 THEN 0 ELSE 1 END WHERE id = ?");
        $stmt->execute([$id]);
        empleados_volver(true, 'Estado actualizado.');
    }

    if (!in_array($accion, ['crear', 'editar'], true)) {
        empleados_volver(false, 'Accion desconocida.');
    }

    $esCrear = $accion === 'crear';
    if (!$esCrear && $id <= 0) empleados_volver(false, 'ID invalido.');

    $nombre = trim($_POST['nombre'] ?? '');
    $apellido = trim($_POST['apellido'] ?? '');
    $dni = trim($_POST['dni'] ?? '');
    $telefono = trim($_POST['telefono'] ?? '');
    $correo = trim($_POST['correo'] ?? '');
    $usuario = trim($_POST['usuario'] ?? '');
    $cargo = trim($_POST['cargo'] ?? '');
    $rango = starlim_normalizar_rango(trim($_POST['rango'] ?? 'Empleado'));
    $activo = !empty($_POST['activo']) ? 1 : 0;
    $fechaIngreso = trim($_POST['fecha_ingreso'] ?? '');
    $observaciones = trim($_POST['observaciones'] ?? '');
    $contrasena = (string)($_POST['contrasena'] ?? '');
    $permisos = $_POST['permisos'] ?? [];

    if ($nombre === '' || $usuario === '' || $correo === '') {
        empleados_volver(false, 'Completá nombre, usuario y email.');
    }
    if (!filter_var($correo, FILTER_VALIDATE_EMAIL)) {
        empleados_volver(false, 'Email invalido.');
    }
    if (!in_array($rango, empleados_rangos_permitidos($rangoActual), true)) {
        $rango = 'Empleado';
    }
    if ($esCrear && mb_strlen($contrasena) < 6) {
        empleados_volver(false, 'La contraseña debe tener al menos 6 caracteres.');
    }
    if (!$esCrear && $contrasena !== '' && mb_strlen($contrasena) < 6) {
        empleados_volver(false, 'La nueva contraseña debe tener al menos 6 caracteres.');
    }
    if (mb_strlen($telefono) > 30 || mb_strlen($dni) > 30) {
        empleados_volver(false, 'DNI o telefono demasiado largo.');
    }

    if (!$esCrear) {
        $stmt = $pdo->prepare("SELECT rango FROM usuarios WHERE id = ?");
        $stmt->execute([$id]);
        $target = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$target) empleados_volver(false, 'Empleado no encontrado.');
        if ($target['rango'] === 'Admin' && $rangoActual !== 'Admin') empleados_volver(false, 'No tenes permiso para editar un Admin.');
    }

    $dupParams = $esCrear ? [$usuario, $correo] : [$usuario, $correo, $id];
    $dupSql = $esCrear
        ? "SELECT id FROM usuarios WHERE usuario = ? OR correo = ? LIMIT 1"
        : "SELECT id FROM usuarios WHERE (usuario = ? OR correo = ?) AND id <> ? LIMIT 1";
    $stmt = $pdo->prepare($dupSql);
    $stmt->execute($dupParams);
    if ($stmt->fetch(PDO::FETCH_ASSOC)) {
        empleados_volver(false, 'Ya existe un empleado con ese usuario o email.');
    }

    $nombreCompleto = trim($nombre . ' ' . $apellido);
    $fechaIngresoDb = $fechaIngreso !== '' ? $fechaIngreso : null;

    $pdo->beginTransaction();

    if ($esCrear) {
        $hash = starlim_hash_password($contrasena);
        $stmt = $pdo->prepare("
            INSERT INTO usuarios
                (nombre_completo, nombre, apellido, dni, telefono, correo, usuario, contrasena,
                 rango, cargo, activo, fecha_ingreso, observaciones)
            VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id
        ");
        $stmt->execute([
            $nombreCompleto, $nombre, $apellido, $dni, $telefono, $correo, $usuario, $hash,
            $rango, $cargo, $activo, $fechaIngresoDb, $observaciones,
        ]);
        $id = (int)$stmt->fetchColumn();
    } else {
        $sets = "
            nombre_completo = ?, nombre = ?, apellido = ?, dni = ?, telefono = ?, correo = ?,
            usuario = ?, rango = ?, cargo = ?, activo = ?, fecha_ingreso = ?, observaciones = ?
        ";
        $params = [
            $nombreCompleto, $nombre, $apellido, $dni, $telefono, $correo,
            $usuario, $rango, $cargo, $activo, $fechaIngresoDb, $observaciones,
        ];
        if ($contrasena !== '') {
            $sets .= ", contrasena = ?";
            $params[] = starlim_hash_password($contrasena);
        }
        $params[] = $id;
        $stmt = $pdo->prepare("UPDATE usuarios SET $sets WHERE id = ?");
        $stmt->execute($params);
    }

    starlim_empleados_sync_rol($pdo, $id, $rango);
    starlim_empleados_guardar_permisos($pdo, $id, is_array($permisos) ? $permisos : []);

    $pdo->commit();
    empleados_volver(true, $esCrear ? 'Empleado creado correctamente.' : 'Empleado actualizado correctamente.');
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    empleados_volver(false, 'Error al guardar: ' . $e->getMessage());
}
