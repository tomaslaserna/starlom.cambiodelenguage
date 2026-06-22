<?php
require_once __DIR__ . '/session_bootstrap.php';
starlim_session_start();

if (!isset($_SESSION['usuario'])) {
    header('Location: ../frontend/sign.php');
    exit;
}

require_once __DIR__ . '/conexion_starlim_be.php';
require_once __DIR__ . '/comprobante_pdf_lib.php';

$empresaId = starlim_bootstrap_tenant_context($conexion);
$id_compra = (int)($_GET['id'] ?? 0);
if ($id_compra <= 0) die('Error: orden invalida.');

$stmt = $conexion->prepare(
    "SELECT cr.id, cr.id_proveedor, cr.descripcion, cr.total, cr.fecha, cr.estado, cr.tipo,
            p.nombre AS proveedor_nombre, p.contacto, p.telefono, p.email, p.direccion
     FROM compras_registro cr
     LEFT JOIN proveedores p ON p.id = cr.id_proveedor AND p.empresa_id = cr.empresa_id
     WHERE cr.id = ? AND cr.empresa_id = ?
     LIMIT 1"
);
$stmt->bind_param('ii', $id_compra, $empresaId);
$stmt->execute();
$orden = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$orden) die('Error: orden no encontrada.');

$det = $conexion->prepare(
    "SELECT dcr.id_producto, dcr.cantidad,
            COALESCE(p.nombre, '(producto eliminado)') AS nombre,
            COALESCE(p.costo, 0) AS costo
     FROM detalle_compras_registro dcr
     LEFT JOIN productos p ON p.id = dcr.id_producto AND p.empresa_id = dcr.empresa_id
     WHERE dcr.id_compra = ? AND dcr.empresa_id = ?
     ORDER BY dcr.id ASC"
);
$det->bind_param('ii', $id_compra, $empresaId);
$det->execute();
$res = $det->get_result();

$items = [];
$subtotal = 0.0;
if ($res) while ($row = $res->fetch_assoc()) {
    $qty = (float)($row['cantidad'] ?? 0);
    $costo = (float)($row['costo'] ?? 0);
    $importe = $qty * $costo;
    $subtotal += $importe;
    $items[] = [
        'codigo' => (string)($row['id_producto'] ?? ''),
        'nombre' => (string)($row['nombre'] ?? ''),
        'cantidad' => $qty,
        'costo' => $costo,
        'importe' => $importe,
    ];
}
$det->close();

$totalDb = (float)($orden['total'] ?? 0);
if ($subtotal <= 0 && $totalDb > 0) $subtotal = $totalDb;
$total = $totalDb > 0 ? $totalDb : $subtotal;

function oc_fecha(?string $fecha, string $fallback = '-'): string {
    if (!$fecha) return $fallback;
    $ts = strtotime($fecha);
    return $ts ? date('d/m/Y', $ts) : $fallback;
}

function oc_short(string $text, int $width): string {
    return mb_strimwidth(trim($text), 0, $width, '...', 'UTF-8');
}

$pdf = new ComprobantePDF('P', 'mm', 'A4');
$pdf->SetMargins(15, 14, 15);
$pdf->SetAutoPageBreak(true, 22);
$pdf->AddPage();

$nro = 'OC-' . str_pad((string)$id_compra, 8, '0', STR_PAD_LEFT);
$fecha = oc_fecha($orden['fecha'] ?? null, date('d/m/Y'));

$y_linea = cabecera_comprobante(
    $pdf,
    'ORDEN DE COMPRA',
    'OC',
    $nro,
    $fecha,
    ['Estado: ' . (string)($orden['estado'] ?? '-'), 'Tipo: ' . (string)($orden['tipo'] ?? '-')]
);

$pdf->SetY($y_linea + 8);
starlim_pdf_section_title($pdf, 'Proveedor', 15);
$pdf->SetFont('Arial', 'B', 10.5);
starlim_pdf_set_text($pdf, 'body');
$pdf->Cell(180, 6, p((string)($orden['proveedor_nombre'] ?: 'Sin proveedor asignado')), 0, 1, 'L');
$pdf->SetFont('Arial', '', 8.5);
starlim_pdf_set_text($pdf, 'muted');
$proveedorLineas = array_filter([
    trim((string)($orden['direccion'] ?? '')),
    trim((string)($orden['telefono'] ?? '')),
    trim((string)($orden['email'] ?? '')),
    trim((string)($orden['contacto'] ?? '')) !== '' ? 'Contacto: ' . trim((string)$orden['contacto']) : '',
]);
$pdf->MultiCell(180, 4.8, p(implode(' - ', $proveedorLineas) ?: '-'), 0, 'L');

$pdf->Ln(6);
$headers = ['Cant.', 'Codigo', 'Descripcion', 'P. unit.', 'Importe'];
$widths = [18, 24, 82, 28, 28];
$aligns = ['L', 'L', 'L', 'R', 'R'];
starlim_pdf_table_header($pdf, $headers, $widths, $aligns);

