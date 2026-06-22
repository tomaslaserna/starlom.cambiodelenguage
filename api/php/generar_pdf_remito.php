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

$id_remito = (int)($_GET['id_remito'] ?? ($_GET['id'] ?? 0));
if (!$id_remito) die('Error: ID de remito invalido.');
$conPrecios = !empty($_GET['precios']);

$stmt = $conexion->prepare(
    "SELECT r.*, CONCAT(v.nombre, ' ', v.apellido) AS nombre_operador
     FROM remitos r
     LEFT JOIN operadores v ON v.id = r.id_operador AND v.empresa_id = r.empresa_id
     WHERE r.id = ? AND r.empresa_id = ?"
);
$stmt->bind_param('ii', $id_remito, $empresaId);
$stmt->execute();
$remito = $stmt->get_result()->fetch_assoc();
if (!$remito) die('Error: Remito no encontrado.');

$detalle_stmt = $conexion->prepare(
    "SELECT d.id_producto AS codigo,
            COALESCE(d.nombre_producto, p.nombre, '(producto eliminado)') AS nombre,
            d.cantidad,
            d.precio_unit,
            COALESCE(d.descuento, 0) AS descuento,
            d.subtotal
     FROM detalle_remitos d
     LEFT JOIN productos p ON p.id = d.id_producto AND p.empresa_id = d.empresa_id
     WHERE d.id_remito = ? AND d.empresa_id = ?
     ORDER BY d.id ASC"
);
$detalle_stmt->bind_param('ii', $id_remito, $empresaId);
$detalle_stmt->execute();
$detalle_res = $detalle_stmt->get_result();

$dni_val = (string)($remito['dni_cliente'] ?? '');
$cli_stmt = $conexion->prepare("SELECT * FROM clientes WHERE empresa_id = ? AND REPLACE(REPLACE(nro_id, '-', ''), ' ', '') = ? LIMIT 1");
$cli_stmt->bind_param('is', $empresaId, $dni_val);
$cli_stmt->execute();
$cliente = $cli_stmt->get_result()->fetch_assoc() ?: [];

$pdf = new ComprobantePDF('P', 'mm', 'A4');
$pdf->SetMargins(15, 14, 15);
$pdf->SetAutoPageBreak(true, 22);
$pdf->AddPage();

$fecha = !empty($remito['fecha']) ? date('d/m/Y', strtotime($remito['fecha'])) : date('d/m/Y');
$extra = [$conPrecios ? 'Documento valorizado' : 'Control de mercaderia'];
if (!empty($remito['deposito'])) $extra[] = 'Deposito: ' . $remito['deposito'];

$y_linea = cabecera_comprobante(
    $pdf,
    'REMITO',
    'R',
    str_pad((string)$remito['nro_remito'], 8, '0', STR_PAD_LEFT),
    $fecha,
    $extra
);

$localidad = trim(($cliente['ciudad'] ?? '') . ', ' . ($cliente['provincia'] ?? ''), ', ');
$domicilio = (string)($cliente['domicilio'] ?? '-');
$destinatario = (string)($remito['nombre_cliente'] ?: ($cliente['nombre_cliente'] ?? '-'));
$documento = trim((string)($cliente['tipo_id'] ?? '') . ': ' . (string)($cliente['nro_id'] ?? $remito['dni_cliente']), ': ');

$pdf->SetY($y_linea + 8);
starlim_pdf_section_title($pdf, 'Destinatario', 15);
$pdf->SetFont('Arial', 'B', 10.5);
starlim_pdf_set_text($pdf, 'body');
$pdf->Cell(180, 6, p($destinatario), 0, 1, 'L');
$pdf->SetFont('Arial', '', 8.5);
starlim_pdf_set_text($pdf, 'muted');
$pdf->MultiCell(180, 4.8, p(trim($domicilio . ' - ' . ($localidad ?: '-') . ' - ' . ($documento ?: '-'), ' -')), 0, 'L');

$infoY = $pdf->GetY() + 4;
starlim_pdf_section_title($pdf, 'Entrega', 15, $infoY);
$pdf->SetXY(15, $infoY + 6);
starlim_pdf_key_value($pdf, 'Cond. vta.', (string)($remito['condicion_pago'] ?: '-'), 22, 68);
$pdf->SetXY(108, $infoY + 6);
starlim_pdf_key_value($pdf, 'Vendedor', (string)($remito['vendedor'] ?: ($cliente['vendedor_cl'] ?? '-')), 22, 65);
$pdf->SetXY(15, $infoY + 12);
starlim_pdf_key_value($pdf, 'Provincia', (string)($remito['provincia'] ?: '-'), 22, 68);
$pdf->SetXY(108, $infoY + 12);
starlim_pdf_key_value($pdf, 'Sucursal', (string)($remito['sucursal_cliente'] ?: '-'), 22, 65);

$pdf->SetY($infoY + 24);
$headers = $conPrecios
    ? ['Cant.', 'Codigo', 'Descripcion', 'P. unit.', 'Importe']
    : ['Cant.', 'Codigo', 'Descripcion', 'Control'];
