<?php
// Biblioteca compartida para generación de PDF de presupuestos.
// Incluir con require_once antes de usar buildPresupuestoPDF().

if (!class_exists('FPDF')) {
    require_once __DIR__ . '/../fpdf186/fpdf.php';
}

if (!class_exists('PresupuestoPDF')) {
    class PresupuestoPDF extends FPDF {
        function Footer() {}
    }
}

/**
 * Genera el PDF de un presupuesto y lo retorna como string binario.
 *
 * $cl            : array con claves nombre, razon_social, domicilio, telefono, cond_iva, cuit
 * $prods         : array de productos; cada ítem debe tener nombre, precio_unit, cantidad, bonif
 *                  (y opcionalmente los campos pre-calculados _qty, _pu, _bonif, _pu_net, _total)
 * $desc_pct      : descuento global en %
 * $con_iva       : bool, incluir IVA 21%
 * $fecha_emit    : string 'dd/mm/yyyy' o null (usa fecha de hoy)
 * $fecha_vto     : string 'dd/mm/yyyy' o null (usa hoy + 15 días)
 */
function buildPresupuestoPDF($cl, $prods, $desc_pct, $con_iva, $fecha_emit = null, $fecha_vto = null) {
    $fecha_emit = $fecha_emit ?: date('d/m/Y');
    $fecha_vto  = $fecha_vto  ?: date('d/m/Y', strtotime('+15 days'));

    $conv  = function($s) { return iconv('UTF-8', 'ISO-8859-1//TRANSLIT', (string)($s ?? '')); };
    $money = function($n) { return '$' . number_format((float)$n, 2, ',', '.'); };

    // Calcular campos derivados si no vienen pre-calculados
    $neto = 0;
    foreach ($prods as &$pr) {
        if (!array_key_exists('_total', $pr)) {
            $qty       = max(0.001, (float)($pr['cantidad']   ?? 1));
            $pu        = (float)($pr['precio_unit'] ?? 0);
            $bonif     = min(100, max(0, (float)($pr['bonif'] ?? 0)));
            $pr['_qty']    = $qty;
            $pr['_pu']     = $pu;
            $pr['_bonif']  = $bonif;
            $pr['_pu_net'] = $pu * (1 - $bonif / 100);
            $pr['_total']  = round($pr['_pu_net'] * $qty, 2);
        }
        $neto += (float)$pr['_total'];
    }
    unset($pr);

    $neto       = round($neto, 2);
    $desc_monto = round($neto * (float)$desc_pct / 100, 2);
    $subtotal   = round($neto - $desc_monto, 2);
    $iva        = $con_iva ? round($subtotal * 0.21, 2) : 0.0;
    $total      = round($subtotal + $iva, 2);

    $logo = __DIR__ . '/../imagenesIndex/logo nuevo starlim-04.png';
    $cw   = [82, 15, 15, 27, 27, 24]; // anchos de columna, suma = 190 mm

    $pdf = new PresupuestoPDF('P', 'mm', 'A4');
    $pdf->AddPage();
    $pdf->SetMargins(15, 15, 15);
    $pdf->SetAutoPageBreak(true, 50);

    // ── ENCABEZADO ─────────────────────────────────────────────
    $pdf->SetXY(15, 15);
    $pdf->SetFont('Arial', 'B', 18);
    $pdf->SetTextColor(0, 0, 0);
    $pdf->Cell(90, 9, 'STARLIMM SAS', 0, 1, 'L');

    $pdf->SetFont('Arial', '', 8);
    $pdf->SetTextColor(60, 60, 60);
    foreach (['Av. argentina 1515, Villa allende, Cordoba', 'Tel: 3543 68-3594', 'starlimmsas@gmail.com'] as $linea) {
        $pdf->SetX(15);
        $pdf->Cell(90, 4, $linea, 0, 1, 'L');
    }
    $yc = $pdf->GetY();
    if (file_exists($logo)) $pdf->Image($logo, 15, $yc + 2, 35);

    $pdf->SetXY(110, 15);
    $pdf->SetFont('Arial', 'B', 18);
    $pdf->SetTextColor(0, 0, 0);
    $pdf->Cell(80, 9, 'PRESUPUESTO', 0, 0, 'R');

    $pdf->SetXY(110, 26); $pdf->SetFont('Arial', '', 8);
    $pdf->Cell(58, 5, 'FECHA',     0, 0, 'R'); $pdf->SetFont('Arial', 'B', 8); $pdf->Cell(22, 5, $fecha_emit, 0, 1, 'R');
    $pdf->SetXY(110, 31); $pdf->SetFont('Arial', '', 8);
    $pdf->Cell(58, 5, 'FECHA VTO', 0, 0, 'R'); $pdf->SetFont('Arial', 'B', 8); $pdf->Cell(22, 5, $fecha_vto,  0, 1, 'R');

    $ys1 = max(56, $yc + 22);
    $pdf->SetDrawColor(0, 0, 0);
    $pdf->SetLineWidth(0.5);
    $pdf->Line(15, $ys1, 195, $ys1);
    $pdf->SetLineWidth(0.2);

    // ── DATOS DE CLIENTE ────────────────────────────────────────
    $y0 = $ys1 + 3;
    $pdf->SetXY(15, $y0);
    $pdf->SetFont('Arial', 'B', 9);
    $pdf->SetTextColor(0, 0, 0);
    $pdf->Cell(0, 5, 'DATOS DE CLIENTE', 0, 1, 'L');
    $pdf->Line(15, $pdf->GetY(), 195, $pdf->GetY());
    $y0 = $pdf->GetY() + 2;

    $left_cl  = [['NOMBRE:',    $conv($cl['nombre']       ?? '')],
                 ['DIRECCION:', $conv($cl['domicilio']    ?? '')],
                 ['TELEFONO:',  $conv($cl['telefono']     ?? '')]];
    $right_cl = [['RAZON SOCIAL:', $conv($cl['razon_social'] ?? '')],
                 ['CONDICION:',    $conv($cl['cond_iva']     ?? '')],
                 ['CUIT:',         $conv($cl['cuit']         ?? '')]];

    $yl = $y0; $yr = $y0;
    foreach ($left_cl as [$lb, $vl]) {
        $pdf->SetXY(15, $yl);
        $pdf->SetFont('Arial', 'B', 8); $pdf->Cell(24, 5, $lb, 0, 0, 'L');
        $pdf->SetFont('Arial', '', 8);  $pdf->Cell(66, 5, $vl, 0, 0, 'L');
        $yl += 5;
    }
    foreach ($right_cl as [$lb, $vl]) {
        $pdf->SetXY(110, $yr);
        $pdf->SetFont('Arial', 'B', 8); $pdf->Cell(28, 5, $lb, 0, 0, 'L');
        $pdf->SetFont('Arial', '', 8);  $pdf->Cell(57, 5, $vl, 0, 0, 'L');
        $yr += 5;
    }
    $ys2 = max($yl, $yr) + 2;
    $pdf->SetLineWidth(0.3);
    $pdf->Line(15, $ys2, 195, $ys2);

    // ── TABLA DE PRODUCTOS ──────────────────────────────────────
    $pdf->SetXY(15, $ys2 + 2);
    $pdf->SetFont('Arial', 'B', 8);
    $pdf->SetFillColor(220, 220, 220);
    $pdf->SetTextColor(0, 0, 0);
    $pdf->Cell($cw[0], 7, 'DESCRIPCION', 1, 0, 'C', true);
    $pdf->Cell($cw[1], 7, 'CANT',        1, 0, 'C', true);
    $pdf->Cell($cw[2], 7, 'BONIF.',      1, 0, 'C', true);
    $pdf->Cell($cw[3], 7, 'P. U',        1, 0, 'C', true);
    $pdf->Cell($cw[4], 7, 'P.U %',       1, 0, 'C', true);
    $pdf->Cell($cw[5], 7, 'TOTAL',       1, 1, 'C', true);
    $pdf->SetFont('Arial', '', 8);
    $pdf->SetFillColor(255, 255, 255);

    foreach ($prods as $pr) {
        if ($pdf->GetY() + 6 > $pdf->GetPageHeight() - 55) {
            $pdf->AddPage();
            $pdf->SetFont('Arial', 'B', 8);
            $pdf->SetFillColor(220, 220, 220);
            $pdf->Cell($cw[0], 7, 'DESCRIPCION', 1, 0, 'C', true);
            $pdf->Cell($cw[1], 7, 'CANT',        1, 0, 'C', true);
            $pdf->Cell($cw[2], 7, 'BONIF.',      1, 0, 'C', true);
            $pdf->Cell($cw[3], 7, 'P. U',        1, 0, 'C', true);
            $pdf->Cell($cw[4], 7, 'P.U %',       1, 0, 'C', true);
            $pdf->Cell($cw[5], 7, 'TOTAL',       1, 1, 'C', true);
            $pdf->SetFont('Arial', '', 8);
            $pdf->SetFillColor(255, 255, 255);
        }
        $qtyS   = number_format((float)$pr['_qty'],   (float)$pr['_qty']   == intval($pr['_qty'])   ? 0 : 2, ',', '.');
        $bonifS = (float)$pr['_bonif'] > 0 ? number_format((float)$pr['_bonif'], 1, ',', '.') . '%' : '-';

        $pdf->Cell($cw[0], 6, $conv($pr['nombre'] ?? ''), 0, 0, 'L');
        $pdf->Cell($cw[1], 6, $qtyS,                      0, 0, 'C');
        $pdf->Cell($cw[2], 6, $bonifS,                    0, 0, 'C');
        $pdf->Cell($cw[3], 6, $money($pr['_pu']),         0, 0, 'R');
        $pdf->Cell($cw[4], 6, $money($pr['_pu_net']),     0, 0, 'R');
        $pdf->Cell($cw[5], 6, $money($pr['_total']),      0, 1, 'R');
    }

    // ── TOTALES ─────────────────────────────────────────────────
    $ys3 = $pdf->GetY() + 2;
    $pdf->SetLineWidth(0.3);
    $pdf->Line(15, $ys3, 195, $ys3);

    $xl = 140; $wl = 38; $wv = 17; $yt = $ys3 + 3;
    $rows_tot = [
        ['Neto Agravado', $money($neto)],
        ['Descuento %',   $money($desc_monto)],
        ['Subtotal',      $money($subtotal)],
        ['I.V.A. 21%',   $money($iva)],
    ];
    $pdf->SetFont('Arial', '', 8);
    $pdf->SetTextColor(0, 0, 0);
    foreach ($rows_tot as [$lb, $vl]) {
        $pdf->SetXY($xl, $yt);
        $pdf->Cell($wl, 5, $lb, 0, 0, 'R');
        $pdf->Cell($wv, 5, $vl, 0, 0, 'R');
        $yt += 5;
    }
    $pdf->Line($xl, $yt, 195, $yt);
    $pdf->SetXY($xl, $yt + 1);
    $pdf->SetFont('Arial', 'B', 9);
    $pdf->Cell($wl, 6, 'Total', 0, 0, 'R');
    $pdf->Cell($wv, 6, $money($total), 0, 0, 'R');

    // ── PIE ─────────────────────────────────────────────────────
    $yp = $pdf->GetY() + 12;
    $pdf->SetXY(15, $yp);
    $pdf->SetFont('Arial', '', 7);
    $pdf->SetTextColor(100, 100, 100);
    $pdf->Cell(140, 4, 'Todo pago debe realizarse a STARLIMM SAS', 0, 1, 'L');
    $pdf->SetX(15);
    $pdf->Cell(140, 4, 'Si tiene alguna duda respecto a este documento consulte a su vendedor o mediante:', 0, 1, 'L');
    $pdf->SetX(15);
    $pdf->SetFont('Arial', 'B', 7);
    $pdf->Cell(140, 4, 'Centro de Atencion, Whatsapp 354 368 3594, starlimmsas@gmail.com |', 0, 1, 'L');
    $pdf->SetX(15);
    $pdf->Cell(140, 4, 'GRACIAS POR TRABAJAR CON NOSOTROS!', 0, 1, 'L');
    if (file_exists($logo)) $pdf->Image($logo, 165, $yp, 25);

    return $pdf->Output('S');
}
