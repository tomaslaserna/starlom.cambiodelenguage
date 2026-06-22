<?php
require_once __DIR__ . '/session_bootstrap.php';
starlim_session_start();

if (!isset($_SESSION['usuario'])) {
    header('Location: ../frontend/sign.php');
    exit;
}

include 'conexion_starlim_be.php';
require_once __DIR__ . '/comprobante_pdf_lib.php';
$empresaId = starlim_bootstrap_tenant_context($conexion);

$id_venta = (int)($_GET['id_venta'] ?? 0);
if (!$id_venta) die('Error: ID de venta invalido.');

$stmt = $conexion->prepare(
    "SELECT v.*, CONCAT(ven.nombre, ' ', ven.apellido) AS nombre_vendedor,
            r.observacion AS obs_form
     FROM ventas v
     LEFT JOIN operadores ven ON ven.id = v.id_operador AND ven.empresa_id = v.empresa_id
     LEFT JOIN remitos r ON r.id_venta = v.id AND r.empresa_id = v.empresa_id
     WHERE v.id = ? AND v.empresa_id = ?
     LIMIT 1"
);
$stmt->bind_param('ii', $id_venta, $empresaId);
$stmt->execute();
$venta = $stmt->get_result()->fetch_assoc();
if (!$venta) die('Error: Venta no encontrada.');

$detalle_stmt = $conexion->prepare(
    "SELECT d.id_producto AS codigo,
            COALESCE(d.nombre_producto, p.nombre, '(producto eliminado)') AS nombre,
            d.cantidad,
            d.precio_unit,
            COALESCE(d.descuento, 0) AS descuento,
            d.subtotal
     FROM detalle_ventas d
     LEFT JOIN productos p ON p.id = d.id_producto AND p.empresa_id = d.empresa_id
     WHERE d.id_venta = ? AND d.empresa_id = ?
     ORDER BY d.id ASC"
);
$detalle_stmt->bind_param('ii', $id_venta, $empresaId);
$detalle_stmt->execute();
$detalle_res = $detalle_stmt->get_result();

$items = [];
$suma_bruta = 0.0;
while ($det = $detalle_res->fetch_assoc()) {
    $cantidad = (float)($det['cantidad'] ?? 0);
    $precio = (float)($det['precio_unit'] ?? 0);
    $subtotal = (float)($det['subtotal'] ?? 0);
    $bruto = $precio * $cantidad;
    $suma_bruta += $bruto;
    $items[] = [
        'codigo' => (string)($det['codigo'] ?? ''),
        'nombre' => (string)($det['nombre'] ?? ''),
        'cantidad' => $cantidad,
        'precio_unit' => $precio,
        'subtotal' => $subtotal,
        'desc_pct' => $bruto > 0 ? round((1 - $subtotal / $bruto) * 100, 1) : 0,
    ];
}

$docNorm = preg_replace('/\D+/', '', (string)($venta['dni_cliente'] ?? ''));
$cli_stmt = $conexion->prepare("SELECT * FROM clientes WHERE empresa_id = ? AND REPLACE(REPLACE(nro_id, '-', ''), ' ', '') = ? LIMIT 1");
$cli_stmt->bind_param('is', $empresaId, $docNorm);
$cli_stmt->execute();
$cliente = $cli_stmt->get_result()->fetch_assoc() ?: [];

function _n2l($n) {
    $un = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
           'diez', 'once', 'doce', 'trece', 'catorce', 'quince',
           'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve'];
    $de = ['', 'diez', 'veinte', 'treinta', 'cuarenta', 'cincuenta',
           'sesenta', 'setenta', 'ochenta', 'noventa'];
    $ce = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
           'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
    $n = (int)$n;
    if ($n === 0) return 'cero';
    if ($n < 20) return $un[$n];
    if ($n < 100) { $d = intdiv($n, 10); $u = $n % 10; return $u ? $de[$d] . ' y ' . $un[$u] : $de[$d]; }
    if ($n < 1000) { $c = intdiv($n, 100); $r = $n % 100; return $n === 100 ? 'cien' : ($r ? $ce[$c] . ' ' . _n2l($r) : $ce[$c]); }
    if ($n < 1000000) { $m = intdiv($n, 1000); $r = $n % 1000; $s = $m === 1 ? 'mil' : _n2l($m) . ' mil'; return $r ? $s . ' ' . _n2l($r) : $s; }
    if ($n < 1000000000) { $m = intdiv($n, 1000000); $r = $n % 1000000; $s = $m === 1 ? 'un millon' : _n2l($m) . ' millones'; return $r ? $s . ' ' . _n2l($r) : $s; }
    return number_format($n, 0, ',', '.');
}

