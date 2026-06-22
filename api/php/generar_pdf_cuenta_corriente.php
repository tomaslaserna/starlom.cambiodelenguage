<?php
require_once __DIR__ . '/session_bootstrap.php';
require_once __DIR__ . '/conexion_starlim_be.php';
starlim_session_start();
if (!isset($_SESSION['usuario'])) { header('Location: ../frontend/sign.php'); exit; }

require_once __DIR__ . '/comprobante_pdf_lib.php';
$empresaId = starlim_bootstrap_tenant_context($conexion);

function cc_fecha_valida(string $fecha): string {
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha) ? $fecha : '';
}

function cc_money(float $value, bool $signed = false): string {
    $sign = '';
    if ($signed && abs($value) > 0.0001) $sign = $value > 0 ? '+' : '-';
    return $sign . starlim_pdf_money(abs($value));
}

function cc_fecha_arg(string $fecha, string $fallback = '-'): string {
    if ($fecha === '') return $fallback;
    $ts = strtotime($fecha);
    return $ts ? date('d/m/Y', $ts) : $fallback;
}

function cc_short(string $text, int $width): string {
    return mb_strimwidth(trim($text), 0, $width, '...', 'UTF-8');
}

function cc_doc_cliente(array $cliente): string {
    $doc = trim((string)($cliente['nro_id'] ?? ''));
    if ($doc === '') return 'Sin CUIT informado';
    $tipo = trim((string)($cliente['tipo_id'] ?? 'CUIT'));
    return trim($tipo . ': ' . $doc, ': ');
}

function cc_numero_cliente(array $cliente): string {
    $codigo = trim((string)($cliente['codigo_cliente'] ?? ''));
    if ($codigo !== '') return $codigo;
    $id = (int)($cliente['id'] ?? 0);
    return $id > 0 ? (string)$id : '-';
}

function cc_draw_header(ComprobantePDF $pdf): void {
    starlim_pdf_table_header($pdf, ['Fecha', 'Concepto', 'Debe', 'Haber', 'Saldo'], [24, 86, 27, 27, 26], ['C', 'L', 'R', 'R', 'R']);
}

function cc_draw_row(ComprobantePDF $pdf, string $fecha, string $concepto, string $debe, string $haber, string $saldo): void {
    if ($pdf->GetY() > 256) {
        $pdf->AddPage();
        cc_draw_header($pdf);
    }

    $rowH = max(8, (int)ceil($pdf->GetStringWidth(p($concepto)) / 82) * 5.2);
    $x = 15;
    $y = $pdf->GetY();
    $widths = [24, 86, 27, 27, 26];

    $pdf->SetDrawColor(236, 239, 237);
    $pdf->SetFont('Arial', '', 8.4);
    starlim_pdf_set_text($pdf, 'muted');
    $pdf->SetXY($x, $y);
    $pdf->Cell($widths[0], $rowH, p($fecha), 0, 0, 'C');
    $x += $widths[0];

    starlim_pdf_set_text($pdf, 'body');
    $pdf->SetXY($x, $y + 1.1);
    $pdf->MultiCell($widths[1] - 2, 5, p(cc_short($concepto, 74)), 0, 'L');
    $x += $widths[1];

    $pdf->SetXY($x, $y);
    $pdf->Cell($widths[2], $rowH, p($debe), 0, 0, 'R');
    $x += $widths[2];
    $pdf->SetXY($x, $y);
    $pdf->Cell($widths[3], $rowH, p($haber), 0, 0, 'R');
    $x += $widths[3];
    $pdf->SetXY($x, $y);
    $pdf->SetFont('Arial', 'B', 8.4);
    $pdf->Cell($widths[4], $rowH, p($saldo), 0, 0, 'R');
    $pdf->SetFont('Arial', '', 8.4);

    $pdf->Line(15, $y + $rowH, 195, $y + $rowH);
    $pdf->SetY($y + $rowH);
}

$nombre = trim($_GET['nombre'] ?? '');
$tipo = in_array($_GET['tipo'] ?? '', ['cliente', 'proveedor'], true) ? $_GET['tipo'] : 'cliente';
$desde = cc_fecha_valida(trim($_GET['desde'] ?? ''));
$hasta = cc_fecha_valida(trim($_GET['hasta'] ?? ''));

if ($desde !== '' && $hasta !== '' && strtotime($desde) > strtotime($hasta)) {
    [$desde, $hasta] = [$hasta, $desde];
}

if ($nombre === '') {
    http_response_code(400);
    die('Nombre requerido.');
}

