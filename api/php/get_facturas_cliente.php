<?php
require_once __DIR__ . '/session_bootstrap.php';
starlim_session_start();
header('Content-Type: application/json; charset=utf-8');

if (!isset($_SESSION['usuario'])) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'SESSION_EXPIRED']);
    exit;
}

include 'conexion_starlim_be.php';
$empresaId = starlim_bootstrap_tenant_context($conexion);

// Esquema gestionado en supabase_migration.sql + db_fixes.sql

$pagina        = max(1, intval($_GET['pagina'] ?? 1));
$limite        = max(1, min(500, intval($_GET['limite'] ?? 100)));
$offset        = ($pagina - 1) * $limite;

$nro_id        = preg_replace('/[^0-9]/', '', trim($_GET['nro_id']        ?? ''));
$nro_factura   = trim($_GET['nro_factura']   ?? '');
$tipo_factura  = strtolower(trim($_GET['tipo_factura']  ?? ''));
$dia           = preg_replace('/[^0-9]/', '', trim($_GET['dia']  ?? ''));
$mes           = preg_replace('/[^0-9]/', '', trim($_GET['mes']  ?? ''));
$anio          = preg_replace('/[^0-9]/', '', trim($_GET['anio'] ?? ''));
$cobro         = trim($_GET['cobro']         ?? '');
$seguimiento   = trim($_GET['seguimiento']   ?? '');
$lista_precios = trim($_GET['lista_precios'] ?? '');

// ── Ventas branch conditions ──────────────────────────────────────────
// Solo ventas ENTREGADAS: los pedidos sin entregar viven en pedidos.php.
$conds_v  = ['v.empresa_id = ?', "COALESCE(v.estado_pedido, 'entregado') = 'entregado'"];
$params_v = [$empresaId];
$types_v  = 'i';

if ($nro_id !== '') {
    $conds_v[]  = 'v.dni_cliente = ?';
    $params_v[] = $nro_id;
    $types_v   .= 's';
}

if ($nro_factura !== '') {
    $nro_buscar = ltrim($nro_factura, '0') ?: '0';
    $conds_v[]  = 'CAST(v.nro_comprobante AS CHAR) LIKE ?';
    $params_v[] = '%' . $nro_buscar . '%';
    $types_v   .= 's';
}

$tipo_map          = ['a' => '1', 'b' => '6', 'nc' => '(3,8)', 'nd' => '(2,7)'];
$filtro_solo_remito = ($tipo_factura === 'remito');

if ($filtro_solo_remito) {
    // Filtro "Remito": ventas sin factura emitida (sin CAE) + remitos standalone
    $conds_v[] = "COALESCE(v.cae, '') = ''";
} elseif (isset($tipo_map[$tipo_factura])) {
    // Filtros A/B/NC/ND: solo comprobantes fiscales realmente emitidos
    $v_tipo    = $tipo_map[$tipo_factura];
    $conds_v[] = strpos($v_tipo, '(') === 0
        ? "v.tipo_cbte IN $v_tipo"
        : "v.tipo_cbte = $v_tipo";
    $conds_v[] = "COALESCE(v.cae, '') <> ''";
}

if ($dia !== '') {
    $conds_v[]  = 'EXTRACT(DAY FROM v.fecha) = ?';
    $params_v[] = (int)$dia;
    $types_v   .= 'i';
}
if ($mes !== '') {
    $conds_v[]  = 'EXTRACT(MONTH FROM v.fecha) = ?';
    $params_v[] = (int)$mes;
    $types_v   .= 'i';
}
if ($anio !== '') {
    $conds_v[]  = 'EXTRACT(YEAR FROM v.fecha) = ?';
    $params_v[] = (int)$anio;
    $types_v   .= 'i';
}

$valid_cobro = ['en_proceso', 'pendiente_aprobacion', 'recibido', 'pendiente', 'vencido'];
if (in_array($cobro, $valid_cobro, true)) {
    $conds_v[]  = "COALESCE(v.estado_cobro, 'pendiente') = ?";
    $params_v[] = $cobro;
    $types_v   .= 's';
}

