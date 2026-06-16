<?php
/**
 * crear_nota_venta.php — Nota de crédito / débito sobre una venta entregada
 * (o un remito standalone legacy).
 *
 *   clase  = 'NC' (crédito) | 'ND' (débito)
 *   fiscal = 1 → emite por ARCA (requiere que la venta tenga factura con CAE)
 *            0 → nota interna (remito), correlativo propio, sin CAE
 *
 * Efectos:
 *   - Stock: NC devuelve (+), ND descuenta (−), por los productos del detalle.
 *   - Saldo del cliente (cuentas_corrientes): NC → haber, ND → debe.
 *   - Queda registrada en comprobantes_venta (con detalle_json para el PDF).
 */
session_start();
if (!isset($_SESSION['usuario'])) { http_response_code(403); die(); }

include 'conexion_starlim_be.php';
require_once 'auth.php';
header('Content-Type: application/json; charset=utf-8');

$usuario = $_SESSION['usuario'];
$rango   = starlim_normalizar_rango($_SESSION['rango'] ?? '');

$id_venta  = (int)($_POST['id_venta']  ?? 0);
$id_remito = (int)($_POST['id_remito'] ?? 0);
$clase     = strtoupper(trim($_POST['clase'] ?? ''));        // NC | ND
$fiscal    = (int)($_POST['fiscal'] ?? 0) === 1 ? 1 : 0;
$motivo    = trim($_POST['motivo'] ?? '');
$detalle   = json_decode($_POST['detalle_json'] ?? '[]', true);

if (!in_array($clase, ['NC', 'ND'], true)) { echo json_encode(['ok' => false, 'error' => 'Clase inválida']); exit; }
if ($id_venta <= 0 && $id_remito <= 0)     { echo json_encode(['ok' => false, 'error' => 'Falta la venta o remito']); exit; }
if (empty($detalle))                       { echo json_encode(['ok' => false, 'error' => 'Agregá al menos un producto']); exit; }

// Permisos: fiscal solo Jefe1/Admin; interna Empleado_2+
$permitido = $fiscal
    ? in_array($rango, ['Jefe1', 'Admin'], true)
    : in_array($rango, ['Empleado_2', 'Jefe', 'Jefe1', 'Admin'], true);
if (!$permitido) { echo json_encode(['ok' => false, 'error' => 'Sin permiso para este comprobante']); exit; }

// ── Cargar la venta/remito de referencia ─────────────────────────────────
$ref = null;
if ($id_venta > 0) {
    $st = $conexion->prepare(
        "SELECT id, nombre_cliente, dni_cliente, tipo_cbte, nro_comprobante, fecha,
                COALESCE(cae,'') AS cae, COALESCE(estado_pedido,'entregado') AS estado_pedido
         FROM ventas WHERE id = ?"
    );
    $st->bind_param('i', $id_venta);
    $st->execute(); $ref = $st->get_result()->fetch_assoc(); $st->close();
    if (!$ref) { echo json_encode(['ok' => false, 'error' => 'Venta no encontrada']); exit; }
    if ($ref['estado_pedido'] !== 'entregado') { echo json_encode(['ok' => false, 'error' => 'El pedido aún no fue entregado.']); exit; }
} else {
    $st = $conexion->prepare("SELECT id, nombre_cliente, dni_cliente, nro_remito, fecha FROM remitos WHERE id = ?");
    $st->bind_param('i', $id_remito);
    $st->execute(); $ref = $st->get_result()->fetch_assoc(); $st->close();
    if (!$ref) { echo json_encode(['ok' => false, 'error' => 'Remito no encontrado']); exit; }
}

// ── Normalizar detalle y calcular monto ──────────────────────────────────
$items = [];
$monto = 0.0;
foreach ($detalle as $d) {
    $idp  = (int)($d['id'] ?? 0);
    $nom  = trim($d['nombre'] ?? '');
    $cant = (int)($d['cantidad'] ?? 0);
    $pu   = (float)($d['precio_unit'] ?? 0);
    if ($cant <= 0) continue;
    $sub  = round($pu * $cant, 2);
    $monto += $sub;
    $items[] = ['id' => $idp, 'nombre' => $nom, 'cantidad' => $cant, 'precio_unit' => $pu, 'subtotal' => $sub];
}
if (empty($items)) { echo json_encode(['ok' => false, 'error' => 'Detalle vacío']); exit; }
$monto = round($monto, 2);

