<?php
require_once __DIR__ . '/session_bootstrap.php';
/**
 * crear_reparto.php — Arma una ruta de reparto desde Pedidos.
 *
 * Recibe los pedidos seleccionados (deben estar 'pendiente_entrega') y un
 * repartidor (empleado). Registra el reparto, arma el mensaje de WhatsApp con
 * la lista de entregas (cliente, dirección, observación) y devuelve un link
 * wa.me listo para enviar, además de emitir el evento reparto.asignado.
 */
starlim_session_start();
if (!isset($_SESSION['usuario'])) { http_response_code(403); die(); }

include 'conexion_starlim_be.php';
require_once 'auth.php';
require_once __DIR__ . '/tenant.php';
header('Content-Type: application/json; charset=utf-8');
$empresa_id = starlim_bootstrap_tenant_context($conexion);

$usuario = $_SESSION['usuario'];
$rango   = starlim_normalizar_rango($_SESSION['rango'] ?? '');
if (!in_array($rango, STARLIM_RANGOS_STAFF, true)) {
    echo json_encode(['ok' => false, 'error' => 'Sin permiso']); exit;
}

$id_repartidor = (int)($_POST['id_repartidor'] ?? 0);
$ids           = array_values(array_unique(array_filter(array_map('intval', explode(',', $_POST['ids'] ?? '')))));

if ($id_repartidor <= 0) { echo json_encode(['ok' => false, 'error' => 'Elegí un repartidor']); exit; }
if (empty($ids))         { echo json_encode(['ok' => false, 'error' => 'Seleccioná al menos un pedido']); exit; }

// Repartidor (empleado con teléfono)
$st = $conexion->prepare("SELECT nombre_completo, COALESCE(telefono,'') AS telefono FROM usuarios WHERE id = ?");
$st->bind_param('i', $id_repartidor);
$st->execute();
$rep = $st->get_result()->fetch_assoc();
$st->close();
if (!$rep)                          { echo json_encode(['ok' => false, 'error' => 'Repartidor no encontrado']); exit; }
if (trim($rep['telefono']) === '')  { echo json_encode(['ok' => false, 'error' => 'El repartidor no tiene teléfono cargado (Gestión de empleados).']); exit; }

// Normalización de teléfono AR para wa.me: solo dígitos, prepende 54 si falta
$tel = preg_replace('/[^0-9]/', '', $rep['telefono']);
if ($tel === '') { echo json_encode(['ok' => false, 'error' => 'Teléfono del repartidor inválido']); exit; }
if (strpos($tel, '54') !== 0) $tel = '54' . $tel;

// Pedidos: deben estar pendiente_entrega y no estar ya en otro reparto
$in = implode(',', $ids);
$res = $conexion->query(
    "SELECT v.id, v.nombre_cliente, v.dni_cliente, COALESCE(v.observacion,'') AS observacion,
            COALESCE(v.estado_pedido,'') AS estado_pedido,
            COALESCE(c.domicilio,'') AS domicilio, COALESCE(c.ciudad,'') AS ciudad, COALESCE(c.provincia,'') AS provincia
     FROM ventas v
     LEFT JOIN clientes c ON c.empresa_id = v.empresa_id AND REPLACE(REPLACE(c.nro_id,'-',''),' ','') = v.dni_cliente AND c.nro_id <> ''
     WHERE v.id IN ($in)
       AND v.empresa_id = $empresa_id
     ORDER BY v.id"
);
$pedidos = [];
while ($row = $res->fetch_assoc()) {
    if ($row['estado_pedido'] !== 'pendiente_entrega') {
        echo json_encode(['ok' => false, 'error' => "El pedido #{$row['id']} no está en 'pendiente de entrega'."]); exit;
    }
    $pedidos[] = $row;
}
if (count($pedidos) !== count($ids)) { echo json_encode(['ok' => false, 'error' => 'Algún pedido no existe']); exit; }

// Excluir los que ya estén en un reparto
$ya = $conexion->query("SELECT id_venta FROM reparto_pedidos WHERE empresa_id = $empresa_id AND id_venta IN ($in)");
$asignados = [];
while ($r = $ya->fetch_assoc()) $asignados[] = (int)$r['id_venta'];
if ($asignados) {
    echo json_encode(['ok' => false, 'error' => 'Hay pedidos que ya están en un reparto: #' . implode(', #', $asignados)]); exit;
}

// Crear el reparto
$st = $conexion->prepare(
    "INSERT INTO repartos (repartidor_nombre, repartidor_telefono, creado_por, empresa_id) VALUES (?, ?, ?, ?) RETURNING id"
);
$st->bind_param('sssi', $rep['nombre_completo'], $rep['telefono'], $usuario, $empresa_id);
$st->execute();
$id_reparto = (int)$st->get_result()->fetch_assoc()['id'];
$st->close();

$ins = $conexion->prepare("INSERT INTO reparto_pedidos (id_reparto, id_venta, empresa_id) VALUES (?, ?, ?)");
foreach ($pedidos as $p) { $vid = (int)$p['id']; $ins->bind_param('iii', $id_reparto, $vid, $empresa_id); $ins->execute(); }
$ins->close();

// Armar el mensaje
$hoy = (new DateTime('now', new DateTimeZone('America/Argentina/Buenos_Aires')))->format('d/m/Y');
$lineas = ["*Reparto {$hoy}* — Repartidor: {$rep['nombre_completo']}", "Pedidos a entregar hoy:", ""];
$payload_pedidos = [];
$n = 1;
foreach ($pedidos as $p) {
    $dir = trim($p['domicilio']);
    $loc = trim(trim($p['ciudad'] . ', ' . $p['provincia'], ', '));
    if ($loc !== '') $dir = $dir !== '' ? "$dir, $loc" : $loc;
    $lineas[] = "{$n}) {$p['nombre_cliente']}";
    if ($dir !== '')               $lineas[] = "   Dirección: {$dir}";
    if (trim($p['observacion']))   $lineas[] = "   Obs: {$p['observacion']}";
    $lineas[] = "";
    $payload_pedidos[] = [
        'id_venta' => (int)$p['id'], 'cliente' => $p['nombre_cliente'],
        'direccion' => $dir, 'observacion' => $p['observacion'],
    ];
    $n++;
}
$mensaje = trim(implode("\n", $lineas));
$wa_link = 'https://wa.me/' . $tel . '?text=' . rawurlencode($mensaje);

require_once __DIR__ . '/integracion_eventos.php';
starlim_evento_registrar($conexion, 'reparto.asignado', [
    'id_reparto'          => $id_reparto,
    'repartidor'          => $rep['nombre_completo'],
    'repartidor_telefono' => $tel,
    'fecha'               => $hoy,
    'pedidos'             => $payload_pedidos,
    'mensaje'             => $mensaje,
]);

echo json_encode([
    'ok' => true, 'id_reparto' => $id_reparto, 'cantidad' => count($pedidos),
    'repartidor' => $rep['nombre_completo'], 'wa_link' => $wa_link, 'mensaje' => $mensaje,
]);
