
<?php
    include 'conexion_starlim_be.php';
    require_once __DIR__ . '/auth.php';

    $nombre_completo = $_POST['nombre_completo'];
    $correo = $_POST['correo'];
    $usuario = $_POST['usuario'];
    $contrasena = $_POST['contrasena'];
    $rango = "Minorista";

    // 1. Preparar la contraseña con Pepper y Hash seguro
    $pass_encriptada = starlim_hash_password($contrasena);


    // 2. Verificar codigo
    if (strpos($usuario, 'Empleado_Star_Lim:') === 0) {
        $rango = "Empleado";
    }

    // 3. Verificar si el correo ya existe
    $stmt_correo = $conexion->prepare("SELECT * FROM usuarios WHERE correo = ?");
    $stmt_correo->bind_param("s", $correo);
    $stmt_correo->execute();
    $verify_correo = $stmt_correo->get_result();
    if($verify_correo->num_rows > 0) {
        echo '<script>alert("Este correo ya está registrado"); window.location = "../frontend/sign.php";</script>';
        exit();
    }
    $stmt_correo->close();

    // 4. Verificar si el usuario ya existe
    $stmt_usuario = $conexion->prepare("SELECT * FROM usuarios WHERE usuario = ?");
    $stmt_usuario->bind_param("s", $usuario);
    $stmt_usuario->execute();
    $verify_user = $stmt_usuario->get_result();
    if($verify_user->num_rows > 0) {
        echo '<script>alert("Este usuario ya está registrado"); window.location = "../frontend/sign.php";</script>';
        exit();
    }
    $stmt_usuario->close();

    // 5. INSERTAR usando Sentencias Preparadas
    $stmt = $conexion->prepare("INSERT INTO usuarios (nombre_completo, correo, usuario, contrasena, rango) VALUES (?, ?, ?, ?, ?)");
    $stmt->bind_param("sssss", $nombre_completo, $correo, $usuario, $pass_encriptada, $rango);
    
    if($stmt->execute()){
        echo '
            <script>
                alert("Usuario almacenado exitosamente");
                window.location = "../frontend/index.php";
            </script>
        ';
    } else {
        echo '
            <script>
                alert("Inténtelo de nuevo, usuario no almacenado");
                window.location = "../frontend/sign.php";
            </script>
        ';
    }

    $stmt->close();
    
?>