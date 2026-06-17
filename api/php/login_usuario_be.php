<?php
    include 'conexion_starlim_be.php';
    require_once __DIR__ . '/auth.php';
    session_start();

    $identificador = $_POST['correo'] ?? '';
    $contrasena    = $_POST['contrasena'] ?? '';

    if ($identificador === '' || $contrasena === '') {
        echo '<script>alert("Completá usuario y contraseña"); window.location = "../frontend/sign.php";</script>';
        exit;
    }

    // 1. Buscamos al usuario
    $stmt = $conexion->prepare("SELECT * FROM usuarios WHERE correo = ? OR usuario = ?");
    $stmt->bind_param("ss", $identificador, $identificador);
    $stmt->execute();
    $resultado = $stmt->get_result();

    if($usuario_datos = $resultado->fetch_assoc()){
        if (array_key_exists('activo', $usuario_datos) && (int)$usuario_datos['activo'] === 0) {
            echo '<script>alert("Usuario inactivo. Contactá a un administrador."); window.location = "../frontend/sign.php";</script>';
            exit;
        }

        if(starlim_verificar_password($contrasena, $usuario_datos['contrasena'])){

            // Normalizar rangos legacy ('Empleado1', 'Jefe0') y autocurar la fila
            $rango = starlim_normalizar_rango($usuario_datos['rango']);
            if ($rango !== $usuario_datos['rango']) {
                $fix = $conexion->prepare("UPDATE usuarios SET rango = ? WHERE id = ?");
                $fix->bind_param("si", $rango, $usuario_datos['id']);
                $fix->execute();
            }

            $_SESSION['usuario'] = $usuario_datos['usuario'];
            $_SESSION['rango']   = $rango;
            $_SESSION['correo']  = $usuario_datos['correo'];

            // Staff al panel; clientes (Minorista/Mayorista) a la tienda
            $destino = starlim_es_staff($rango) ? 'panel_empleados.php' : 'index.php';
            header("Location: ../frontend/{$destino}");
            exit;
        } else {
            echo '<script>alert("Contraseña incorrecta"); window.location = "../frontend/sign.php";</script>';
            exit;
        }
    } else {
        echo '<script>alert("El usuario o correo no existe"); window.location = "../frontend/sign.php";</script>';
        exit;
    }
?>
