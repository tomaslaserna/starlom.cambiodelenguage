<?php
// Shared PDF builder for Starlim quotes.

require_once __DIR__ . '/comprobante_pdf_lib.php';

function buildPresupuestoPDF($cl, $prods, $desc_pct, $con_iva, $fecha_emit = null, $fecha_vto = null, $doc_no = null) {
    $fecha_emit = $fecha_emit ?: date('d/m/Y');
    $fecha_vto = $fecha_vto ?: date('d/m/Y', strtotime('+15 days'));
    $doc_no = $doc_no ?: ('P-' . date('Ymd'));

    $conv = function($s) { return p((string)($s ?? '')); };
    $money = function($n) { return starlim_pdf_money((float)$n); };

    $neto = 0.0;
    foreach ($prods as &$pr) {
        if (!array_key_exists('_total', $pr)) {
            $qty = max(0.001, (float)($pr['cantidad'] ?? 1));
            $pu = (float)($pr['precio_unit'] ?? 0);
            $bonif = min(100, max(0, (float)($pr['bonif'] ?? 0)));
            $pr['_qty'] = $qty;
            $pr['_pu'] = $pu;
            $pr['_bonif'] = $bonif;
            $pr['_pu_net'] = $pu * (1 - $bonif / 100);
            $pr['_total'] = round($pr['_pu_net'] * $qty, 2);
        }
        $neto += (float)$pr['_total'];
    }
    unset($pr);

    $neto = round($neto, 2);
    $desc_monto = round($neto * (float)$desc_pct / 100, 2);
    $subtotal = round($neto - $desc_monto, 2);
    $iva = $con_iva ? round($subtotal * 0.21, 2) : 0.0;
    $total = round($subtotal + $iva, 2);

    $pdf = new ComprobantePDF('P', 'mm', 'A4');
    $pdf->SetMargins(15, 14, 15);
    $pdf->SetAutoPageBreak(true, 28);
    $pdf->AddPage();

    $company = starlim_pdf_company();
    $logoH = starlim_pdf_draw_logo($pdf, 15, 15, 43);
    $infoY = 15 + $logoH + 3;
    $pdf->SetXY(15, $infoY);
    $pdf->SetFont('Arial', '', 8);
    starlim_pdf_set_text($pdf, 'muted');
    $pdf->Cell(102, 4.2, p($company['name'] . ' - CUIT ' . $company['cuit']), 0, 1, 'L');
    $pdf->SetX(15);
    $pdf->Cell(102, 4.2, p($company['address'] . ' - ' . $company['phone']), 0, 1, 'L');

    $pdf->SetXY(120, 15);
    $pdf->SetFont('Arial', 'B', 24);
    starlim_pdf_set_text($pdf, 'body');
    $pdf->Cell(75, 9, 'Presupuesto', 0, 1, 'R');
    $pdf->SetFont('Arial', '', 8.5);
    starlim_pdf_set_text($pdf, 'muted');
    $pdf->SetX(120);
    $pdf->Cell(75, 5, p('Nro. ' . $doc_no), 0, 1, 'R');
    $pdf->SetX(120);
    $pdf->Cell(75, 5, p('Fecha ' . $fecha_emit), 0, 1, 'R');
    $pdf->SetX(120);
    $pdf->Cell(75, 5, p('Validez hasta ' . $fecha_vto), 0, 1, 'R');

    $yLine = max(55, $pdf->GetY() + 4);
    $pdf->SetDrawColor(31, 36, 33);
    $pdf->SetLineWidth(0.55);
    $pdf->Line(15, $yLine, 195, $yLine);
    $pdf->SetLineWidth(0.2);

    $pdf->SetY($yLine + 8);
    starlim_pdf_section_title($pdf, 'Presupuestado a', 15);
    $pdf->SetFont('Arial', 'B', 11);
    starlim_pdf_set_text($pdf, 'body');
    $clienteNombre = trim((string)($cl['razon_social'] ?? '')) ?: (string)($cl['nombre'] ?? '');
    $pdf->Cell(180, 6, $conv($clienteNombre ?: '-'), 0, 1, 'L');

    $lineasCliente = array_filter([
        trim((string)($cl['domicilio'] ?? '')),
        trim((string)($cl['cuit'] ?? '')) !== '' ? 'CUIT ' . trim((string)$cl['cuit']) : '',
        trim((string)($cl['cond_iva'] ?? '')),
        trim((string)($cl['telefono'] ?? '')),
    ]);
    $pdf->SetFont('Arial', '', 9);
    starlim_pdf_set_text($pdf, 'muted');
    $pdf->MultiCell(180, 5, $conv(implode(' - ', $lineasCliente) ?: '-'), 0, 'L');

    $pdf->Ln(7);

    $headers = ['Cant.', 'Descripcion', 'P. unitario', 'Bonif.', 'Importe'];
    $widths = [18, 82, 28, 20, 32];
    $aligns = ['L', 'L', 'R', 'R', 'R'];
    $drawHeader = function() use ($pdf, $headers, $widths, $aligns) {
        starlim_pdf_table_header($pdf, $headers, $widths, $aligns);
    };
    $drawHeader();

    $pdf->SetFont('Arial', '', 8.8);
    foreach ($prods as $pr) {
        if ($pdf->GetY() > 245) {
            $pdf->AddPage();
            $drawHeader();
            $pdf->SetFont('Arial', '', 8.8);
        }

        $qty = (float)($pr['_qty'] ?? $pr['cantidad'] ?? 1);
        $qtyS = number_format($qty, $qty == (int)$qty ? 0 : 2, ',', '.');
        $bonif = (float)($pr['_bonif'] ?? 0);
        $bonifS = $bonif > 0 ? number_format($bonif, 1, ',', '.') . '%' : '-';
        $desc = (string)($pr['nombre'] ?? '');
        $descW = $widths[1] - 3;
        $descLines = max(1, (int)ceil($pdf->GetStringWidth($conv($desc)) / max(1, $descW)));
        $rowH = max(8, $descLines * 5.2);
        $x = 15;
        $y = $pdf->GetY();

        $pdf->SetDrawColor(236, 239, 237);
        starlim_pdf_set_text($pdf, 'body');

        $pdf->SetXY($x, $y);
        $pdf->Cell($widths[0], $rowH, $qtyS, 0, 0, 'L');
        $x += $widths[0];

        $pdf->SetXY($x, $y + 1.2);
        $pdf->MultiCell($widths[1] - 2, 5, $conv($desc), 0, 'L');
        $x += $widths[1];

        $pdf->SetXY($x, $y);
        $pdf->Cell($widths[2], $rowH, $conv($money((float)($pr['_pu'] ?? 0))), 0, 0, 'R');
        $x += $widths[2];

        $pdf->SetXY($x, $y);
        $pdf->Cell($widths[3], $rowH, $bonifS, 0, 0, 'R');
        $x += $widths[3];

        $pdf->SetXY($x, $y);
        $pdf->SetFont('Arial', 'B', 8.8);
        $pdf->Cell($widths[4], $rowH, $conv($money((float)($pr['_total'] ?? 0))), 0, 0, 'R');
        $pdf->SetFont('Arial', '', 8.8);

        $pdf->Line(15, $y + $rowH, 195, $y + $rowH);
        $pdf->SetY($y + $rowH);
    }

    $pdf->Ln(6);
    $totX = 112;
    $totW = 83;
    $totY = $pdf->GetY();
    if ($totY > 225) {
        $pdf->AddPage();
        $totY = 20;
    }

    $rows = [
        ['Subtotal neto', $money($neto)],
    ];
    if ((float)$desc_pct > 0) {
        $rows[] = ['Descuento ' . number_format((float)$desc_pct, 1, ',', '.') . '%', '-' . $money($desc_monto)];
    }
    $rows[] = ['Base imponible', $money($subtotal)];
    if ($con_iva) $rows[] = ['IVA 21%', $money($iva)];

    $pdf->SetFont('Arial', '', 9);
    foreach ($rows as [$label, $value]) {
        $pdf->SetXY($totX, $totY);
        starlim_pdf_set_text($pdf, 'muted');
        $pdf->Cell(48, 6, p($label), 0, 0, 'L');
        starlim_pdf_set_text($pdf, 'body');
        $pdf->Cell($totW - 48, 6, p($value), 0, 0, 'R');
        $totY += 6;
    }
    $pdf->SetDrawColor(31, 36, 33);
    $pdf->SetLineWidth(0.55);
    $pdf->Line($totX, $totY + 1, $totX + $totW, $totY + 1);
    $pdf->SetXY($totX, $totY + 4);
    $pdf->SetFont('Arial', 'B', 14);
    starlim_pdf_set_text($pdf, 'body');
    $pdf->Cell(40, 8, 'Total', 0, 0, 'L');
    $pdf->Cell($totW - 40, 8, p($money($total)), 0, 0, 'R');

    $pdf->SetY($totY + 20);
    if ($pdf->GetY() > 235) $pdf->AddPage();

    $boxY = $pdf->GetY();
    $pdf->SetDrawColor(227, 231, 228);
    $pdf->RoundedRect(15, $boxY, 180, 25, 2, 'D');
    $pdf->SetXY(19, $boxY + 4);
    starlim_pdf_section_title($pdf, 'Condiciones', 19);
    $pdf->SetXY(19, $boxY + 10);
    $pdf->SetFont('Arial', '', 8.5);
    starlim_pdf_set_text($pdf, 'muted');
    $pdf->MultiCell(172, 4.6, p('Precios expresados en pesos argentinos. Presupuesto valido hasta la fecha indicada, sujeto a disponibilidad de stock y confirmacion comercial. Forma de pago y entrega segun acuerdo con el vendedor.'), 0, 'L');

    $sigY = $boxY + 47;
    if ($sigY > 270) {
        $pdf->AddPage();
        $sigY = 62;
    }
    starlim_pdf_signature_pair($pdf, 'Por Starlim S.A.S.', 'Conformidad del cliente', $sigY);

    return $pdf->Output('S');
}
