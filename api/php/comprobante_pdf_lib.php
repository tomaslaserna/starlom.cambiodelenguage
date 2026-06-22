<?php
/**
 * Shared PDF primitives for Starlim operational documents.
 *
 * The visual language mirrors the supplied HTML references while keeping the
 * existing FPDF runtime used in production.
 */

if (!class_exists('FPDF')) {
    require_once __DIR__ . '/../fpdf186/fpdf.php';
}

if (!function_exists('p')) {
    function p($str) {
        return iconv('UTF-8', 'ISO-8859-1//TRANSLIT', (string)($str ?? ''));
    }
}

if (!function_exists('starlim_pdf_money')) {
    function starlim_pdf_money(float $value): string {
        return '$' . number_format($value, 2, ',', '.');
    }
}

if (!function_exists('starlim_pdf_logo_path')) {
    function starlim_pdf_logo_path(): string {
        foreach ([
            __DIR__ . '/../../imagenesIndex/logo nuevo starlim-04.png',
            __DIR__ . '/../imagenesIndex/logo nuevo starlim-04.png',
        ] as $path) {
            if (is_file($path)) return $path;
        }
        return '';
    }
}

if (!function_exists('starlim_pdf_company')) {
    function starlim_pdf_company(): array {
        return [
            'name' => 'Starlim S.A.S.',
            'brand' => 'Starlim',
            'cuit' => '20-46656757-5',
            'address' => 'Av. Argentina 1515, Villa Allende, Cordoba',
            'phone' => '+54 9 351 373-7820',
            'email' => 'starlimmsas@gmail.com',
            'iva' => 'Responsable Inscripto',
        ];
    }
}

if (!class_exists('ComprobantePDF')) {
    class ComprobantePDF extends FPDF {
        function RoundedRect($x, $y, $w, $h, $r, $style = '') {
            if ($style === 'F') $op = 'f';
            elseif ($style === 'FD' || $style === 'DF') $op = 'B';
            else $op = 'S';

            $k = $this->k;
            $hp = $this->h;
            $cp = 0.4477 * $r;

            $this->_out(sprintf('%.2F %.2F m', ($x + $r) * $k, ($hp - $y) * $k));
            $this->_out(sprintf('%.2F %.2F l', ($x + $w - $r) * $k, ($hp - $y) * $k));
            $this->_out(sprintf('%.2F %.2F %.2F %.2F %.2F %.2F c',
                ($x + $w - $r + $cp) * $k, ($hp - $y) * $k,
                ($x + $w) * $k, ($hp - ($y + $r - $cp)) * $k,
                ($x + $w) * $k, ($hp - ($y + $r)) * $k));
            $this->_out(sprintf('%.2F %.2F l', ($x + $w) * $k, ($hp - ($y + $h - $r)) * $k));
            $this->_out(sprintf('%.2F %.2F %.2F %.2F %.2F %.2F c',
                ($x + $w) * $k, ($hp - ($y + $h - $r + $cp)) * $k,
                ($x + $w - $r + $cp) * $k, ($hp - ($y + $h)) * $k,
                ($x + $w - $r) * $k, ($hp - ($y + $h)) * $k));
            $this->_out(sprintf('%.2F %.2F l', ($x + $r) * $k, ($hp - ($y + $h)) * $k));
            $this->_out(sprintf('%.2F %.2F %.2F %.2F %.2F %.2F c',
                ($x + $r - $cp) * $k, ($hp - ($y + $h)) * $k,
                $x * $k, ($hp - ($y + $h - $r + $cp)) * $k,
                $x * $k, ($hp - ($y + $h - $r)) * $k));
            $this->_out(sprintf('%.2F %.2F l', $x * $k, ($hp - ($y + $r)) * $k));
            $this->_out(sprintf('%.2F %.2F %.2F %.2F %.2F %.2F c',
                $x * $k, ($hp - ($y + $r - $cp)) * $k,
                ($x + $r - $cp) * $k, ($hp - $y) * $k,
                ($x + $r) * $k, ($hp - $y) * $k));
            $this->_out($op);
        }

        function Footer() {
            $this->SetY(-13);
            $this->SetFont('Arial', '', 7);
            $this->SetTextColor(138, 147, 140);
            $this->Cell(95, 5, p('Starlim - documento operativo'), 0, 0, 'L');
            $this->Cell(95, 5, 'Pagina ' . $this->PageNo(), 0, 0, 'R');
        }
    }
}

