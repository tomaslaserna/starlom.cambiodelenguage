<?php
require_once __DIR__ . '/session_bootstrap.php';
/**
 * crear_nota_venta.php - Nota interna de credito/debito sobre una venta
 * entregada o un remito standalone legacy.
 *
 * La emision fiscal online esta deshabilitada. Todas las notas generadas
 * por este endpoint son internas, ajustan stock y actualizan cuenta corriente.
 */
starlim_session_start();
if (!isset($_SESSION['usuario'])) { http_response_code(403); die(); }

include 'conexion_starlim_be.php';
require_once 'auth.php';
require_once __DIR__ . '/tenant.php';
header('Content-Type: application/json; charset=utf-8');
$empresa_id = starlim_bootstrap_tenant_context($conexion);

$usuario = $_SESSION['usuario'];
$rango   = starlim_normalizar_rango($_SESSION['rango'] ?? '');

$id_venta  = (int)($_POST['id_venta']  ?? 0);
$id_remito = (int)($_POST['id_remito'] ?? 0);
$clase     = strtoupper(trim($_POST['clase'] ?? ''));        // NC | ND
$fiscal    = (int)($_POST['fiscal'] ?? 0) === 1 ? 1 : 0;
$motivo    = trim($_POST['motivo'] ?? '');
$detalle   = json_decode($_POST['detalle_json'] ?? '[]', true);
if ($fiscal) { echo json_encode(['ok' => false, 'error' => 'La emision fiscal online esta deshabilitada. Genera solo notas internas.']); exit; }

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
         FROM ventas WHERE id = ? AND empresa_id = ?"
    );
    $st->bind_param('ii', $id_venta, $empresa_id);
    $st->execute(); $ref = $st->get_result()->fetch_assoc(); $st->close();
    if (!$ref) { echo json_encode(['ok' => false, 'error' => 'Venta no encontrada']); exit; }
    if ($ref['estado_pedido'] !== 'entregado') { echo json_encode(['ok' => false, 'error' => 'El pedido aún no fue entregado.']); exit; }
} else {
    $st = $conexion->prepare("SELECT id, nombre_cliente, dni_cliente, nro_remito, fecha FROM remitos WHERE id = ? AND empresa_id = ?");
    $st->bind_param('ii', $id_remito, $empresa_id);
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

// Nota interna: correlativo propio entre comprobantes no fiscales.
$tipo_cbte = 0; $cae = ''; $vto = '';
$nro = starlim_next_sequence($conexion, 'comprobante_venta', $empresa_id);

// ── Persistir el comprobante ─────────────────────────────────────────────
$detalle_json = json_encode($items, JSON_UNESCAPED_UNICODE);
$idv_param = $id_venta > 0 ? $id_venta : null;
$idr_param = $id_remito > 0 ? $id_remito : null;
$st = $conexion->prepare(
    "INSERT INTO comprobantes_venta
        (id_venta, id_remito, clase, fiscal, tipo_cbte, nro_comprobante, cae, vencimiento_cae,
         monto, detalle_json, motivo, stock_ajustado, creado_por, empresa_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?) RETURNING id"
);
$st->bind_param('iisiiississsi',
    $idv_param, $idr_param, $clase, $fiscal, $tipo_cbte, $nro, $cae, $vto,
    $monto, $detalle_json, $motivo, $usuario, $empresa_id
);
$st->execute();
$id_comp = (int)$st->get_result()->fetch_assoc()['id'];
$st->close();

// ── Ajustar stock: NC devuelve (+), ND descuenta (−) ─────────────────────
$signo = ($clase === 'NC') ? 1 : -1;
foreach ($items as $it) {
    if ($it['id'] <= 0) continue;
    $delta = $signo * $it['cantidad'];
    $up = $conexion->prepare("UPDATE productos SET stock = GREATEST(0, stock + ?) WHERE id = ? AND empresa_id = ?");
    $up->bind_param('iii', $delta, $it['id'], $empresa_id);
    $up->execute(); $up->close();
}
$upComp = $conexion->prepare("UPDATE comprobantes_venta SET stock_ajustado = 1 WHERE id = ? AND empresa_id = ?");
$upComp->bind_param('ii', $id_comp, $empresa_id);
$upComp->execute();
$upComp->close();

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
        "INSERT INTO cuentas_corrientes (tipo,entidad_nombre,descripcion,debe,haber,fecha,id_origen,tipo_origen,empresa_id)
         VALUES ('cliente',?,?,?,?,?,?,'venta',?)"
    );
    $cc->bind_param('ssddsii', $nombre, $desc, $debe, $haber, $hoy, $id_venta, $empresa_id);
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