function montoEnLetras($monto) {
    $e = (int)$monto;
    $c = (int)round(($monto - $e) * 100);
    $t = 'Son PESOS: ' . strtoupper(_n2l($e));
    return $c > 0 ? $t . ' CON ' . strtoupper(_n2l($c)) : $t;
}

$tipo_cbte = (int)($venta['tipo_cbte'] ?? 6);
$_letra_map = [1 => 'A', 2 => 'ND', 3 => 'NC', 6 => 'B', 7 => 'ND', 8 => 'NC'];
$_clase_map = [1 => 'A', 2 => 'A', 3 => 'A', 6 => 'B', 7 => 'B', 8 => 'B'];
$_nom_map = [
    1 => 'Factura A', 6 => 'Factura B',
    2 => 'Nota de Debito', 7 => 'Nota de Debito',
    3 => 'Nota de Credito', 8 => 'Nota de Credito',
];
$letra = $_letra_map[$tipo_cbte] ?? 'B';
$clase = $_clase_map[$tipo_cbte] ?? 'B';
$nom_cbte = $_nom_map[$tipo_cbte] ?? 'Comprobante';
$es_a = in_array($tipo_cbte, [1, 2, 3], true);

$monto_neto = (float)($venta['monto_neto'] ?? 0);
$monto_iva = (float)($venta['monto_iva'] ?? 0);
$monto_tot = (float)($venta['monto'] ?? 0);
if ($monto_neto <= 0 && $monto_tot > 0) {
    $monto_neto = round($monto_tot / 1.21, 2);
    $monto_iva = round($monto_tot - $monto_neto, 2);
}
$monto_descuento = round($suma_bruta - $monto_neto, 2);

$pdf = new ComprobantePDF('P', 'mm', 'A4');
$pdf->SetMargins(15, 14, 15);
$pdf->SetAutoPageBreak(true, 24);
$pdf->AddPage();

$company = starlim_pdf_company();
$fecha = !empty($venta['fecha']) ? date('d/m/Y', strtotime($venta['fecha'])) : date('d/m/Y');
$nro = str_pad((string)$venta['nro_comprobante'], 8, '0', STR_PAD_LEFT);

// Fiscal header.
$hdrY = 14;
$pdf->SetDrawColor(31, 36, 33);
$pdf->SetLineWidth(0.35);
$pdf->RoundedRect(15, $hdrY, 180, 47, 2.5, 'D');
$pdf->Line(105, $hdrY, 105, $hdrY + 47);

$letterW = 18;
$pdf->SetFillColor(255, 255, 255);
$pdf->RoundedRect(96, $hdrY, $letterW, 20, 2, 'D');
$pdf->SetXY(96, $hdrY + 3);
$pdf->SetFont('Arial', 'B', strlen($letra) > 1 ? 12 : 18);
starlim_pdf_set_text($pdf, 'body');
$pdf->Cell($letterW, 7, p($letra), 0, 1, 'C');
$pdf->SetXY(96, $hdrY + 12);
$pdf->SetFont('Arial', '', 6.5);
starlim_pdf_set_text($pdf, 'muted');
$pdf->Cell($letterW, 4, p('COD. ' . str_pad((string)$tipo_cbte, 2, '0', STR_PAD_LEFT)), 0, 1, 'C');

