<?php
/**
 * get_comprobantes_venta.php — Contexto para el modal de Comprobantes de Ventas.
 *
 *   ?id_venta=N   → datos de la venta, su detalle (con id_producto para NC/ND),
 *                   y las notas ya emitidas sobre ella.
 *   ?id_remito=N  → ídem para un remito standalone legacy.
 *   ?pendientes=1 → (Jefe1/Admin) lista de solicitudes de factura pendientes.
 */
session_start();
if (!isset($_SESSION['usuario'])) { http_response_code(403); die(); }

include 'conexion_starlim_be.php';
require_once 'auth.php';
header('Content-Type: application/json; charset=utf-8');

$rango = starlim_normalizar_rango($_SESSION['rango'] ?? '');

// ── Solicitudes de factura pendientes (para Jefe1/Admin) ─────────────────
if (isset($_GET['pendientes'])) {
    if (!in_array($rango, ['Jefe1', 'Admin'], true)) { echo json_encode(['ok' => false, 'error' => 'Sin permiso']); exit; }
    $r = $conexion->query(
        "SELECT sf.id, sf.id_venta, sf.tipo_cbte, sf.solicitado_por, sf.creado_en,
                v.nombre_cliente, v.monto, v.nro_comprobante
         FROM solicitudes_factura sf JOIN ventas v ON v.id = sf.id_venta
         WHERE sf.estado = 'pendiente'
         ORDER BY sf.creado_en ASC"
    );
    $out = [];
    if ($r) while ($row = $r->fetch_assoc()) {
        $out[] = [
            'id'            => (int)$row['id'],
            'id_venta'      => (int)$row['id_venta'],
            'tipo_cbte'     => (int)$row['tipo_cbte'],
            'tipo_label'    => ((int)$row['tipo_cbte'] === 1) ? 'Factura A' : 'Factura B',
            'solicitado_por'=> $row['solicitado_por'],
            'nombre_cliente'=> $row['nombre_cliente'],
            'monto'         => (float)$row['monto'],
            'nro_remito'    => str_pad((int)$row['nro_comprobante'], 8, '0', STR_PAD_LEFT),
        ];
    }
    echo json_encode(['ok' => true, 'solicitudes' => $out]);
    exit;
}

$id_venta  = (int)($_GET['id_venta']  ?? 0);
$id_remito = (int)($_GET['id_remito'] ?? 0);

$resp = ['ok' => true, 'venta' => null, 'detalle' => [], 'notas' => [], 'solicitud_pendiente' => null];

