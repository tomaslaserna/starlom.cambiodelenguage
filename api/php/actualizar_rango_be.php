<?php
require_once __DIR__ . '/session_bootstrap.php';
starlim_session_start();
include 'conexion_starlim_be.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/tenant.php';

if (!isset($_SESSION['rango']) || ($_SESSION['rango'] !== 'Jefe1' && $_SESSION['rango'] !== 'Admin')) {
    exit('Acceso denegado');
}

$empresa_id = starlim_bootstrap_tenant_context($conexion);
$id = (int)($_POST['id_usuario'] ?? 0);
$nuevo_rango = starlim_normalizar_rango((string)($_POST['nuevo_rango'] ?? ''));

if ($id <= 0) {
    echo '<script>alert("Usuario invalido"); window.location="../frontend/gestion_empleados.php";</script>';
    exit;
}

if (!starlim_rango_valido($nuevo_rango)) {
    echo '<script>alert("Rango invalido"); window.location="../frontend/gestion_empleados.php";</script>';
    exit;
}

if ($nuevo_rango === 'Admin' && $_SESSION['rango'] !== 'Admin') {
    echo '<script>alert("No tenes permiso para asignar rango Admin"); window.location="../frontend/gestion_empleados.php";</script>';
    exit;
}

$stmt = $conexion->prepare("UPDATE usuarios SET rango = ? WHERE id = ?");
$stmt->bind_param("si", $nuevo_rango, $id);

if ($stmt->execute()) {
    $ue = $conexion->prepare(
        "INSERT INTO usuario_empresa (id_usuario, empresa_id, rango, activo)
         VALUES (?, ?, ?, TRUE)
         ON CONFLICT (id_usuario, empresa_id) DO UPDATE
         SET rango = EXCLUDED.rango,
             activo = TRUE,
             updated_at = CURRENT_TIMESTAMP"
    );
    $ue->bind_param("iis", $id, $empresa_id, $nuevo_rango);
    $ue->execute();
    $ue->close();
    echo '<script>alert("Rango actualizado con exito"); window.location="../frontend/gestion_empleados.php";</script>';
} else {
    echo '<script>alert("Error al actualizar"); window.location="../frontend/gestion_empleados.php";</script>';
}

$stmt->close();
