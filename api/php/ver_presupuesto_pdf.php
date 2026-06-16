<?php
session_start();

if (!isset($_SESSION['usuario'])) {
    header('Location: ../frontend/sign.php');
    die();
}

include 'conexion_starlim_be.php';
require_once 'presupuesto_pdf_lib.php';

$conexion->query("SET NAMES 'utf8mb4'");

$id = intval($_GET['id'] ?? 0);
if (!$id) die("ID inválido.");

$res = $conexion->query("SELECT * FROM presupuestos WHERE id = $id LIMIT 1");
$prp = $res->fetch_assoc();
if (!$prp) die("Presupuesto no encontrado.");

$cl = [
    'nombre'       => $prp['cliente_nombre'],
    'razon_social' => $prp['cliente_razon_social'],
    'domicilio'    => $prp['cliente_domicilio'],
    'telefono'     => $prp['cliente_telefono'],
    'cond_iva'     => $prp['cliente_cond_iva'],
    'cuit'         => $prp['cliente_cuit'],
];
$prods     = json_decode($prp['productos_json'], true) ?: [];
$desc_pct  = (float)$prp['descuento_pct'];
$con_iva   = (bool)(int)$prp['incluir_iva'];

// Usar las fechas originales del presupuesto
$fecha_emit = date('d/m/Y', strtotime($prp['fecha_emision']));
$fecha_vto  = date('d/m/Y', strtotime($prp['fecha_vencimiento']));

$pdf_str = buildPresupuestoPDF($cl, $prods, $desc_pct, $con_iva, $fecha_emit, $fecha_vto);

$safe = preg_replace('/[^a-zA-Z0-9_-]/', '_', $prp['cliente_nombre'] ?: 'cliente');
$filename = 'Presupuesto_' . $safe . '_' . $id . '.pdf';

header('Content-Type: application/pdf');
header('Content-Disposition: inline; filename="' . $filename . '"');
echo $pdf_str;
