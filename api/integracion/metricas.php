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

if ($tipo === 'ventas_dia') {
    $fecha = trim($_GET['fecha'] ?? $hoy);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
        integracion_responder(400, ['ok' => false, 'error' => 'fecha inválida (YYYY-MM-DD)']);
    }
    $stmt = $pdo->prepare(
        "SELECT COUNT(*) AS cantidad, COALESCE(SUM(monto), 0) AS monto_total
         FROM ventas WHERE fecha = ?"
    );
    $stmt->execute([$fecha]);
    $r = $stmt->fetch();

    $det = $pdo->prepare(
        "SELECT id, nombre_cliente, monto, estado_cobro, estado_pedido, vendedor
         FROM ventas WHERE fecha = ? ORDER BY id DESC LIMIT 50"
    );
    $det->execute([$fecha]);

    integracion_responder(200, [
        'ok' => true, 'fecha' => $fecha,
        'cantidad' => (int) $r['cantidad'],
        'monto_total' => (float) $r['monto_total'],
        'ventas' => $det->fetchAll(),
    ]);
}

/* ── tipo=resumen ── */
$resumen = [];

$r = $pdo->prepare("SELECT COUNT(*) c, COALESCE(SUM(monto),0) m FROM ventas WHERE fecha = ? AND COALESCE(estado_pedido,'entregado') = 'entregado'");
$r->execute([$hoy]);
$f = $r->fetch();
$resumen['ventas_hoy'] = ['cantidad' => (int) $f['c'], 'monto' => (float) $f['m']];

$f = $pdo->query(
    "SELECT COUNT(*) c FROM ventas WHERE estado_pedido IN ('recibido', 'en_proceso', 'pendiente_entrega')"
)->fetch();
$resumen['pedidos_pendientes'] = (int) $f['c'];

$f = $pdo->query(
    "SELECT COUNT(*) c, COALESCE(SUM(monto),0) m FROM ventas
     WHERE estado_cobro IN ('pendiente', 'en_proceso', 'vencido')
       AND COALESCE(estado_pedido,'entregado') = 'entregado'"
)->fetch();
$resumen['cobros_pendientes'] = ['cantidad' => (int) $f['c'], 'monto' => (float) $f['m']];

$f = $pdo->query("SELECT COUNT(*) c FROM productos WHERE stock <= 5")->fetch();
$resumen['productos_stock_bajo'] = (int) $f['c'];

$f = $pdo->query("SELECT COUNT(*) c FROM presupuestos WHERE estado = 'pendiente'")->fetch();
$resumen['presupuestos_pendientes'] = (int) $f['c'];

integracion_responder(200, ['ok' => true, 'fecha' => $hoy, 'resumen' => $resumen]);
