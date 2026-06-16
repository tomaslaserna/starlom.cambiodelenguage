<?php
/**
 * generar_pdf_solicitud_pedido.php — Comprobante de SOLICITUD DE PEDIDO para
 * que depósito imprima y controle contra stock qué pide el cliente.
 *
 * Uso:
 *   ?id_venta=N           → un pedido
 *   ?todos=1              → todos los pedidos en curso (uno por página)
 *   &view=1              → abre en el navegador (si no, descarga)
 *
 * No lleva importes: es un documento de control de depósito.
 */
session_start();

if (!isset($_SESSION['usuario'])) {
    header('Location: ../frontend/sign.php');
    die();
}

include 'conexion_starlim_be.php';
require_once 'comprobante_pdf_lib.php';

$id_venta = intval($_GET['id_venta'] ?? 0);
$todos    = !empty($_GET['todos']);

/* ── IDs a imprimir ─────────────────────────────────────────────── */
$ids = [];
if ($todos) {
    $where_todos = ($_GET['todos'] ?? '') === 'entregados'
        ? "estado_pedido = 'entregado'"
        : "estado_pedido IN ('recibido','en_proceso','pendiente_entrega')";
    $rv = $conexion->query(
        "SELECT id FROM ventas
         WHERE $where_todos
         ORDER BY creado_en ASC, id ASC"
    );
    if ($rv) while ($row = $rv->fetch_assoc()) $ids[] = (int)$row['id'];
} elseif ($id_venta > 0) {
    $ids[] = $id_venta;
}
if (empty($ids)) die('Error: no hay pedidos para imprimir.');

$ESTADOS = [
    'recibido'          => 'Recibido',
    'en_proceso'        => 'En proceso',
    'pendiente_entrega' => 'Pendiente de entrega',
    'entregado'         => 'Entregado',
];

/* ── PDF ────────────────────────────────────────────────────────── */
$pdf = new ComprobantePDF('P', 'mm', 'A4');
$pdf->SetMargins(10, 10, 10);
$pdf->SetAutoPageBreak(true, 20);
$pdf->SetDrawColor(0, 0, 0);
$pdf->SetLineWidth(0.2);

// Anchos de columna (suma = 190 mm)
$cw = [18, 87, 18, 17, 17, 33];
$ch = 6;

$thead = function () use ($pdf, $cw, $ch) {
    $pdf->SetFont('Arial', 'B', 9);
    $pdf->SetFillColor(230, 230, 230);
    $pdf->SetTextColor(0, 0, 0);
    $pdf->Cell($cw[0], $ch + 1, 'Codigo',      1, 0, 'C', true);
    $pdf->Cell($cw[1], $ch + 1, 'Producto',    1, 0, 'C', true);
    $pdf->Cell($cw[2], $ch + 1, 'Cant.',       1, 0, 'C', true);
    $pdf->Cell($cw[3], $ch + 1, 'Tiene',       1, 0, 'C', true);
    $pdf->Cell($cw[4], $ch + 1, 'Falta',       1, 0, 'C', true);
    $pdf->Cell($cw[5], $ch + 1, 'Observacion', 1, 1, 'C', true);
    $pdf->SetFont('Arial', '', 9);
    $pdf->SetFillColor(255, 255, 255);
};

