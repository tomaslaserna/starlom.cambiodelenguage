<?php
require_once __DIR__ . '/session_bootstrap.php';
starlim_session_start();
if (!isset($_SESSION['usuario'])) { http_response_code(403); die(); }

include 'conexion_starlim_be.php';
header('Content-Type: application/json; charset=utf-8');
$empresaId = starlim_bootstrap_tenant_context($conexion);

$id_venta = intval($_GET['id_venta'] ?? 0);
if (!$id_venta) { echo json_encode([]); exit; }

$stmt = $conexion->prepare(
    "SELECT COALESCE(d.nombre_producto, p.nombre, '(producto eliminado)') AS nombre,
            d.cantidad,
            d.precio_unit,
            COALESCE(d.descuento, 0) AS descuento,
            d.subtotal
     FROM detalle_ventas d
     LEFT JOIN productos p ON p.id = d.id_producto
          AND p.empresa_id = d.empresa_id
     WHERE d.id_venta = ?
       AND d.empresa_id = ?
     ORDER BY d.id ASC"
);
$stmt->bind_param('ii', $id_venta, $empresaId);
$stmt->execute();
$rows = $stmt->get_result();

$out = [];
while ($r = $rows->fetch_assoc()) {
    $out[] = [
        'nombre'      => $r['nombre'],
        'cantidad'    => (int)$r['cantidad'],
        'precio_unit' => (float)$r['precio_unit'],
        'descuento'   => (float)$r['descuento'],
        'subtotal'    => (float)$r['subtotal'],
    ];
}
echo json_encode($out);