$logoH = starlim_pdf_draw_logo($pdf, 20, $hdrY + 6, 41);
$pdf->SetXY(20, $hdrY + 8 + $logoH);
$pdf->SetFont('Arial', 'B', 8.5);
starlim_pdf_set_text($pdf, 'body');
$pdf->Cell(78, 4.5, p($company['name']), 0, 1, 'L');
$pdf->SetX(20);
$pdf->SetFont('Arial', '', 7.8);
starlim_pdf_set_text($pdf, 'muted');
$pdf->Cell(78, 4, p($company['address']), 0, 1, 'L');
$pdf->SetX(20);
$pdf->Cell(78, 4, p('IVA: ' . $company['iva']), 0, 1, 'L');

$pdf->SetXY(116, $hdrY + 8);
$pdf->SetFont('Arial', 'B', 18);
starlim_pdf_set_text($pdf, 'body');
$pdf->Cell(74, 8, p(strtoupper($nom_cbte)), 0, 1, 'R');
$pdf->SetFont('Arial', '', 8.5);
starlim_pdf_set_text($pdf, 'muted');
$pdf->SetX(116);
$pdf->Cell(74, 5, p('Punto de venta: 0001'), 0, 1, 'R');
$pdf->SetX(116);
$pdf->Cell(74, 5, p('Comp. Nro: ' . $nro), 0, 1, 'R');
$pdf->SetX(116);
$pdf->Cell(74, 5, p('Fecha de emision: ' . $fecha), 0, 1, 'R');

$pdf->SetXY(20, $hdrY + 39);
$pdf->SetFont('Arial', '', 7.8);
starlim_pdf_set_text($pdf, 'muted');
$pdf->Cell(60, 4, p('CUIT: ' . $company['cuit']), 0, 0, 'L');
$pdf->Cell(60, 4, p('Inicio actividades: --/--/----'), 0, 0, 'L');
$pdf->Cell(50, 4, p('Periodo: ' . $fecha), 0, 1, 'R');

// Customer card.
$cardY = 68;
$pdf->SetDrawColor(227, 231, 228);
$pdf->RoundedRect(15, $cardY, 180, 28, 2, 'D');
$clienteNombre = (string)($venta['nombre_cliente'] ?: ($cliente['nombre_cliente'] ?? '-'));
$docCliente = trim((string)($cliente['tipo_id'] ?? 'DNI/CUIT') . ': ' . (string)($cliente['nro_id'] ?? $venta['dni_cliente']), ': ');
$domicilio = trim((string)($cliente['domicilio'] ?? ''));
$localidad = trim(($cliente['ciudad'] ?? '') . ', ' . ($cliente['provincia'] ?? ''), ', ');

$pdf->SetXY(19, $cardY + 4);
starlim_pdf_key_value($pdf, 'Cliente', $clienteNombre, 18, 150);
$pdf->SetXY(19, $cardY + 10);
starlim_pdf_key_value($pdf, 'CUIT/DNI', $docCliente, 23, 64);
$pdf->SetXY(108, $cardY + 10);
starlim_pdf_key_value($pdf, 'Cond. IVA', (string)($cliente['cond_iva'] ?? ($es_a ? 'Responsable Inscripto' : 'Consumidor Final')), 25, 55);
$pdf->SetXY(19, $cardY + 16);
starlim_pdf_key_value($pdf, 'Domicilio', trim($domicilio . ' ' . $localidad) ?: '-', 23, 64);
$pdf->SetXY(108, $cardY + 16);
starlim_pdf_key_value($pdf, 'Cond. venta', (string)($venta['condicion_pago'] ?: '-'), 25, 55);

$pdf->SetY($cardY + 36);
$headers = ['Cant.', 'Descripcion', 'P. unit.', 'IVA', 'Subtotal'];
$widths = [18, 82, 32, 18, 30];
$aligns = ['L', 'L', 'R', 'C', 'R'];
starlim_pdf_table_header($pdf, $headers, $widths, $aligns);

