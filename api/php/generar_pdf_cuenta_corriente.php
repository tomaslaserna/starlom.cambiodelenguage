<?php
session_start();
if (!isset($_SESSION['usuario'])) { header('Location: ../frontend/sign.php'); die(); }

include 'conexion_starlim_be.php';
require_once '../fpdf186/fpdf.php';

$nombre = trim($_GET['nombre'] ?? '');
$tipo   = in_array($_GET['tipo'] ?? '', ['cliente','proveedor']) ? $_GET['tipo'] : 'cliente';
$desde  = trim($_GET['desde'] ?? '');
$hasta  = trim($_GET['hasta'] ?? '');
if ($nombre === '') die('Nombre requerido.');

/* ── Obtener movimientos ──────────────────────────────────────────── */
$where = "WHERE entidad_nombre = '" . $conexion->real_escape_string($nombre) . "'
          AND tipo = '" . $conexion->real_escape_string($tipo) . "'";

$saldo_anterior = 0.0;
if ($desde !== '') {
    $sd = $conexion->real_escape_string($desde);
    $ra = $conexion->query("
        SELECT COALESCE(SUM(haber - debe), 0) AS saldo
        FROM cuentas_corrientes
        $where AND fecha < '$sd'
    ");
    if ($ra) $saldo_anterior = (float)($ra->fetch_assoc()['saldo'] ?? 0);
    $where .= " AND fecha >= '$sd'";
}
if ($hasta !== '') {
    $sh = $conexion->real_escape_string($hasta);
    $where .= " AND fecha <= '$sh'";
}

$res = $conexion->query("
    SELECT descripcion, debe, haber, fecha
    FROM cuentas_corrientes
    $where
    ORDER BY fecha ASC, id ASC
");
$rows = $res ? $res->fetch_all(MYSQLI_ASSOC) : [];

/* ── PDF ──────────────────────────────────────────────────────────── */
class CuentaCorrientePDF extends FPDF {
    public $titulo = '';
    public $subtitulo = '';
    function Header() {
        $this->SetFont('Arial','B',14);
        $this->Cell(0,8,$this->titulo,0,1,'C');
        $this->SetFont('Arial','',10);
        $this->Cell(0,6,$this->subtitulo,0,1,'C');
        $this->SetFont('Arial','',9);
        $this->Cell(0,5,'Fecha de emisión: '.date('d/m/Y H:i'),0,1,'C');
        $this->Ln(3);
        /* Encabezado tabla */
        $this->SetFillColor(240,240,240);
        $this->SetFont('Arial','B',9);
        $this->Cell(28,7,'Fecha',1,0,'C',true);
        $this->Cell(85,7,'Descripción',1,0,'L',true);
        $this->Cell(26,7,'Debe',1,0,'R',true);
        $this->Cell(26,7,'Haber',1,0,'R',true);
        $this->Cell(26,7,'Saldo',1,1,'R',true);
    }
    function Footer() {
        $this->SetY(-12);
        $this->SetFont('Arial','I',8);
        $this->Cell(0,5,'Página '.$this->PageNo().'/{nb}',0,0,'C');
    }
}

$pdf = new CuentaCorrientePDF();
$pdf->AliasNbPages();
$pdf->titulo  = iconv('UTF-8','windows-1252','Cuenta Corriente — '.ucfirst($tipo).': '.$nombre);
$periodo = ($desde || $hasta)
    ? 'Periodo: ' . ($desde ? date('d/m/Y', strtotime($desde)) : 'inicio') . ' a ' . ($hasta ? date('d/m/Y', strtotime($hasta)) : 'hoy')
    : 'Periodo completo';
$pdf->subtitulo = iconv('UTF-8','windows-1252','Star Lim - ' . $periodo);
$pdf->AddPage();
$pdf->SetFont('Arial','',9);

$saldo     = $saldo_anterior;
$total_d   = 0.0;
$total_h   = 0.0;

if ($desde !== '' && abs($saldo_anterior) > 0.0001) {
    $pdf->SetFillColor(245,245,245);
    $saldo_txt = ($saldo >= 0 ? '+' : '') . '$' . number_format(abs($saldo),2,',','.');
    $pdf->Cell(28,6,date('d/m/Y', strtotime($desde)),1,0,'C',true);
    $pdf->Cell(85,6,iconv('UTF-8','windows-1252//IGNORE','Saldo histórico anterior'),1,0,'L',true);
    $pdf->Cell(26,6,'-',1,0,'R',true);
    $pdf->Cell(26,6,'-',1,0,'R',true);
    $pdf->Cell(26,6,$saldo_txt,1,1,'R',true);
}

foreach ($rows as $i => $r) {
    $debe   = (float)$r['debe'];
    $haber  = (float)$r['haber'];
    $saldo += $haber - $debe;
    $total_d += $debe;
    $total_h += $haber;

    $bg = ($i % 2 === 0);
    if ($bg) $pdf->SetFillColor(250,250,250);

    $fecha_fmt = $r['fecha'] ? date('d/m/Y', strtotime($r['fecha'])) : '—';
    $desc      = iconv('UTF-8','windows-1252//IGNORE', mb_strimwidth($r['descripcion'] ?? '', 0, 55, '...'));
    $saldo_txt = ($saldo >= 0 ? '+' : '') . '$' . number_format(abs($saldo),2,',','.');

    $pdf->Cell(28,6,$fecha_fmt,1,0,'C',$bg);
    $pdf->Cell(85,6,$desc,1,0,'L',$bg);
    $pdf->Cell(26,6,$debe > 0 ? '$'.number_format($debe,2,',','.') : '—',1,0,'R',$bg);
    $pdf->Cell(26,6,$haber > 0 ? '$'.number_format($haber,2,',','.') : '—',1,0,'R',$bg);
    $pdf->Cell(26,6,$saldo_txt,1,1,'R',$bg);
}

/* Totales */
$pdf->Ln(2);
$pdf->SetFont('Arial','B',9);
$pdf->SetFillColor(230,230,230);
$pdf->Cell(113,7,iconv('UTF-8','windows-1252','Totales'),1,0,'R',true);
$pdf->Cell(26,7,'$'.number_format($total_d,2,',','.'),1,0,'R',true);
$pdf->Cell(26,7,'$'.number_format($total_h,2,',','.'),1,0,'R',true);
$saldo_final = $saldo_anterior + $total_h - $total_d;
$saldo_label = ($saldo_final >= 0 ? 'Saldo a favor: $' : 'Deuda: $') . number_format(abs($saldo_final),2,',','.');
$pdf->Cell(26,7,iconv('UTF-8','windows-1252',$saldo_label),1,1,'R',true);

$pdf->Output(isset($_GET['download']) ? 'D' : 'I', 'cuenta_corriente_'.date('Ymd').'.pdf');
