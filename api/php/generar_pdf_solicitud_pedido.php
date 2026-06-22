<?php
require_once __DIR__ . '/session_bootstrap.php';
starlim_session_start();

if (!isset($_SESSION['usuario'])) {
    header('Location: ../frontend/sign.php');
    exit;
}

require_once __DIR__ . '/conexion_starlim_be.php';
require_once __DIR__ . '/comprobante_pdf_lib.php';

$empresaId = starlim_bootstrap_tenant_context($conexion);
$id_venta = (int)($_GET['id_venta'] ?? 0);
$todos = !empty($_GET['todos']);

$ids = [];
if ($todos) {
    $where_todos = ($_GET['todos'] ?? '') === 'entregados'
        ? "estado_pedido = 'entregado'"
        : "estado_pedido IN ('recibido','en_proceso','pendiente_entrega')";
    $rv = $conexion->query(
        "SELECT id FROM ventas
         WHERE empresa_id = $empresaId AND $where_todos
         ORDER BY creado_en ASC, id ASC"
    );
    if ($rv) while ($row = $rv->fetch_assoc()) $ids[] = (int)$row['id'];
} elseif ($id_venta > 0) {
    $ids[] = $id_venta;
}

if (empty($ids)) die('Error: no hay pedidos para imprimir.');

$estados = [
    'recibido' => 'Recibido',
    'en_proceso' => 'En proceso',
    'pendiente_entrega' => 'Pendiente de entrega',
    'entregado' => 'Entregado',
];

function sp_fecha(?string $fecha, string $fallback = '-'): string {
    if (!$fecha) return $fallback;
    $ts = strtotime($fecha);
    return $ts ? date('d/m/Y', $ts) : $fallback;
}

function sp_short(string $text, int $width): string {
    return mb_strimwidth(trim($text), 0, $width, '...', 'UTF-8');
}

$pdf = new ComprobantePDF('P', 'mm', 'A4');
$pdf->SetMargins(15, 14, 15);
$pdf->SetAutoPageBreak(true, 22);

$headers = ['Codigo', 'Descripcion', 'Solic.', 'Disp.', 'Falta', 'Control'];
$widths = [24, 70, 21, 21, 21, 23];
$aligns = ['L', 'L', 'C', 'C', 'C', 'C'];

