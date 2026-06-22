<?php
require_once __DIR__ . '/session_bootstrap.php';
starlim_session_start();
if (!isset($_SESSION['usuario'])) { http_response_code(403); die(); }

include 'conexion_starlim_be.php';
header('Content-Type: application/json; charset=utf-8');
$empresaId = starlim_bootstrap_tenant_context($conexion);

$id_remito = intval($_GET['id_remito'] ?? 0);
if (!$id_remito) { echo json_encode([]); exit; }

$stmt = $conexion->prepare(
    "SELECT COALESCE(p.nombre, '(producto eliminado)') AS nombre,
            d.cantidad
     FROM detalle_remitos d
     LEFT JOIN productos p ON p.id = d.id_producto
          AND p.empresa_id = d.empresa_id
     WHERE d.id_remito = ?
       AND d.empresa_id = ?
     ORDER BY d.id ASC"
);
$stmt->bind_param('ii', $id_remito, $empresaId);
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
