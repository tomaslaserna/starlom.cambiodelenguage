<?php
session_start();

if (!isset($_SESSION['usuario'])) {
    header('Location: ../frontend/sign.php');
    die();
}

include 'conexion_starlim_be.php';
require_once '../fpdf186/fpdf.php';

$id_remito = intval($_GET['id_remito'] ?? 0);
if (!$id_remito) die("Error: ID de remito inválido.");

$res = $conexion->query("SELECT r.*, CONCAT(v.nombre, ' ', v.apellido) AS nombre_operador
     FROM remitos r
     LEFT JOIN operadores v ON v.id = r.id_operador
     WHERE r.id = $id_remito"
);
$remito = $res->fetch_assoc();
if (!$remito) die("Error: Remito no encontrado.");

$detalle_res = $conexion->query("SELECT d.id_producto AS codigo,
            COALESCE(d.nombre_producto, p.nombre, '(producto eliminado)') AS nombre,
            d.cantidad,
            d.precio_unit,
            COALESCE(d.descuento, 0) AS descuento,
            d.subtotal
     FROM detalle_remitos d
     LEFT JOIN productos p ON p.id = d.id_producto
     WHERE d.id_remito = $id_remito
     ORDER BY d.id ASC"
);

// Buscar cliente por dni
$dni_val = $remito['dni_cliente'];
$cli_stmt = $conexion->prepare("SELECT * FROM clientes WHERE REPLACE(REPLACE(nro_id, '-', ''), ' ', '') = ? LIMIT 1");
$cli_stmt->bind_param('s', $dni_val);
$cli_stmt->execute();
$cliente = $cli_stmt->get_result()->fetch_assoc() ?: [];

// ── Encoding UTF-8 → ISO-8859-1 para FPDF ─────────────
function p($str) {
    return iconv('UTF-8', 'ISO-8859-1//TRANSLIT', $str ?? '');
}