foreach ($ids as $vid) {

    $res   = $conexion->query("SELECT * FROM ventas WHERE id = $vid LIMIT 1");
    $venta = $res ? $res->fetch_assoc() : null;
    if (!$venta) continue;

    $det_res = $conexion->query(
        "SELECT dv.id_producto AS codigo,
                COALESCE(dv.nombre_producto, p.nombre, '(producto eliminado)') AS nombre,
                dv.cantidad
         FROM detalle_ventas dv
         LEFT JOIN productos p ON p.id = dv.id_producto
         WHERE dv.id_venta = $vid
         ORDER BY dv.id ASC"
    );

    // Cliente por DNI/CUIT (igual que el remito)
    $cliente = [];
    if (!empty($venta['dni_cliente'])) {
        $cli_stmt = $conexion->prepare(
            "SELECT * FROM clientes WHERE REPLACE(REPLACE(nro_id, '-', ''), ' ', '') = ? LIMIT 1"
        );
        $dni_val = $venta['dni_cliente'];
        $cli_stmt->bind_param('s', $dni_val);
        $cli_stmt->execute();
        $cliente = $cli_stmt->get_result()->fetch_assoc() ?: [];
    }

    $pdf->AddPage();

    $nro   = str_pad((string)((int)($venta['nro_comprobante'] ?? 0) ?: $vid), 8, '0', STR_PAD_LEFT);
    $fecha = !empty($venta['fecha']) ? date('d/m/Y', strtotime($venta['fecha'])) : date('d/m/Y');

    $extra = [];
    $estado_lbl = $ESTADOS[$venta['estado_pedido'] ?? ''] ?? ($venta['estado_pedido'] ?? '');
    if ($estado_lbl !== '') $extra[] = 'Estado: ' . $estado_lbl;
    if (!empty($venta['deposito'])) $extra[] = 'Deposito: ' . $venta['deposito'];

    $y0 = cabecera_comprobante($pdf, 'SOLICITUD DE PEDIDO', 'P', $nro, $fecha, $extra) + 3;

    /* ── Datos de cliente / pedido ──────────────────────────────── */
    $localidad = trim(($cliente['ciudad'] ?? '') . ', ' . ($cliente['provincia'] ?? ''), ', ');

    $izq = [
        ['Cliente:',   p($venta['nombre_cliente'] ?: ($cliente['nombre_cliente'] ?? '-'))],
        ['DNI/CUIT:',  p(trim(($cliente['tipo_id'] ?? '') . ': ' . ($cliente['nro_id'] ?? $venta['dni_cliente'] ?? '-'), ': '))],
        ['Direccion:', p($cliente['domicilio'] ?? '-')],
        ['Localidad:', p($localidad ?: '-')],
    ];
    if (!empty($cliente['nombre_sucursal'])) {
        $izq[] = ['Sucursal:', p($cliente['nombre_sucursal'])];
    }
    $der = [
        ['Cond. pago:', p($venta['condicion_pago'] ?? '-')],
        ['Vendedor:',  p($venta['vendedor'] ?: ($cliente['vendedor_cl'] ?? '-'))],
        ['Ingreso:',   !empty($venta['creado_en']) ? date('d/m/Y', strtotime($venta['creado_en'])) : '-'],
    ];

    $y_izq = $y0;
    foreach ($izq as [$lbl, $val]) {
        $pdf->SetXY(10, $y_izq);
        $pdf->SetFont('Arial', '', 8);  $pdf->SetTextColor(80, 80, 80); $pdf->Cell(30, 5, $lbl, 0, 0, 'L');
        $pdf->SetFont('Arial', 'B', 8); $pdf->SetTextColor(0, 0, 0);    $pdf->Cell(63, 5, $val, 0, 0, 'L');
        $y_izq += 5;
    }
    $y_der = $y0;
    foreach ($der as [$lbl, $val]) {
        $pdf->SetXY(107, $y_der);
        $pdf->SetFont('Arial', '', 8);  $pdf->SetTextColor(80, 80, 80); $pdf->Cell(28, 5, $lbl, 0, 0, 'L');
        $pdf->SetFont('Arial', 'B', 8); $pdf->SetTextColor(0, 0, 0);    $pdf->Cell(65, 5, $val, 0, 0, 'L');
        $y_der += 5;
    }

    $y_tabla = max($y_izq, $y_der) + 4;
    $pdf->SetDrawColor(180, 180, 180);
    $pdf->Line(10, $y_tabla - 2, 200, $y_tabla - 2);
    $pdf->SetDrawColor(0, 0, 0);

    /* ── Tabla de productos (con columnas de control) ───────────── */
    $pdf->SetXY(10, $y_tabla);
    $thead();

    $hay_items = false;
    if ($det_res) while ($det = $det_res->fetch_assoc()) {
        $hay_items = true;
        $nombre  = p($det['nombre']);
        $n_lines = max(1, ceil($pdf->GetStringWidth($nombre) / ($cw[1] - 3)));
        $row_h   = max(8, $n_lines * $ch);

        if ($pdf->GetY() + $row_h > $pdf->GetPageHeight() - 40) {
            $pdf->AddPage();
            $pdf->SetXY(10, 15);
            $thead();
        }

        $x = 10;
        $y = $pdf->GetY();

        // Bordes de toda la fila (grilla para tildar)
        $pdf->SetXY($x, $y);
        foreach ($cw as $w) $pdf->Cell($w, $row_h, '', 1, 0, 'C');
        $pdf->Ln();

        // Texto encima
        $pdf->SetXY($x, $y);
        $pdf->Cell($cw[0], $row_h, (string)$det['codigo'], 0, 0, 'C');
        $pdf->SetXY($x + $cw[0], $y + ($row_h - $n_lines * $ch) / 2);
        $pdf->MultiCell($cw[1], $ch, $nombre, 0, 'L');
        $pdf->SetXY($x + $cw[0] + $cw[1], $y);
        $pdf->Cell($cw[2], $row_h, (string)(int)$det['cantidad'], 0, 0, 'C');

        $pdf->SetXY(10, $y + $row_h);
    }
    if (!$hay_items) {
        $pdf->SetFont('Arial', 'I', 9);
        $pdf->Cell(array_sum($cw), 8, p('Sin detalle de productos'), 1, 1, 'C');
        $pdf->SetFont('Arial', '', 9);
    }

    /* ── Observaciones ──────────────────────────────────────────── */
    $y_obs = $pdf->GetY() + 6;
    if ($y_obs + 24 > $pdf->GetPageHeight() - 30) { $pdf->AddPage(); $y_obs = 15; }
    $pdf->SetDrawColor(0, 0, 0);
    $pdf->SetLineWidth(0.3);
    $pdf->RoundedRect(10, $y_obs, 190, 22, 3);
    $pdf->SetFont('Arial', 'B', 8);
    $pdf->SetXY(10, $y_obs + 1);
    $pdf->Cell(190, 6, 'OBSERVACIONES', 0, 1, 'C');
    $pdf->Line(10, $y_obs + 7, 200, $y_obs + 7);
    $pdf->SetFont('Arial', '', 8);
    $pdf->SetXY(11, $y_obs + 8);
    $pdf->MultiCell(188, 5, p($venta['observacion'] ?? ''), 0, 'L');

    /* ── Firmas: armó / controló ────────────────────────────────── */
    $y_firma = $y_obs + 22 + 14;
    if ($y_firma > $pdf->GetPageHeight() - 18) { $pdf->AddPage(); $y_firma = 40; }
    $pdf->SetDrawColor(180, 180, 180);
    $pdf->SetLineWidth(0.3);
    $pdf->Line(10,  $y_firma, 90,  $y_firma);
    $pdf->Line(120, $y_firma, 200, $y_firma);
    $pdf->SetFont('Arial', '', 7);
    $pdf->SetTextColor(100, 100, 100);
    $pdf->SetXY(10, $y_firma + 1);
    $pdf->Cell(80, 4, 'Armo el pedido', 0, 0, 'C');
    $pdf->SetXY(120, $y_firma + 1);
    $pdf->Cell(80, 4, 'Controlo', 0, 0, 'C');
}

/* ── Salida ─────────────────────────────────────────────────────── */
$nombre_archivo = $todos
    ? 'Solicitudes_pedido.pdf'
    : 'Solicitud_pedido_' . str_pad((string)$id_venta, 8, '0', STR_PAD_LEFT) . '.pdf';
$modo = isset($_GET['view']) ? 'I' : 'D';
$pdf->Output($modo, $nombre_archivo);