if (!function_exists('starlim_pdf_set_text')) {
    function starlim_pdf_set_text(FPDF $pdf, string $tone = 'body'): void {
        $colors = [
            'body' => [31, 36, 33],
            'muted' => [91, 102, 97],
            'soft' => [138, 147, 140],
            'blue' => [31, 58, 96],
            'white' => [255, 255, 255],
            'danger' => [185, 28, 28],
            'ok' => [0, 122, 92],
        ];
        [$r, $g, $b] = $colors[$tone] ?? $colors['body'];
        $pdf->SetTextColor($r, $g, $b);
    }
}

if (!function_exists('starlim_pdf_draw_logo')) {
    function starlim_pdf_draw_logo(FPDF $pdf, float $x, float $y, float $w): float {
        $logo = starlim_pdf_logo_path();
        if ($logo !== '') {
            [$pxW, $pxH] = getimagesize($logo);
            $h = ($pxH / max(1, $pxW)) * $w;
            $pdf->Image($logo, $x, $y, $w);
            return $h;
        }

        $pdf->SetXY($x, $y);
        $pdf->SetFont('Arial', 'B', 18);
        starlim_pdf_set_text($pdf, 'blue');
        $pdf->Cell($w, 8, 'Starlim', 0, 0, 'L');
        return 9;
    }
}

if (!function_exists('starlim_pdf_section_title')) {
    function starlim_pdf_section_title(FPDF $pdf, string $title, float $x = 15, ?float $y = null): void {
        if ($y !== null) $pdf->SetXY($x, $y);
        else $pdf->SetX($x);
        $pdf->SetFont('Arial', 'B', 8);
        starlim_pdf_set_text($pdf, 'soft');
        $pdf->Cell(0, 5, p(strtoupper($title)), 0, 1, 'L');
        starlim_pdf_set_text($pdf, 'body');
    }
}

if (!function_exists('starlim_pdf_key_value')) {
    function starlim_pdf_key_value(FPDF $pdf, string $label, string $value, float $labelW, float $valueW, float $h = 5): void {
        $pdf->SetFont('Arial', '', 8);
        starlim_pdf_set_text($pdf, 'soft');
        $pdf->Cell($labelW, $h, p($label), 0, 0, 'L');
        $pdf->SetFont('Arial', 'B', 8);
        starlim_pdf_set_text($pdf, 'body');
        $pdf->Cell($valueW, $h, p($value !== '' ? $value : '-'), 0, 0, 'L');
    }
}

if (!function_exists('starlim_pdf_table_header')) {
    function starlim_pdf_table_header(FPDF $pdf, array $headers, array $widths, array $aligns = []): void {
        $pdf->SetFillColor(31, 58, 96);
        $pdf->SetDrawColor(31, 58, 96);
        $pdf->SetLineWidth(0.2);
        $pdf->SetFont('Arial', 'B', 7.5);
        starlim_pdf_set_text($pdf, 'white');
        foreach ($headers as $i => $label) {
            $align = $aligns[$i] ?? 'L';
            $pdf->Cell($widths[$i], 7, p(strtoupper($label)), 1, 0, $align, true);
        }
        $pdf->Ln();
        starlim_pdf_set_text($pdf, 'body');
    }
}

if (!function_exists('starlim_pdf_signature_pair')) {
    function starlim_pdf_signature_pair(FPDF $pdf, string $left, string $right, float $y): void {
        $pdf->SetDrawColor(31, 36, 33);
        $pdf->SetLineWidth(0.2);
        $pdf->Line(15, $y, 86, $y);
        $pdf->Line(124, $y, 195, $y);
        $pdf->SetFont('Arial', '', 8);
        starlim_pdf_set_text($pdf, 'muted');
        $pdf->SetXY(15, $y + 2);
        $pdf->Cell(71, 5, p($left), 0, 0, 'C');
        $pdf->SetXY(124, $y + 2);
        $pdf->Cell(71, 5, p($right), 0, 0, 'C');
        starlim_pdf_set_text($pdf, 'body');
    }
}