$entidad = [];
if ($tipo === 'cliente') {
    $stmt = $conexion->prepare(
        "SELECT id, codigo_cliente, nombre_cliente, razon_social, tipo_id, nro_id,
                cond_iva, telefono, domicilio, ciudad, provincia, vendedor_cl
         FROM clientes
         WHERE nombre_cliente = ? AND empresa_id = ?
         LIMIT 1"
    );
    $stmt->bind_param('si', $nombre, $empresaId);
    $stmt->execute();
    $entidad = $stmt->get_result()->fetch_assoc() ?: [];
    $stmt->close();
} else {
    $stmt = $conexion->prepare(
        "SELECT id, nombre, contacto, telefono, email, direccion
         FROM proveedores
         WHERE nombre = ? AND empresa_id = ?
         LIMIT 1"
    );
    $stmt->bind_param('si', $nombre, $empresaId);
    $stmt->execute();
    $entidad = $stmt->get_result()->fetch_assoc() ?: [];
    $stmt->close();
}

$saldo_anterior = 0.0;
if ($desde !== '') {
    $sa = $conexion->prepare(
        "SELECT COALESCE(SUM(haber - debe), 0) AS saldo
         FROM cuentas_corrientes
         WHERE empresa_id = ? AND entidad_nombre = ? AND tipo = ? AND fecha < ?"
    );
    $sa->bind_param('isss', $empresaId, $nombre, $tipo, $desde);
    $sa->execute();
    $saldo_anterior = (float)($sa->get_result()->fetch_assoc()['saldo'] ?? 0);
    $sa->close();
}

if ($desde !== '' && $hasta !== '') {
    $stmt = $conexion->prepare(
        "SELECT descripcion, debe, haber, fecha
         FROM cuentas_corrientes
         WHERE empresa_id = ? AND entidad_nombre = ? AND tipo = ? AND fecha >= ? AND fecha <= ?
         ORDER BY fecha ASC, id ASC"
    );
    $stmt->bind_param('issss', $empresaId, $nombre, $tipo, $desde, $hasta);
} elseif ($desde !== '') {
    $stmt = $conexion->prepare(
        "SELECT descripcion, debe, haber, fecha
         FROM cuentas_corrientes
         WHERE empresa_id = ? AND entidad_nombre = ? AND tipo = ? AND fecha >= ?
         ORDER BY fecha ASC, id ASC"
    );
    $stmt->bind_param('isss', $empresaId, $nombre, $tipo, $desde);
} elseif ($hasta !== '') {
    $stmt = $conexion->prepare(
        "SELECT descripcion, debe, haber, fecha
         FROM cuentas_corrientes
         WHERE empresa_id = ? AND entidad_nombre = ? AND tipo = ? AND fecha <= ?
         ORDER BY fecha ASC, id ASC"
    );
    $stmt->bind_param('isss', $empresaId, $nombre, $tipo, $hasta);
} else {
    $stmt = $conexion->prepare(
        "SELECT descripcion, debe, haber, fecha
         FROM cuentas_corrientes
         WHERE empresa_id = ? AND entidad_nombre = ? AND tipo = ?
         ORDER BY fecha ASC, id ASC"
    );
    $stmt->bind_param('iss', $empresaId, $nombre, $tipo);
}
$stmt->execute();
$res = $stmt->get_result();
$rows = [];
if ($res) while ($row = $res->fetch_assoc()) $rows[] = $row;
$stmt->close();

$periodo = ($desde || $hasta)
    ? cc_fecha_arg($desde, 'inicio') . ' a ' . cc_fecha_arg($hasta, 'hoy')
    : 'Completo';

$pdf = new ComprobantePDF('P', 'mm', 'A4');
$pdf->SetMargins(15, 14, 15);
$pdf->SetAutoPageBreak(true, 22);
$pdf->AddPage();

$nro_pdf = 'CC-' . date('Ymd');
$y_linea = cabecera_comprobante(
    $pdf,
    'CUENTA CORRIENTE',
    'CC',
    $nro_pdf,
    date('d/m/Y'),
    ['Tipo: ' . ($tipo === 'cliente' ? 'Cliente' : 'Proveedor'), 'Periodo: ' . $periodo]
);

$pdf->SetY($y_linea + 8);
starlim_pdf_section_title($pdf, $tipo === 'cliente' ? 'Cliente' : 'Proveedor', 15);
$pdf->SetFont('Arial', 'B', 11);
starlim_pdf_set_text($pdf, 'body');
$nombrePrincipal = $tipo === 'cliente'
    ? ((string)($entidad['razon_social'] ?: $nombre))
    : ((string)($entidad['nombre'] ?? $nombre));
$pdf->Cell(180, 6, p($nombrePrincipal), 0, 1, 'L');