// ── Detalle de productos (con id_producto, para armar NC/ND) ─────────────
if ($id_venta > 0) {
    $st = $conexion->prepare(
        "SELECT id, COALESCE(cae,'') AS cae, tipo_cbte, nro_comprobante, nombre_cliente,
                dni_cliente, monto, COALESCE(estado_pedido,'entregado') AS estado_pedido
         FROM ventas WHERE id = ?"
    );
    $st->bind_param('i', $id_venta);
    $st->execute(); $v = $st->get_result()->fetch_assoc(); $st->close();
    if (!$v) { echo json_encode(['ok' => false, 'error' => 'Venta no encontrada']); exit; }
    $resp['venta'] = [
        'id'             => (int)$v['id'],
        'con_factura'    => trim($v['cae']) !== '',
        'tipo_cbte'      => (int)$v['tipo_cbte'],
        'nro_comprobante'=> str_pad((int)$v['nro_comprobante'], 8, '0', STR_PAD_LEFT),
        'nombre_cliente' => $v['nombre_cliente'],
        'dni_cliente'    => $v['dni_cliente'],
        'monto'          => (float)$v['monto'],
        'entregado'      => $v['estado_pedido'] === 'entregado',
    ];

    $st = $conexion->prepare(
        "SELECT d.id_producto, COALESCE(d.nombre_producto, p.nombre, '(producto)') AS nombre,
                d.cantidad, d.precio_unit
         FROM detalle_ventas d LEFT JOIN productos p ON p.id = d.id_producto
         WHERE d.id_venta = ? ORDER BY d.id"
    );
    $st->bind_param('i', $id_venta);
    $st->execute(); $rd = $st->get_result();
    while ($d = $rd->fetch_assoc()) {
        $resp['detalle'][] = [
            'id'          => (int)$d['id_producto'],
            'nombre'      => $d['nombre'],
            'cantidad'    => (int)$d['cantidad'],
            'precio_unit' => (float)$d['precio_unit'],
        ];
    }
    $st->close();

    $st = $conexion->prepare("SELECT id FROM solicitudes_factura WHERE id_venta = ? AND estado='pendiente' LIMIT 1");
    $st->bind_param('i', $id_venta);
    $st->execute(); $sp = $st->get_result()->fetch_assoc(); $st->close();
    if ($sp) $resp['solicitud_pendiente'] = (int)$sp['id'];

} elseif ($id_remito > 0) {
    $st = $conexion->prepare("SELECT id, nombre_cliente, dni_cliente, nro_remito, monto FROM remitos WHERE id = ?");
    $st->bind_param('i', $id_remito);
    $st->execute(); $v = $st->get_result()->fetch_assoc(); $st->close();
    if (!$v) { echo json_encode(['ok' => false, 'error' => 'Remito no encontrado']); exit; }
    $resp['venta'] = [
        'id_remito'      => (int)$v['id'],
        'con_factura'    => false,
        'nro_comprobante'=> str_pad((int)$v['nro_remito'], 8, '0', STR_PAD_LEFT),
        'nombre_cliente' => $v['nombre_cliente'],
        'dni_cliente'    => $v['dni_cliente'],
        'monto'          => (float)$v['monto'],
        'entregado'      => true,
    ];
    $st = $conexion->prepare(
        "SELECT d.id_producto, COALESCE(d.nombre_producto, p.nombre, '(producto)') AS nombre,
                d.cantidad, d.precio_unit
         FROM detalle_remitos d LEFT JOIN productos p ON p.id = d.id_producto
         WHERE d.id_remito = ? ORDER BY d.id"
    );
    $st->bind_param('i', $id_remito);
    $st->execute(); $rd = $st->get_result();
    while ($d = $rd->fetch_assoc()) {
        $resp['detalle'][] = [
            'id'          => (int)$d['id_producto'],
            'nombre'      => $d['nombre'],
            'cantidad'    => (int)$d['cantidad'],
            'precio_unit' => (float)$d['precio_unit'],
        ];
    }
    $st->close();
} else {
    echo json_encode(['ok' => false, 'error' => 'Falta id_venta o id_remito']); exit;
}

// ── Notas ya emitidas (NC/ND) sobre esta venta/remito ────────────────────
if ($id_venta > 0) {
    $st = $conexion->prepare("SELECT id, clase, fiscal, tipo_cbte, nro_comprobante, monto, motivo, creado_en FROM comprobantes_venta WHERE id_venta = ? ORDER BY id DESC");
    $st->bind_param('i', $id_venta);
} else {
    $st = $conexion->prepare("SELECT id, clase, fiscal, tipo_cbte, nro_comprobante, monto, motivo, creado_en FROM comprobantes_venta WHERE id_remito = ? ORDER BY id DESC");
    $st->bind_param('i', $id_remito);
}
$st->execute(); $rn = $st->get_result();
while ($n = $rn->fetch_assoc()) {
    $resp['notas'][] = [
        'id'        => (int)$n['id'],
        'clase'     => $n['clase'],
        'fiscal'    => (int)$n['fiscal'],
        'nro'       => str_pad((int)$n['nro_comprobante'], 8, '0', STR_PAD_LEFT),
        'monto'     => (float)$n['monto'],
        'motivo'    => $n['motivo'],
        'fecha'     => $n['creado_en'] ? date('d-m-Y', strtotime($n['creado_en'])) : '',
    ];
}
$st->close();

echo json_encode($resp);