// ── Fiscal: emitir por ARCA con CbteAsoc a la factura original ───────────
$tipo_cbte = 0; $cae = ''; $vto = ''; $nro = 0;
if ($fiscal) {
    if ($id_venta <= 0)          { echo json_encode(['ok' => false, 'error' => 'La nota fiscal requiere una venta facturada']); exit; }
    if ($ref['cae'] === '')      { echo json_encode(['ok' => false, 'error' => 'La venta no tiene factura: emití la factura antes de la nota fiscal.']); exit; }

    $orig = (int)$ref['tipo_cbte'];   // 1 = Fac A, 6 = Fac B
    // NC: A→3, B→8 | ND: A→2, B→7
    if ($clase === 'NC') $tipo_cbte = ($orig === 1) ? 3 : 8;
    else                 $tipo_cbte = ($orig === 1) ? 2 : 7;

    $tipo_doc = ($orig === 1) ? 80 : 96;
    $nro_doc  = preg_replace('/[^0-9]/', '', (string)$ref['dni_cliente']);
    if ($nro_doc === '') { $nro_doc = '0'; $tipo_doc = 99; }

    if ($orig === 1) { $neto = round($monto / 1.21, 2); $iva = round($monto - $neto, 2); }
    else             { $neto = $monto; $iva = 0.0; }

    $cbte_asoc = ['tipo' => $orig, 'pto_vta' => 1, 'nro' => (int)$ref['nro_comprobante']];

    require_once __DIR__ . '/../facturacion/generar_factura.php';
    $r = emitirFacturaARCA($nro_doc, $neto, $iva, $monto, $tipo_cbte, $tipo_doc, (string)$ref['fecha'], $cbte_asoc);
    if (empty($r['success'])) { echo json_encode(['ok' => false, 'error' => 'ARCA: ' . ($r['error'] ?? '')]); exit; }
    $cae = $r['CAE']; $vto = $r['vencimiento']; $nro = (int)$r['comprobante'];
} else {
    // Interna: correlativo propio entre las notas internas
    $r = $conexion->query("SELECT COALESCE(MAX(nro_comprobante),0)+1 AS n FROM comprobantes_venta WHERE fiscal = 0");
    $nro = (int)$r->fetch_assoc()['n'];
}

// ── Persistir el comprobante ─────────────────────────────────────────────
$detalle_json = json_encode($items, JSON_UNESCAPED_UNICODE);
$idv_param = $id_venta > 0 ? $id_venta : null;
$idr_param = $id_remito > 0 ? $id_remito : null;
$st = $conexion->prepare(
    "INSERT INTO comprobantes_venta
        (id_venta, id_remito, clase, fiscal, tipo_cbte, nro_comprobante, cae, vencimiento_cae,
         monto, detalle_json, motivo, stock_ajustado, creado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?) RETURNING id"
);
$st->bind_param('iisiiississs',
    $idv_param, $idr_param, $clase, $fiscal, $tipo_cbte, $nro, $cae, $vto,
    $monto, $detalle_json, $motivo, $usuario
);
$st->execute();
$id_comp = (int)$st->get_result()->fetch_assoc()['id'];
$st->close();

// ── Ajustar stock: NC devuelve (+), ND descuenta (−) ─────────────────────
$signo = ($clase === 'NC') ? 1 : -1;
foreach ($items as $it) {
    if ($it['id'] <= 0) continue;
    $delta = $signo * $it['cantidad'];
    $up = $conexion->prepare("UPDATE productos SET stock = GREATEST(0, stock + ?) WHERE id = ?");
    $up->bind_param('ii', $delta, $it['id']);
    $up->execute(); $up->close();
}
$conexion->query("UPDATE comprobantes_venta SET stock_ajustado = 1 WHERE id = $id_comp");

// ── Netear saldo del cliente en cuentas corrientes (solo si hay venta) ────
//   NC → haber (el cliente debe menos) | ND → debe (el cliente debe más)
if ($id_venta > 0) {
    $nombre = $ref['nombre_cliente'] ?: '';
    $hoy    = date('Y-m-d');
    $desc   = ($clase === 'NC' ? 'Nota de crédito' : 'Nota de débito')
            . ($fiscal ? ' fiscal' : ' interna') . " #$nro";
    if ($clase === 'NC') { $debe = 0.0;   $haber = $monto; }
    else                 { $debe = $monto; $haber = 0.0;   }
    $cc = $conexion->prepare(
        "INSERT INTO cuentas_corrientes (tipo,entidad_nombre,descripcion,debe,haber,fecha,id_origen,tipo_origen)
         VALUES ('cliente',?,?,?,?,?,?,'venta')"
    );
    $cc->bind_param('ssddsi', $nombre, $desc, $debe, $haber, $hoy, $id_venta);
    $cc->execute(); $cc->close();
}

require_once __DIR__ . '/integracion_eventos.php';
starlim_evento_registrar($conexion, 'nota.creada', [
    'id' => $id_comp, 'clase' => $clase, 'fiscal' => $fiscal, 'id_venta' => $id_venta,
    'id_remito' => $id_remito, 'monto' => $monto, 'nro' => $nro,
]);

echo json_encode([
    'ok' => true, 'id' => $id_comp, 'clase' => $clase, 'fiscal' => $fiscal,
    'nro_comprobante' => $nro, 'cae' => $cae, 'monto' => $monto,
]);
