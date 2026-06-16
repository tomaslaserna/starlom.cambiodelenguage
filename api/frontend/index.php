<?php
    session_start();

    include '../php/conexion_starlim_be.php';

    if (!isset($_SESSION['usuario'])) {
        $rango = "x";
    }
    else{
        $rango = $_SESSION['rango'];
    }
    
    include '../php/conexion_starlim_be.php';

    $query = "SELECT * FROM productos LIMIT 50";
    $resultado = $conexion->query($query);
?>



<!DOCTYPE html>
<html lang="es">

<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Star Lim</title>
    <link rel="stylesheet" href="../css/style.css">
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/theme.css">
</head>

<body>
 
    <header class="header">
        <div class="bg_4"></div>
        <div class="menu">
            <a href="#" class="logo">Star Lim</a>
            <input type="checkbox" id="menu">
                <label for="menu" class="menu-icono">
                    <span></span>
                    <span></span>
                    <span></span>
                </label>
            <nav class="navbar">

                <ul>
                    <li><a href="#" class="ini">- Inicio -</a></li>
                    <li><a href="productos.php" class="pro">Productos</a></li>
                    <li><a href="#footerid" class="con">Contacto</a></li>
                    <?php if ($rango === 'Empleado_1' || $rango === 'Empleado_2' || $rango === 'Jefe' || $rango === 'Jefe1' || $rango === 'Admin'): ?>
                        <li><a href="panel_empleados.php" class="ser">Empleados</a></li>
                    <?php endif; ?>
                    <li>
                        <div class="menu-sol">
                            <img id="dark-mode-toggle" class="luyso" src="../imagenesIndex/luna.png" >
                        </div>
                    </li>
                </ul>
            </nav>
            <div>
                <ul>
                    <li class="submenu">
                        <img src="../imagenesIndex/carrito light.png" id="img-carrito" class="claro" loading="lazy" alt="">
                        <img src="../imagenesIndex/carrito dark.png" id="img-carrito" class="oscuro" loading="lazy" alt="">
                        <div id="carrito">
                            <table id="lista-carrito">
                                <thead>
                                    <tr>
                                        <th>Imagen</th>
                                        <th>Nombre</th>
                                        <th>Precio</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody></tbody>
                            </table>
                            <a href="#" id="vaciar-carrito" class="btn-3">Vaciar Carrito</a>
                        </div>
                    </li>
                </ul>
            </div>
            <div>
                <ul>
                    <li class="submenu">
                        <input type="checkbox" id="menu-usuario">

                        <label for="menu-usuario">
                            <img src="../imagenesIndex/usuario light.png" id="img-usuario" class="claro" loading="lazy" alt="">
                            <img src="../imagenesIndex/usuario dark.png" id="img-usuario" class="oscuro" loading="lazy" alt="">
                        </label>
                        <div id="usuario">
                            <a href="sign.php" id="log-in_registro" class="btn-3">Iniciar sesión o Registrarse</a>
                        </div>
                    </li>
                </ul>
            </div>
        </div>

        <div class="header-content container">
            <div class="header-txt">
                <h1> <span>Bienvenido,</span> disfruta de nuestros productos </h1>
                <p>
                    Lorem ipsum dolor sit, amet consectetur adipisicing elit. Debitis sapiente quibusdam voluptatem
                    eligendi modi iure minus beatae, vero, dolorum quo tempore animi, ipsam ullam illum veniam similique
                    distinctio. Doloremque, porro.
                </p>
                <a href="#" class="btn-1">Informacion</a>
            </div>
            <div class="header-img">
                <img src="../imagenesIndex/logo nuevo starlim-04.png" class="claro" loading="lazy" alt="">
                <img src="../imagenesIndex/logo starlim blanco.png" class="oscuro" loading="lazy" alt="">
            </div>
        </div>


    </header>




    <section class="quimico container">

        <h2>Productos de las mejores marcas</h2>
        <p>
            Solo lo mejor de lo mejor
        </p>

        <div class="quimico-content reveal">
            <div class="quimico-1">
                <img src="../imagenesIndex/Magistral.png" loading="lazy" alt="">
                <h3>Magistral</h3>
            </div>
            <div class="quimico-1">
                <img src="../imagenesIndex/Mr Musculo.png" loading="lazy" alt="">
                <h3>Mr. Musculo</h3>
            </div>
            <div class="quimico-1">
                <img src="../imagenesIndex/Nevex.png" loading="lazy" alt="">
                <h3>Nevex</h3>
            </div>
            <div class="quimico-1">
                <img src="../imagenesIndex/Tide.png" loading="lazy" alt="">
                <h3>Tide</h3>
            </div>
        </div>

    </section>

    <section class="info reveal" id="infoid">
        <div class="info-content container">
            <div class="info-img">
                <img src="../imagenesIndex/Local.png" loading="lazy" alt="">
            </div>
            <div class="info-txt">
                <h2>La mejor calidad en los productos</h2>
                <p>
                    Lorem ipsum dolor sit amet consectetur adipisicing elit. Accusantium dolorum ab similique ratione
                    optio. Unde nesciunt sequi molestias, error, quis reiciendis quas, nobis ea earum minima ullam vel
                    perferendis maiores!
                </p>
                <a href="#" class="btn-1">Informacion</a>
            </div>
        </div>
    </section>



    <main class="products container reveal">

        <h2>Productos</h2>
        <img src="../imagenesIndex/bg block.png" style="opacity: 0; width: 100%; z-index: 999999; display: block; position: absolute;" alt="">
        <div class="carousel">
            <div class="box-container">
                <?php 
                $productos = [];
                while ($fila = $resultado->fetch_assoc()) { $productos[] = $fila; }
                
                foreach ($productos as $p) { ?>
                    <div class="box">
                        <img src="<?= htmlspecialchars(str_starts_with($p['imagen'] ?? '', 'http') ? $p['imagen'] : '../' . $p['imagen']) ?>" alt="<?= htmlspecialchars($p['nombre']) ?>">
                        <p><?= $p['nombre']; ?></p>
                        <p>$<?= $p['costo']; ?></p>
                    </div>
                <?php } ?>

                <?php foreach ($productos as $p) { ?>
                    <div class="box">
                        <img src="<?= htmlspecialchars(str_starts_with($p['imagen'] ?? '', 'http') ? $p['imagen'] : '../' . $p['imagen']) ?>" alt="<?= htmlspecialchars($p['nombre']) ?>">
                        <p><?= $p['nombre']; ?></p>
                        <p>$<?= $p['costo']; ?></p>
                    </div>
                <?php } ?>
            </div>
        </div>
        <a href="productos.php" class="btn-2 reveal">Ver mas</a>

    </main>

    <section class="app container reveal">

        <div class="app-txt">

            <h2>Descarga nuestra app y descubre ofertas</h2>
            <p>
                Lorem ipsum dolor sit amet consectetur adipisicing elit. Blanditiis, vel perferendis! Ad tempora quaerat
                laudantium, id autem vitae distinctio facere eius veritatis quae neque a nemo, sint incidunt nesciunt
                voluptatem!
            </p>
            <div class="descarga reveal">
                <div>
                    <img src="../imagenesIndex/google light.png" class="claro" loading="lazy" alt="">
                    <img src="../imagenesIndex/google dark.png" class="oscuro" loading="lazy" alt="">
                </div>
                <div>
                    <img src="../imagenesIndex/apple light.png" class="claro" loading="lazy" alt="">
                    <img src="../imagenesIndex/apple dark.png" class="oscuro" loading="lazy" alt="">
                </div>
            </div>
        </div>

        <div class="app-img reveal">
            <img src="../imagenesIndex/phone light.png" class="claro" loading="lazy" alt="">
            <img src="../imagenesIndex/phone dark.png" class="oscuro" loading="lazy" alt="">            
        </div>
    </section>



    <footer class="footer" id="footerid">

        <div class="footer-content container reveal">

            <div class="link">
                <h3>Lorem</h3>
                <ul>
                    <li><a href="#">Lorem</a></li>
                    <li><a href="#">Lorem</a></li>
                    <li><a href="#">Lorem</a></li>
                    <li><a href="#">Lorem</a></li>
                </ul>
            </div>

            <div class="link">
                <h3>Lorem</h3>
                <ul>
                    <li><a href="#">Lorem</a></li>
                    <li><a href="#">Lorem</a></li>
                    <li><a href="#">Lorem</a></li>
                    <li><a href="#">Lorem</a></li>
                </ul>
            </div>

            <div class="link">
                <h3>Lorem</h3>
                <ul>
                    <li><a href="#">Lorem</a></li>
                    <li><a href="#">Lorem</a></li>
                    <li><a href="#">Lorem</a></li>
                    <li><a href="#">Lorem</a></li>
                </ul>
            </div>

            <div class="link">
                <h3>Lorem</h3>
                <div class="descarga">
                    <img src="../imagenesIndex/google light.png" loading="lazy" alt="">
                    <img src="../imagenesIndex/apple light.png" loading="lazy" alt="">

                </div>
            </div>

            
        </div>
        <!--<img src="../imagenesIndex/bg 3.png" id="bg-3" class="oscuro" alt="">
        <img src="../imagenesIndex/bg 5.png" id="bg-3" class="claro" alt="">-->
    </footer>


    <script src="../js/script.js" ></script>
    <script src="../js/global.js"></script>
    
</body>

</html>