$valid_seg = ['facturada', 'no_facturada'];
if (in_array($seguimiento, $valid_seg, true)) {
    $conds_v[]  = 'v.seguimiento = ?';
    $params_v[] = $seguimiento;
    $types_v   .= 's';
}

$join_cli_v = '';
$valid_lista = ['rev', '1', '2', '3', '4'];
if (in_array($lista_precios, $valid_lista, true)) {
    $conds_v[]  = 'cl.lista_precios = ?';
    $params_v[] = $lista_precios;
    $types_v   .= 's';
    $join_cli_v = 'LEFT JOIN clientes cl ON cl.empresa_id = v.empresa_id AND cl.nro_id = v.dni_cliente';
}

$where_v = implode(' AND ', $conds_v);

// ── Decide whether to include standalone remitos ──────────────────────
// Siempre incluir si el filtro es "Remito" explícitamente.
// Excluir si hay filtros que no aplican a remitos:
//   - nro_factura  : remitos have no factura number
//   - tipo A/B/NC/ND : remitos son tipo 0, no coinciden
//   - cobro        : remitos have no cobro state
//   - seguimiento=facturada : standalone remitos are always "no facturadas"
$include_remitos = $filtro_solo_remito || (
    $nro_factura  === '' &&
    !isset($tipo_map[$tipo_factura]) &&
    !in_array($cobro, $valid_cobro, true) &&
    $seguimiento !== 'facturada'
);

// ── Standalone remitos branch conditions ─────────────────────────────
$conds_r  = ['r.empresa_id = ?', 'r.id_venta IS NULL', "COALESCE(r.estado_pedido, 'entregado') = 'entregado'"];
$params_r = [$empresaId];
$types_r  = 'i';

if ($nro_id !== '') {
    $conds_r[]  = 'r.dni_cliente = ?';
    $params_r[] = $nro_id;
    $types_r   .= 's';
}
if ($dia !== '') {
    $conds_r[]  = 'EXTRACT(DAY FROM r.fecha) = ?';
    $params_r[] = (int)$dia;
    $types_r   .= 'i';
}
if ($mes !== '') {
    $conds_r[]  = 'EXTRACT(MONTH FROM r.fecha) = ?';
    $params_r[] = (int)$mes;
    $types_r   .= 'i';
}
if ($anio !== '') {
    $conds_r[]  = 'EXTRACT(YEAR FROM r.fecha) = ?';
    $params_r[] = (int)$anio;
    $types_r   .= 'i';
}
if (in_array($lista_precios, $valid_lista, true)) {
    $conds_r[]  = 'r.lista_precios = ?';
    $params_r[] = $lista_precios;
    $types_r   .= 's';
}
// seguimiento='no_facturada': all standalone remitos qualify — no extra condition

$where_r = implode(' AND ', $conds_r);

// ── SQL fragments ─────────────────────────────────────────────────────
$sql_v = "SELECT
    v.id          AS id_venta,
    v.nro_comprobante,
    v.tipo_cbte,
    COALESCE(v.cae, '') AS cae,
    v.fecha,
    v.monto,
    v.condicion_pago,
    COALESCE(v.estado_cobro, 'pendiente')       AS estado_cobro,
    COALESCE(v.seguimiento,  'no_facturada')    AS seguimiento,
    COALESCE(v.estado_pedido,'entregado') AS estado_pedido,
    v.nombre_cliente,
    v.dni_cliente,
    rj.id        AS id_remito,
    rj.nro_remito
FROM ventas v
LEFT JOIN remitos rj ON rj.empresa_id = v.empresa_id AND rj.id_venta = v.id
$join_cli_v
WHERE $where_v";

$sql_r = $include_remitos ? "
UNION ALL
SELECT
    NULL         AS id_venta,
    NULL         AS nro_comprobante,
    0            AS tipo_cbte,
    ''           AS cae,
    r.fecha,
    r.monto,
    r.condicion_pago,
    NULL         AS estado_cobro,
    NULL         AS seguimiento,
    COALESCE(r.estado_pedido, 'entregado') AS estado_pedido,
    r.nombre_cliente,
    r.dni_cliente,
    r.id         AS id_remito,
    r.nro_remito
