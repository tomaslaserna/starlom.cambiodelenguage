<?php
session_start();
if (!isset($_SESSION['usuario'])) { http_response_code(403); die(); }

include 'conexion_starlim_be.php';
header('Content-Type: application/json; charset=utf-8');

$id_remito = intval($_GET['id_remito'] ?? 0);
if (!$id_remito) { echo json_encode([]); exit; }

$stmt = $conexion->prepare(
    "SELECT COALESCE(p.nombre, '(producto eliminado)') AS nombre,
            d.cantidad
     FROM detalle_remitos d
     LEFT JOIN productos p ON p.id = d.id_producto
     WHERE d.id_remito = ?
     ORDER BY d.id ASC"
);
$stmt->bind_param('i', $id_remito);
$stmt->execute();
$rows = $stmt->get_result();

$out = [];
while ($r = $rows->fetch_assoc()) {
    $out[] = [
        'nombre'   => $r['nombre'],
        'cantidad' => (int)$r['cantidad'],
    ];
}
echo json_encode($out);