$pdf->SetFont('Arial', '', 8.7);
foreach ($items as $item) {
    if ($pdf->GetY() > 220) {
        $pdf->AddPage();
        starlim_pdf_table_header($pdf, $headers, $widths, $aligns);
        $pdf->SetFont('Arial', '', 8.7);
    }

    $qty = (float)$item['cantidad'];
    $qtyS = number_format($qty, $qty == (int)$qty ? 0 : 2, ',', '.');
    $desc = $item['nombre'];
    $rowH = max(8.5, (int)ceil($pdf->GetStringWidth(p($desc)) / 79) * 5.2);
    $x = 15;
    $y = $pdf->GetY();
    $pdf->SetDrawColor(236, 239, 237);
    starlim_pdf_set_text($pdf, 'body');

    $pdf->SetXY($x, $y);
    $pdf->Cell($widths[0], $rowH, $qtyS, 0, 0, 'L');
    $x += $widths[0];

    $pdf->SetXY($x, $y + 1.1);
    $pdf->MultiCell($widths[1] - 2, 5, p($desc), 0, 'L');
    $x += $widths[1];

    $pdf->SetXY($x, $y);
    $pdf->Cell($widths[2], $rowH, p(starlim_pdf_money((float)$item['precio_unit'])), 0, 0, 'R');
    $x += $widths[2];

    $pdf->SetXY($x, $y);
    starlim_pdf_set_text($pdf, 'soft');
    $pdf->Cell($widths[3], $rowH, '21%', 0, 0, 'C');
    $x += $widths[3];

    $pdf->SetXY($x, $y);
    starlim_pdf_set_text($pdf, 'body');
    $pdf->SetFont('Arial', 'B', 8.7);
    $pdf->Cell($widths[4], $rowH, p(starlim_pdf_money((float)$item['subtotal'])), 0, 0, 'R');
    $pdf->SetFont('Arial', '', 8.7);

    $pdf->Line(15, $y + $rowH, 195, $y + $rowH);
    $pdf->SetY($y + $rowH);
}

$footerH = 82;
$y = max($pdf->GetY() + 8, 168);
if ($y + $footerH > 277) {
    $pdf->AddPage();
    $y = 20;
}
$pdf->SetAutoPageBreak(false);

$obs = trim((string)($venta['obs_form'] ?? $cliente['observacion'] ?? ''));
if ($obs !== '') {
    $pdf->SetDrawColor(227, 231, 228);
    $pdf->RoundedRect(15, $y, 86, 28, 2, 'D');
    $pdf->SetXY(19, $y + 4);
    starlim_pdf_section_title($pdf, 'Observaciones', 19);
    $pdf->SetXY(19, $y + 10);
    $pdf->SetFont('Arial', '', 8);
    starlim_pdf_set_text($pdf, 'muted');
    $pdf->MultiCell(78, 4.5, p($obs), 0, 'L');
}

$totX = 112;
$totY = $y;
$rows = [
    ['Importe neto gravado', starlim_pdf_money($suma_bruta)],
    ['Descuento', ($monto_descuento > 0 ? '-' : '') . starlim_pdf_money(abs($monto_descuento))],
    ['Subtotal neto', starlim_pdf_money($monto_neto)],
    ['IVA 21%', starlim_pdf_money($monto_iva)],
];
$pdf->SetFont('Arial', '', 8.8);
foreach ($rows as [$label, $value]) {
    $pdf->SetXY($totX, $totY);
    starlim_pdf_set_text($pdf, 'muted');
    $pdf->Cell(50, 6, p($label), 0, 0, 'L');
    starlim_pdf_set_text($pdf, 'body');
    $pdf->Cell(33, 6, p($value), 0, 0, 'R');
    $totY += 6;
}
$pdf->SetDrawColor(31, 36, 33);
$pdf->SetLineWidth(0.55);
$pdf->Line($totX, $totY + 1, 195, $totY + 1);
$pdf->SetXY($totX, $totY + 4);
$pdf->SetFont('Arial', 'B', 14);
starlim_pdf_set_text($pdf, 'body');
$pdf->Cell(35, 8, 'Importe total', 0, 0, 'L');
$pdf->Cell(48, 8, p(starlim_pdf_money($monto_tot)), 0, 1, 'R');

$pdf->SetXY(15, max($totY + 16, $y + 34));
$pdf->SetFont('Arial', 'I', 8);
starlim_pdf_set_text($pdf, 'muted');
$pdf->Cell(180, 5, p(montoEnLetras($monto_tot)), 0, 1, 'R');

