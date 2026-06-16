<?php
session_start();
if (!isset($_SESSION['usuario'])) { header('Location: ../frontend/sign.php'); die(); }

include 'conexion_starlim_be.php';
require_once '../fpdf186/fpdf.php';

$id = (int)($_GET['id'] ?? 0);
if (!$id) die('ID requerido.');

$stmt = $conexion->prepare(
    "SELECT tipo, entidad_nombre, concepto, monto, fecha, comprobante_nombre, notas, created_at,
            id_origen, tipo_origen
     FROM pagos_registro WHERE id = ?"
);
$stmt->bind_param('i', $id);
$stmt->execute();
$reg = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$reg) die('Registro no encontrado.');

$entidad = [];
if ($reg['tipo'] === 'cobro' && $reg['entidad_nombre'] !== '') {
    $st = $conexion->prepare("SELECT nombre_cliente, razon_social, tipo_id, nro_id, telefono, domicilio, ciudad, provincia FROM clientes WHERE nombre_cliente = ? LIMIT 1");
    $st->bind_param('s', $reg['entidad_nombre']);
    $st->execute();
    $entidad = $st->get_result()->fetch_assoc() ?: [];
    $st->close();
} elseif ($reg['tipo'] === 'pago' && $reg['entidad_nombre'] !== '') {
    $st = $conexion->prepare("SELECT nombre, contacto, telefono, email, direccion FROM proveedores WHERE nombre = ? LIMIT 1");
    $st->bind_param('s', $reg['entidad_nombre']);
    $st->execute();
    $entidad = $st->get_result()->fetch_assoc() ?: [];
    $st->close();
}