// ── Clase PDF ──────────────────────────────────────────
class RemitoPDF extends FPDF {

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

$pdf = new RemitoPDF('P', 'mm', 'A4');
$pdf->AddPage();
$pdf->SetMargins(10, 10, 10);
$pdf->SetAutoPageBreak(true, 20);
$pdf->SetDrawColor(0, 0, 0);
$pdf->SetLineWidth(0.2);

// ════════════════════════════════════════════════════
// ENCABEZADO
// ════════════════════════════════════════════════════

// — Izquierda: logo + empresa —
$logo = __DIR__ . '/../imagenesIndex/logo nuevo starlim-04.png';
if (file_exists($logo)) {
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

// — Centro: etiqueta REMITO —
$pdf->SetXY(83, 10);
$pdf->SetFont('Arial', 'B', 18);
$pdf->SetTextColor(0, 0, 0);
$pdf->Cell(44, 22, 'R', 1, 0, 'C');

$pdf->SetXY(83, 33);
$pdf->SetFont('Arial', 'B', 10);
$pdf->Cell(44, 6, 'REMITO', 0, 0, 'C');

// — Derecha: datos del comprobante —
$pdf->SetXY(133, 10);
$pdf->SetFont('Arial', 'B', 12);
$pdf->SetTextColor(0, 0, 0);
$pdf->Cell(67, 6, 'Star Lim', 0, 1, 'R');

$pdf->SetX(133);
$pdf->SetFont('Arial', 'B', 10);
$pdf->Cell(67, 6, 'Nro: ' . str_pad($remito['nro_remito'], 8, '0', STR_PAD_LEFT), 0, 1, 'R');

$pdf->SetX(133);
$pdf->SetFont('Arial', '', 8);
$pdf->Cell(67, 4, 'CUIT: 20-46656757-5', 0, 1, 'R');
$pdf->SetX(133);
$pdf->SetFont('Arial', 'B', 8);
$pdf->Cell(67, 4, 'Fecha: ' . date('d/m/Y', strtotime($remito['fecha'])), 0, 1, 'R');
$pdf->SetX(133);
$pdf->SetFont('Arial', '', 8);
if ($remito['deposito']) {
    $pdf->Cell(67, 4, p('Deposito: ' . $remito['deposito']), 0, 1, 'R');
}
$y_right = $pdf->GetY();

// Línea separadora
$y_linea = max($y_left, $y_right, 39) + 2;
$pdf->SetDrawColor(0, 0, 0);
$pdf->SetLineWidth(0.5);
$pdf->Line(10, $y_linea, 200, $y_linea);
$pdf->SetDrawColor(0, 0, 0);
$pdf->SetLineWidth(0.2);

// ════════════════════════════════════════════════════
// SECCIÓN CLIENTE
// ════════════════════════════════════════════════════
$y0 = $y_linea + 3;

$localidad = trim(($cliente['ciudad'] ?? '') . ', ' . ($cliente['provincia'] ?? ''), ', ');
$domicilio = $cliente['domicilio'] ?? '-';

$izq = [
    ['Cliente:',           p($remito['nombre_cliente'] ?: ($cliente['nombre_cliente'] ?? '-'))],
    ['DNI/CUIT:',          p(($cliente['tipo_id'] ?? '') . ': ' . ($cliente['nro_id'] ?? $remito['dni_cliente']))],
    ['Direccion entrega:', p($domicilio)],
    ['Localidad:',         p($localidad ?: '-')],
];
if ($remito['sucursal_cliente']) {
    $izq[] = ['Sucursal:', p($remito['sucursal_cliente'])];
}

$der = [
    ['Cond. Vta.:',  p($remito['condicion_pago'] ?: '-')],
    ['Vendedor:',   p($remito['vendedor'] ?: ($cliente['vendedor_cl'] ?? '-'))],
    ['Provincia:',   p($remito['provincia'] ?: '-')],
];

$y_izq = $y0;
foreach ($izq as [$lbl, $val]) {
    $pdf->SetXY(10, $y_izq);
    $pdf->SetFont('Arial', '', 8);
    $pdf->SetTextColor(80, 80, 80);
    $pdf->Cell(30, 5, $lbl, 0, 0, 'L');
    $pdf->SetFont('Arial', 'B', 8);
    $pdf->SetTextColor(0, 0, 0);
    $pdf->Cell(63, 5, $val, 0, 0, 'L');
    $y_izq += 5;
}

$y_der = $y0;
foreach ($der as [$lbl, $val]) {
    $pdf->SetXY(107, $y_der);
    $pdf->SetFont('Arial', '', 8);
    $pdf->SetTextColor(80, 80, 80);
    $pdf->Cell(28, 5, $lbl, 0, 0, 'L');
    $pdf->SetFont('Arial', 'B', 8);
    $pdf->SetTextColor(0, 0, 0);
    $pdf->Cell(65, 5, $val, 0, 0, 'L');
    $y_der += 5;
}

$y_tabla = max($y_izq, $y_der) + 4;

$pdf->SetDrawColor(180, 180, 180);
$pdf->Line(10, $y_tabla - 2, 200, $y_tabla - 2);
$pdf->SetDrawColor(0, 0, 0);

// ════════════════════════════════════════════════════
// TABLA DE PRODUCTOS
// ════════════════════════════════════════════════════
$cw = [15, 130, 45];
$ch = 7;

$pdf->SetXY(10, $y_tabla);
$pdf->SetFont('Arial', 'B', 9);
$pdf->SetTextColor(0, 0, 0);

$pdf->Cell($cw[0], $ch, 'Codigo',    1, 0, 'C');
$pdf->Cell($cw[1], $ch, 'Productos', 1, 0, 'C');
$pdf->Cell($cw[2], $ch, 'Cantidad',  1, 1, 'C');

$pdf->SetFont('Arial', '', 9);
while ($det = $detalle_res->fetch_assoc()) {
    $nombre  = p($det['nombre']);
    $n_lines = max(1, ceil($pdf->GetStringWidth($nombre) / ($cw[1] - 2)));
    $row_h   = $n_lines * $ch;

    if ($pdf->GetY() + $row_h > $pdf->GetPageHeight() - 25) {
        $pdf->AddPage();
    }

    $x = 10;
    $y = $pdf->GetY();

    $pdf->SetXY($x, $y);
    $pdf->Cell($cw[0], $row_h, $det['codigo'], 0, 0, 'C');
    $x += $cw[0];

    $pdf->SetXY($x, $y);
    $pdf->MultiCell($cw[1], $ch, $nombre, 0, 'L');
    $x += $cw[1];

    $pdf->SetXY($x, $y);
    $pdf->Cell($cw[2], $row_h, $det['cantidad'], 0, 0, 'C');

    $pdf->SetXY(10, $y + $row_h);
}

// ════════════════════════════════════════════════════
// OBSERVACIONES (ancho completo)
// ════════════════════════════════════════════════════
$y_tot = max($pdf->GetY() + 8, 185);
$alto_bloque = 28;

$pdf->SetDrawColor(0, 0, 0);
$pdf->SetLineWidth(0.3);
$pdf->RoundedRect(10, $y_tot, 190, $alto_bloque, 3);

$pdf->SetFont('Arial', 'B', 8);
$pdf->SetTextColor(0, 0, 0);
$pdf->SetXY(10, $y_tot + 1);
$pdf->Cell(190, 6, 'OBSERVACIONES', 0, 1, 'C');
$pdf->Line(10, $y_tot + 7, 200, $y_tot + 7);

$pdf->SetFont('Arial', '', 8);
$obs = p($remito['observacion'] ?: ($cliente['observacion'] ?? ''));
$pdf->SetXY(11, $y_tot + 8);
$pdf->MultiCell(188, 5, $obs, 0, 'L');

// Firma de recepción
$y_firma = $y_tot + $alto_bloque + 12;
$pdf->SetDrawColor(180, 180, 180);
$pdf->SetLineWidth(0.3);
$pdf->Line(10,  $y_firma, 90,  $y_firma);
$pdf->Line(120, $y_firma, 200, $y_firma);
$pdf->SetFont('Arial', '', 7);
$pdf->SetTextColor(100, 100, 100);
$pdf->SetXY(10, $y_firma + 1);
$pdf->Cell(80, 4, 'Firma y aclaracion receptor', 0, 0, 'C');
$pdf->SetXY(120, $y_firma + 1);
$pdf->Cell(80, 4, 'Fecha de recepcion', 0, 0, 'C');

// ── Output ─────────────────────────────────────────────
$nombre_archivo = 'Remito_' . str_pad($remito['nro_remito'], 8, '0', STR_PAD_LEFT) . '.pdf';
$modo = isset($_GET['view']) ? 'I' : 'D';
$pdf->Output($modo, $nombre_archivo);
