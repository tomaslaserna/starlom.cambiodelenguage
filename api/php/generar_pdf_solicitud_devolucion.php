<?php
/**
 * generar_pdf_solicitud_devolucion.php — Comprobante de SOLICITUD DE DEVOLUCIÓN
 * a un proveedor. Se entrega junto con la mercadería: detalla qué se devuelve,
 * el motivo, y deja espacio de firma para ambas partes.
 *
 * Entrada (POST desde el modal de Compras → Registro):
 *   id_compra       (int)
 *   prod_id[]       ids de producto a devolver
 *   prod_cant[]     cantidades a devolver (alineadas por índice con prod_id[])
 *   motivo[]        motivo por ítem (opcional, alineado por índice)
 *   motivo_general  (string)
 *
 * Solo Jefe / Jefe1 / Admin.
 */
require_once __DIR__ . '/auth.php';
if (session_status() === PHP_SESSION_NONE) session_start();

if (!isset($_SESSION['usuario'], $_SESSION['rango'])) {
    header('Location: ../frontend/sign.php');
    die();
}
$rango = starlim_normalizar_rango($_SESSION['rango']);
if (!in_array($rango, ['Jefe', 'Jefe1', 'Admin'], true)) {
    http_response_code(403);
    die('No tenés permiso para emitir devoluciones.');
}

include 'conexion_starlim_be.php';
require_once 'comprobante_pdf_lib.php';

$id_compra = intval($_POST['id_compra'] ?? 0);
if ($id_compra <= 0) die('Error: compra inválida.');

$prod_ids  = $_POST['prod_id']   ?? [];
$prod_cant = $_POST['prod_cant'] ?? [];
$motivos   = $_POST['motivo']    ?? [];
$motivo_general = trim($_POST['motivo_general'] ?? '');

/* ── Compra + proveedor ─────────────────────────────────────────── */
$res = $conexion->query(
    "SELECT cr.id, cr.descripcion, cr.total, cr.fecha,
            p.nombre AS prov_nombre, p.contacto, p.telefono, p.email, p.direccion
     FROM compras_registro cr
     LEFT JOIN proveedores p ON p.id = cr.id_proveedor
     WHERE cr.id = $id_compra LIMIT 1"
);
$compra = $res ? $res->fetch_assoc() : null;
if (!$compra) die('Error: compra no encontrada.');

/* ── Detalle real de la compra (para validar) ───────────────────── */
$recibido = [];   // id_producto => ['nombre' => ..., 'cantidad' => ...]
$rd = $conexion->query(
    "SELECT dcr.id_producto, COALESCE(p.nombre, '(producto eliminado)') AS nombre, dcr.cantidad
     FROM detalle_compras_registro dcr
     LEFT JOIN productos p ON p.id = dcr.id_producto
     WHERE dcr.id_compra = $id_compra"
);
if ($rd) while ($row = $rd->fetch_assoc()) {
    $recibido[(int)$row['id_producto']] = [
        'nombre'   => $row['nombre'],
        'cantidad' => (int)$row['cantidad'],
    ];
}

/* ── Armar lista a devolver (solo ítems válidos de esta compra) ─── */
$items = [];
foreach ($prod_ids as $i => $pid) {
    $pid  = (int)$pid;
    $cant = (int)($prod_cant[$i] ?? 0);
    if ($pid <= 0 || $cant <= 0 || !isset($recibido[$pid])) continue;
    $cant = min($cant, $recibido[$pid]['cantidad']);   // no más de lo recibido
    if ($cant <= 0) continue;
    $items[] = [
        'codigo'   => $pid,
        'nombre'   => $recibido[$pid]['nombre'],
        'cantidad' => $cant,
        'motivo'   => trim($motivos[$i] ?? ''),
    ];
}
if (empty($items)) die('Error: no se seleccionaron productos válidos para devolver.');

/* ── PDF ────────────────────────────────────────────────────────── */
$pdf = new ComprobantePDF('P', 'mm', 'A4');
$pdf->SetMargins(10, 10, 10);
$pdf->SetAutoPageBreak(true, 20);
$pdf->SetDrawColor(0, 0, 0);
$pdf->SetLineWidth(0.2);
$pdf->AddPage();

$nro   = str_pad((string)$id_compra, 8, '0', STR_PAD_LEFT);
$fecha = date('d/m/Y');
$extra = [];
if (!empty($compra['fecha'])) $extra[] = 'Compra del: ' . date('d/m/Y', strtotime($compra['fecha']));

$y0 = cabecera_comprobante($pdf, 'SOLICITUD DE DEVOLUCION', 'D', $nro, $fecha, $extra) + 3;

/* ── Datos del proveedor / referencia de compra ─────────────────── */
$izq = [
    ['Proveedor:', p($compra['prov_nombre'] ?: 'Sin proveedor')],
    ['Contacto:',  p($compra['contacto']  ?: '-')],
    ['Telefono:',  p($compra['telefono']  ?: '-')],
    ['Email:',     p($compra['email']     ?: '-')],
];
$der = [
    ['Compra Nro:', '#' . $nro],
    ['Fecha compra:', !empty($compra['fecha']) ? date('d/m/Y', strtotime($compra['fecha'])) : '-'],
    ['Direccion:', p($compra['direccion'] ?: '-')],
];

