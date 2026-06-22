<?php
require_once __DIR__ . '/session_bootstrap.php';
require_once __DIR__ . '/auth.php';
starlim_session_start();

if (!isset($_SESSION['usuario'], $_SESSION['rango'])) {
    header('Location: ../frontend/sign.php');
    exit;
}

$rango = starlim_normalizar_rango($_SESSION['rango']);
if (!in_array($rango, ['Jefe', 'Jefe1', 'Admin'], true)) {
    http_response_code(403);
    die('No tenes permiso para emitir devoluciones.');
}

require_once __DIR__ . '/conexion_starlim_be.php';
require_once __DIR__ . '/comprobante_pdf_lib.php';

$empresaId = starlim_bootstrap_tenant_context($conexion);
$id_compra = (int)($_POST['id_compra'] ?? 0);
if ($id_compra <= 0) die('Error: compra invalida.');

$prod_ids = $_POST['prod_id'] ?? [];
$prod_cant = $_POST['prod_cant'] ?? [];
$motivos = $_POST['motivo'] ?? [];
$motivo_general = trim((string)($_POST['motivo_general'] ?? ''));

$stmt = $conexion->prepare(
    "SELECT cr.id, cr.descripcion, cr.total, cr.fecha,
            p.nombre AS prov_nombre, p.contacto, p.telefono, p.email, p.direccion
     FROM compras_registro cr
     LEFT JOIN proveedores p ON p.id = cr.id_proveedor AND p.empresa_id = cr.empresa_id
     WHERE cr.id = ? AND cr.empresa_id = ?
     LIMIT 1"
);
$stmt->bind_param('ii', $id_compra, $empresaId);
$stmt->execute();
$compra = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$compra) die('Error: compra no encontrada.');

$recibido = [];
$det = $conexion->prepare(
    "SELECT dcr.id_producto, COALESCE(p.nombre, '(producto eliminado)') AS nombre, dcr.cantidad
     FROM detalle_compras_registro dcr
     LEFT JOIN productos p ON p.id = dcr.id_producto AND p.empresa_id = dcr.empresa_id
     WHERE dcr.id_compra = ? AND dcr.empresa_id = ?
     ORDER BY dcr.id ASC"
);
$det->bind_param('ii', $id_compra, $empresaId);
$det->execute();
$rd = $det->get_result();
if ($rd) while ($row = $rd->fetch_assoc()) {
    $recibido[(int)$row['id_producto']] = [
        'nombre' => (string)$row['nombre'],
        'cantidad' => (int)$row['cantidad'],
    ];
}
$det->close();

$items = [];
foreach ($prod_ids as $i => $pid) {
    $pid = (int)$pid;
    $cant = (int)($prod_cant[$i] ?? 0);
    if ($pid <= 0 || $cant <= 0 || !isset($recibido[$pid])) continue;
    $cant = min($cant, $recibido[$pid]['cantidad']);
    if ($cant <= 0) continue;
    $items[] = [
        'codigo' => $pid,
        'nombre' => $recibido[$pid]['nombre'],
        'cantidad' => $cant,
        'motivo' => trim((string)($motivos[$i] ?? '')),
    ];
}
if (empty($items)) die('Error: no se seleccionaron productos validos para devolver.');

function sd_fecha(?string $fecha, string $fallback = '-'): string {
    if (!$fecha) return $fallback;
    $ts = strtotime($fecha);
    return $ts ? date('d/m/Y', $ts) : $fallback;
}

function sd_short(string $text, int $width): string {
    return mb_strimwidth(trim($text), 0, $width, '...', 'UTF-8');
}

$pdf = new ComprobantePDF('P', 'mm', 'A4');
$pdf->SetMargins(15, 14, 15);
$pdf->SetAutoPageBreak(true, 22);
$pdf->AddPage();

$nro = 'SD-' . str_pad((string)$id_compra, 8, '0', STR_PAD_LEFT);
$fecha = date('d/m/Y');
$fechaCompra = sd_fecha($compra['fecha'] ?? null);

$y_linea = cabecera_comprobante(
    $pdf,
    'SOLICITUD DE DEVOLUCION',
    'SD',
    $nro,
    $fecha,
    ['Proveedor', 'Compra: #' . str_pad((string)$id_compra, 8, '0', STR_PAD_LEFT), 'Fecha compra: ' . $fechaCompra]
);

