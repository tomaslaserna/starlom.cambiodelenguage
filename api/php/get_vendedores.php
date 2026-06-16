<?php
include 'conexion_starlim_be.php';

$res = $conexion->query("SELECT id, nombre, apellido, lista_precios_fav FROM operadores ORDER BY nombre ASC"
);

$vendedores = [];
while ($v = $res->fetch_assoc()) {
    $vendedores[] = $v;
}

echo json_encode($vendedores);