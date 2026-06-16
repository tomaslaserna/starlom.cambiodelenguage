<?php
session_start();

if (!isset($_SESSION['usuario'])) {
    header('Location: ../frontend/sign.php');
    die();
}

include 'conexion_starlim_be.php';
require_once '../fpdf186/fpdf.php';

$id_venta = intval($_GET['id_venta'] ?? 0);
if (!$id_venta) die("Error: ID de venta inválido.");

$res = $conexion->query("SELECT v.*, CONCAT(ven.nombre, ' ', ven.apellido) AS nombre_vendedor,
            r.observacion AS obs_form
     FROM ventas v
     LEFT JOIN operadores ven ON ven.id = v.id_operador
     LEFT JOIN remitos r ON r.id_venta = v.id
     WHERE v.id = $id_venta
     LIMIT 1"
);
$venta = $res->fetch_assoc();
if (!$venta) die("Error: Venta no encontrada.");

$detalle_res = $conexion->query("SELECT d.id_producto AS codigo,
            COALESCE(d.nombre_producto, p.nombre, '(producto eliminado)') AS nombre,
            d.cantidad,
            d.precio_unit,
            COALESCE(d.descuento, 0) AS descuento,
            d.subtotal
     FROM detalle_ventas d
     LEFT JOIN productos p ON p.id = d.id_producto
     WHERE d.id_venta = $id_venta
     ORDER BY d.id ASC"
);

// Buscar cliente por nro_id (comparando sin guiones)
$dni_val = $venta['dni_cliente'];
$cli_stmt = $conexion->prepare("SELECT * FROM clientes WHERE REPLACE(REPLACE(nro_id, '-', ''), ' ', '') = ? LIMIT 1");
$cli_stmt->bind_param('s', $dni_val);
$cli_stmt->execute();
$cliente = $cli_stmt->get_result()->fetch_assoc() ?: [];

// ── Número a letras ────────────────────────────────────
function _n2l($n) {
    $un = ['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve',
           'diez','once','doce','trece','catorce','quince',
           'dieciseis','diecisiete','dieciocho','diecinueve'];
    $de = ['','diez','veinte','treinta','cuarenta','cincuenta',
           'sesenta','setenta','ochenta','noventa'];
    $ce = ['','ciento','doscientos','trescientos','cuatrocientos','quinientos',
           'seiscientos','setecientos','ochocientos','novecientos'];
    $n = intval($n);
    if ($n === 0)    return 'cero';
    if ($n < 20)     return $un[$n];
    if ($n < 100)    { $d=$n/10|0; $u=$n%10; return $u?$de[$d].' y '.$un[$u]:$de[$d]; }
    if ($n < 1000)   { $c=$n/100|0; $r=$n%100; return $n===100?'cien':($r?$ce[$c].' '._n2l($r):$ce[$c]); }
    if ($n < 1000000){ $m=$n/1000|0; $r=$n%1000; $s=$m===1?'mil':_n2l($m).' mil'; return $r?$s.' '._n2l($r):$s; }
    if ($n < 1000000000){ $m=$n/1000000|0; $r=$n%1000000; $s=$m===1?'un millon':_n2l($m).' millones'; return $r?$s.' '._n2l($r):$s; }
    return number_format($n, 0, ',', '.');
}
function montoEnLetras($monto) {
    $e = intval($monto);
    $c = intval(round(($monto - $e) * 100));
    $t = 'Son PESOS: ' . strtoupper(_n2l($e));
    return $c > 0 ? $t . ' CON ' . strtoupper(_n2l($c)) : $t;
}

// ── Encoding UTF-8 → ISO-8859-1 para FPDF ─────────────
function p($str) {
    return iconv('UTF-8', 'ISO-8859-1//TRANSLIT', $str ?? '');
}

// ── Clase PDF ──────────────────────────────────────────
class FacturaPDF extends FPDF {

