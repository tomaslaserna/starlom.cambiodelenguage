<?php
require_once __DIR__ . '/session_bootstrap.php';
starlim_session_start();
header('Content-Type: application/json; charset=utf-8');

if (!isset($_SESSION['usuario'])) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'SESSION_EXPIRED']);
    exit;
}

$rango = starlim_normalizar_rango((string)($_SESSION['rango'] ?? ''));
if (!in_array($rango, ['Jefe', 'Jefe1', 'Admin'], true)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'FORBIDDEN']);
    exit;
}

include 'conexion_starlim_be.php';
$empresaId = starlim_bootstrap_tenant_context($conexion);

$periodo = trim($_GET['periodo'] ?? 'mes');
if (!in_array($periodo, ['mes', 'anio', 'todos'], true)) $periodo = 'mes';

// Period filters applied to v.fecha (ventas branch) and r.fecha (standalone remitos branch)
if ($periodo === 'mes') {
    $where_v = "EXTRACT(YEAR  FROM v.fecha) = EXTRACT(YEAR  FROM CURRENT_DATE) AND EXTRACT(MONTH FROM v.fecha) = EXTRACT(MONTH FROM CURRENT_DATE)";
    $where_r = "EXTRACT(YEAR  FROM r.fecha) = EXTRACT(YEAR  FROM CURRENT_DATE) AND EXTRACT(MONTH FROM r.fecha) = EXTRACT(MONTH FROM CURRENT_DATE)";
} elseif ($periodo === 'anio') {
    $where_v = "EXTRACT(YEAR FROM v.fecha) = EXTRACT(YEAR FROM CURRENT_DATE)";
    $where_r = "EXTRACT(YEAR FROM r.fecha) = EXTRACT(YEAR FROM CURRENT_DATE)";
} else {
    $where_v = '1=1';
    $where_r = '1=1';
}

// UNION ventas ENTREGADAS + standalone remitos legacy:
//   is_venta=1  → ventas row (solo estado_pedido='entregado': los pedidos
//                 sin entregar viven en pedidos.php y no son venta todavía)
//   is_venta=0  → standalone remito (id_venta IS NULL)
//
// Facturada = tiene CAE (factura ARCA emitida). En el circuito de pedidos
// toda venta tiene remito, así que "tiene remito" ya no distingue nada.
$sql = "
SELECT
    COUNT(*)                                                                  AS total_facturas,
    COALESCE(SUM(monto), 0)                                                   AS total_monto,
    COALESCE(SUM(CASE WHEN is_venta = 1 AND con_factura THEN monto ELSE 0 END), 0) AS facturadas,
    COALESCE(SUM(CASE WHEN NOT con_factura              THEN monto ELSE 0 END), 0) AS no_facturadas
FROM (
    SELECT
        v.monto,
        COALESCE(v.cae, '') <> '' AS con_factura,
        1 AS is_venta
    FROM ventas v
    WHERE v.empresa_id = $empresaId
      AND COALESCE(v.estado_pedido, 'entregado') = 'entregado'
      AND $where_v

    UNION ALL

    SELECT
        r.monto,
        FALSE AS con_factura,
        0     AS is_venta
    FROM remitos r
    WHERE r.empresa_id = $empresaId
      AND r.id_venta IS NULL
      AND COALESCE(r.estado_pedido, 'entregado') = 'entregado'
      AND $where_r
) AS combined";

$res = $conexion->query($sql);
$row = $res->fetch_assoc();

// Pendiente/vencido son saldos vigentes de cobro: no dependen del período
// seleccionado (una deuda de mayo sigue pendiente aunque se mire junio).
// Solo deben dinero las ventas ENTREGADAS (un pedido sin entregar no es deuda).
$res2 = $conexion->query("
SELECT
    COALESCE(SUM(CASE WHEN COALESCE(estado_cobro,'pendiente') IN ('pendiente','en_proceso','pendiente_aprobacion') THEN monto ELSE 0 END), 0) AS pendiente,
    COALESCE(SUM(CASE WHEN estado_cobro = 'vencido' THEN monto ELSE 0 END), 0) AS vencido
FROM ventas
WHERE empresa_id = $empresaId
  AND COALESCE(estado_pedido, 'entregado') = 'entregado'");
$row2 = $res2->fetch_assoc();

echo json_encode([
    'total_facturas' => (int)$row['total_facturas'],
    'total_monto'    => (float)$row['total_monto'],
    'facturadas'     => (float)$row['facturadas'],
    'no_facturadas'  => (float)$row['no_facturadas'],
    'pendiente'      => (float)$row2['pendiente'],
    'vencido'        => (float)$row2['vencido'],
]);