$y_izq = $y0;
foreach ($izq as [$lbl, $val]) {
    $pdf->SetXY(10, $y_izq);
    $pdf->SetFont('Arial', '', 8);  $pdf->SetTextColor(80, 80, 80); $pdf->Cell(24, 5, $lbl, 0, 0, 'L');
    $pdf->SetFont('Arial', 'B', 8); $pdf->SetTextColor(0, 0, 0);    $pdf->Cell(69, 5, $val, 0, 0, 'L');
    $y_izq += 5;
}
$y_der = $y0;
foreach ($der as [$lbl, $val]) {
    $pdf->SetXY(107, $y_der);
    $pdf->SetFont('Arial', '', 8);  $pdf->SetTextColor(80, 80, 80); $pdf->Cell(28, 5, $lbl, 0, 0, 'L');
    $pdf->SetFont('Arial', 'B', 8); $pdf->SetTextColor(0, 0, 0);    $pdf->Cell(65, 5, $val, 0, 0, 'L');
    $y_der += 5;
}

$y_tabla = max($y_izq, $y_der) + 4;
$pdf->SetDrawColor(180, 180, 180);
$pdf->Line(10, $y_tabla - 2, 200, $y_tabla - 2);
$pdf->SetDrawColor(0, 0, 0);

/* ── Tabla: qué se devuelve ─────────────────────────────────────── */
$cw = [22, 96, 30, 42];
$ch = 6;

$thead = function () use ($pdf, $cw, $ch) {
    $pdf->SetFont('Arial', 'B', 9);
    $pdf->SetFillColor(230, 230, 230);
    $pdf->SetTextColor(0, 0, 0);
    $pdf->Cell($cw[0], $ch + 1, 'Codigo',           1, 0, 'C', true);
    $pdf->Cell($cw[1], $ch + 1, 'Producto',         1, 0, 'C', true);
    $pdf->Cell($cw[2], $ch + 1, 'Cant. a devolver', 1, 0, 'C', true);
    $pdf->Cell($cw[3], $ch + 1, 'Motivo',           1, 1, 'C', true);
    $pdf->SetFont('Arial', '', 9);
    $pdf->SetFillColor(255, 255, 255);
};

$pdf->SetXY(10, $y_tabla);
$thead();

foreach ($items as $it) {
    $nombre  = p($it['nombre']);
    $motivo  = p($it['motivo'] ?: '-');
    $n_nom   = max(1, ceil($pdf->GetStringWidth($nombre) / ($cw[1] - 3)));
    $n_mot   = max(1, ceil($pdf->GetStringWidth($motivo) / ($cw[3] - 3)));
    $row_h   = max(8, max($n_nom, $n_mot) * $ch);

    if ($pdf->GetY() + $row_h > $pdf->GetPageHeight() - 45) {
        $pdf->AddPage();
        $pdf->SetXY(10, 15);
        $thead();
    }

    $x = 10;
    $y = $pdf->GetY();

    $pdf->SetXY($x, $y);
    foreach ($cw as $w) $pdf->Cell($w, $row_h, '', 1, 0, 'C');
    $pdf->Ln();

    $pdf->SetXY($x, $y);
    $pdf->Cell($cw[0], $row_h, (string)$it['codigo'], 0, 0, 'C');
    $pdf->SetXY($x + $cw[0], $y + ($row_h - $n_nom * $ch) / 2);
    $pdf->MultiCell($cw[1], $ch, $nombre, 0, 'L');
    $pdf->SetXY($x + $cw[0] + $cw[1], $y);
    $pdf->Cell($cw[2], $row_h, (string)$it['cantidad'], 0, 0, 'C');
    $pdf->SetXY($x + $cw[0] + $cw[1] + $cw[2], $y + ($row_h - $n_mot * $ch) / 2);
    $pdf->MultiCell($cw[3], $ch, $motivo, 0, 'L');

    $pdf->SetXY(10, $y + $row_h);
}

/* ── Motivo general ─────────────────────────────────────────────── */
$y_obs = $pdf->GetY() + 6;
if ($y_obs + 26 > $pdf->GetPageHeight() - 30) { $pdf->AddPage(); $y_obs = 15; }
$pdf->SetDrawColor(0, 0, 0);
$pdf->SetLineWidth(0.3);
$pdf->RoundedRect(10, $y_obs, 190, 24, 3);
$pdf->SetFont('Arial', 'B', 8);
$pdf->SetXY(10, $y_obs + 1);
$pdf->Cell(190, 6, p('MOTIVO GENERAL DE LA DEVOLUCION'), 0, 1, 'C');
$pdf->Line(10, $y_obs + 7, 200, $y_obs + 7);
$pdf->SetFont('Arial', '', 8);
$pdf->SetXY(11, $y_obs + 8);
$pdf->MultiCell(188, 5, p($motivo_general ?: '-'), 0, 'L');

/* ── Firmas ─────────────────────────────────────────────────────── */
$y_firma = $y_obs + 24 + 16;
if ($y_firma > $pdf->GetPageHeight() - 18) { $pdf->AddPage(); $y_firma = 40; }
$pdf->SetDrawColor(180, 180, 180);
$pdf->SetLineWidth(0.3);
$pdf->Line(10,  $y_firma, 90,  $y_firma);
$pdf->Line(120, $y_firma, 200, $y_firma);
$pdf->SetFont('Arial', '', 7);
$pdf->SetTextColor(100, 100, 100);
$pdf->SetXY(10, $y_firma + 1);
$pdf->Cell(80, 4, p('Entregó — Star Lim'), 0, 0, 'C');
$pdf->SetXY(120, $y_firma + 1);
$pdf->Cell(80, 4, p('Recibió — Proveedor (firma y aclaración)'), 0, 0, 'C');

/* ── Salida ─────────────────────────────────────────────────────── */
$pdf->Output('I', 'Solicitud_devolucion_' . $nro . '.pdf');