    function RoundedRect($x, $y, $w, $h, $r, $style = '') {
    if ($style == 'F') $op = 'f';
    elseif ($style == 'FD' || $style == 'DF') $op = 'B';
    else $op = 'S';

    $k = $this->k;
    $hp = $this->h;
    $cp = 0.4477 * $r; // constante de aproximación bezier para círculo

    $this->_out(sprintf('%.2F %.2F m', ($x + $r) * $k, ($hp - $y) * $k));
    $this->_out(sprintf('%.2F %.2F l', ($x + $w - $r) * $k, ($hp - $y) * $k));
    // esquina superior derecha
    $this->_out(sprintf('%.2F %.2F %.2F %.2F %.2F %.2F c',
        ($x + $w - $r + $cp) * $k, ($hp - $y) * $k,
        ($x + $w) * $k, ($hp - ($y + $r - $cp)) * $k,
        ($x + $w) * $k, ($hp - ($y + $r)) * $k));
    $this->_out(sprintf('%.2F %.2F l', ($x + $w) * $k, ($hp - ($y + $h - $r)) * $k));
    // esquina inferior derecha
    $this->_out(sprintf('%.2F %.2F %.2F %.2F %.2F %.2F c',
        ($x + $w) * $k, ($hp - ($y + $h - $r + $cp)) * $k,
        ($x + $w - $r + $cp) * $k, ($hp - ($y + $h)) * $k,
        ($x + $w - $r) * $k, ($hp - ($y + $h)) * $k));
    $this->_out(sprintf('%.2F %.2F l', ($x + $r) * $k, ($hp - ($y + $h)) * $k));
    // esquina inferior izquierda
    $this->_out(sprintf('%.2F %.2F %.2F %.2F %.2F %.2F c',
        ($x + $r - $cp) * $k, ($hp - ($y + $h)) * $k,
        $x * $k, ($hp - ($y + $h - $r + $cp)) * $k,
        $x * $k, ($hp - ($y + $h - $r)) * $k));
    $this->_out(sprintf('%.2F %.2F l', $x * $k, ($hp - ($y + $r)) * $k));
    // esquina superior izquierda
    $this->_out(sprintf('%.2F %.2F %.2F %.2F %.2F %.2F c',
        $x * $k, ($hp - ($y + $r - $cp)) * $k,
        ($x + $r - $cp) * $k, ($hp - $y) * $k,
        ($x + $r) * $k, ($hp - $y) * $k));
    $this->_out($op);
}

    /*function _Arc($x1, $y1, $r, $a1, $a2) {
        $k = $this->k; $hp = $this->h;
        $MyArc = 4/3 * (sqrt(2) - 1);
        if ($a2 < $a1) $a2 += 360;
        $a1 = deg2rad($a1); $a2 = deg2rad($a2);
        $da = $a2 - $a1;
        $n = ceil($da / (M_PI/2));
        $da /= $n;
        $myArc = 4/3*tan($da/4);
        for ($i = 0; $i < $n; $i++) {
            $a = $a1 + $i*$da;
            $dx = cos($a); $dy = sin($a);
            $x = $x1 + $r*$dx; $y = $y1 - $r*$dy;
            $dx2 = cos($a+$da); $dy2 = sin($a+$da);
            $x2 = $x1 + $r*$dx2; $y2 = $y1 - $r*$dy2;
            $this->_out(sprintf('%.2F %.2F %.2F %.2F %.2F %.2F c',
                ($x-$myArc*$dy)*$k, ($hp-($y-$myArc*$dx))*$k,
                ($x2+$myArc*$dy2)*$k, ($hp-($y2+$myArc*$dx2))*$k,
                $x2*$k, ($hp-$y2)*$k));
        }
    }*/

    function Footer() {
        $this->SetY(-12);
        $this->SetFont('Arial', 'I', 7);
        $this->SetTextColor(150, 150, 150);
        $this->Cell(0, 5, 'Pagina ' . $this->PageNo(), 0, 0, 'C');
    }
}

$pdf = new FacturaPDF('P', 'mm', 'A4');
$pdf->AddPage();
$pdf->SetMargins(10, 10, 10);
$pdf->SetAutoPageBreak(true, 20);
$pdf->SetDrawColor(0, 0, 0);
$pdf->SetLineWidth(0.2);