FROM remitos r
WHERE $where_r" : '';

// ── Count (for pagination) ────────────────────────────────────────────
$sql_count = "SELECT COUNT(*) AS total
              FROM ($sql_v $sql_r) AS combined";

$params_count = array_merge($params_v, $include_remitos ? $params_r : []);
$types_count  = $types_v . ($include_remitos ? $types_r : '');

$stmt_count = $conexion->prepare($sql_count);
if ($types_count !== '') {
    $stmt_count->bind_param($types_count, ...$params_count);
}
if (!$stmt_count->execute()) {
    error_log('[Starlim] get_facturas_cliente count error: ' . $conexion->error);
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'QUERY_ERROR']);
    exit;
}
$total_rows = (int)($stmt_count->get_result()->fetch_assoc()['total'] ?? 0);

// ── Main query with ORDER + LIMIT ─────────────────────────────────────
$sql_main = "SELECT * FROM ($sql_v $sql_r) AS combined
             ORDER BY fecha DESC, id_remito DESC
             LIMIT ? OFFSET ?";

$params_main = array_merge($params_v, $include_remitos ? $params_r : [], [$limite, $offset]);
$types_main  = $types_v . ($include_remitos ? $types_r : '') . 'ii';

$stmt = $conexion->prepare($sql_main);
$stmt->bind_param($types_main, ...$params_main);
if (!$stmt->execute()) {
    error_log('[Starlim] get_facturas_cliente main error: ' . $conexion->error);
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'QUERY_ERROR']);
    exit;
}
$rows = $stmt->get_result();

$tipo_labels = [
    0 => 'Remito',
    1 => 'A',  2 => 'ND', 3 => 'NC',
    6 => 'B',  7 => 'ND', 8 => 'NC',
];
$metodo_labels = [
    'Cuenta corriente'   => 'Cta. Cte.',
    'Contado'            => 'Contado',
    'Tarjeta de débito'  => 'Déb.',
    'Tarjeta de crédito' => 'Créd.',
    'Cheque'             => 'Cheque',
    'Ticket'             => 'Ticket',
];

$out = [];
while ($r = $rows->fetch_assoc()) {
    $tipo_cbte   = (int)$r['tipo_cbte'];
    $id_venta    = $r['id_venta'] !== null ? (int)$r['id_venta'] : null;
    $con_factura = trim((string)($r['cae'] ?? '')) !== '';
    $out[] = [
        'id'              => $id_venta,
        'nro_comprobante' => $id_venta !== null
                                ? str_pad((int)$r['nro_comprobante'], 8, '0', STR_PAD_LEFT)
                                : null,
        // Venta sin CAE = todavía es remito (la factura se emite post-entrega)
        'tipo'            => ($id_venta !== null && !$con_factura) ? 'Remito' : ($tipo_labels[$tipo_cbte] ?? '?'),
        'con_factura'     => $con_factura,
        'fecha'           => $r['fecha'] ? date('d-m-Y', strtotime($r['fecha'])) : '—',
        'monto'           => (float)$r['monto'],
        'condicion_pago'  => $r['condicion_pago'] ?? '',
        'metodo_label'    => $metodo_labels[$r['condicion_pago'] ?? ''] ?? ($r['condicion_pago'] ?? '—'),
        'estado_cobro'    => $r['estado_cobro']  ?: 'pendiente',
        'seguimiento'     => $r['seguimiento']   ?: 'no_facturada',
        'estado_pedido'   => $r['estado_pedido'] ?: 'entregado',
        'nombre_cliente'  => $r['nombre_cliente'] ?: '—',
        'dni_cliente'     => $r['dni_cliente'] ?? '',
        'id_remito'       => $r['id_remito']  !== null ? (int)$r['id_remito']  : null,
        'nro_remito'      => $r['nro_remito'] !== null
                                ? str_pad((int)$r['nro_remito'], 8, '0', STR_PAD_LEFT)
                                : null,
    ];
}

echo json_encode(['data' => $out, 'total' => $total_rows]);
