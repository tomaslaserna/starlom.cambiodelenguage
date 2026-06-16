<?php
/**
 * generar_pdf_comprobante.php — PDF de una Nota de Crédito/Débito de
 * comprobantes_venta (fiscal o interna). Reusa el layout del remito.
 */
session_start();
if (!isset($_SESSION['usuario'])) { header('Location: ../frontend/sign.php'); die(); }

include 'conexion_starlim_be.php';
require_once '../fpdf186/fpdf.php';

$id = intval($_GET['id'] ?? 0);
if (!$id) die("Error: ID inválido.");

$res = $conexion->query("SELECT * FROM comprobantes_venta WHERE id = $id");
$c = $res->fetch_assoc();
if (!$c) die("Error: comprobante no encontrado.");

// Datos del cliente vía la venta o el remito asociado
$cliente_nombre = ''; $cliente_doc = ''; $ref_label = '';
if (!empty($c['id_venta'])) {
    $r = $conexion->query("SELECT nombre_cliente, dni_cliente, nro_comprobante, COALESCE(cae,'') AS cae FROM ventas WHERE id = " . (int)$c['id_venta']);
    if ($v = $r->fetch_assoc()) {
        $cliente_nombre = $v['nombre_cliente']; $cliente_doc = $v['dni_cliente'];
        $ref_label = ($v['cae'] !== '' ? 'Factura #' : 'Pedido #') . str_pad((int)$v['nro_comprobante'], 8, '0', STR_PAD_LEFT);
    }
} elseif (!empty($c['id_remito'])) {
    $r = $conexion->query("SELECT nombre_cliente, dni_cliente, nro_remito FROM remitos WHERE id = " . (int)$c['id_remito']);
    if ($v = $r->fetch_assoc()) {
        $cliente_nombre = $v['nombre_cliente']; $cliente_doc = $v['dni_cliente'];
        $ref_label = 'Remito #' . str_pad((int)$v['nro_remito'], 8, '0', STR_PAD_LEFT);
    }
}

$items = json_decode($c['detalle_json'] ?? '[]', true) ?: [];

$titulo = ($c['clase'] === 'NC' ? 'NOTA DE CREDITO' : 'NOTA DE DEBITO')
        . ((int)$c['fiscal'] ? '' : ' (INTERNA)');
$inicial = $c['clase'] === 'NC' ? 'NC' : 'ND';

function p($str) { return iconv('UTF-8', 'ISO-8859-1//TRANSLIT', $str ?? ''); }

class CompPDF extends FPDF {
    function Footer() {
        $this->SetY(-12);
        $this->SetFont('Arial', 'I', 7);
        $this->SetTextColor(150, 150, 150);
        $this->Cell(0, 5, 'Pagina ' . $this->PageNo(), 0, 0, 'C');
    }
}

$pdf = new CompPDF('P', 'mm', 'A4');
$pdf->AddPage();
$pdf->SetMargins(10, 10, 10);
$pdf->SetAutoPageBreak(true, 20);

// — Encabezado —
$logo = __DIR__ . '/../imagenesIndex/logo nuevo starlim-04.png';
if (file_exists($logo)) {
    $logo_w = 45; [$pw, $ph] = getimagesize($logo);
    $pdf->Image($logo, 10, 10, $logo_w);
    $y_empresa = 10 + ($ph / $pw) * $logo_w + 2;
} else { $y_empresa = 18; }

$pdf->SetXY(10, $y_empresa);
$pdf->SetFont('Arial', 'B', 9);
$pdf->Cell(70, 5, 'De Starlimm S.A.S.', 0, 1, 'L');
$pdf->SetX(10); $pdf->SetFont('Arial', '', 8); $pdf->SetTextColor(60, 60, 60);
$pdf->Cell(70, 4, 'CUIT: 20-46656757-5', 0, 1, 'L');

// — Centro: letra —
$pdf->SetXY(83, 10);
$pdf->SetFont('Arial', 'B', 18); $pdf->SetTextColor(0, 0, 0);
$pdf->Cell(44, 22, $inicial, 1, 0, 'C');
$pdf->SetXY(83, 33);
$pdf->SetFont('Arial', 'B', 9);
$pdf->Cell(44, 6, p($titulo), 0, 0, 'C');

