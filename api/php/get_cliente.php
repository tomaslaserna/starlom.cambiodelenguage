<?php
include 'conexion_starlim_be.php';

$id = intval($_GET['id'] ?? 0);
if (!$id) { echo json_encode([]); die(); }

$res = $conexion->query("SELECT * FROM clientes WHERE id = $id AND (activo = 'true' OR estado = 'Activo')");
$cliente = $res->fetch_assoc();

echo json_encode($cliente);
