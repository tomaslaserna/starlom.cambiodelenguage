<?php
require_once __DIR__ . '/session_bootstrap.php';
require_once __DIR__ . '/conexion_starlim_be.php';
starlim_session_start();
if (!isset($_SESSION['usuario'])) { header('Location: ../frontend/sign.php'); exit; }

require_once __DIR__ . '/comprobante_pdf_lib.php';
$empresaId = starlim_bootstrap_tenant_context($conexion);

function rp_money(float $value): string {
    return starlim_pdf_money($value);
}

function rp_fecha(?string $fecha, string $fallback = '-'): string {
    if (!$fecha) return $fallback;
    $ts = strtotime($fecha);
    return $ts ? date('d/m/Y', $ts) : $fallback;
}

function rp_short(string $text, int $width): string {
    return mb_strimwidth(trim($text), 0, $width, '...', 'UTF-8');
}

function rp_cliente_doc(array $cliente, string $fallbackDoc = ''): string {
    $doc = trim((string)($cliente['nro_id'] ?? $fallbackDoc));
    if ($doc === '') return 'Sin CUIT informado';
    $tipo = trim((string)($cliente['tipo_id'] ?? 'CUIT'));
    return trim($tipo . ': ' . $doc, ': ');
}

$id = (int)($_GET['id'] ?? 0);
if (!$id) {
    http_response_code(400);
    die('ID requerido.');
}

$stmt = $conexion->prepare(
    "SELECT tipo, entidad_nombre, concepto, monto, fecha, comprobante_nombre, notas, created_at,
            id_origen, tipo_origen
     FROM pagos_registro
     WHERE id = ? AND empresa_id = ?"
);
$stmt->bind_param('ii', $id, $empresaId);
$stmt->execute();
$reg = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$reg) die('Registro no encontrado.');

$cliente = [];
$proveedor = [];
$venta = [];
$cancelaciones = [];