$tipo_cbte  = intval($venta['tipo_cbte'] ?? 6);
// Letra/sigla que aparece dentro del cuadrado del comprobante
$_letra_map  = [1=>'A', 2=>'ND', 3=>'NC', 6=>'B', 7=>'ND', 8=>'NC'];
// Clase fiscal (A/B) usada sólo para el nombre del archivo PDF
$_clase_map  = [1=>'A', 2=>'A',  3=>'A',  6=>'B', 7=>'B',  8=>'B' ];
$_nom_map    = [
    1 => 'Factura A',       6 => 'Factura B',
    2 => 'Nota de Débito',  7 => 'Nota de Débito',
    3 => 'Nota de Crédito', 8 => 'Nota de Crédito',
];
$letra    = $_letra_map[$tipo_cbte] ?? 'B';
$clase    = $_clase_map[$tipo_cbte] ?? 'B';   // para el nombre del archivo
$nom_cbte = $_nom_map[$tipo_cbte]   ?? 'Comprobante';
$es_a     = in_array($tipo_cbte, [1, 2, 3]);

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
$y_left = $pdf->GetY(); // bottom de la columna izquierda

// — Centro: cuadrado con sigla del comprobante (30×30 mm, centrado en franja de 44 mm) —
$caja_w  = 30;
$caja_h  = 30;
$caja_x  = 83 + (44 - $caja_w) / 2;   // centrado horizontalmente: 90
$caja_y  = 10;
$font_sz = strlen($letra) === 1 ? 28 : 18;   // A/B → 28, NC/ND → 18

$pdf->SetXY($caja_x, $caja_y);
$pdf->SetFont('Arial', 'B', $font_sz);
$pdf->SetTextColor(0, 0, 0);
$pdf->Cell($caja_w, $caja_h, $letra, 1, 0, 'C');

$pdf->SetXY(83, $caja_y + $caja_h + 2);
$pdf->SetFont('Arial', 'B', 10);
$pdf->Cell(44, 6, $nom_cbte, 0, 0, 'C');

// — Derecha: datos del comprobante —
$pdf->SetXY(133, 10);
$pdf->SetFont('Arial', 'B', 12);
$pdf->SetTextColor(0, 0, 0);
$pdf->Cell(67, 6, 'Star Lim', 0, 1, 'R');

$pdf->SetX(133);
$pdf->SetFont('Arial', 'B', 10);
$pdf->SetTextColor(0, 0, 0);
$pdf->Cell(67, 6, 'Nro: ' . str_pad($venta['nro_comprobante'], 8, '0', STR_PAD_LEFT), 0, 1, 'R');

$pdf->SetX(133);
$pdf->SetFont('Arial', '', 8);
$pdf->SetTextColor(0, 0, 0);
$pdf->Cell(67, 4, 'CUIT: 20-46656757-5', 0, 1, 'R');
$pdf->SetX(133);
$pdf->Cell(67, 4, 'Punto de venta: 0001', 0, 1, 'R');
$pdf->SetX(133);
$pdf->SetFont('Arial', 'B', 8);
$pdf->Cell(67, 4, 'Fecha: ' . date('d/m/Y', strtotime($venta['fecha'])), 0, 1, 'R');
$pdf->SetX(133);
$pdf->SetFont('Arial', '', 8);
$pdf->Cell(67, 4, 'Inic. Activ.:  dd/mm/aaaa', 0, 1, 'R');
$pdf->SetX(133);
$pdf->SetFont('Arial', 'B', 8);
$pdf->Cell(67, 4, 'RESPONSABLE INSCRIPTO', 0, 1, 'R');
$y_right = $pdf->GetY(); // bottom de la columna derecha

// Línea azul separadora — siempre debajo de la columna más alta
$y_linea = max($y_left, $y_right, 39) + 2;
$pdf->SetDrawColor(0, 0, 0);
$pdf->SetLineWidth(0.5);
$pdf->Line(10, $y_linea, 200, $y_linea);
$pdf->SetDrawColor(0, 0, 0);
$pdf->SetLineWidth(0.2);

// ════════════════════════════════════════════════════
// SECCIÓN CLIENTE (dos columnas)
// ════════════════════════════════════════════════════
$y0 = $y_linea + 3;

$localidad = trim(($cliente['ciudad'] ?? '') . ', ' . ($cliente['provincia'] ?? ''), ', ');
$domicilio = $cliente['domicilio'] ?? '-';