if (!function_exists('starlim_pdf_signature_trio')) {
    function starlim_pdf_signature_trio(FPDF $pdf, array $labels, float $y): void {
        $labels = array_values(array_pad($labels, 3, ''));
        $segments = [
            [15, 65, $labels[0]],
            [80, 130, $labels[1]],
            [145, 195, $labels[2]],
        ];

        $pdf->SetDrawColor(31, 36, 33);
        $pdf->SetLineWidth(0.2);
        $pdf->SetFont('Arial', '', 8);
        starlim_pdf_set_text($pdf, 'muted');
        foreach ($segments as [$x1, $x2, $label]) {
            $pdf->Line($x1, $y, $x2, $y);
            $pdf->SetXY($x1, $y + 2);
            $pdf->Cell($x2 - $x1, 5, p($label), 0, 0, 'C');
        }
        starlim_pdf_set_text($pdf, 'body');
    }
}

if (!function_exists('cabecera_comprobante')) {
    function cabecera_comprobante($pdf, $titulo, $letra, $nro, $fecha, $extra = []) {
        $company = starlim_pdf_company();

        $pdf->SetMargins(15, 14, 15);
        $pdf->SetDrawColor(31, 36, 33);
        $pdf->SetLineWidth(0.35);

        $logoH = starlim_pdf_draw_logo($pdf, 15, 14, 42);
        $infoY = 14 + $logoH + 3;
        $pdf->SetXY(15, $infoY);
        $pdf->SetFont('Arial', 'B', 8.5);
        starlim_pdf_set_text($pdf, 'body');
        $pdf->Cell(82, 4.5, p($company['name'] . ' - CUIT ' . $company['cuit']), 0, 1, 'L');
        $pdf->SetX(15);
        $pdf->SetFont('Arial', '', 8);
        starlim_pdf_set_text($pdf, 'muted');
        $pdf->Cell(82, 4, p($company['address']), 0, 1, 'L');
        $pdf->SetX(15);
        $pdf->Cell(82, 4, p($company['phone'] . ' - ' . $company['email']), 0, 1, 'L');

        $boxX = 132;
        $boxY = 14;
        $pdf->RoundedRect($boxX, $boxY, 63, 27, 2, 'D');
        $pdf->SetXY($boxX + 4, $boxY + 4);
        $pdf->SetFont('Arial', 'B', strlen((string)$letra) > 1 ? 14 : 18);
        starlim_pdf_set_text($pdf, 'blue');
        $pdf->Cell(14, 10, p((string)$letra), 0, 0, 'C');

        $title = strtoupper((string)$titulo);
        $titleLen = strlen($title);
        $titleSize = $titleLen > 22 ? 7.7 : ($titleLen > 15 ? 8.8 : ($titleLen > 10 ? 10.5 : 14));
        $pdf->SetXY($boxX + 21, $boxY + 4);
        $pdf->SetFont('Arial', 'B', $titleSize);
        starlim_pdf_set_text($pdf, 'body');
        $pdf->MultiCell(37, $titleLen > 15 ? 4.2 : 6, p($title), 0, 'R');
        $docY = $titleLen > 22 ? $boxY + 17.5 : $boxY + 16;
        if ($docY < $pdf->GetY() + 1) $docY = $pdf->GetY() + 1;

        $pdf->SetXY($boxX + 21, $docY);
        $pdf->SetX($boxX + 21);
        $pdf->SetFont('Arial', '', 8);
        starlim_pdf_set_text($pdf, 'muted');
        $pdf->Cell(37, 5, p('Nro. ' . $nro), 0, 1, 'R');
        $pdf->SetX($boxX + 21);
        $pdf->Cell(37, 5, p('Fecha ' . $fecha), 0, 1, 'R');

        $extraY = 43;
        foreach ($extra as $line) {
            $pdf->SetXY($boxX, $extraY);
            $pdf->SetFont('Arial', '', 8);
            starlim_pdf_set_text($pdf, 'muted');
            $pdf->Cell(63, 4.2, p((string)$line), 0, 1, 'R');
            $extraY += 4.2;
        }

        $lineY = max(56, $pdf->GetY() + 2);
        $pdf->SetDrawColor(31, 36, 33);
        $pdf->SetLineWidth(0.55);
        $pdf->Line(15, $lineY, 195, $lineY);
        $pdf->SetLineWidth(0.2);
        starlim_pdf_set_text($pdf, 'body');

        return $lineY;
    }
}