if ($reg['tipo'] === 'cobro' && ($reg['tipo_origen'] ?? '') === 'venta' && (int)$reg['id_origen'] > 0) {
    $id_or = (int)$reg['id_origen'];
    $st = $conexion->prepare(
        "SELECT v.id, v.nro_comprobante, v.tipo_cbte, COALESCE(v.cae,'') AS cae,
                v.fecha, v.monto, v.nombre_cliente, v.dni_cliente,
                COALESCE(v.cobro_metodo,'') AS cobro_metodo,
                COALESCE(v.cobro_destino,'') AS cobro_destino,
                COALESCE(v.cobro_operacion,'') AS cobro_operacion,
                COALESCE(v.cobro_registrado_por,'') AS cobro_registrado_por,
                COALESCE(v.cobro_aprobado_por,'') AS cobro_aprobado_por,
                COALESCE((SELECT r.nro_remito FROM remitos r WHERE r.id_venta = v.id AND r.empresa_id = v.empresa_id ORDER BY r.id LIMIT 1), v.nro_comprobante) AS nro_remito
         FROM ventas v
         WHERE v.id = ? AND v.empresa_id = ?"
    );
    $st->bind_param('ii', $id_or, $empresaId);
    $st->execute();
    $venta = $st->get_result()->fetch_assoc() ?: [];
    $st->close();

    if ($venta) {
        $docNorm = preg_replace('/\D+/', '', (string)($venta['dni_cliente'] ?? ''));
        if ($docNorm !== '') {
            $st = $conexion->prepare(
                "SELECT id, codigo_cliente, nombre_cliente, razon_social, tipo_id, nro_id,
                        cond_iva, telefono, domicilio, ciudad, provincia
                 FROM clientes
                 WHERE empresa_id = ? AND REPLACE(REPLACE(nro_id,'-',''),' ','') = ?
                 LIMIT 1"
            );
            $st->bind_param('is', $empresaId, $docNorm);
            $st->execute();
            $cliente = $st->get_result()->fetch_assoc() ?: [];
            $st->close();
        }
        if (!$cliente && trim((string)$venta['nombre_cliente']) !== '') {
            $st = $conexion->prepare(
                "SELECT id, codigo_cliente, nombre_cliente, razon_social, tipo_id, nro_id,
                        cond_iva, telefono, domicilio, ciudad, provincia
                 FROM clientes
                 WHERE empresa_id = ? AND nombre_cliente = ?
                 LIMIT 1"
            );
            $nombreVenta = $venta['nombre_cliente'];
            $st->bind_param('is', $empresaId, $nombreVenta);
            $st->execute();
            $cliente = $st->get_result()->fetch_assoc() ?: [];
            $st->close();
        }
        $doc = !empty($venta['cae']) ? 'Factura #' : 'Remito #';
        $doc .= str_pad((string)(int)($venta['nro_remito'] ?? $venta['nro_comprobante']), 8, '0', STR_PAD_LEFT);
        $cancelaciones[] = [
            'doc' => $doc,
            'fecha' => $venta['fecha'],
            'total' => (float)$venta['monto'],
            'aplicado' => (float)$reg['monto'],
        ];
    }
} elseif ($reg['tipo'] === 'cobro' && trim((string)$reg['entidad_nombre']) !== '') {
    $st = $conexion->prepare(
        "SELECT id, codigo_cliente, nombre_cliente, razon_social, tipo_id, nro_id,
                cond_iva, telefono, domicilio, ciudad, provincia
         FROM clientes WHERE empresa_id = ? AND nombre_cliente = ? LIMIT 1"
    );
    $st->bind_param('is', $empresaId, $reg['entidad_nombre']);
    $st->execute();
    $cliente = $st->get_result()->fetch_assoc() ?: [];
    $st->close();
} elseif ($reg['tipo'] === 'pago' && trim((string)$reg['entidad_nombre']) !== '') {
    $st = $conexion->prepare(
        "SELECT id, nombre, contacto, telefono, email, direccion
         FROM proveedores WHERE empresa_id = ? AND nombre = ? LIMIT 1"
    );
    $st->bind_param('is', $empresaId, $reg['entidad_nombre']);
    $st->execute();
    $proveedor = $st->get_result()->fetch_assoc() ?: [];
    $st->close();
}

if (($reg['tipo_origen'] ?? '') === 'compra' && (int)$reg['id_origen'] > 0) {
    $id_or = (int)$reg['id_origen'];
    $st = $conexion->prepare(
        "SELECT cr.id, cr.fecha, cr.total, COALESCE(p.nombre, cr.descripcion) AS proveedor
         FROM compras_registro cr
         LEFT JOIN proveedores p ON p.id = cr.id_proveedor AND p.empresa_id = cr.empresa_id
         WHERE cr.id = ? AND cr.empresa_id = ?"
    );
    $st->bind_param('ii', $id_or, $empresaId);
    $st->execute();
    if ($c = $st->get_result()->fetch_assoc()) {
        $cancelaciones[] = [
            'doc' => 'Compra #' . (int)$c['id'],
            'fecha' => $c['fecha'],
            'total' => (float)$c['total'],
            'aplicado' => (float)$reg['monto'],
        ];
    }
    $st->close();
}

$esCobro = $reg['tipo'] === 'cobro';
$titulo = $esCobro ? 'RECIBO DE PAGO' : 'COMPROBANTE DE PAGO';
$letra = $esCobro ? 'RP' : 'PG';
$nro = ($esCobro ? 'RP-' : 'PG-') . str_pad((string)$id, 6, '0', STR_PAD_LEFT);
$fechaPago = rp_fecha($reg['fecha'] ?: $reg['created_at'], date('d/m/Y'));

$pdf = new ComprobantePDF('P', 'mm', 'A4');
$pdf->SetMargins(15, 14, 15);
$pdf->SetAutoPageBreak(true, 22);
$pdf->AddPage();

$y_linea = cabecera_comprobante(
    $pdf,
    $titulo,
    $letra,
    $nro,
    $fechaPago,
    [$esCobro ? 'Cobro de cliente' : 'Pago a proveedor']
);

