<?php
/**
 * GET /integracion/pedidos.php — Pedidos (ventas) con su estado de ciclo de vida.
 *
 * Estados reales del sistema (campo estado_pedido):
 *   recibido | en_proceso | pendiente_entrega | entregado
 *   (recibido = pedido ingresado; entregado = venta concretada)
 *
 * Parámetros (query string):
 *   estado   filtrar por estado_pedido
 *   desde    fecha mínima (YYYY-MM-DD)
 *   id       un pedido puntual
 *   fuente   "ventas" (default) | "remitos"
 *   limite   máx. filas (default 100, tope 500)
 *
 * Devuelve teléfono del cliente (join por CUIT/DNI) para el bot de WhatsApp.
 */

require __DIR__ . '/_auth.php';

$estado = trim($_GET['estado'] ?? '');
$desde  = trim($_GET['desde']  ?? '');
$id     = (int) ($_GET['id'] ?? 0);
$fuente = ($_GET['fuente'] ?? 'ventas') === 'remitos' ? 'remitos' : 'ventas';
$limite = max(1, min(500, (int) ($_GET['limite'] ?? 100)));

$estados_validos = ['recibido', 'en_proceso', 'pendiente_entrega', 'entregado'];
if ($estado !== '' && !in_array($estado, $estados_validos, true)) {
    integracion_responder(400, ['ok' => false, 'error' => 'estado inválido', 'validos' => $estados_validos]);
}

$pdo = $conexion->getPDO();
$empresa_id = (int)($GLOBALS['STARLIM_EMPRESA_ID'] ?? 1);

$where  = ['t.empresa_id = ?'];
$params = [$empresa_id];
if ($id > 0)       { $where[] = 't.id = ?';            $params[] = $id; }
if ($estado !== ''){ $where[] = 't.estado_pedido = ?'; $params[] = $estado; }
if ($desde !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $desde)) {
    $where[] = 't.fecha >= ?'; $params[] = $desde;
}
$where_sql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

if ($fuente === 'ventas') {
    $sql = "SELECT t.id, t.fecha, t.nombre_cliente, t.dni_cliente,
                   t.monto, t.estado_pedido, t.estado_cobro, t.seguimiento,
                   t.tipo_cbte, t.nro_comprobante, t.vendedor,
                   c.telefono AS telefono_cliente, c.nombre_cliente AS cliente_registrado
            FROM ventas t
            LEFT JOIN clientes c ON c.empresa_id = t.empresa_id AND c.nro_id = t.dni_cliente AND c.nro_id <> ''
            $where_sql
            ORDER BY t.id DESC
            LIMIT $limite";
} else {
    $sql = "SELECT t.id, t.id_venta, t.nro_remito, t.fecha, t.nombre_cliente, t.dni_cliente,
                   t.monto, t.estado_pedido, t.vendedor, t.provincia, t.sucursal_cliente,
                   c.telefono AS telefono_cliente
            FROM remitos t
            LEFT JOIN clientes c ON c.empresa_id = t.empresa_id AND c.nro_id = t.dni_cliente AND c.nro_id <> ''
            $where_sql
            ORDER BY t.id DESC
            LIMIT $limite";
}

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$filas = $stmt->fetchAll();

integracion_responder(200, ['ok' => true, 'fuente' => $fuente, 'cantidad' => count($filas), 'pedidos' => $filas]);
