<?php
/**
 * resolver_solicitud_factura.php — Jefe1/Admin aprueba o rechaza una solicitud
 * de factura. Al aprobar, emite la factura por ARCA (homologación o producción
 * según AFIP_PRODUCTION) y estampa CAE/nro en la venta.
 *
 * Se puede invocar:
 *   - como endpoint POST (accion=aprobar|rechazar, id_solicitud, motivo)
 *   - como función starlim_resolver_solicitud() desde solicitar_factura.php
 */
if (!function_exists('starlim_resolver_solicitud')) {

function starlim_resolver_solicitud($conexion, int $id_sol, string $accion, string $usuario, string $motivo): array {
    $st = $conexion->prepare(
        "SELECT sf.id, sf.id_venta, sf.tipo_cbte, sf.estado,
                v.dni_cliente, v.monto, v.fecha, COALESCE(v.cae,'') AS cae,
                COALESCE(v.estado_pedido,'entregado') AS estado_pedido
         FROM solicitudes_factura sf JOIN ventas v ON v.id = sf.id_venta
         WHERE sf.id = ?"
    );
    $st->bind_param('i', $id_sol);
    $st->execute();
    $sol = $st->get_result()->fetch_assoc();
    $st->close();

    if (!$sol)                            return ['ok' => false, 'error' => 'Solicitud no encontrada'];
    if ($sol['estado'] !== 'pendiente')   return ['ok' => false, 'error' => 'La solicitud ya fue ' . $sol['estado'] . '.'];

    /* ── Rechazar ─────────────────────────────────────────────────────── */
    if ($accion === 'rechazar') {
        $st = $conexion->prepare(
            "UPDATE solicitudes_factura SET estado='rechazada', resuelto_por=?, motivo_rechazo=?, resuelto_en=CURRENT_TIMESTAMP WHERE id=?"
        );
        $st->bind_param('ssi', $usuario, $motivo, $id_sol);
        $st->execute(); $st->close();
        return ['ok' => true, 'estado' => 'rechazada'];
    }

    /* ── Aprobar → emitir factura por ARCA ────────────────────────────── */
    if ($sol['cae'] !== '') return ['ok' => false, 'error' => 'La venta ya tiene factura.'];

    $tipo_cbte = (int)$sol['tipo_cbte'];
    $tipo_doc  = ($tipo_cbte === 1) ? 80 : 96;             // 80 = CUIT, 96 = DNI
    $monto_tot = (float)$sol['monto'];
    $nro_doc   = preg_replace('/[^0-9]/', '', (string)$sol['dni_cliente']);
    if ($nro_doc === '') { $nro_doc = '0'; $tipo_doc = 99; }  // consumidor final

    // Factura A: discriminar neto/IVA (la venta guarda el total con IVA incluido).
    // Factura B: emitirFacturaARCA discrimina internamente, mandamos total.
    if ($tipo_cbte === 1) {
        $monto_neto = round($monto_tot / 1.21, 2);
        $monto_iva  = round($monto_tot - $monto_neto, 2);
    } else {
        $monto_neto = $monto_tot;
        $monto_iva  = 0.0;
    }

    require_once __DIR__ . '/../facturacion/generar_factura.php';
    $r = emitirFacturaARCA($nro_doc, $monto_neto, $monto_iva, $monto_tot, $tipo_cbte, $tipo_doc, (string)$sol['fecha']);

    if (empty($r['success'])) {
        return ['ok' => false, 'error' => 'ARCA: ' . ($r['error'] ?? 'error desconocido')];
    }

    $cae = $r['CAE']; $vto = $r['vencimiento']; $nro = (int)$r['comprobante'];
    $upd = $conexion->prepare(
        "UPDATE ventas SET tipo_cbte=?, cae=?, vencimiento_cae=?, nro_comprobante=?, seguimiento='facturada' WHERE id=?"
    );
    $idv = (int)$sol['id_venta'];
    $upd->bind_param('issii', $tipo_cbte, $cae, $vto, $nro, $idv);
    $upd->execute(); $upd->close();

    $st = $conexion->prepare(
        "UPDATE solicitudes_factura SET estado='aprobada', resuelto_por=?, resuelto_en=CURRENT_TIMESTAMP WHERE id=?"
    );
    $st->bind_param('si', $usuario, $id_sol);
    $st->execute(); $st->close();

    require_once __DIR__ . '/integracion_eventos.php';
    starlim_evento_registrar($conexion, 'venta.facturada', [
        'id' => $idv, 'tipo_cbte' => $tipo_cbte, 'nro_comprobante' => $nro, 'cae' => $cae,
    ]);

    return ['ok' => true, 'estado' => 'aprobada', 'cae' => $cae, 'nro_comprobante' => $nro, 'id_venta' => $idv];
}

}

// ── Modo endpoint ────────────────────────────────────────────────────────
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) {
    session_start();
    if (!isset($_SESSION['usuario'])) { http_response_code(403); die(); }
    include 'conexion_starlim_be.php';
    require_once 'auth.php';
    header('Content-Type: application/json; charset=utf-8');

    $rango = starlim_normalizar_rango($_SESSION['rango'] ?? '');
    if (!in_array($rango, ['Jefe1', 'Admin'], true)) {
        echo json_encode(['ok' => false, 'error' => 'Solo Jefe1/Admin pueden resolver solicitudes.']); exit;
    }

    $accion = trim($_POST['accion'] ?? '');
    $id_sol = (int)($_POST['id_solicitud'] ?? 0);
    $motivo = trim($_POST['motivo'] ?? '');
    if (!in_array($accion, ['aprobar', 'rechazar'], true) || $id_sol <= 0) {
        echo json_encode(['ok' => false, 'error' => 'Datos inválidos']); exit;
    }

    echo json_encode(starlim_resolver_solicitud($conexion, $id_sol, $accion, $_SESSION['usuario'], $motivo));
}