$pdf->SetY($y_linea + 8);
starlim_pdf_section_title($pdf, 'Proveedor', 15);
$pdf->SetFont('Arial', 'B', 10.5);
starlim_pdf_set_text($pdf, 'body');
$pdf->Cell(180, 6, p((string)($compra['prov_nombre'] ?: 'Sin proveedor')), 0, 1, 'L');
$pdf->SetFont('Arial', '', 8.5);
starlim_pdf_set_text($pdf, 'muted');
$proveedorLineas = array_filter([
    trim((string)($compra['direccion'] ?? '')),
    trim((string)($compra['telefono'] ?? '')),
    trim((string)($compra['email'] ?? '')),
    trim((string)($compra['contacto'] ?? '')) !== '' ? 'Contacto: ' . trim((string)$compra['contacto']) : '',
]);
$pdf->MultiCell(180, 4.8, p(implode(' - ', $proveedorLineas) ?: '-'), 0, 'L');

$pdf->Ln(6);
$headers = ['Cant.', 'Codigo', 'Descripcion', 'Motivo'];
$widths = [18, 24, 86, 52];
$aligns = ['L', 'L', 'L', 'L'];
starlim_pdf_table_header($pdf, $headers, $widths, $aligns);

$totalUnidades = 0;
$pdf->SetFont('Arial', '', 8.7);
foreach ($items as $item) {
    $totalUnidades += (int)$item['cantidad'];
    $nombre = (string)$item['nombre'];
    $motivo = (string)($item['motivo'] ?: '-');
    $rowH = max(
        9,
        (int)ceil($pdf->GetStringWidth(p($nombre)) / 82) * 5.2,
        (int)ceil($pdf->GetStringWidth(p($motivo)) / 49) * 5.2
    );

    if ($pdf->GetY() + $rowH > 252) {
        $pdf->AddPage();
        starlim_pdf_table_header($pdf, $headers, $widths, $aligns);
        $pdf->SetFont('Arial', '', 8.7);
    }

    $x = 15;
    $y = $pdf->GetY();
    $pdf->SetDrawColor(236, 239, 237);

    starlim_pdf_set_text($pdf, 'body');
    $pdf->SetXY($x, $y);
    $pdf->Cell($widths[0], $rowH, (string)(int)$item['cantidad'], 0, 0, 'L');
    $x += $widths[0];

    starlim_pdf_set_text($pdf, 'soft');
    $pdf->SetXY($x, $y);
    $pdf->Cell($widths[1], $rowH, p((string)$item['codigo']), 0, 0, 'L');
    $x += $widths[1];

    starlim_pdf_set_text($pdf, 'body');
    $pdf->SetXY($x, $y + 1.2);
    $pdf->MultiCell($widths[2] - 2, 5, p(sd_short($nombre, 96)), 0, 'L');
    $x += $widths[2];

    $pdf->SetXY($x, $y + 1.2);
    starlim_pdf_set_text($pdf, 'muted');
    $pdf->MultiCell($widths[3] - 2, 5, p(sd_short($motivo, 70)), 0, 'L');

    $pdf->Line(15, $y + $rowH, 195, $y + $rowH);
    $pdf->SetY($y + $rowH);
}

$pdf->SetDrawColor(31, 36, 33);
$pdf->SetLineWidth(0.55);
$pdf->Line(15, $pdf->GetY() + 2, 195, $pdf->GetY() + 2);
$pdf->SetY($pdf->GetY() + 4);
$pdf->SetFont('Arial', 'B', 9);
starlim_pdf_set_text($pdf, 'body');
$pdf->Cell(18, 6, (string)$totalUnidades, 0, 0, 'L');
$pdf->Cell(162, 6, p('TOTAL DE UNIDADES A DEVOLVER'), 0, 1, 'L');

$boxY = $pdf->GetY() + 8;
if ($boxY + 36 > 260) {
    $pdf->AddPage();
    $boxY = 22;
}
$pdf->SetDrawColor(205, 214, 228);
$pdf->SetFillColor(238, 242, 248);
$pdf->RoundedRect(15, $boxY, 180, 30, 2.5, 'DF');
$pdf->SetXY(20, $boxY + 5);
starlim_pdf_section_title($pdf, 'Accion solicitada', 20);
$pdf->SetXY(20, $boxY + 11);
$pdf->SetFont('Arial', '', 8.5);
starlim_pdf_set_text($pdf, 'body');
$accion = $motivo_general !== ''
    ? $motivo_general
    : 'Reposicion de mercaderia o nota de credito por los bienes devueltos. Coordinar retiro y control con compras.';
$pdf->MultiCell(170, 4.8, p($accion), 0, 'L');

$sigY = $boxY + 52;
if ($sigY > 270) {
    $pdf->AddPage();
    $sigY = 58;
}
starlim_pdf_signature_pair($pdf, 'Autorizo - Starlim', 'Retiro - proveedor / transporte', $sigY);

$pdf->Output('I', 'Solicitud_devolucion_' . $nro . '.pdf');