if ($tipo === 'cliente') {
    $localidad = trim(($entidad['ciudad'] ?? '') . ', ' . ($entidad['provincia'] ?? ''), ', ');
    $meta = array_filter([
        'Nro cliente: ' . cc_numero_cliente($entidad),
        cc_doc_cliente($entidad),
        trim((string)($entidad['cond_iva'] ?? '')),
        trim((string)($entidad['domicilio'] ?? '') . ($localidad !== '' ? ' - ' . $localidad : '')),
        trim((string)($entidad['telefono'] ?? '')),
    ]);
} else {
    $meta = array_filter([
        ((int)($entidad['id'] ?? 0) > 0 ? 'Nro proveedor: ' . (int)$entidad['id'] : ''),
        trim((string)($entidad['contacto'] ?? '')) !== '' ? 'Contacto: ' . trim((string)$entidad['contacto']) : '',
        trim((string)($entidad['telefono'] ?? '')),
        trim((string)($entidad['email'] ?? '')),
        trim((string)($entidad['direccion'] ?? '')),
    ]);
}
$pdf->SetFont('Arial', '', 8.5);
starlim_pdf_set_text($pdf, 'muted');
$pdf->MultiCell(180, 4.8, p(implode(' - ', $meta) ?: '-'), 0, 'L');

$pdf->Ln(7);
starlim_pdf_section_title($pdf, 'Movimientos', 15);
cc_draw_header($pdf);

$saldo = $saldo_anterior;
$total_d = 0.0;
$total_h = 0.0;

if ($desde !== '' && abs($saldo_anterior) > 0.0001) {
    cc_draw_row($pdf, cc_fecha_arg($desde), 'Saldo anterior', '-', '-', cc_money($saldo, true));
}

if (empty($rows) && abs($saldo_anterior) <= 0.0001) {
    $pdf->SetFont('Arial', 'I', 9);
    starlim_pdf_set_text($pdf, 'muted');
    $pdf->Cell(180, 10, p('No se registran movimientos para el periodo seleccionado.'), 0, 1, 'C');
}

foreach ($rows as $r) {
    $debe = (float)$r['debe'];
    $haber = (float)$r['haber'];
    $saldo += $haber - $debe;
    $total_d += $debe;
    $total_h += $haber;
    $concepto = trim((string)($r['descripcion'] ?? ''));
    if ($concepto === '') $concepto = 'Movimiento de cuenta corriente';
    cc_draw_row(
        $pdf,
        cc_fecha_arg((string)($r['fecha'] ?? '')),
        $concepto,
        $debe > 0 ? cc_money($debe) : '-',
        $haber > 0 ? cc_money($haber) : '-',
        cc_money($saldo, true)
    );
}

$saldo_final = $saldo;
$saldo_estado = abs($saldo_final) <= 0.0001
    ? 'Cuenta saldada'
    : ($saldo_final < 0 ? 'Saldo pendiente' : 'Saldo a favor');

$summaryY = $pdf->GetY() + 8;
if ($summaryY > 230) {
    $pdf->AddPage();
    $summaryY = 24;
}
$pdf->SetY($summaryY);
$totX = 112;
$totY = $summaryY;
$summaryRows = [
    ['Saldo anterior', cc_money($saldo_anterior, true)],
    ['Total debe', cc_money($total_d)],
    ['Total haber', cc_money($total_h)],
];

$pdf->SetFont('Arial', '', 8.8);
foreach ($summaryRows as [$label, $value]) {
    $pdf->SetXY($totX, $totY);
    starlim_pdf_set_text($pdf, 'muted');
    $pdf->Cell(48, 6, p($label), 0, 0, 'L');
    starlim_pdf_set_text($pdf, 'body');
    $pdf->Cell(35, 6, p($value), 0, 0, 'R');
    $totY += 6;
}
$pdf->SetDrawColor(31, 36, 33);
$pdf->SetLineWidth(0.55);
$pdf->Line($totX, $totY + 1, 195, $totY + 1);
$pdf->SetXY($totX, $totY + 4);
$pdf->SetFont('Arial', 'B', 12);
starlim_pdf_set_text($pdf, 'body');
$pdf->Cell(42, 8, p($saldo_estado), 0, 0, 'L');
$pdf->Cell(41, 8, p(cc_money($saldo_final, true)), 0, 1, 'R');

$noteY = max($pdf->GetY() + 8, $summaryY);
if ($noteY + 22 > 265) {
    $pdf->AddPage();
    $noteY = 24;
}
$pdf->SetDrawColor(227, 231, 228);
$pdf->RoundedRect(15, $noteY, 180, 22, 2, 'D');
$pdf->SetXY(19, $noteY + 4);
$pdf->SetFont('Arial', '', 8.2);
starlim_pdf_set_text($pdf, 'muted');
$pdf->MultiCell(172, 4.5, p('Este estado refleja los movimientos registrados en Starlim para la entidad y el periodo indicados. Ante diferencias, verificar contra facturas, remitos y recibos emitidos.'), 0, 'L');

$safe_nombre = preg_replace('/[^A-Za-z0-9_-]+/', '_', $nombre);
$filename = 'cuenta_corriente_' . ($safe_nombre ?: 'entidad') . '_' . date('Ymd') . '.pdf';
$pdf->Output(isset($_GET['download']) ? 'D' : 'I', $filename);