if ($esCobro) {
    $entityName = (string)($cliente['razon_social'] ?: ($cliente['nombre_cliente'] ?? ($venta['nombre_cliente'] ?? $reg['entidad_nombre'])));
    $entityDoc = rp_cliente_doc($cliente, (string)($venta['dni_cliente'] ?? ''));
    $entityAddress = trim((string)($cliente['domicilio'] ?? '') . ' ' . trim(($cliente['ciudad'] ?? '') . ', ' . ($cliente['provincia'] ?? ''), ', '));
    $section = 'Recibimos de';
} else {
    $entityName = (string)($proveedor['nombre'] ?? $reg['entidad_nombre']);
    $entityDoc = trim((string)($proveedor['contacto'] ?? '')) !== '' ? 'Contacto: ' . (string)$proveedor['contacto'] : 'Proveedor';
    $entityAddress = trim((string)($proveedor['direccion'] ?? ''));
    $section = 'Pagamos a';
}
$entityName = $entityName !== '' ? $entityName : '-';

$pdf->SetY($y_linea + 8);
starlim_pdf_section_title($pdf, $section, 15);
$pdf->SetFont('Arial', 'B', 11);
starlim_pdf_set_text($pdf, 'body');
$pdf->Cell(180, 6, p($entityName), 0, 1, 'L');
$pdf->SetFont('Arial', '', 8.5);
starlim_pdf_set_text($pdf, 'muted');
$pdf->MultiCell(180, 4.8, p(trim($entityDoc . ($entityAddress !== '' ? ' - ' . $entityAddress : ''))), 0, 'L');

$amountY = $pdf->GetY() + 10;
$pdf->SetDrawColor(205, 214, 228);
$pdf->SetFillColor(238, 242, 248);
$pdf->RoundedRect(15, $amountY, 180, 28, 2.5, 'DF');
$pdf->SetXY(20, $amountY + 5);
$pdf->SetFont('Arial', 'B', 8);
starlim_pdf_set_text($pdf, 'blue');
$pdf->Cell(80, 5, p($esCobro ? 'IMPORTE RECIBIDO' : 'IMPORTE PAGADO'), 0, 1, 'L');
$pdf->SetX(20);
$pdf->SetFont('Arial', '', 8.5);
starlim_pdf_set_text($pdf, 'muted');
$pdf->MultiCell(92, 4.8, p($reg['concepto'] ?: ($esCobro ? 'Cobro aprobado' : 'Pago registrado')), 0, 'L');
$pdf->SetXY(118, $amountY + 8);
$pdf->SetFont('Arial', 'B', 19);
starlim_pdf_set_text($pdf, 'body');
$pdf->Cell(72, 8, p(rp_money((float)$reg['monto'])), 0, 0, 'R');

$gridY = $amountY + 38;
starlim_pdf_section_title($pdf, 'Medio de pago', 15, $gridY);
$pdf->SetXY(15, $gridY + 7);
$metodo = $venta['cobro_metodo'] ?? '';
$destino = $venta['cobro_destino'] ?? '';
$operacion = $venta['cobro_operacion'] ?? '';
$aprobado = $venta['cobro_aprobado_por'] ?? '';

starlim_pdf_key_value($pdf, 'Medio', (string)($metodo ?: '-'), 19, 64);
$pdf->SetXY(108, $gridY + 7);
starlim_pdf_key_value($pdf, 'Cuenta', (string)($destino ?: '-'), 20, 67);
$pdf->SetXY(15, $gridY + 13);
starlim_pdf_key_value($pdf, 'Operacion', (string)($operacion ?: '-'), 19, 64);
$pdf->SetXY(108, $gridY + 13);
starlim_pdf_key_value($pdf, 'Aprobado', (string)($aprobado ?: '-'), 20, 67);