// ARCA QR.
$y_cae = $pdf->GetY() + 8;
$mapaTipoDoc = ['CUIT' => 80, 'CUIL' => 86, 'CDI' => 87, 'LE' => 89, 'LC' => 90, 'CI' => 91, 'Pasaporte' => 94, 'DNI' => 96];
$tipo_doc_rec = $mapaTipoDoc[$cliente['tipo_id'] ?? ''] ?? 96;
if ((string)($venta['dni_cliente'] ?? '') === '0') $tipo_doc_rec = 99;

$qrData = [
    'ver' => 1,
    'fecha' => date('Y-m-d', strtotime($venta['fecha'])),
    'cuit' => 20466567575,
    'ptoVta' => 1,
    'tipoCmp' => (int)$venta['tipo_cbte'],
    'nroCmp' => (int)$venta['nro_comprobante'],
    'importe' => round((float)$venta['monto'], 2),
    'moneda' => 'PES',
    'ctz' => 1,
    'tipoDocRec' => $tipo_doc_rec,
    'nroDocRec' => (int)$venta['dni_cliente'],
    'tipoCodAut' => 'E',
    'codAut' => (int)$venta['cae'],
];
$qrContenido = 'https://www.afip.gob.ar/fe/qr/?p=' . base64_encode(json_encode($qrData));
$tmpQr = tempnam(sys_get_temp_dir(), 'qr_') . '.png';
$qrOk = false;

$phpqrcode = __DIR__ . '/../phpqrcode/phpqrcode.php';
if (is_file($phpqrcode) && function_exists('imagecreate')) {
    require_once $phpqrcode;
    QRcode::png($qrContenido, $tmpQr, QR_ECLEVEL_H, 10, 2);
    $qrOk = true;
} else {
    $png = @file_get_contents('https://api.qrserver.com/v1/create-qr-code/?size=420x420&margin=2&ecc=H&data=' . urlencode($qrContenido));
    if ($png !== false && substr($png, 1, 3) === 'PNG') {
        file_put_contents($tmpQr, $png);
        $qrOk = true;
    }
}

$pdf->SetDrawColor(227, 231, 228);
$pdf->Line(15, $y_cae - 4, 195, $y_cae - 4);
if ($qrOk) {
    $pdf->Image($tmpQr, 15, $y_cae, 26, 26, 'PNG');
    @unlink($tmpQr);
} else {
    @unlink($tmpQr);
    $pdf->Rect(15, $y_cae, 26, 26);
    $pdf->SetXY(15, $y_cae + 9);
    $pdf->SetFont('Arial', 'B', 6.5);
    starlim_pdf_set_text($pdf, 'muted');
    $pdf->Cell(26, 5, 'QR no disponible', 0, 0, 'C');
}

$caeVto = !empty($venta['vencimiento_cae']) ? date('d/m/Y', strtotime($venta['vencimiento_cae'])) : '-';
$pdf->SetXY(47, $y_cae + 2);
$pdf->SetFont('Arial', 'B', 9);
starlim_pdf_set_text($pdf, 'body');
$pdf->Cell(0, 5, p('COMPROBANTE AUTORIZADO'), 0, 1, 'L');
$pdf->SetX(47);
$pdf->SetFont('Arial', '', 8.5);
starlim_pdf_set_text($pdf, 'muted');
$pdf->Cell(0, 5, p('CAE Nro.: ' . (string)$venta['cae']), 0, 1, 'L');
$pdf->SetX(47);
$pdf->Cell(0, 5, p('Fecha de vto. CAE: ' . $caeVto), 0, 1, 'L');
$pdf->SetX(47);
$pdf->Cell(0, 5, p('Agencia de Recaudacion y Control Aduanero (ARCA)'), 0, 1, 'L');

$_pref_map = [1 => 'Factura', 6 => 'Factura', 2 => 'ND', 7 => 'ND', 3 => 'NC', 8 => 'NC'];
$nombre_archivo = ($_pref_map[$tipo_cbte] ?? 'Comprobante') . '_' . $clase . '_' . $nro . '.pdf';
$modo = isset($_GET['view']) ? 'I' : 'D';
$pdf->Output($modo, $nombre_archivo);