foreach ($ids as $vid) {
    $res = $conexion->query("SELECT * FROM ventas WHERE id = $vid AND empresa_id = $empresaId LIMIT 1");
    $venta = $res ? $res->fetch_assoc() : null;
    if (!$venta) continue;

    $det_res = $conexion->query(
        "SELECT dv.id_producto,
                COALESCE(dv.nombre_producto, p.nombre, '(producto eliminado)') AS nombre,
                dv.cantidad,
                GREATEST(0, COALESCE(p.stock, 0) - COALESCE(reservado.reservado, 0)) AS disponible_para_pedido
         FROM detalle_ventas dv
         LEFT JOIN productos p ON p.id = dv.id_producto AND p.empresa_id = dv.empresa_id
         LEFT JOIN (
             SELECT dv2.id_producto, SUM(dv2.cantidad) AS reservado
             FROM detalle_ventas dv2
             JOIN ventas v2 ON v2.id = dv2.id_venta AND v2.empresa_id = dv2.empresa_id
             WHERE v2.id <> $vid
               AND v2.empresa_id = $empresaId
               AND dv2.empresa_id = $empresaId
               AND v2.estado_pedido IN ('recibido','en_proceso','pendiente_entrega')
               AND COALESCE(v2.stock_descontado, 0) = 0
             GROUP BY dv2.id_producto
         ) reservado ON reservado.id_producto = dv.id_producto
         WHERE dv.id_venta = $vid AND dv.empresa_id = $empresaId
         ORDER BY dv.id ASC"
    );

    $cliente = [];
    $docNorm = preg_replace('/\D+/', '', (string)($venta['dni_cliente'] ?? ''));
    if ($docNorm !== '') {
        $cli_stmt = $conexion->prepare(
            "SELECT * FROM clientes
             WHERE empresa_id = ? AND REPLACE(REPLACE(nro_id, '-', ''), ' ', '') = ?
             LIMIT 1"
        );
        $cli_stmt->bind_param('is', $empresaId, $docNorm);
        $cli_stmt->execute();
        $cliente = $cli_stmt->get_result()->fetch_assoc() ?: [];
        $cli_stmt->close();
    }

    $pdf->AddPage();
    $fecha = sp_fecha($venta['fecha'] ?? null, date('d/m/Y'));
    $estado = $estados[$venta['estado_pedido'] ?? ''] ?? (string)($venta['estado_pedido'] ?? '-');
    $nroBase = (int)($venta['nro_comprobante'] ?? 0) > 0 ? (int)$venta['nro_comprobante'] : $vid;
    $nro = 'SP-' . str_pad((string)$nroBase, 8, '0', STR_PAD_LEFT);
    $deposito = trim((string)($venta['deposito'] ?? ''));

    $y_linea = cabecera_comprobante(
        $pdf,
        'SOLICITUD DE PEDIDO',
        'SP',
        $nro,
        $fecha,
        array_filter(['Documento interno', 'Estado: ' . $estado, $deposito !== '' ? 'Deposito: ' . $deposito : ''])
    );

    $clienteNombre = (string)($venta['nombre_cliente'] ?: ($cliente['nombre_cliente'] ?? '-'));
    $domicilio = trim((string)($cliente['domicilio'] ?? ''));
    $localidad = trim(($cliente['ciudad'] ?? '') . ', ' . ($cliente['provincia'] ?? ''), ', ');
    $vendedor = (string)($venta['vendedor'] ?: ($cliente['vendedor_cl'] ?? '-'));

    $pdf->SetY($y_linea + 8);
    starlim_pdf_section_title($pdf, 'Datos del pedido', 15);
    $pdf->SetXY(15, $pdf->GetY() + 1);
    starlim_pdf_key_value($pdf, 'Solicitante', $vendedor, 24, 62);
    $pdf->SetXY(108, $pdf->GetY());
    starlim_pdf_key_value($pdf, 'Destino', $clienteNombre, 18, 66);
    $pdf->Ln(6);
    $pdf->SetX(15);
    starlim_pdf_key_value($pdf, 'Ingreso', sp_fecha($venta['creado_en'] ?? null), 24, 62);
    $pdf->SetXY(108, $pdf->GetY());
    starlim_pdf_key_value($pdf, 'Prioridad', 'Normal', 18, 66);
    $pdf->Ln(7);

    $entrega = trim($domicilio . ($localidad !== '' ? ' - ' . $localidad : ''));
    if ($entrega !== '') {
        $pdf->SetFont('Arial', '', 8.5);
        starlim_pdf_set_text($pdf, 'muted');
        $pdf->MultiCell(180, 4.8, p('Entrega: ' . $entrega), 0, 'L');
        $pdf->Ln(4);
    }

    starlim_pdf_table_header($pdf, $headers, $widths, $aligns);
    $pdf->SetFont('Arial', '', 8.7);
    $hay_items = false;

    if ($det_res) while ($det = $det_res->fetch_assoc()) {
        $hay_items = true;
        $pedido = (float)($det['cantidad'] ?? 0);
        $disponible = (float)($det['disponible_para_pedido'] ?? 0);
        $falta = max(0, $pedido - $disponible);
        $nombre = (string)($det['nombre'] ?? '');
        $rowH = max(9, (int)ceil($pdf->GetStringWidth(p($nombre)) / 66) * 5.2);

        if ($pdf->GetY() + $rowH > 252) {
            $pdf->AddPage();
            starlim_pdf_table_header($pdf, $headers, $widths, $aligns);
            $pdf->SetFont('Arial', '', 8.7);
        }

        $x = 15;
        $y = $pdf->GetY();
        $pdf->SetDrawColor(236, 239, 237);

        starlim_pdf_set_text($pdf, 'soft');
        $pdf->SetXY($x, $y);
        $pdf->Cell($widths[0], $rowH, p((string)($det['id_producto'] ?? '-')), 0, 0, 'L');
        $x += $widths[0];

        starlim_pdf_set_text($pdf, 'body');
        $pdf->SetXY($x, $y + 1.2);
        $pdf->MultiCell($widths[1] - 2, 5, p(sp_short($nombre, 92)), 0, 'L');
        $x += $widths[1];

        $qtyS = number_format($pedido, $pedido == (int)$pedido ? 0 : 2, ',', '.');
        $dispS = number_format($disponible, $disponible == (int)$disponible ? 0 : 2, ',', '.');
        $faltaS = number_format($falta, $falta == (int)$falta ? 0 : 2, ',', '.');
        $pdf->SetXY($x, $y);
        $pdf->Cell($widths[2], $rowH, $qtyS, 0, 0, 'C');
        $x += $widths[2];
        $pdf->SetXY($x, $y);
        $pdf->Cell($widths[3], $rowH, $dispS, 0, 0, 'C');
        $x += $widths[3];
        $pdf->SetXY($x, $y);
        starlim_pdf_set_text($pdf, $falta > 0 ? 'danger' : 'muted');
        $pdf->Cell($widths[4], $rowH, $faltaS, 0, 0, 'C');
        $x += $widths[4];
        $pdf->SetXY($x, $y);
        starlim_pdf_set_text($pdf, 'soft');
        $pdf->Cell($widths[5], $rowH, '____', 0, 0, 'C');

        $pdf->Line(15, $y + $rowH, 195, $y + $rowH);
        $pdf->SetY($y + $rowH);
    }

    if (!$hay_items) {
        $pdf->SetFont('Arial', 'I', 9);
        starlim_pdf_set_text($pdf, 'muted');
        $pdf->Cell(180, 9, p('Sin detalle de productos'), 0, 1, 'C');
    }

    $obs = trim((string)($venta['observacion'] ?? ''));
    $boxY = $pdf->GetY() + 8;
    if ($boxY + 34 > 260) {
        $pdf->AddPage();
        $boxY = 22;
    }
    $pdf->SetDrawColor(227, 231, 228);
    $pdf->RoundedRect(15, $boxY, 180, 28, 2, 'D');
    $pdf->SetXY(19, $boxY + 4);
    starlim_pdf_section_title($pdf, 'Observaciones de deposito', 19);
    $pdf->SetXY(19, $boxY + 10);
    $pdf->SetFont('Arial', '', 8.3);
    starlim_pdf_set_text($pdf, 'muted');
    $textoObs = $obs !== ''
        ? $obs
        : 'Completar la columna Control durante el armado. Anotar faltantes o diferencias de stock antes del despacho.';
    $pdf->MultiCell(172, 4.6, p($textoObs), 0, 'L');

    $sigY = $boxY + 50;
    if ($sigY > 270) {
        $pdf->AddPage();
        $sigY = 58;
    }
    starlim_pdf_signature_trio($pdf, ['Solicito', 'Preparo deposito', 'Controlo'], $sigY);
}

$nombre_archivo = $todos
    ? 'Solicitudes_pedido.pdf'
    : 'Solicitud_pedido_' . str_pad((string)$id_venta, 8, '0', STR_PAD_LEFT) . '.pdf';
$modo = isset($_GET['view']) ? 'I' : 'D';
$pdf->Output($modo, $nombre_archivo);