$cancelaciones = [];
if (($reg['tipo_origen'] ?? '') === 'venta' && (int)$reg['id_origen'] > 0) {
    $st = $conexion->prepare("SELECT nro_comprobante, tipo_cbte, fecha, monto, nombre_cliente FROM ventas WHERE id = ?");
    $id_or = (int)$reg['id_origen'];
    $st->bind_param('i', $id_or);
    $st->execute();
    if ($v = $st->get_result()->fetch_assoc()) {
        $cancelaciones[] = [
            'doc' => 'Factura/Remito #' . str_pad((int)$v['nro_comprobante'], 8, '0', STR_PAD_LEFT),
            'fecha' => $v['fecha'],
            'total' => (float)$v['monto'],
            'aplicado' => (float)$reg['monto'],
        ];
    }
    $st->close();
} elseif (($reg['tipo_origen'] ?? '') === 'compra' && (int)$reg['id_origen'] > 0) {
    $st = $conexion->prepare("SELECT cr.id, cr.fecha, cr.total, COALESCE(p.nombre, cr.descripcion) AS proveedor FROM compras_registro cr LEFT JOIN proveedores p ON p.id = cr.id_proveedor WHERE cr.id = ?");
    $id_or = (int)$reg['id_origen'];
    $st->bind_param('i', $id_or);
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

/* ── PDF ──────────────────────────────────────────────────────────── */
$pdf = new FPDF();
$pdf->AddPage();

/* Encabezado */
$pdf->SetFont('Arial','B',16);
$tipo_label = $reg['tipo'] === 'cobro' ? 'RECIBO DE COBRO' : 'COMPROBANTE DE PAGO';
$pdf->Cell(0,10,iconv('UTF-8','windows-1252',$tipo_label),0,1,'C');
$pdf->SetFont('Arial','',10);
$pdf->Cell(0,6,'Star Lim',0,1,'C');
$pdf->Cell(0,5,'CUIT: 20-46656757-5',0,1,'C');
$pdf->Cell(0,5,iconv('UTF-8','windows-1252//IGNORE','Comprobante interno de registración'),0,1,'C');
$pdf->Cell(0,5,'Fecha de emisión: '.date('d/m/Y H:i'),0,1,'C');
$pdf->Ln(6);

/* Línea separadora */
$pdf->SetDrawColor(180,180,180);
$pdf->Line(15, $pdf->GetY(), 195, $pdf->GetY());
$pdf->Ln(4);

/* Datos del registro */
$pdf->SetFont('Arial','B',10);
$pdf->Cell(50,7,iconv('UTF-8','windows-1252','Tipo:'),0,0);
$pdf->SetFont('Arial','',10);
$pdf->Cell(0,7,iconv('UTF-8','windows-1252', $reg['tipo'] === 'cobro' ? 'Cobro (de cliente)' : 'Pago (a proveedor)'),0,1);

$pdf->SetFont('Arial','B',10);
$pdf->Cell(50,7,iconv('UTF-8','windows-1252', $reg['tipo'] === 'cobro' ? 'Cliente:' : 'Proveedor:'),0,0);
$pdf->SetFont('Arial','',10);
$pdf->Cell(0,7,iconv('UTF-8','windows-1252//IGNORE', $reg['entidad_nombre'] ?: '—'),0,1);

if (!empty($entidad)) {
    $doc_ent = trim(($entidad['tipo_id'] ?? '') . ': ' . ($entidad['nro_id'] ?? ''), ': ');
    $tel_ent = $entidad['telefono'] ?? '';
    $dir_ent = $entidad['domicilio'] ?? ($entidad['direccion'] ?? '');
    $loc_ent = trim(($entidad['ciudad'] ?? '') . ', ' . ($entidad['provincia'] ?? ''), ', ');

    if ($doc_ent !== '') {
        $pdf->SetFont('Arial','B',10);
        $pdf->Cell(50,7,'Documento:',0,0);
        $pdf->SetFont('Arial','',10);
        $pdf->Cell(0,7,iconv('UTF-8','windows-1252//IGNORE', $doc_ent),0,1);
    }
    if ($tel_ent !== '') {
        $pdf->SetFont('Arial','B',10);
        $pdf->Cell(50,7,iconv('UTF-8','windows-1252','Teléfono:'),0,0);
        $pdf->SetFont('Arial','',10);
        $pdf->Cell(0,7,iconv('UTF-8','windows-1252//IGNORE', $tel_ent),0,1);
    }
    if ($dir_ent !== '' || $loc_ent !== '') {
        $pdf->SetFont('Arial','B',10);
        $pdf->Cell(50,7,iconv('UTF-8','windows-1252','Dirección:'),0,0);
        $pdf->SetFont('Arial','',10);
        $pdf->Cell(0,7,iconv('UTF-8','windows-1252//IGNORE', trim($dir_ent . ' ' . $loc_ent)),0,1);
    }
}

$pdf->SetFont('Arial','B',10);
$pdf->Cell(50,7,iconv('UTF-8','windows-1252','Concepto:'),0,0);
$pdf->SetFont('Arial','',10);
$pdf->Cell(0,7,iconv('UTF-8','windows-1252//IGNORE', $reg['concepto'] ?: '—'),0,1);

$pdf->SetFont('Arial','B',10);
$pdf->Cell(50,7,'Fecha:',0,0);
$pdf->SetFont('Arial','',10);
$pdf->Cell(0,7,$reg['fecha'] ? date('d/m/Y', strtotime($reg['fecha'])) : '—',0,1);

$pdf->Ln(4);
$pdf->Line(15, $pdf->GetY(), 195, $pdf->GetY());
$pdf->Ln(6);

if (!empty($cancelaciones)) {
    $pdf->SetFont('Arial','B',11);
    $pdf->Cell(0,8,iconv('UTF-8','windows-1252','Detalle de facturas / documentos cancelados'),0,1);
    $pdf->SetFillColor(240,240,240);
    $pdf->SetFont('Arial','B',9);
    $pdf->Cell(70,7,'Documento',1,0,'L',true);
    $pdf->Cell(30,7,'Fecha',1,0,'C',true);
    $pdf->Cell(40,7,'Total doc.',1,0,'R',true);
    $pdf->Cell(40,7,'Aplicado',1,1,'R',true);
    $pdf->SetFont('Arial','',9);
    foreach ($cancelaciones as $can) {
        $pdf->Cell(70,7,iconv('UTF-8','windows-1252//IGNORE',$can['doc']),1,0,'L');
        $pdf->Cell(30,7,$can['fecha'] ? date('d/m/Y', strtotime($can['fecha'])) : '-',1,0,'C');
        $pdf->Cell(40,7,'$'.number_format((float)$can['total'],2,',','.'),1,0,'R');
        $pdf->Cell(40,7,'$'.number_format((float)$can['aplicado'],2,',','.'),1,1,'R');
    }
    $pdf->Ln(5);
    $pdf->Line(15, $pdf->GetY(), 195, $pdf->GetY());
    $pdf->Ln(5);
}

/* Monto destacado */
$pdf->SetFont('Arial','B',13);
$monto_fmt = '$'.number_format((float)$reg['monto'],2,',','.');
$pdf->Cell(50,9,iconv('UTF-8','windows-1252','Monto:'),0,0);
$pdf->SetFont('Arial','B',16);
$pdf->Cell(0,9,$monto_fmt,0,1);

$pdf->Ln(6);
$pdf->Line(15, $pdf->GetY(), 195, $pdf->GetY());
$pdf->Ln(4);

/* Notas */
if (!empty($reg['notas'])) {
    $pdf->SetFont('Arial','B',10);
    $pdf->Cell(50,7,'Notas:',0,0);
    $pdf->SetFont('Arial','',10);
    $pdf->MultiCell(0,6,iconv('UTF-8','windows-1252//IGNORE', $reg['notas']));
    $pdf->Ln(2);
}

/* Comprobante adjunto */
if (!empty($reg['comprobante_nombre'])) {
    $pdf->SetFont('Arial','I',9);
    $pdf->Cell(0,6,iconv('UTF-8','windows-1252','* Comprobante adjunto: '.$reg['comprobante_nombre']),0,1);
}

/* Pie */
$pdf->Ln(10);
$pdf->SetFont('Arial','I',8);
$pdf->SetTextColor(130,130,130);
$pdf->Cell(0,5,iconv('UTF-8','windows-1252','Registro interno — Star Lim · Generado el '.date('d/m/Y \a \l\a\s H:i')),0,1,'C');

$pdf->Output('I', 'registro_pago_'.$id.'_'.date('Ymd').'.pdf');
