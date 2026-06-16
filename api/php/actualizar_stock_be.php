<?php
include 'conexion_starlim_be.php';

if ($_SERVER['REQUEST_METHOD'] == 'POST') {
    $ids = $_POST['id'];
    $nombres = $_POST['nombre'];
    $precios = $_POST['precio'];
    $descripciones = $_POST['descripcion'];
    $cantidades = $_POST['cantidad'];
    $imagenes = $_POST['imagen'];

    for ($i = 0; $i < count($ids); $i++) {
        $id = $ids[$i];
        $nombre = $nombres[$i];
        $precio = !empty($precios[$i]) ? $precios[$i] : 0;
        $descripcion = $descripciones[$i];
        $cantidad = !empty($cantidades[$i]) ? $cantidades[$i] : 0;
        $imagen = $imagenes[$i];

        $sql = "UPDATE productos SET
                nombre='$nombre',
                costo='$precio',
                descripcion='$descripcion',
                stock='$cantidad',
                imagen='$imagen'
                WHERE id='$id'";

        $conexion->query($sql);
    }

    header("Location: " . $_SERVER['HTTP_REFERER']);
    exit();
}
?>
