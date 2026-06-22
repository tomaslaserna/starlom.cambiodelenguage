<?php
require_once __DIR__ . '/../php/session_bootstrap.php';
    starlim_session_start();

    include '../php/conexion_starlim_be.php';
    $empresaId = starlim_bootstrap_tenant_context($conexion);

    if (!isset($_SESSION['usuario'])) {
        $rango = "x";
    }
    else{
        $rango = $_SESSION['rango'];
    }

    include '../php/conexion_starlim_be.php';

    $query = "SELECT * FROM productos WHERE empresa_id = $empresaId LIMIT 50";
    $resultado = $conexion->query($query);
?>



<!DOCTYPE html>
<html lang="es">

<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Starlim</title>
    <link rel="stylesheet" href="../css/style.css">
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/theme.css">
</head>

<body>

    <header class="header landing-header">
        <div class="bg_4"></div>
        <div class="menu">
            <a href="#" class="logo">Starlim</a>
            <input type="checkbox" id="menu">
                <label for="menu" class="menu-icono">
                    <span></span>
                    <span></span>
                    <span></span>
                </label>
            <nav class="navbar">

                <ul>
                    <li><a href="#" class="ini">Inicio</a></li>
                    <li><a href="productos.php" class="pro">Productos</a></li>
                    <li><a href="#servicios" class="con">Servicios</a></li>
                    <li><a href="#footerid" class="con">Contacto</a></li>
                    <?php if ($rango === 'Empleado_1' || $rango === 'Empleado_2' || $rango === 'Jefe' || $rango === 'Jefe1' || $rango === 'Admin'): ?>
                        <li><a href="panel_empleados.php" class="ser">Panel interno</a></li>
                    <?php endif; ?>
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
                            <?php if (isset($_SESSION['usuario'])): ?>
                                <?php if (in_array($rango, ['Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'], true)): ?>
                                    <a href="panel_empleados.php" id="log-in_registro" class="btn-3">Panel interno</a>
                                <?php else: ?>
                                    <span class="btn-3"><?= htmlspecialchars((string)$_SESSION['usuario']) ?></span>
                                <?php endif; ?>
                                <a href="../php/cerrar_sesion.php" class="btn-3">Cerrar sesi&oacute;n</a>
                            <?php else: ?>
                                <a href="sign.php" id="log-in_registro" class="btn-3">Iniciar sesi&oacute;n o Registrarse</a>
                            <?php endif; ?>
                        </div>
                    </li>
                </ul>
            </div>
        </div>

        <div class="header-content container landing-hero">
            <div class="header-txt hero-copy">
                <span class="hero-eyebrow">Productos de limpieza y gestion comercial</span>
                <h1>Starlim</h1>
                <p>
                    Productos de limpieza, catalogo, pedidos, stock y seguimiento comercial en una experiencia simple para comprar, vender y administrar sin perder control.
                </p>
                <div class="hero-actions">
                    <a href="productos.php" class="btn-1">Ver productos</a>
                    <a href="sign.php" class="btn-1 btn-ghost">Ingresar al sistema</a>
                </div>
                <div class="hero-proof" aria-label="Beneficios principales">
                    <span>Catalogo organizado</span>
                    <span>Gestion de stock</span>
                    <span>Ventas y presupuestos</span>
                </div>
            </div>
        </div>


    </header>




    <section class="quimico container landing-section" id="servicios">

        <span class="section-eyebrow">Catalogo seleccionado</span>
        <h2>Productos para abastecer operaciones de limpieza</h2>
        <p>
            Marcas reconocidas, insumos de alta rotacion y una experiencia pensada para encontrar rapido lo que se necesita.
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

    <section class="info reveal landing-section" id="infoid">
        <div class="info-content container">
            <div class="info-img">
                <img src="../imagenesIndex/Local.png" loading="lazy" alt="Local de Starlim">
            </div>
            <div class="info-txt">
                <span class="section-eyebrow">Atencion y control</span>
                <h2>Compra con informacion clara y gestion ordenada</h2>
                <p>
                    El sistema permite consultar productos, registrar ventas, preparar pedidos y controlar reposicion desde una misma base operativa.
                </p>
                <a href="productos.php" class="btn-1">Explorar catalogo</a>
            </div>
        </div>
    </section>



    <main class="products container reveal landing-section">

        <h2>Productos</h2>
        <p>Una vista rapida de articulos disponibles para limpieza, mantenimiento y abastecimiento diario.</p>
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
        <a href="productos.php" class="btn-2 reveal">Ver catalogo completo</a>

    </main>

    <section class="app container reveal operations-section">

        <div class="app-txt">

            <span class="section-eyebrow">Sistema interno</span>
            <h2>Herramientas para vender, comprar y reponer con menos friccion</h2>
            <p>
                El panel conecta clientes, presupuestos, pedidos, compras, stock y facturacion para que cada equipo vea lo que necesita sin pasos innecesarios.
            </p>
            <div class="operations-grid reveal">
                <article>
                    <strong>Ventas</strong>
                    <span>Presupuestos, comprobantes y seguimiento de entregas.</span>
                </article>
                <article>
                    <strong>Stock</strong>
                    <span>Reconteos, codigos, listas y control de disponibilidad.</span>
                </article>
                <article>
                    <strong>Compras</strong>
                    <span>Reposicion por proveedor y alertas para productos criticos.</span>
                </article>
            </div>
        </div>

        <div class="app-img reveal">
            <img src="../imagenesIndex/phone light.png" loading="lazy" alt="Vista movil del sistema Starlim">
        </div>
    </section>



    <footer class="footer" id="footerid">

        <div class="footer-content container reveal">

            <div class="link">
                <h3>Starlim</h3>
                <ul>
                    <li><a href="#">Inicio</a></li>
                    <li><a href="productos.php">Productos</a></li>
                    <li><a href="#servicios">Servicios</a></li>
                    <li><a href="sign.php">Acceso al sistema</a></li>
                </ul>
            </div>

            <div class="link">
                <h3>Operacion</h3>
                <ul>
                    <li><a href="presupuestar.php">Presupuestos</a></li>
                    <li><a href="pedidos.php">Pedidos</a></li>
                    <li><a href="stock.php">Stock</a></li>
                    <li><a href="compras.php">Compras</a></li>
                </ul>
            </div>

            <div class="link">
                <h3>Gestion</h3>
                <ul>
                    <li><a href="clientes.php">Clientes</a></li>
                    <li><a href="proveedores.php">Proveedores</a></li>
                    <li><a href="ventas_registradas.php">Ventas registradas</a></li>
                    <li><a href="panel_empleados.php">Panel interno</a></li>
                </ul>
            </div>

            <div class="link">
                <h3>Contacto</h3>
                <p>Consultas comerciales, pedidos y soporte operativo desde los canales habituales de Starlim.</p>
                <a href="sign.php" class="footer-cta">Ingresar</a>
            </div>


        </div>
        <!--<img src="../imagenesIndex/bg 3.png" id="bg-3" class="oscuro" alt="">
        <img src="../imagenesIndex/bg 5.png" id="bg-3" class="claro" alt="">-->
    </footer>


    <script src="../js/script.js" ></script>
    <script src="../js/global.js"></script>

</body>

</html>
