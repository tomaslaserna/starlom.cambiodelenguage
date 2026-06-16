<?php
/**
 * GET /integracion/eventos.php — Feed de eventos para polling desde Make.
 *
 * Cada cambio de estado de pedido/cobro y cada alta relevante queda registrado
 * en eventos_integracion. Make guarda el último id procesado y pide:
 *
 *   GET /integracion/eventos.php?desde_id=<ultimo_id>&limite=100
 *
 * Respuesta: eventos con id > desde_id, en orden ascendente, y "ultimo_id"
 * para usar como cursor en la próxima llamada.
 *
 * Alternativa sin polling: configurar la env STARLIM_WEBHOOK_URL y el ERP
 * hace POST a esa URL en el momento de cada evento (payload idéntico).
 */

require __DIR__ . '/_auth.php';

$desde_id = max(0, (int) ($_GET['desde_id'] ?? 0));
$limite   = max(1, min(500, (int) ($_GET['limite'] ?? 100)));
$tipo     = trim($_GET['tipo'] ?? '');

$pdo = $conexion->getPDO();

$where  = ['id > ?'];
$params = [$desde_id];
if ($tipo !== '') { $where[] = 'tipo = ?'; $params[] = $tipo; }

$stmt = $pdo->prepare(
    'SELECT id, tipo, datos, creado_en FROM eventos_integracion
     WHERE ' . implode(' AND ', $where) . " ORDER BY id ASC LIMIT $limite"
);
$stmt->execute($params);

$eventos = [];
$ultimo  = $desde_id;
foreach ($stmt->fetchAll() as $fila) {
    $fila['datos'] = json_decode($fila['datos'], true);
    $eventos[]     = $fila;
    $ultimo        = (int) $fila['id'];
}

integracion_responder(200, ['ok' => true, 'cantidad' => count($eventos), 'ultimo_id' => $ultimo, 'eventos' => $eventos]);
