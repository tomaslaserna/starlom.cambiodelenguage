<?php
/**
 * GET /integracion/metricas.php — Métricas del negocio (bot administrativo).
 *
 * Parámetros:
 *   tipo    "resumen" (default) | "ventas_dia"
 *   fecha   para ventas_dia (YYYY-MM-DD, default hoy en Argentina)
 *
 * "resumen" devuelve en una sola llamada lo que el bot admin necesita para
 * responder "ventas hoy", "pedidos pendientes", "cobros pendientes".
 */

require __DIR__ . '/_auth.php';

$tz   = new DateTimeZone('America/Argentina/Buenos_Aires');
$hoy  = (new DateTime('now', $tz))->format('Y-m-d');
$tipo = $_GET['tipo'] ?? 'resumen';

$pdo = $conexion->getPDO();
$empresa_id = (int)($GLOBALS['STARLIM_EMPRESA_ID'] ?? 1);

if ($tipo === 'ventas_dia') {
    $fecha = trim($_GET['fecha'] ?? $hoy);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
        integracion_responder(400, ['ok' => false, 'error' => 'fecha inválida (YYYY-MM-DD)']);
    }
    $stmt = $pdo->prepare(
        "SELECT COUNT(*) AS cantidad, COALESCE(SUM(monto), 0) AS monto_total
         FROM ventas WHERE empresa_id = ? AND fecha = ?"
    );
    $stmt->execute([$empresa_id, $fecha]);
    $r = $stmt->fetch();

    $det = $pdo->prepare(
        "SELECT id, nombre_cliente, monto, estado_cobro, estado_pedido, vendedor
         FROM ventas WHERE empresa_id = ? AND fecha = ? ORDER BY id DESC LIMIT 50"
    );
    $det->execute([$empresa_id, $fecha]);

    integracion_responder(200, [
        'ok' => true, 'fecha' => $fecha,
        'cantidad' => (int) $r['cantidad'],
        'monto_total' => (float) $r['monto_total'],
        'ventas' => $det->fetchAll(),
    ]);
}

/* ── tipo=resumen ── */
$resumen = [];

$r = $pdo->prepare("SELECT COUNT(*) c, COALESCE(SUM(monto),0) m FROM ventas WHERE empresa_id = ? AND fecha = ? AND COALESCE(estado_pedido,'entregado') = 'entregado'");
$r->execute([$empresa_id, $hoy]);
$f = $r->fetch();
$resumen['ventas_hoy'] = ['cantidad' => (int) $f['c'], 'monto' => (float) $f['m']];

$stmt = $pdo->prepare(
    "SELECT COUNT(*) c FROM ventas WHERE empresa_id = ? AND estado_pedido IN ('recibido', 'en_proceso', 'pendiente_entrega')"
);
$stmt->execute([$empresa_id]);
$f = $stmt->fetch();
$resumen['pedidos_pendientes'] = (int) $f['c'];

$stmt = $pdo->prepare(
    "SELECT COUNT(*) c, COALESCE(SUM(monto),0) m FROM ventas
     WHERE empresa_id = ?
       AND estado_cobro IN ('pendiente', 'en_proceso', 'pendiente_aprobacion', 'vencido')
       AND COALESCE(estado_pedido,'entregado') = 'entregado'"
);
$stmt->execute([$empresa_id]);
$f = $stmt->fetch();
$resumen['cobros_pendientes'] = ['cantidad' => (int) $f['c'], 'monto' => (float) $f['m']];

$stmt = $pdo->prepare("SELECT COUNT(*) c FROM productos WHERE empresa_id = ? AND stock <= 5");
$stmt->execute([$empresa_id]);
$f = $stmt->fetch();
$resumen['productos_stock_bajo'] = (int) $f['c'];

$stmt = $pdo->prepare("SELECT COUNT(*) c FROM presupuestos WHERE empresa_id = ? AND estado = 'pendiente'");
$stmt->execute([$empresa_id]);
$f = $stmt->fetch();
$resumen['presupuestos_pendientes'] = (int) $f['c'];

integracion_responder(200, ['ok' => true, 'fecha' => $hoy, 'resumen' => $resumen]);
