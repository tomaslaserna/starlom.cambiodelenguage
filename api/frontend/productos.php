<?php
    session_start();

    if (!isset($_SESSION['usuario'])) {
        $rango = "x";
        $usuario = "x";
    }
    else{
        $rango = $_SESSION['rango'];
        $usuario = $_SESSION['usuario'];
    }

    
    include '../php/conexion_starlim_be.php';

    // Tienda: mostrar/limitar por stock DISPONIBLE (real menos reservado)
    $query = "SELECT *, disponible AS stock FROM vista_stock_disponible";
    $resultado = $conexion->query($query);

?>




<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Animate on scroll</title>
    <link rel="stylesheet" href="../css/productos.css">
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>
    <img src="../imagenesIndex/bg 6.png" class="claro" id="bg_6" alt="">
    <img src="../imagenesIndex/bg 4.png" class="oscuro" id="bg_6" alt="">
    <div class="space"></div>
    <header class="header">
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
                    <li><a href="index.php" class="ini">Inicio</a></li>
                    <li><a href="#" class="pro">- Productos -</a></li>
                    <li><a href="#footerid" class="con">Contacto</a></li>
                    <?php if ($rango === 'Empleado_1' || $rango === 'Empleado_2' || $rango === 'Jefe' || $rango === 'Jefe1' || $rango === 'Admin'): ?>
                        <li><a href="edit_Stock.php" class="ser">Stock</a></li>
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
                            <a href="sign.php" id="log-in_registro" class="btn-3">Iniciar sesión o Registrarse</a>
                        </div>
                    </li>
                </ul>
            </div>
        </div>
    </header>

    <div class="menu-sol">
        <img id="dark-mode-toggle" class="luyso" src="../imagenesIndex/luna.png" >
    </div>
    <div class="view">
        <?php while ($fila = $resultado->fetch_assoc()): ?>
            <div class="block">
                <!-- Determinamos si el producto es comprable una sola vez -->
                <?php $esComprable = ($fila['stock'] > 0 && $fila['costo'] > 0); ?>

                <!-- El enlace envuelve la imagen para que sea clickable -->
                <a href="<?php echo $esComprable ? 'view_producto.php?id=' . $fila['id'] : '#'; ?>">
                    <img class="producto-img" src="../<?php echo $fila['imagen']; ?>" alt="<?php echo $fila['nombre']; ?>">
                </a>

                <h2 class="producto-name"><?php echo $fila['nombre']; ?></h2>    
                
                <p class="producto-info">
                    <?php if ($fila['costo'] > 0): ?>
                        Precio: $<?php echo number_format($fila['costo'], 2); ?>
                    <?php else: ?>
                        Error al cargar precios
                    <?php endif; ?>
                </p>
                
                <p>
                    <?php if ($esComprable): ?>
                        <button class="producto-disponible">Agregar al carrito</button>
                    <?php else: ?>
                        <span class="agotado">No disponible</span>
                    <?php endif; ?>
                </p>
            </div>
        <?php endwhile; ?>
    </div>


    <script src="../js/global.js"></script>
</body>
</html>
