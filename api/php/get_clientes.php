<?php
include 'conexion_starlim_be.php';

$res = $conexion->query("SELECT id, nombre_cliente, codigo_cliente, tipo_id, nro_id, cond_iva, 
            provincia, ciudad, sucursales, nombre_sucursal, lista_precios
     FROM clientes WHERE activo = 'true' OR estado = 'Activo' ORDER BY nombre_cliente ASC"
);

$clientes = [];
while ($c = $res->fetch_assoc()) {
    $clientes[] = $c;
}

echo json_encode($clientes);
