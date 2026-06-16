<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login Y Registro</title>
    <link rel="stylesheet" href="../css/styleSign.css">
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/theme.css">
</head>  

<body>
    <?php
        $authNotice = '';
        if (isset($_GET['expired'])) {
            $authNotice = 'Tu sesion vencio. Inicia sesion para continuar.';
        } elseif (isset($_GET['no_access'])) {
            $authNotice = 'No tenes acceso a esa seccion con este usuario.';
        }
    ?>

    <div class="menu-sol">
        <img id="dark-mode-toggle" class="luyso" src="../imagenesIndex/luna.png">
    </div>

    <div class="menu">
        <div class="home">
            <a href="index.php">
                <img src="../imagenesSign/house light.png" class="oscuro" alt="">
                <img src="../imagenesSign/house dark.png" class="claro" alt="">
            </a>
        </div>
    </div>

    <header class="header">

    </header>

    <?php if ($authNotice !== ''): ?>
        <div class="auth-notice">
            <?= htmlspecialchars($authNotice, ENT_QUOTES, 'UTF-8') ?>
        </div>
    <?php endif; ?>
 


    <main class="main">

        <div class="contenedor__todo">

            <div class="caja__trasera">
                <div class="caja__trasera-login">
                    <h3>
                        ¿Ya tienes una cuenta?
                    </h3>

                    <p>
                        Inicia sesión para entrar a la página
                    </p>

                    <button id="btn__iniciar-sesion">
                        Iniciar Sesión
                    </button>

                </div>


                <div class="caja__trasera-register">
                    <h3>
                        ¿Aún no tienes una cuenta?
                    </h3>

                    <p>
                        Regístrate para que puedas iniciar sesión
                    </p>

                    <button id="btn__registrarse">
                        Registrarse
                    </button>

                </div>

            </div>
            <!--Formularios de Login y Register-->
            <div class="contenedor__login-register">

                <form action="../php/login_usuario_be.php" method="POST" class="formulario__login">
                    <!--Login-->
                    <h2>
                        Iniciar Sesión
                    </h2>

                    <input type="text" placeholder="Correo Electronico o Usuario" name="correo">
                    <input type="password" placeholder="Contraseña" name="contrasena">

                    <button>
                        Entrar
                    </button>

                </form>

                <form action="../php/registro_usuario_be.php" method="POST" class="formulario__register">
                    <!--Registro-->
                    <h2>
                        Registrarse
                    </h2>
                    <input type="text" placeholder="Nombre completo" name="nombre_completo">
                    <input type="text" placeholder="Correo Electronico" name="correo">
                    <input type="text" placeholder="Usuario" name="usuario">
                    <input type="password" placeholder="Contraseña" name="contrasena">

                    <button>
                        Registrarse
                    </button>
                </form>

            </div>

        </div>

    </main>



    <footer class="footer">

    </footer>


    <script src="../js/scriptSign.js" ></script>
    <script src="../js/global.js"></script>
    
</body>

</html>
