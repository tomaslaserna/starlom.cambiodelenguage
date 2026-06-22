<?php
require_once __DIR__ . '/session_bootstrap.php';
/**
 * get_comprobantes_venta.php — Contexto para el modal de Comprobantes de Ventas.
 *
 *   ?id_venta=N   → datos de la venta, su detalle (con id_producto para NC/ND),
 *                   y las notas ya emitidas sobre ella.
 *   ?id_remito=N  → ídem para un remito standalone legacy.
 *   ?pendientes=1 → (Jefe1/Admin) lista de solicitudes de factura pendientes.
 */
starlim_session_start();
if (!isset($_SESSION['usuario'])) { http_response_code(403); die(); }

include 'conexion_starlim_be.php';
require_once 'auth.php';
header('Content-Type: application/json; charset=utf-8');
$empresaId = starlim_bootstrap_tenant_context($conexion);

$rango = starlim_normalizar_rango($_SESSION['rango'] ?? '');

// ── Solicitudes de factura pendientes (para Jefe1/Admin) ─────────────────
if (isset($_GET['pendientes'])) {
    if (!in_array($rango, ['Jefe1', 'Admin'], true)) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Sin permiso para ver solicitudes fiscales.']);
        exit;
    }
    $st = $conexion->prepare(
        "SELECT bd.id, bd.source_venta_id, bd.status, bd.grand_total, bd.created_at,
                COALESCE(c.nombre_cliente, cfp.trade_name, cfp.legal_name, bd.source_order_label, '') AS cliente,
                COALESCE(cfp.identification_number, '') AS documento,
                bd.validation_errors::text AS validation_errors
         FROM billing_document bd
         LEFT JOIN customer_fiscal_profile cfp ON cfp.id = bd.customer_fiscal_profile_id AND cfp.company_id = bd.company_id
         LEFT JOIN clientes c ON c.id = bd.customer_id AND c.empresa_id = bd.company_id
         WHERE bd.company_id = ?
           AND bd.status IN ('ready_for_validation','pending_authorization','rejected','validation_failed')
         ORDER BY bd.created_at ASC, bd.id ASC
         LIMIT 80"
    );
    $st->bind_param('i', $empresaId);
    $st->execute();
    $rs = $st->get_result();
    $solicitudes = [];
    while ($row = $rs->fetch_assoc()) {
        $solicitudes[] = [
            'id' => (int)$row['id'],
            'id_venta' => (int)$row['source_venta_id'],
            'estado' => $row['status'],
            'cliente' => $row['cliente'],
            'documento' => $row['documento'],
            'monto' => (float)$row['grand_total'],
            'creado_en' => $row['created_at'],
            'errores' => json_decode((string)$row['validation_errors'], true) ?: [],
        ];
    }
    $st->close();
    echo json_encode(['ok' => true, 'solicitudes' => $solicitudes], JSON_UNESCAPED_UNICODE);
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
         FROM ventas WHERE id = ? AND empresa_id = ?"
    );
    $st->bind_param('ii', $id_venta, $empresaId);
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
              AND p.empresa_id = d.empresa_id
         WHERE d.id_venta = ? AND d.empresa_id = ? ORDER BY d.id"
    );
    $st->bind_param('ii', $id_venta, $empresaId);
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

    $st = $conexion->prepare(
        "SELECT id, status, created_at, document_number, point_of_sale,
                validation_errors::text AS validation_errors
         FROM billing_document
         WHERE company_id = ?
           AND source_venta_id = ?
           AND status NOT IN ('void_draft','archived')
         ORDER BY id DESC
         LIMIT 1"
    );
    $st->bind_param('ii', $empresaId, $id_venta);
    $st->execute();
    $bd = $st->get_result()->fetch_assoc();
    $st->close();
    if ($bd) {
        $resp['solicitud_pendiente'] = [
            'id' => (int)$bd['id'],
            'estado' => $bd['status'],
            'creado_en' => $bd['created_at'],
            'nro_comprobante' => $bd['document_number'] ? str_pad((string)(int)$bd['document_number'], 8, '0', STR_PAD_LEFT) : '',
            'punto_venta' => (int)($bd['point_of_sale'] ?? 0),
            'errores' => json_decode((string)$bd['validation_errors'], true) ?: [],
        ];
    }

} elseif ($id_remito > 0) {
    $st = $conexion->prepare("SELECT id, nombre_cliente, dni_cliente, nro_remito, monto FROM remitos WHERE id = ? AND empresa_id = ?");
    $st->bind_param('ii', $id_remito, $empresaId);
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
              AND p.empresa_id = d.empresa_id
         WHERE d.id_remito = ? AND d.empresa_id = ? ORDER BY d.id"
    );
    $st->bind_param('ii', $id_remito, $empresaId);
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
    $st = $conexion->prepare("SELECT id, clase, fiscal, tipo_cbte, nro_comprobante, monto, motivo, creado_en FROM comprobantes_venta WHERE id_venta = ? AND empresa_id = ? ORDER BY id DESC");
    $st->bind_param('ii', $id_venta, $empresaId);
} else {
    $st = $conexion->prepare("SELECT id, clase, fiscal, tipo_cbte, nro_comprobante, monto, motivo, creado_en FROM comprobantes_venta WHERE id_remito = ? AND empresa_id = ? ORDER BY id DESC");
    $st->bind_param('ii', $id_remito, $empresaId);
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
