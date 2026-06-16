<?php
session_start();

if (!isset($_SESSION['usuario'])) {
    http_response_code(401);
    die("No autorizado");
}

include 'conexion_starlim_be.php';
require_once 'presupuesto_pdf_lib.php';
// Esquema de presupuestos gestionado en supabase_migration.sql + db_fixes.sql

$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!$data) { http_response_code(400); die("Datos invalidos"); }

$cl         = $data['cliente']    ?? [];
$prods      = $data['productos']  ?? [];
$desc_pct   = min(100, max(0, (float)($data['descuento']    ?? 0)));
$con_iva    = (bool)($data['incluir_iva'] ?? true);
$lista_act  = intval($data['lista_activa'] ?? 0);
$vigencia   = min(365, max(1, intval($data['vigencia_dias'] ?? 15)));   // default 15 días

// Pre-calcular campos de cada producto
$neto = 0;
foreach ($prods as &$pr) {
    $qty       = max(0.001, (float)($pr['cantidad']   ?? 1));
    $pu        = (float)($pr['precio_unit'] ?? 0);
    $bonif     = min(100, max(0, (float)($pr['bonif'] ?? 0)));
    $pr['_qty']    = $qty;
    $pr['_pu']     = $pu;
    $pr['_bonif']  = $bonif;
    $pr['_pu_net'] = $pu * (1 - $bonif / 100);
    $pr['_total']  = round($pr['_pu_net'] * $qty, 2);
    $neto += $pr['_total'];
}
unset($pr);

$neto       = round($neto, 2);
$desc_monto = round($neto * $desc_pct / 100, 2);
$subtotal   = round($neto - $desc_monto, 2);
$iva_monto  = $con_iva ? round($subtotal * 0.21, 2) : 0.0;
$total      = round($subtotal + $iva_monto, 2);

// Guardar en DB
$p_nombre       = (string)($cl['nombre']       ?? '');
$p_razon_social = (string)($cl['razon_social'] ?? '');
$p_domicilio    = (string)($cl['domicilio']    ?? '');
$p_telefono     = (string)($cl['telefono']     ?? '');
$p_cond_iva     = (string)($cl['cond_iva']     ?? '');
$p_cuit         = (string)($cl['cuit']         ?? '');
$p_lista_act    = (int)$lista_act;
$p_desc_pct     = (float)$desc_pct;
$p_con_iva      = $con_iva ? 1 : 0;
$p_neto         = (float)$neto;
$p_desc_monto   = (float)$desc_monto;
$p_subtotal     = (float)$subtotal;
$p_iva_monto    = (float)$iva_monto;
$p_total        = (float)$total;
$p_prods_json   = json_encode($prods);
$p_usuario      = (string)($_SESSION['usuario'] ?? '');

$ins = $conexion->prepare(
    "INSERT INTO presupuestos
        (fecha_emision, fecha_vencimiento,
         cliente_nombre, cliente_razon_social, cliente_domicilio,
         cliente_telefono, cliente_cond_iva, cliente_cuit,
         lista_activa, descuento_pct, incluir_iva,
         neto_agravado, desc_monto, subtotal, iva_monto, total,
         productos_json, creado_por)
     VALUES
        (CURRENT_DATE, CURRENT_DATE + (? || ' days')::interval,
         ?, ?, ?,
         ?, ?, ?,
         ?, ?, ?,
         ?, ?, ?, ?, ?,
         ?, ?)"
);
$ins->bind_param(
    'issssssididddddss',
    $vigencia,
    $p_nombre, $p_razon_social, $p_domicilio,
    $p_telefono, $p_cond_iva, $p_cuit,
    $p_lista_act, $p_desc_pct, $p_con_iva,
    $p_neto, $p_desc_monto, $p_subtotal, $p_iva_monto, $p_total,
    $p_prods_json, $p_usuario
);
$ins->execute();
$presupuesto_id = (int)$conexion->insert_id;

// Generar PDF (usa lib compartida) con la vigencia elegida
$fecha_vto = date('d/m/Y', strtotime("+$vigencia days"));
$pdf_str = buildPresupuestoPDF($cl, $prods, $desc_pct, $con_iva, null, $fecha_vto);

$safe = preg_replace('/[^a-zA-Z0-9_-]/', '_', $cl['nombre'] ?? 'cliente');
$filename = 'Presupuesto_' . $safe . '_' . date('Ymd') . '.pdf';

header('Content-Type: application/pdf');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('X-Presupuesto-ID: ' . $presupuesto_id);
header('Access-Control-Expose-Headers: X-Presupuesto-ID');

echo $pdf_str;