$pdf->SetFont('Arial', '', 8.7);
if (!empty($items)) {
    foreach ($items as $item) {
        $nombre = (string)$item['nombre'];
        $rowH = max(9, (int)ceil($pdf->GetStringWidth(p($nombre)) / 78) * 5.2);
        if ($pdf->GetY() + $rowH > 252) {
            $pdf->AddPage();
            starlim_pdf_table_header($pdf, $headers, $widths, $aligns);
            $pdf->SetFont('Arial', '', 8.7);
        }

        $x = 15;
        $y = $pdf->GetY();
        $qty = (float)$item['cantidad'];
        $qtyS = number_format($qty, $qty == (int)$qty ? 0 : 2, ',', '.');
        $pdf->SetDrawColor(236, 239, 237);

        starlim_pdf_set_text($pdf, 'body');
        $pdf->SetXY($x, $y);
        $pdf->Cell($widths[0], $rowH, $qtyS, 0, 0, 'L');
        $x += $widths[0];
        starlim_pdf_set_text($pdf, 'soft');
        $pdf->Cell($widths[1], $rowH, p((string)$item['codigo']), 0, 0, 'L');
        $x += $widths[1];
        starlim_pdf_set_text($pdf, 'body');
        $pdf->SetXY($x, $y + 1.2);
        $pdf->MultiCell($widths[2] - 2, 5, p(oc_short($nombre, 96)), 0, 'L');
        $x += $widths[2];
        $pdf->SetXY($x, $y);
        $pdf->Cell($widths[3], $rowH, p(starlim_pdf_money((float)$item['costo'])), 0, 0, 'R');
        $x += $widths[3];
        $pdf->SetXY($x, $y);
        $pdf->SetFont('Arial', 'B', 8.7);
        $pdf->Cell($widths[4], $rowH, p(starlim_pdf_money((float)$item['importe'])), 0, 0, 'R');
        $pdf->SetFont('Arial', '', 8.7);

        $pdf->Line(15, $y + $rowH, 195, $y + $rowH);
        $pdf->SetY($y + $rowH);
    }
} else {
    $pdf->SetFont('Arial', '', 8.7);
    starlim_pdf_set_text($pdf, 'muted');
    $pdf->MultiCell(180, 6, p(trim((string)$orden['descripcion']) ?: 'Sin detalle estructurado de productos.'), 0, 'L');
}

$totX = 112;
$totY = $pdf->GetY() + 8;
if ($totY > 230) {
    $pdf->AddPage();
    $totY = 24;
}
$rows = [
    ['Subtotal estimado', starlim_pdf_money($subtotal)],
    ['IVA', 'Segun factura proveedor'],
];
$pdf->SetFont('Arial', '', 8.8);
foreach ($rows as [$label, $value]) {
    $pdf->SetXY($totX, $totY);
    starlim_pdf_set_text($pdf, 'muted');
    $pdf->Cell(48, 6, p($label), 0, 0, 'L');
    starlim_pdf_set_text($pdf, 'body');
    $pdf->Cell(35, 6, p($value), 0, 0, 'R');
    $totY += 6;
}
$pdf->SetDrawColor(31, 36, 33);
$pdf->SetLineWidth(0.55);
$pdf->Line($totX, $totY + 1, 195, $totY + 1);
$pdf->SetXY($totX, $totY + 4);
$pdf->SetFont('Arial', 'B', 13);
starlim_pdf_set_text($pdf, 'body');
$pdf->Cell(35, 8, 'Total', 0, 0, 'L');
$pdf->Cell(48, 8, p(starlim_pdf_money($total)), 0, 1, 'R');

$noteY = $totY + 20;
if ($noteY + 28 > 264) {
    $pdf->AddPage();
    $noteY = 24;
}
$pdf->SetDrawColor(227, 231, 228);
$pdf->RoundedRect(15, $noteY, 180, 25, 2, 'D');
$pdf->SetXY(19, $noteY + 4);
starlim_pdf_section_title($pdf, 'Condiciones', 19);
$pdf->SetXY(19, $noteY + 10);
$pdf->SetFont('Arial', '', 8.3);
starlim_pdf_set_text($pdf, 'muted');
$nota = trim((string)$orden['descripcion']);
$texto = 'Confirmar recepcion de esta orden dentro de las 48 hs. Adjuntar remito y factura al momento de la entrega. La mercaderia sera controlada en deposito.';
if ($nota !== '' && empty($items)) $texto = $nota;
$pdf->MultiCell(172, 4.5, p($texto), 0, 'L');

$sigY = $noteY + 47;
if ($sigY > 270) {
    $pdf->AddPage();
    $sigY = 58;
}
starlim_pdf_signature_pair($pdf, 'Autorizo la compra - Starlim', 'Recepcion proveedor', $sigY);

$filename = 'orden_compra_' . str_pad((string)$id_compra, 8, '0', STR_PAD_LEFT) . '.pdf';
$pdf->Output(isset($_GET['download']) ? 'D' : 'I', $filename);