$pdf->SetY($gridY + 26);
if (!empty($cancelaciones)) {
    starlim_pdf_section_title($pdf, $esCobro ? 'Imputado a' : 'Documento asociado', 15);
    $headers = ['Comprobante', 'Fecha', 'Importe', 'Aplicado'];
    $widths = [76, 28, 38, 38];
    $aligns = ['L', 'C', 'R', 'R'];
    starlim_pdf_table_header($pdf, $headers, $widths, $aligns);

    $totalAplicado = 0.0;
    $pdf->SetFont('Arial', '', 8.6);
    foreach ($cancelaciones as $can) {
        $totalAplicado += (float)$can['aplicado'];
        if ($pdf->GetY() > 246) {
            $pdf->AddPage();
            starlim_pdf_table_header($pdf, $headers, $widths, $aligns);
            $pdf->SetFont('Arial', '', 8.6);
        }
        $y = $pdf->GetY();
        $pdf->SetDrawColor(236, 239, 237);
        starlim_pdf_set_text($pdf, 'body');
        $pdf->Cell($widths[0], 8, p(rp_short((string)$can['doc'], 48)), 0, 0, 'L');
        starlim_pdf_set_text($pdf, 'muted');
        $pdf->Cell($widths[1], 8, p(rp_fecha($can['fecha'] ?? null)), 0, 0, 'C');
        starlim_pdf_set_text($pdf, 'body');
        $pdf->Cell($widths[2], 8, p(rp_money((float)$can['total'])), 0, 0, 'R');
        $pdf->SetFont('Arial', 'B', 8.6);
        $pdf->Cell($widths[3], 8, p(rp_money((float)$can['aplicado'])), 0, 1, 'R');
        $pdf->SetFont('Arial', '', 8.6);
        $pdf->Line(15, $y + 8, 195, $y + 8);
    }

    $pdf->SetDrawColor(31, 36, 33);
    $pdf->SetLineWidth(0.55);
    $lineY = $pdf->GetY() + 2;
    $pdf->Line(15, $lineY, 195, $lineY);
    $pdf->SetY($lineY + 3);
    $pdf->SetFont('Arial', 'B', 9);
    $pdf->Cell(136, 6, p('TOTAL IMPUTADO'), 0, 0, 'L');
    $pdf->Cell(44, 6, p(rp_money($totalAplicado)), 0, 1, 'R');
} else {
    $pdf->SetFont('Arial', '', 8.8);
    starlim_pdf_set_text($pdf, 'muted');
    $pdf->MultiCell(180, 5, p('El registro no tiene documentos asociados para imputar en este comprobante.'), 0, 'L');
}

$boxY = $pdf->GetY() + 8;
if ($boxY + 30 > 260) {
    $pdf->AddPage();
    $boxY = 22;
}
if (!empty($reg['notas']) || !empty($reg['comprobante_nombre'])) {
    $pdf->SetDrawColor(227, 231, 228);
    $pdf->RoundedRect(15, $boxY, 180, 24, 2, 'D');
    $pdf->SetXY(19, $boxY + 4);
    starlim_pdf_section_title($pdf, 'Observaciones', 19);
    $pdf->SetXY(19, $boxY + 10);
    $pdf->SetFont('Arial', '', 8.3);
    starlim_pdf_set_text($pdf, 'muted');
    $obs = trim((string)($reg['notas'] ?? ''));
    if (!empty($reg['comprobante_nombre'])) $obs = trim($obs . ' Comprobante adjunto: si');
    $pdf->MultiCell(172, 4.5, p($obs), 0, 'L');
    $sigY = $boxY + 46;
} else {
    $sigY = $boxY + 20;
}

if ($sigY > 270) {
    $pdf->AddPage();
    $sigY = 58;
}
starlim_pdf_signature_pair(
    $pdf,
    $esCobro ? 'Recibi conforme - Starlim' : 'Autorizo pago - Starlim',
    'Aclaracion y firma',
    $sigY
);

$filename = 'registro_pago_' . $id . '_' . date('Ymd') . '.pdf';
$pdf->Output('I', $filename);
