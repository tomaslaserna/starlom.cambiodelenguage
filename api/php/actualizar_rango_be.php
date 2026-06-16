<?php
    session_start();
    include 'conexion_starlim_be.php';

    // Validar que quien intenta cambiar sea Jefe1 o Admin
    if(!isset($_SESSION['rango']) || ($_SESSION['rango'] != 'Jefe1' && $_SESSION['rango'] != 'Admin')){
        exit("Acceso denegado");
    }

    require_once __DIR__ . '/auth.php';

    $id = $_POST['id_usuario'];
    $nuevo_rango = $_POST['nuevo_rango'];

    // Solo rangos canónicos del sistema (whitelist)
    if(!starlim_rango_valido($nuevo_rango)){
        echo '<script>alert("Rango inválido"); window.location="../frontend/gestion_empleados.php";</script>';
        exit();
    }

    // El Jefe1 NO puede crear Admins (Seguridad extra)
    if($nuevo_rango == 'Admin' && $_SESSION['rango'] != 'Admin'){
        echo '<script>alert("No tienes permiso para asignar rango Admin"); window.location="../frontend/gestion_empleados.php";</script>';
        exit();
    }

    // Actualizamos en la DB
    $stmt = $conexion->prepare("UPDATE usuarios SET rango = ? WHERE id = ?");
    $stmt->bind_param("si", $nuevo_rango, $id);

    if($stmt->execute()){
        echo '<script>alert("Rango actualizado con éxito"); window.location="../frontend/gestion_empleados.php";</script>';
    } else {
        echo '<script>alert("Error al actualizar"); window.location="../frontend/gestion_empleados.php";</script>';
    }

    $stmt->close();
    
?>
