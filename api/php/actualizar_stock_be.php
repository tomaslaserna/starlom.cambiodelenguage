<?php
require_once __DIR__ . '/session_bootstrap.php';
starlim_session_start();
include 'conexion_starlim_be.php';
$empresaId = starlim_bootstrap_tenant_context($conexion);

if ($_SERVER['REQUEST_METHOD'] == 'POST') {
    $ids = $_POST['id'];
    $nombres = $_POST['nombre'];
    $precios = $_POST['precio'];
    $descripciones = $_POST['descripcion'];
    $cantidades = $_POST['cantidad'];
    $imagenes = $_POST['imagen'];
    $stmt = $conexion->prepare(
        "UPDATE productos
         SET nombre = ?, costo = ?, descripcion = ?, stock = ?, imagen = ?
         WHERE id = ? AND empresa_id = ?"
    );

    for ($i = 0; $i < count($ids); $i++) {
        $id = (int)$ids[$i];
        $nombre = trim((string)$nombres[$i]);
        $precio = !empty($precios[$i]) ? (float)$precios[$i] : 0.0;
        $descripcion = trim((string)$descripciones[$i]);
        $cantidad = !empty($cantidades[$i]) ? (int)$cantidades[$i] : 0;
        $imagen = trim((string)$imagenes[$i]);

        if ($id <= 0) continue;
        $stmt->bind_param('sdsisii', $nombre, $precio, $descripcion, $cantidad, $imagen, $id, $empresaId);
        $stmt->execute();
    }
    $stmt->close();

    header("Location: " . $_SERVER['HTTP_REFERER']);
    exit();
}
?>
