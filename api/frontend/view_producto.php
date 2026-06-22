<?php
require_once __DIR__ . '/../php/session_bootstrap.php';
    starlim_session_start();

    if (!isset($_SESSION['usuario'])) {
        $rango = "x";
        $usuario = "x";
    }
    else{
        $rango = $_SESSION['rango'];
        $usuario = $_SESSION['usuario'];
    }

    
    include '../php/conexion_starlim_be.php';

    $query = "SELECT *, costo AS precio, disponible AS cantidad FROM vista_stock_disponible";
    $resultado = $conexion->query($query);
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Producto</title>
    <link rel="stylesheet" href="../css/producto_view.css">
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>
    <div class="contenedor-producto">
        <?php
        if (isset($_GET['id'])) {
            $id_producto = (int)($_GET['id'] ?? 0);
            // Disponible (real menos reservado) determina si se puede comprar
            $query = "SELECT *, costo AS precio, disponible AS cantidad FROM vista_stock_disponible WHERE id = $id_producto";
            $resultado = $conexion->query($query);

            if ($fila = $resultado->fetch_assoc()) { ?>

                <?php $esComprable = ($fila['cantidad'] > 0 && $fila['precio'] > 0); ?>
                
                <!-- Área de la Imagen -->
                <div class="foto">
                    <img class="producto-img" src="../<?php echo $fila['imagen']; ?>" alt="Producto">
                </div>

                <!-- Área del Nombre -->
                <div class="nombre">
                    <h2><?php echo $fila['nombre']; ?></h2>
                </div>

                <!-- Área de Información y Botón -->
                <div class="info">
                    <p class="precio">Precio: $<?php echo $fila['precio']; ?></p>
                    <p>
                        <a href="<?php echo $esComprable ? 'proceso_ventas.php?id=' . $fila['id'] : '#'; ?>">
                            <button class="comprar">COMPRAR</button>
                        </a>
                    </p>
                    <button class="producto-disponible">Agregar al carrito</button>
                    <br><br>
                    <a href="productos.php" class="back">← Volver</a>
                </div>

            <?php } else {
                echo "<p>Producto no encontrado.</p>";
            }
        } else {
            echo "<p>No se seleccionó ningún producto.</p>";
        }
        ?>
    </div>

    <link rel="stylesheet" href="../css/productos.css">
    <link rel="stylesheet" href="../css/global.css">
    <script src="../js/global.js"></script>
</body>
</html>