$izq = [
    ['DNI/CUIT:',          p(($cliente['tipo_id'] ?? '') . ': ' . ($cliente['nro_id'] ?? $venta['dni_cliente']))],
    ['Razon Social:',      p($cliente['nombre_cliente'] ?? '-')],
    ['Cliente:',           p($venta['nombre_cliente'] ?: '-')],
    ['Direccion entrega:', p($domicilio)],
    ['Localidad:',         p($localidad ?: '-')],
];

$der = [
    ['I.V.A.:',      p($cliente['cond_iva'] ?? ($es_a ? 'RESPONSABLE INSCRIPTO' : 'CONSUMIDOR FINAL'))],
    ['Ing. Brutos:', '-'],
    ['Cond. Vta.:',  p($venta['condicion_pago'] ?: '-')],
    ['Vendedor:',   p($venta['vendedor'] ?: ($cliente['vendedor_cl'] ?? ''))],
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

// Línea separadora
$pdf->SetDrawColor(180, 180, 180);
$pdf->Line(10, $y_tabla - 2, 200, $y_tabla - 2);
$pdf->SetDrawColor(0, 0, 0);

// ════════════════════════════════════════════════════
// TABLA DE PRODUCTOS
// ════════════════════════════════════════════════════
// col: Codigo | Productos | Cant. | Precio | Desc. | Subtotal  (total = 190mm)
$cw = [14, 76, 14, 38, 13, 35];
$ch = 7;

$pdf->SetXY(10, $y_tabla);
$pdf->SetFont('Arial', 'B', 9);
$pdf->SetTextColor(0, 0, 0);

$pdf->Cell($cw[0], $ch, 'Codigo',       1, 0, 'C');
$pdf->Cell($cw[1], $ch, 'Productos',    1, 0, 'C');
$pdf->Cell($cw[2], $ch, 'Cant.',        1, 0, 'C');
$pdf->Cell($cw[3], $ch, 'Precio UNIT.', 1, 0, 'C');
$pdf->Cell($cw[4], $ch, 'Desc.',        1, 0, 'C');
$pdf->Cell($cw[5], $ch, 'Subtotal',     1, 1, 'C');

$pdf->SetFont('Arial', '', 9);
while ($det = $detalle_res->fetch_assoc()) {
    $bruto    = floatval($det['precio_unit']) * intval($det['cantidad']);
    $desc_pct = $bruto > 0 ? round((1 - floatval($det['subtotal']) / $bruto) * 100, 1) : 0;
    $desc_str = $desc_pct > 0 ? number_format($desc_pct, 1, '.', '') . '%' : '-';
    $nombre   = p($det['nombre']);

    // Calcular alto de fila según cuántas líneas ocupa el nombre
    $n_lines = max(1, ceil($pdf->GetStringWidth($nombre) / ($cw[1] - 2)));
    $row_h   = $n_lines * $ch;

    // Salto de página si no entra la fila completa
    if ($pdf->GetY() + $row_h > $pdf->GetPageHeight() - 25) {
        $pdf->AddPage();
    }

    $x = 10;
    $y = $pdf->GetY();

    $pdf->SetXY($x, $y);
    $pdf->Cell($cw[0], $row_h, $det['codigo'], 0, 0, 'C');
    $x += $cw[0];

    // MultiCell para el nombre: envuelve automáticamente si es largo
    $pdf->SetXY($x, $y);
    $pdf->MultiCell($cw[1], $ch, $nombre, 0, 'L');
    $x += $cw[1];

    $pdf->SetXY($x, $y);
    $pdf->Cell($cw[2], $row_h, $det['cantidad'], 0, 0, 'C');
    $x += $cw[2];

    $pdf->SetXY($x, $y);
    $pdf->Cell($cw[3], $row_h, '$'.number_format($det['precio_unit'], 2, ',', '.'), 0, 0, 'R');
    $x += $cw[3];

    $pdf->SetXY($x, $y);
    $pdf->Cell($cw[4], $row_h, $desc_str, 0, 0, 'C');
    $x += $cw[4];

    $pdf->SetXY($x, $y);
    $pdf->Cell($cw[5], $row_h, '$'.number_format($det['subtotal'], 2, ',', '.'), 0, 0, 'R');

    // Avanzar al próximo renglón
    $pdf->SetXY(10, $y + $row_h);
}


// ════════════════════════════════════════════════════
// OBSERVACIONES + TOTALES
// ════════════════════════════════════════════════════
$monto_neto = floatval($venta['monto_neto']);
$monto_iva  = floatval($venta['monto_iva']);
$monto_tot  = floatval($venta['monto']);

// Calcular descuento total comparando suma bruta de líneas con el neto guardado
$suma_bruta = 0;
$detalle_desc_res = $conexion->query("SELECT d.cantidad, d.precio_unit FROM detalle_ventas d WHERE d.id_venta = $id_venta"
);
while ($dd = $detalle_desc_res->fetch_assoc()) {
    $suma_bruta += floatval($dd['precio_unit']) * intval($dd['cantidad']);
}
$monto_descuento = round($suma_bruta - $monto_neto, 2);

// Altura total del pie: rect(36) + letras(~9) + padding + QR(30) + margen
$FOOTER_HEIGHT = 85;
$y_candidate   = max($pdf->GetY() + 8, 185);
if ($y_candidate + $FOOTER_HEIGHT > 277) {   // 297mm - 20mm margen inferior
    $pdf->AddPage();
    $y_candidate = $pdf->GetY() + 5;
}
$pdf->SetAutoPageBreak(false); // evitar que FPDF corte el bloque de pie
$y_tot = $y_candidate;

// Altura fija del bloque completo
$alto_bloque = 36; // ajustá si el texto de observaciones es largo

// ── Rectángulo exterior redondeado (todo el bloque) ──
$pdf->SetDrawColor(0, 0, 0);
$pdf->SetLineWidth(0.3);
$pdf->RoundedRect(10, $y_tot, 190, $alto_bloque, 3);

// ── Línea vertical divisoria entre obs y totales ──
$pdf->Line(105, $y_tot, 105, $y_tot + $alto_bloque);

// ── Título OBSERVACIONES (sin borde, centrado) ──
$pdf->SetFont('Arial', 'B', 8);
$pdf->SetTextColor(0, 0, 0);
$pdf->SetXY(10, $y_tot + 1);
$pdf->Cell(93, 6, 'OBSERVACIONES', 0, 1, 'C');

// Línea horizontal debajo del título de observaciones
$pdf->Line(10, $y_tot + 7, 105, $y_tot + 7);

// ── Texto observaciones ──
$pdf->SetX(10);
$pdf->SetFont('Arial', '', 8);
$obs = p($venta['obs_form'] ?? $cliente['observacion'] ?? '');
$pdf->SetXY(11, $y_tot + 8);
$pdf->MultiCell(92, 5, $obs, 0, 'L');

// ── Totales (columna derecha) ──
$xl = 105;
$wl = 55;
$wv = 40;
$yt = $y_tot + 2;

$filas = [
    ['Neto gravado:',  '$' . number_format($suma_bruta,      2, ',', '.')],
    ['Descuento:',     '-$'. number_format($monto_descuento, 2, ',', '.')],
    ['Subtotal neto:', '$' . number_format($monto_neto,      2, ',', '.')],
    ['IVA 21%:',       '$' . number_format($monto_iva,       2, ',', '.')],
];

$pdf->SetFont('Arial', '', 9);
$pdf->SetTextColor(0, 0, 0);
foreach ($filas as [$lbl, $val]) {
    $pdf->SetXY($xl, $yt);
    $pdf->Cell($wl, 6, $lbl, 0, 0, 'R');
    $pdf->Cell($wv, 6, $val, 0, 0, 'R');
    $yt += 6;
}

// Línea horizontal antes del TOTAL
$pdf->Line(105, $yt, 200, $yt);

// ── TOTAL final ──
$pdf->SetXY($xl, $yt + 1);
$pdf->SetFont('Arial', 'B', 11);
$pdf->SetTextColor(0, 0, 0);
$pdf->Cell($wl, 7, 'TOTAL:', 0, 0, 'R');
$pdf->Cell($wv, 7, '$' . number_format($monto_tot, 2, ',', '.'), 0, 0, 'R');

// ════════════════════════════════════════════════════
// TOTAL EN LETRAS
// ════════════════════════════════════════════════════
$y_letras = max($pdf->GetY() + 4, $yt + 12);
$pdf->SetXY(10, $y_letras);
$pdf->SetFont('Arial', 'I', 8);
$pdf->SetTextColor(60, 60, 60);
$pdf->Cell(190, 5, p(montoEnLetras($monto_tot)), 0, 1, 'R');

// ════════════════════════════════════════════════════
// QR AFIP + CAE
// ════════════════════════════════════════════════════
$y_cae = $pdf->GetY() + 4;

// Determinar tipo de documento del receptor según el cliente
$mapaTipoDoc = ['CUIT' => 80, 'CUIL' => 86, 'CDI' => 87, 'LE' => 89, 'LC' => 90, 'CI' => 91, 'Pasaporte' => 94, 'DNI' => 96];
$tipo_doc_rec = $mapaTipoDoc[$cliente['tipo_id'] ?? ''] ?? 96;
if ($venta['dni_cliente'] === '0') $tipo_doc_rec = 99; // Consumidor final

// Estructura JSON que exige AFIP (RG 4291/2018)
$qrData = [
    'ver'        => 1,
    'fecha'      => date('Y-m-d', strtotime($venta['fecha'])),
    'cuit'       => 20466567575,
    'ptoVta'     => 1,
    'tipoCmp'    => intval($venta['tipo_cbte']),
    'nroCmp'     => intval($venta['nro_comprobante']),
    'importe'    => round(floatval($venta['monto']), 2),
    'moneda'     => 'PES',
    'ctz'        => 1,
    'tipoDocRec' => $tipo_doc_rec,
    'nroDocRec'  => intval($venta['dni_cliente']),
    'tipoCodAut' => 'E',
    'codAut'     => intval($venta['cae']),
];
$qrContenido = 'https://www.afip.gob.ar/fe/qr/?p=' . base64_encode(json_encode($qrData));

$tmpQr = tempnam(sys_get_temp_dir(), 'qr_') . '.png';
$qrOk  = false;

// ── Generar QR con phpqrcode (requiere extensión GD) ────
$phpqrcode = __DIR__ . '/../phpqrcode/phpqrcode.php';
if (file_exists($phpqrcode) && function_exists('imagecreate')) {
    require_once $phpqrcode;
    // Módulo 10px, margen 2 módulos → ~420px de lado
    QRcode::png($qrContenido, $tmpQr, QR_ECLEVEL_H, 10, 2);
    $qrOk = true;
} else {
    // Runtime sin GD (Vercel serverless): generar el QR vía servicio externo
    $png = @file_get_contents('https://api.qrserver.com/v1/create-qr-code/?size=420x420&margin=2&ecc=H&data=' . urlencode($qrContenido));
    if ($png !== false && substr($png, 1, 3) === 'PNG') {
        file_put_contents($tmpQr, $png);
        $qrOk = true;
    }
}


if ($qrOk) {
    $pdf->Image($tmpQr, 10, $y_cae, 30, 30, 'PNG');
    @unlink($tmpQr);
} else {
    // Fallback si phpqrcode no está instalado
    @unlink($tmpQr);
    $pdf->SetDrawColor(0, 0, 0);
    $pdf->Rect(10, $y_cae, 30, 30);
    $pdf->SetXY(10, $y_cae + 12);
    $pdf->SetFont('Arial', 'B', 7);
    $pdf->SetTextColor(80, 80, 80);
    $pdf->Cell(30, 5, 'Instalar phpqrcode', 0, 0, 'C');
}

$pdf->SetFont('Arial', '', 7);
$pdf->SetTextColor(100, 100, 100);
$pdf->SetXY(43, $y_cae + 10);
$pdf->Cell(0, 5, 'CAE: ' . $venta['cae'] . '   |   Vto. CAE: ' . date('d/m/Y', strtotime($venta['vencimiento_cae'])), 0, 1, 'L');
$pdf->SetX(43);
$pdf->Cell(0, 5, 'Comprobante generado electronicamente - ARCA', 0, 1, 'L');

// ── Output ─────────────────────────────────────────────
$_pref_map      = [1=>'Factura', 6=>'Factura', 2=>'ND', 7=>'ND', 3=>'NC', 8=>'NC'];
$nombre_archivo = ($_pref_map[$tipo_cbte] ?? 'Comprobante') . '_' . $clase . '_' . str_pad($venta['nro_comprobante'], 8, '0', STR_PAD_LEFT) . '.pdf';
$modo = isset($_GET['view']) ? 'I' : 'D';
$pdf->Output($modo, $nombre_archivo);