// — Derecha —
$pdf->SetXY(133, 10);
$pdf->SetFont('Arial', 'B', 12);
$pdf->Cell(67, 6, 'Star Lim', 0, 1, 'R');
$pdf->SetX(133); $pdf->SetFont('Arial', 'B', 10);
$pdf->Cell(67, 6, 'Nro: ' . str_pad((int)$c['nro_comprobante'], 8, '0', STR_PAD_LEFT), 0, 1, 'R');
$pdf->SetX(133); $pdf->SetFont('Arial', '', 8);
$pdf->Cell(67, 4, 'Fecha: ' . date('d/m/Y', strtotime($c['creado_en'])), 0, 1, 'R');
if ((int)$c['fiscal'] && $c['cae'] !== '') {
    $pdf->SetX(133); $pdf->Cell(67, 4, 'CAE: ' . $c['cae'], 0, 1, 'R');
}
if ($ref_label !== '') {
    $pdf->SetX(133); $pdf->Cell(67, 4, p('Ref: ' . $ref_label), 0, 1, 'R');
}

$y_linea = max($pdf->GetY(), 39) + 2;
$pdf->SetLineWidth(0.5); $pdf->Line(10, $y_linea, 200, $y_linea); $pdf->SetLineWidth(0.2);

// — Cliente —
$y0 = $y_linea + 3;
$pdf->SetXY(10, $y0); $pdf->SetFont('Arial', '', 8); $pdf->SetTextColor(80, 80, 80);
$pdf->Cell(20, 5, 'Cliente:', 0, 0, 'L');
$pdf->SetFont('Arial', 'B', 8); $pdf->SetTextColor(0, 0, 0);
$pdf->Cell(120, 5, p($cliente_nombre ?: '-'), 0, 1, 'L');
$pdf->SetX(10); $pdf->SetFont('Arial', '', 8); $pdf->SetTextColor(80, 80, 80);
$pdf->Cell(20, 5, 'DNI/CUIT:', 0, 0, 'L');
$pdf->SetFont('Arial', 'B', 8); $pdf->SetTextColor(0, 0, 0);
$pdf->Cell(120, 5, p($cliente_doc ?: '-'), 0, 1, 'L');

// — Tabla de productos —
$y_tabla = $pdf->GetY() + 4;
$cw = [95, 25, 35, 35]; $ch = 7;
$pdf->SetXY(10, $y_tabla); $pdf->SetFont('Arial', 'B', 9);
$pdf->Cell($cw[0], $ch, 'Producto', 1, 0, 'C');
$pdf->Cell($cw[1], $ch, 'Cant.', 1, 0, 'C');
$pdf->Cell($cw[2], $ch, 'P. Unit.', 1, 0, 'C');
$pdf->Cell($cw[3], $ch, 'Subtotal', 1, 1, 'C');

$pdf->SetFont('Arial', '', 9);
foreach ($items as $it) {
    $nombre = p($it['nombre'] ?? '');
    $n_lines = max(1, ceil($pdf->GetStringWidth($nombre) / ($cw[0] - 2)));
    $row_h = $n_lines * $ch;
    if ($pdf->GetY() + $row_h > $pdf->GetPageHeight() - 30) $pdf->AddPage();
    $x = 10; $y = $pdf->GetY();
    $pdf->SetXY($x, $y); $pdf->MultiCell($cw[0], $ch, $nombre, 0, 'L'); $x += $cw[0];
    $pdf->SetXY($x, $y); $pdf->Cell($cw[1], $row_h, (int)($it['cantidad'] ?? 0), 0, 0, 'C'); $x += $cw[1];
    $pdf->SetXY($x, $y); $pdf->Cell($cw[2], $row_h, '$' . number_format((float)($it['precio_unit'] ?? 0), 2, ',', '.'), 0, 0, 'R'); $x += $cw[2];
    $pdf->SetXY($x, $y); $pdf->Cell($cw[3], $row_h, '$' . number_format((float)($it['subtotal'] ?? 0), 2, ',', '.'), 0, 0, 'R');
    $pdf->SetXY(10, $y + $row_h);
}

// — Total —
$pdf->Ln(2);
$pdf->SetFont('Arial', 'B', 10);
$pdf->Cell($cw[0] + $cw[1], 8, '', 0, 0);
$pdf->Cell($cw[2], 8, 'TOTAL', 1, 0, 'C');
$pdf->Cell($cw[3], 8, '$' . number_format((float)$c['monto'], 2, ',', '.'), 1, 1, 'R');

// — Motivo —
if (trim((string)$c['motivo']) !== '') {
    $pdf->Ln(4);
    $pdf->SetFont('Arial', 'B', 8); $pdf->Cell(0, 5, 'Motivo:', 0, 1, 'L');
    $pdf->SetFont('Arial', '', 8); $pdf->MultiCell(0, 5, p($c['motivo']), 0, 'L');
}

$nombre_archivo = $inicial . '_' . str_pad((int)$c['nro_comprobante'], 8, '0', STR_PAD_LEFT) . '.pdf';
$modo = isset($_GET['view']) ? 'I' : 'D';
$pdf->Output($modo, $nombre_archivo);
