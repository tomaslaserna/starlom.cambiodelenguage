<?php
/**
 * comprobante_pdf_lib.php — Base compartida para comprobantes con el mismo
 * formato visual que el remito/factura (FPDF).
 *
 * require_once __DIR__ . '/comprobante_pdf_lib.php';
 *
 * Provee:
 *   - class ComprobantePDF  (RoundedRect + Footer "Pagina N")
 *   - function p($s)        (UTF-8 -> ISO-8859-1 para FPDF)
 *   - function cabecera_comprobante(...)  (encabezado estándar + línea)
 *
 * Modelado sobre api/php/generar_pdf_remito.php para mantener el mismo look.
 */

if (!class_exists('FPDF')) {
    require_once __DIR__ . '/../fpdf186/fpdf.php';
}

if (!function_exists('p')) {
    /** Codifica UTF-8 -> ISO-8859-1 para que FPDF muestre tildes/ñ. */
    function p($str) {
        return iconv('UTF-8', 'ISO-8859-1//TRANSLIT', $str ?? '');
    }
}

if (!class_exists('ComprobantePDF')) {
    class ComprobantePDF extends FPDF {

        /** Rectángulo de esquinas redondeadas (idéntico al del remito). */
        function RoundedRect($x, $y, $w, $h, $r, $style = '') {
            if ($style == 'F') $op = 'f';
            elseif ($style == 'FD' || $style == 'DF') $op = 'B';
            else $op = 'S';

            $k  = $this->k;
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
            $this->SetY(-12);
            $this->SetFont('Arial', 'I', 7);
            $this->SetTextColor(150, 150, 150);
            $this->Cell(0, 5, 'Pagina ' . $this->PageNo(), 0, 0, 'C');
        }
    }
}

if (!function_exists('cabecera_comprobante')) {
    /**
     * Dibuja el encabezado estándar (logo + empresa a la izquierda, recuadro
     * central con letra grande + título, bloque derecho con Nro/CUIT/Fecha y
     * líneas extra) más la línea separadora.
     *
     * @param ComprobantePDF $pdf
     * @param string $titulo  Ej. 'SOLICITUD DE PEDIDO'
     * @param string $letra   Letra grande del recuadro central, ej. 'P'
     * @param string $nro     Número ya formateado
     * @param string $fecha   Fecha ya formateada dd/mm/Y
     * @param array  $extra   Líneas extra del bloque derecho (strings UTF-8)
     * @return float          Y donde puede empezar el contenido
     */
    function cabecera_comprobante($pdf, $titulo, $letra, $nro, $fecha, $extra = []) {
        // — Izquierda: logo + empresa —
        // El logo vive en imagenesIndex/ (raíz del repo). Según el entorno
        // (local vs. bundle de Vercel) puede resolver desde api/ o desde la
        // raíz, así que probamos ambas rutas y usamos la primera que exista.
        $logo = '';
        foreach ([
            __DIR__ . '/../../imagenesIndex/logo nuevo starlim-04.png',
            __DIR__ . '/../imagenesIndex/logo nuevo starlim-04.png',
        ] as $cand) {
            if (file_exists($cand)) { $logo = $cand; break; }
        }
        if ($logo !== '') {
            $logo_w_mm = 45;
            [$px_w, $px_h] = getimagesize($logo);
            $logo_h_mm = ($px_h / $px_w) * $logo_w_mm;
            $pdf->Image($logo, 10, 10, $logo_w_mm);
            $y_empresa = 10 + $logo_h_mm + 2;
        } else {
            $pdf->SetXY(10, 10);
            $pdf->SetFont('Arial', 'B', 16);
            $pdf->SetTextColor(0, 80, 180);
            $pdf->Cell(70, 8, 'star lim', 0, 1, 'L');
            $y_empresa = 18;
        }

        $pdf->SetXY(10, $y_empresa);
        $pdf->SetFont('Arial', 'B', 9);
        $pdf->SetTextColor(0, 0, 0);
        $pdf->Cell(70, 5, 'De Starlimm S.A.S.', 0, 1, 'L');
        $pdf->SetX(10);
        $pdf->SetFont('Arial', '', 8);
        $pdf->SetTextColor(60, 60, 60);
        $pdf->Cell(70, 4, 'starlimmsas@gmail.com', 0, 1, 'L');
        $pdf->SetX(10);
        $pdf->Cell(70, 4, '+54 9 351 373-7820', 0, 1, 'L');
        $y_left = $pdf->GetY();

        // — Centro: recuadro con letra + título —
        $pdf->SetXY(83, 10);
        $pdf->SetFont('Arial', 'B', 18);
        $pdf->SetTextColor(0, 0, 0);
        $pdf->Cell(44, 22, $letra, 1, 0, 'C');

        $pdf->SetXY(83, 33);
        $pdf->SetFont('Arial', 'B', 8);
        $pdf->Cell(44, 6, p($titulo), 0, 0, 'C');

        // — Derecha: datos del comprobante —
        $pdf->SetXY(133, 10);
        $pdf->SetFont('Arial', 'B', 12);
        $pdf->SetTextColor(0, 0, 0);
        $pdf->Cell(67, 6, 'Star Lim', 0, 1, 'R');

        $pdf->SetX(133);
        $pdf->SetFont('Arial', 'B', 10);
        $pdf->Cell(67, 6, 'Nro: ' . $nro, 0, 1, 'R');

        $pdf->SetX(133);
        $pdf->SetFont('Arial', '', 8);
        $pdf->Cell(67, 4, 'CUIT: 20-46656757-5', 0, 1, 'R');

        $pdf->SetX(133);
        $pdf->SetFont('Arial', 'B', 8);
        $pdf->Cell(67, 4, 'Fecha: ' . $fecha, 0, 1, 'R');

        $pdf->SetFont('Arial', '', 8);
        foreach ($extra as $linea) {
            $pdf->SetX(133);
            $pdf->Cell(67, 4, p($linea), 0, 1, 'R');
        }
        $y_right = $pdf->GetY();

        // — Línea separadora —
        $y_linea = max($y_left, $y_right, 39) + 2;
        $pdf->SetDrawColor(0, 0, 0);
        $pdf->SetLineWidth(0.5);
        $pdf->Line(10, $y_linea, 200, $y_linea);
        $pdf->SetLineWidth(0.2);

        return $y_linea;
    }
}