$widths = $conPrecios ? [18, 24, 78, 30, 30] : [18, 28, 114, 20];
$aligns = $conPrecios ? ['L', 'L', 'L', 'R', 'R'] : ['L', 'L', 'L', 'C'];
starlim_pdf_table_header($pdf, $headers, $widths, $aligns);

$totalUnidades = 0.0;
$totalImporte = 0.0;
$pdf->SetFont('Arial', '', 8.8);
while ($det = $detalle_res->fetch_assoc()) {
    $cantidad = (float)($det['cantidad'] ?? 0);
    $importe = (float)($det['subtotal'] ?? 0);
    $totalUnidades += $cantidad;
    $totalImporte += $importe;
    $qtyS = number_format($cantidad, $cantidad == (int)$cantidad ? 0 : 2, ',', '.');
    $nombre = (string)($det['nombre'] ?? '');
    $descWidth = $conPrecios ? 74 : 110;
    $rowH = max(9, (int)ceil($pdf->GetStringWidth(p($nombre)) / $descWidth) * 5.2);

    if ($pdf->GetY() + $rowH > 255) {
        $pdf->AddPage();
        starlim_pdf_table_header($pdf, $headers, $widths, $aligns);
        $pdf->SetFont('Arial', '', 8.8);
    }

    $x = 15;
    $y = $pdf->GetY();
    $pdf->SetDrawColor(236, 239, 237);
    starlim_pdf_set_text($pdf, 'body');

    $pdf->SetXY($x, $y);
    $pdf->Cell($widths[0], $rowH, $qtyS, 0, 0, 'L');
    $x += $widths[0];
    starlim_pdf_set_text($pdf, 'soft');
    $pdf->Cell($widths[1], $rowH, p((string)($det['codigo'] ?? '-')), 0, 0, 'L');
    $x += $widths[1];

    starlim_pdf_set_text($pdf, 'body');
    $pdf->SetXY($x, $y + 1.2);
    $pdf->MultiCell($widths[2] - 2, 5, p($nombre), 0, 'L');
    $x += $widths[2];

    $pdf->SetXY($x, $y);
    if ($conPrecios) {
        $pdf->Cell($widths[3], $rowH, p(starlim_pdf_money((float)($det['precio_unit'] ?? 0))), 0, 0, 'R');
        $x += $widths[3];
        $pdf->SetXY($x, $y);
        $pdf->SetFont('Arial', 'B', 8.8);
        $pdf->Cell($widths[4], $rowH, p(starlim_pdf_money($importe)), 0, 0, 'R');
        $pdf->SetFont('Arial', '', 8.8);
    } else {
        $pdf->Cell($widths[3], $rowH, '[ ]', 0, 0, 'C');
    }

    $pdf->Line(15, $y + $rowH, 195, $y + $rowH);
    $pdf->SetY($y + $rowH);
}

$pdf->SetDrawColor(31, 36, 33);
$pdf->SetLineWidth(0.55);
$pdf->Line(15, $pdf->GetY() + 2, 195, $pdf->GetY() + 2);
$pdf->SetY($pdf->GetY() + 4);
$pdf->SetFont('Arial', 'B', 9);
starlim_pdf_set_text($pdf, 'body');
$pdf->Cell(18, 6, number_format($totalUnidades, $totalUnidades == (int)$totalUnidades ? 0 : 2, ',', '.'), 0, 0, 'L');
$pdf->Cell($conPrecios ? 105 : 162, 6, p('TOTAL DE UNIDADES'), 0, 0, 'L');
if ($conPrecios) {
    $pdf->SetFont('Arial', 'B', 12);
    $pdf->Cell(57, 6, p(starlim_pdf_money($totalImporte)), 0, 1, 'R');
} else {
    $pdf->Ln();
}

$obs = trim((string)($remito['observacion'] ?: ($cliente['observacion'] ?? '')));
$boxY = $pdf->GetY() + 8;
if ($boxY + 30 > 260) {
    $pdf->AddPage();
    $boxY = 20;
}
$pdf->SetDrawColor(227, 231, 228);
$pdf->RoundedRect(15, $boxY, 180, 26, 2, 'D');
$pdf->SetXY(19, $boxY + 4);
starlim_pdf_section_title($pdf, 'Observaciones', 19);
$pdf->SetXY(19, $boxY + 10);
$pdf->SetFont('Arial', '', 8.5);
starlim_pdf_set_text($pdf, 'muted');
$pdf->MultiCell(172, 4.8, p($obs !== '' ? $obs : 'Verificar cantidades y estado de la mercaderia al momento de la recepcion.'), 0, 'L');

$sigY = $boxY + 48;
if ($sigY > 270) {
    $pdf->AddPage();
    $sigY = 58;
}
starlim_pdf_signature_pair($pdf, 'Preparo / despacho', 'Controlo / recibio', $sigY);

$nombre_archivo = ($conPrecios ? 'Remito_con_precios_' : 'Remito_') . str_pad((string)$remito['nro_remito'], 8, '0', STR_PAD_LEFT) . '.pdf';
$modo = isset($_GET['view']) ? 'I' : 'D';
$pdf->Output($modo, $nombre_archivo);
