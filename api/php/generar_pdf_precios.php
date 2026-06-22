<?php
require_once __DIR__ . '/session_bootstrap.php';
/**
 * generar_pdf_precios.php — PDF de una lista de precios completa, para que el
 * vendedor la descargue y se la mande al cliente.
 *   ?lista=0..5   (0–3 = Lista 0–3, 4 = Lista 4 (+10%), 5 = Minorista)
 *   ?view=1       abre en el navegador (si no, descarga)
 */
starlim_session_start();
require_once __DIR__ . '/auth.php';
if (!isset($_SESSION['usuario']) || !starlim_es_staff(starlim_normalizar_rango($_SESSION['rango'] ?? ''))) {
    header('Location: ../frontend/sign.php'); die();
}

include 'conexion_starlim_be.php';
require_once '../fpdf186/fpdf.php';
$empresaId = starlim_bootstrap_tenant_context($conexion);

$lista = (int)($_GET['lista'] ?? 0);
if ($lista < 0 || $lista > 5) $lista = 0;

// índice de lista → expresión SQL de precio + etiqueta
$cols = [
    0 => ['precio_0',                  'Lista 0'],
    1 => ['precio_1',                  'Lista 1'],
    2 => ['precio_2',                  'Lista 2'],
    3 => ['precio_3',                  'Lista 3'],
    4 => ['ROUND(precio_3 * 1.10, 2)', 'Lista 4 (+10%)'],
    5 => ['precio_minorista',          'Minorista'],
];
[$expr, $etiqueta] = $cols[$lista];

$res = $conexion->query(
    "SELECT nombre, $expr AS precio FROM vista_precios
     WHERE empresa_id = $empresaId AND precio_1 IS NOT NULL AND $expr > 0
     ORDER BY nombre ASC"
);
$prods = [];
while ($row = $res->fetch_assoc()) $prods[] = $row;

function p($s) { return iconv('UTF-8', 'ISO-8859-1//TRANSLIT', $s ?? ''); }
function precio_fmt($v) { return '$' . number_format((float)$v, 2, ',', '.'); }

class PreciosPDF extends FPDF {
    public $etiqueta = '';
    function Header() {
        $logo = __DIR__ . '/../imagenesIndex/logo nuevo starlim-04.png';
        if (file_exists($logo)) {
            [$pw, $ph] = getimagesize($logo);
            $this->Image($logo, 10, 8, 38);
        }
        $this->SetXY(120, 10);
        $this->SetFont('Arial', 'B', 15); $this->SetTextColor(0, 0, 0);
        $this->Cell(80, 7, 'Lista de precios', 0, 2, 'R');
        $this->SetFont('Arial', '', 10); $this->SetTextColor(80, 80, 80);
        $this->Cell(80, 5, p($this->etiqueta), 0, 2, 'R');
        $this->SetFont('Arial', '', 8);
        $this->Cell(80, 5, p('Starlim — ' . date('d/m/Y')), 0, 0, 'R');
        $this->Ln(14);
        // Encabezado de tabla
        $this->SetFont('Arial', 'B', 9); $this->SetTextColor(255, 255, 255); $this->SetFillColor(37, 99, 235);
        $this->Cell(140, 8, p('  Producto'), 0, 0, 'L', true);
        $this->Cell(50, 8, 'Precio  ', 0, 1, 'R', true);
        $this->SetTextColor(0, 0, 0);
    }
    function Footer() {
        $this->SetY(-12);
        $this->SetFont('Arial', 'I', 7); $this->SetTextColor(150, 150, 150);
        $this->Cell(0, 5, p('Página ') . $this->PageNo(), 0, 0, 'C');
    }
}

$pdf = new PreciosPDF('P', 'mm', 'A4');
$pdf->etiqueta = $etiqueta;
$pdf->SetMargins(10, 10, 10);
$pdf->SetAutoPageBreak(true, 16);
$pdf->AddPage();

$pdf->SetFont('Arial', '', 9);
$fill = false;
foreach ($prods as $pr) {
    $pdf->SetFillColor(245, 247, 250);
    $pdf->Cell(140, 7, p('  ' . $pr['nombre']), 0, 0, 'L', $fill);
    $pdf->Cell(50, 7, precio_fmt($pr['precio']) . '  ', 0, 1, 'R', $fill);
    $fill = !$fill;
}
if (empty($prods)) {
    $pdf->SetFont('Arial', 'I', 10); $pdf->SetTextColor(120, 120, 120);
    $pdf->Cell(0, 12, p('No hay productos con precio en esta lista.'), 0, 1, 'C');
}

$nombre_archivo = 'Lista_precios_' . str_replace([' ', '(', ')', '+', '%'], ['_', '', '', '', ''], $etiqueta) . '_' . date('Y-m-d') . '.pdf';
$modo = isset($_GET['view']) ? 'I' : 'D';
$pdf->Output($modo, $nombre_archivo);
