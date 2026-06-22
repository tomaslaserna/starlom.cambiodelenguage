<?php
require __DIR__ . '/partials/guard.php';

include '../php/conexion_starlim_be.php';
require_once __DIR__ . '/../php/admin_permissions.php';
$empresaId = starlim_bootstrap_tenant_context($conexion);
starlim_admin_require($conexion, 'admin.panel', 'ver');
$canViewSalesAmounts = starlim_admin_is_admin();

date_default_timezone_set('America/Argentina/Buenos_Aires');

function dash_pdo($conexion): PDO {
    if (method_exists($conexion, 'getPDO')) return $conexion->getPDO();
    throw new RuntimeException('No hay conexion PDO disponible.');
}

function dash_query_one(PDO $pdo, string $name, string $sql, array $params, array &$errors): array {
    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
    } catch (Throwable $e) {
        error_log("[Starlim Dashboard] {$name}: " . $e->getMessage());
        $errors[$name] = 'No se pudieron cargar los datos';
        return [];
    }
}

function dash_query_all(PDO $pdo, string $name, string $sql, array $params, array &$errors): array {
    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        error_log("[Starlim Dashboard] {$name}: " . $e->getMessage());
        $errors[$name] = 'No se pudieron cargar los datos';
        return [];
    }
}

function dash_decimal(string|int|float|null $value, int $scale = 2): string {
    $raw = trim((string)($value ?? '0'));
    if ($raw === '') $raw = '0';
    $negative = str_starts_with($raw, '-');
    if ($negative) $raw = substr($raw, 1);
    if (!preg_match('/^\d+(\.\d+)?$/', $raw)) $raw = '0';
    [$int, $dec] = array_pad(explode('.', $raw, 2), 2, '');
    $int = ltrim($int, '0');
    if ($int === '') $int = '0';
    $dec = substr(str_pad($dec, $scale + 1, '0'), 0, $scale);
    $int = preg_replace('/\B(?=(\d{3})+(?!\d))/', '.', $int);
    return ($negative && ($int !== '0' || (int)$dec !== 0) ? '-' : '') . $int . ($scale > 0 ? ',' . $dec : '');
}

function dash_money(string|int|float|null $value): string {
    return '$ ' . dash_decimal($value, 2);
}

function dash_int(string|int|float|null $value): string {
    return dash_decimal((string)(int)($value ?? 0), 0);
}

function dash_pct(?string $value): string {
    if ($value === null || $value === '') return 'Sin comparacion';
    return (($value[0] ?? '') === '-' ? '' : '+') . dash_decimal($value, 2) . ' %';
}

function dash_pct_plain(string|int|float|null $value): string {
    return dash_decimal($value, 2) . ' %';
}

function dash_date_label(?string $value, string $fallback = '-'): string {
    if (!$value) return $fallback;
    $ts = strtotime($value);
    return $ts ? date('d/m/Y', $ts) : $fallback;
}

function dash_datetime_label(?string $value, string $fallback = '-'): string {
    if (!$value) return $fallback;
    $ts = strtotime($value);
    return $ts ? date('d/m/Y H:i', $ts) : $fallback;
}

function dash_period(): array {
    $tz = new DateTimeZone('America/Argentina/Buenos_Aires');
    $today = new DateTimeImmutable('today', $tz);
    $tomorrow = $today->modify('+1 day');
    $period = (string)($_GET['periodo'] ?? 'mes_actual');
    $allowed = ['hoy', '7d', '30d', 'mes_actual', 'mes_anterior', 'anio_actual', 'personalizado'];
    if (!in_array($period, $allowed, true)) $period = 'mes_actual';

    switch ($period) {
        case 'hoy':
            $start = $today;
            $end = $tomorrow;
            $label = 'Hoy';
            break;
        case '7d':
            $start = $today->modify('-6 days');
            $end = $tomorrow;
            $label = 'Ultimos 7 dias';
            break;
        case '30d':
            $start = $today->modify('-29 days');
            $end = $tomorrow;
            $label = 'Ultimos 30 dias';
            break;
        case 'mes_anterior':
            $currentMonth = $today->modify('first day of this month');
            $start = $currentMonth->modify('-1 month');
            $end = $currentMonth;
            $label = 'Mes anterior';
            break;
        case 'anio_actual':
            $start = $today->setDate((int)$today->format('Y'), 1, 1);
            $end = $tomorrow;
            $label = 'Ano actual';
            break;
        case 'personalizado':
            $from = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($_GET['desde'] ?? '')) ? $_GET['desde'] : $today->modify('-29 days')->format('Y-m-d');
            $to = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($_GET['hasta'] ?? '')) ? $_GET['hasta'] : $today->format('Y-m-d');
            $start = new DateTimeImmutable($from, $tz);
            $endInclusive = new DateTimeImmutable($to, $tz);
            if ($endInclusive < $start) $endInclusive = $start;
            $end = $endInclusive->modify('+1 day');
            $label = 'Rango personalizado';
            break;
        case 'mes_actual':
        default:
            $start = $today->modify('first day of this month');
            $end = $tomorrow;
            $label = 'Mes actual';
            $period = 'mes_actual';
            break;
    }

    $days = max(1, (int)$start->diff($end)->format('%a'));
    $prevEnd = $start;
    $prevStart = $start->modify("-{$days} days");

    return [
        'period' => $period,
        'label' => $label,
        'start' => $start,
        'end' => $end,
        'prev_start' => $prevStart,
        'prev_end' => $prevEnd,
        'days' => $days,
        'compare_label' => 'Periodo anterior equivalente',
    ];
}

function dash_qs(array $range, array $extra = []): string {
    $params = [
        'periodo' => $range['period'],
        'desde' => $range['start']->format('Y-m-d'),
        'hasta' => $range['end']->modify('-1 day')->format('Y-m-d'),
    ];
    return http_build_query(array_merge($params, $extra));
}

function dash_percent_change(PDO $pdo, string $current, string $previous): ?string {
    if ((float)$previous == 0.0) return null;
    $stmt = $pdo->prepare("
        SELECT ROUND(((CAST(:current_value AS numeric) - CAST(:previous_value AS numeric)) / NULLIF(ABS(CAST(:previous_abs AS numeric)), 0)) * 100, 2)::text
    ");
    $stmt->execute(['current_value' => $current, 'previous_value' => $previous, 'previous_abs' => $previous]);
    $value = $stmt->fetchColumn();
    return $value === false ? null : (string)$value;
}

function dash_trend_class(?string $pct): string {
    if ($pct === null || $pct === '') return 'neutral';
    if (str_starts_with($pct, '-')) return 'danger';
    if ((float)$pct > 0) return 'success';
    return 'neutral';
}

function dash_smooth_path(array $points): string {
    $n = count($points);
    if ($n === 0) return '';
    if ($n === 1) return 'M ' . $points[0]['x'] . ' ' . $points[0]['y'];
    $path = 'M ' . $points[0]['x'] . ' ' . $points[0]['y'];
    for ($i = 0; $i < $n - 1; $i++) {
        $p0 = $points[max(0, $i - 1)];
        $p1 = $points[$i];
        $p2 = $points[$i + 1];
        $p3 = $points[min($n - 1, $i + 2)];
        $cp1x = $p1['x'] + ($p2['x'] - $p0['x']) / 6;
        $cp1y = $p1['y'] + ($p2['y'] - $p0['y']) / 6;
        $cp2x = $p2['x'] - ($p3['x'] - $p1['x']) / 6;
        $cp2y = $p2['y'] - ($p3['y'] - $p1['y']) / 6;
        $path .= ' C ' . round($cp1x, 2) . ' ' . round($cp1y, 2) . ', ' . round($cp2x, 2) . ' ' . round($cp2y, 2) . ', ' . $p2['x'] . ' ' . $p2['y'];
    }
    return $path;
}

function dash_chart_paths(array $rows, string $metric): array {
    $width = 820;
    $height = 290;
    $padX = 46;
    $padTop = 20;
    $padBottom = 44;
    $values = [];
    foreach ($rows as $row) {
        $values[] = (float)$row[$metric];
        $values[] = (float)$row['prev_' . $metric];
    }
    $max = max($values ?: [0]);
    if ($max <= 0) $max = 1;
    $count = max(1, count($rows));
    $current = [];
    $previous = [];
    foreach ($rows as $i => $row) {
        $x = $padX + ($count === 1 ? 0 : ($i / ($count - 1)) * ($width - $padX - 18));
        $y = $height - $padBottom - (((float)$row[$metric] / $max) * ($height - $padTop - $padBottom));
        $py = $height - $padBottom - (((float)$row['prev_' . $metric] / $max) * ($height - $padTop - $padBottom));
        $current[] = ['x' => round($x, 2), 'y' => round($y, 2)];
        $previous[] = ['x' => round($x, 2), 'y' => round($py, 2)];
    }
    $area = '';
    if ($current) {
        $first = $current[0];
        $last = $current[count($current) - 1];
        $area = 'M ' . $first['x'] . ' ' . ($height - $padBottom) . ' L ' . $first['x'] . ' ' . $first['y'] . ' ' .
            substr(dash_smooth_path($current), 2) . ' L ' . $last['x'] . ' ' . ($height - $padBottom) . ' Z';
    }
    return [
        'current' => dash_smooth_path($current),
        'previous' => dash_smooth_path($previous),
        'area' => $area,
        'points' => $current,
        'max' => $max,
        'width' => $width,
        'height' => $height,
    ];
}

$pdo = dash_pdo($conexion);
$range = dash_period();
$errors = [];
$start = $range['start']->format('Y-m-d');
$end = $range['end']->format('Y-m-d');
$prevStart = $range['prev_start']->format('Y-m-d');
$prevEnd = $range['prev_end']->format('Y-m-d');
$searchTerm = trim((string)($_GET['q'] ?? ''));
$chartMetric = $canViewSalesAmounts ? 'amount' : 'orders';

$validSalesCte = "
    WITH note_adjustments AS (
        SELECT id_venta,
               COALESCE(SUM(CASE WHEN clase = 'NC' THEN -monto WHEN clase = 'ND' THEN monto ELSE 0 END), 0) AS ajuste
        FROM comprobantes_venta
        WHERE empresa_id = :notes_empresa
          AND id_venta IS NOT NULL
        GROUP BY id_venta
    ),
    valid_sales AS (
        SELECT
            v.id,
            v.fecha,
            COALESCE(v.creado_en, v.fecha::timestamp) AS event_ts,
            v.nombre_cliente,
            v.dni_cliente,
            v.estado_cobro,
            v.estado_pedido,
            v.vendedor,
            v.nro_comprobante,
            ((v.monto + COALESCE(na.ajuste, 0)) / 1.21)::numeric AS net_amount,
            COALESCE(NULLIF(REGEXP_REPLACE(COALESCE(v.dni_cliente, ''), '[^0-9]', '', 'g'), ''),
                     NULLIF('nombre:' || LOWER(TRIM(COALESCE(v.nombre_cliente, ''))), 'nombre:'),
                     'venta:' || v.id::text) AS client_key
        FROM ventas v
        LEFT JOIN note_adjustments na ON na.id_venta = v.id
        WHERE v.empresa_id = :empresa
          AND v.fecha >= :desde
          AND v.fecha < :hasta
          AND COALESCE(v.estado_pedido, 'entregado') = 'entregado'
    )
";

$kpiAmountSelect = $canViewSalesAmounts
    ? "ROUND(COALESCE(SUM(net_amount), 0), 2)::text AS ventas_netas,
        CASE WHEN COUNT(DISTINCT id) = 0 THEN NULL ELSE ROUND(SUM(net_amount) / COUNT(DISTINCT id), 2)::text END AS ticket_promedio,"
    : "'0'::text AS ventas_netas,
        NULL::text AS ticket_promedio,";

$kpiSql = $validSalesCte . "
    SELECT
        COUNT(DISTINCT id)::int AS pedidos,
        {$kpiAmountSelect}
        COUNT(DISTINCT client_key)::int AS clientes_activos
    FROM valid_sales
";

$currentKpi = dash_query_one($pdo, 'kpi_actual', $kpiSql, [
    'notes_empresa' => $empresaId,
    'empresa' => $empresaId,
    'desde' => $start,
    'hasta' => $end,
], $errors);
$previousKpi = dash_query_one($pdo, 'kpi_anterior', $kpiSql, [
    'notes_empresa' => $empresaId,
    'empresa' => $empresaId,
    'desde' => $prevStart,
    'hasta' => $prevEnd,
], $errors);

$currentKpi += ['pedidos' => 0, 'ventas_netas' => '0', 'ticket_promedio' => null, 'clientes_activos' => 0];
$previousKpi += ['pedidos' => 0, 'ventas_netas' => '0', 'ticket_promedio' => null, 'clientes_activos' => 0];

$trendVentas = dash_percent_change($pdo, (string)$currentKpi['ventas_netas'], (string)$previousKpi['ventas_netas']);
$trendPedidos = dash_percent_change($pdo, (string)$currentKpi['pedidos'], (string)$previousKpi['pedidos']);
$trendTicket = $currentKpi['ticket_promedio'] === null || $previousKpi['ticket_promedio'] === null ? null : dash_percent_change($pdo, (string)$currentKpi['ticket_promedio'], (string)$previousKpi['ticket_promedio']);
$trendClientes = dash_percent_change($pdo, (string)$currentKpi['clientes_activos'], (string)$previousKpi['clientes_activos']);

$clientSql = "
    WITH all_sales AS (
        SELECT
            v.id,
            v.fecha,
            v.nombre_cliente,
            v.dni_cliente,
            v.monto,
            COALESCE(NULLIF(REGEXP_REPLACE(COALESCE(v.dni_cliente, ''), '[^0-9]', '', 'g'), ''),
                     NULLIF('nombre:' || LOWER(TRIM(COALESCE(v.nombre_cliente, ''))), 'nombre:'),
                     'venta:' || v.id::text) AS client_key
        FROM ventas v
        WHERE v.empresa_id = :empresa_all
          AND COALESCE(v.estado_pedido, 'entregado') = 'entregado'
    ),
    period_sales AS (
        SELECT *
        FROM all_sales
        WHERE fecha >= :period_from AND fecha < :period_to
    ),
    first_sales AS (
        SELECT client_key, MIN(fecha) AS first_date
        FROM all_sales
        GROUP BY client_key
    )
    SELECT
        (SELECT COUNT(DISTINCT ps.client_key) FROM period_sales ps)::int AS activos,
        (SELECT COUNT(*) FROM first_sales fs WHERE fs.first_date >= :first_from AND fs.first_date < :first_to)::int AS nuevos,
        (SELECT COUNT(DISTINCT ps.client_key) FROM period_sales ps JOIN first_sales fs ON fs.client_key = ps.client_key WHERE fs.first_date < :recurring_from)::int AS recurrentes,
        CASE WHEN (SELECT COUNT(DISTINCT client_key) FROM period_sales) = 0 THEN NULL
             ELSE ROUND((SELECT COUNT(DISTINCT id)::numeric FROM period_sales) / NULLIF((SELECT COUNT(DISTINCT client_key)::numeric FROM period_sales),0), 2)::text
        END AS promedio_operaciones_cliente
";
$clientSummary = dash_query_one($pdo, 'clientes_resumen', $clientSql, [
    'empresa_all' => $empresaId,
    'period_from' => $start,
    'period_to' => $end,
    'first_from' => $start,
    'first_to' => $end,
    'recurring_from' => $start,
], $errors);
$clientSummary += ['activos' => 0, 'nuevos' => 0, 'recurrentes' => 0, 'promedio_operaciones_cliente' => null];

$topClients = $canViewSalesAmounts ? dash_query_all($pdo, 'top_clientes', "
    WITH note_adjustments AS (
        SELECT id_venta,
               COALESCE(SUM(CASE WHEN clase = 'NC' THEN -monto WHEN clase = 'ND' THEN monto ELSE 0 END), 0) AS ajuste
        FROM comprobantes_venta
        WHERE empresa_id = :notes_empresa
          AND id_venta IS NOT NULL
        GROUP BY id_venta
    ),
    sales AS (
        SELECT v.id, v.nombre_cliente, v.dni_cliente, ((v.monto + COALESCE(na.ajuste,0)) / 1.21)::numeric AS net_amount,
               COALESCE(NULLIF(REGEXP_REPLACE(COALESCE(v.dni_cliente, ''), '[^0-9]', '', 'g'), ''),
                        NULLIF('nombre:' || LOWER(TRIM(COALESCE(v.nombre_cliente, ''))), 'nombre:'),
                        'venta:' || v.id::text) AS client_key
        FROM ventas v
        LEFT JOIN note_adjustments na ON na.id_venta = v.id
        WHERE v.empresa_id = :empresa
          AND v.fecha >= :desde
          AND v.fecha < :hasta
          AND COALESCE(v.estado_pedido, 'entregado') = 'entregado'
    ),
    totals AS (
        SELECT COALESCE(SUM(net_amount),0) AS grand_total FROM sales
    )
    SELECT
        COALESCE(NULLIF(MAX(nombre_cliente), ''), 'Cliente sin nombre') AS nombre,
        COUNT(DISTINCT id)::int AS operaciones,
        ROUND(SUM(net_amount), 2)::text AS total,
        CASE WHEN (SELECT grand_total FROM totals) = 0 THEN '0'
             ELSE ROUND((SUM(net_amount) / (SELECT grand_total FROM totals)) * 100, 2)::text END AS participacion
    FROM sales
    GROUP BY client_key
    ORDER BY SUM(net_amount) DESC, nombre ASC
    LIMIT 5
", [
    'notes_empresa' => $empresaId,
    'empresa' => $empresaId,
    'desde' => $start,
    'hasta' => $end,
], $errors) : [];

$thresholdRow = dash_query_one($pdo, 'config_clientes_sin_compras', "
    SELECT valor
    FROM config_sistema
    WHERE clave = 'dashboard_clientes_sin_compras_dias'
    LIMIT 1
", [], $errors);
$inactiveRuleDays = isset($thresholdRow['valor']) && ctype_digit((string)$thresholdRow['valor']) ? (int)$thresholdRow['valor'] : null;
$inactiveClients = null;
if ($inactiveRuleDays !== null && $inactiveRuleDays > 0) {
    $inactiveRow = dash_query_one($pdo, 'clientes_sin_compras', "
        WITH last_sales AS (
            SELECT
                COALESCE(NULLIF(REGEXP_REPLACE(COALESCE(dni_cliente, ''), '[^0-9]', '', 'g'), ''),
                         NULLIF('nombre:' || LOWER(TRIM(COALESCE(nombre_cliente, ''))), 'nombre:'),
                         'venta:' || id::text) AS client_key,
                MAX(fecha) AS last_date
            FROM ventas
            WHERE empresa_id = :empresa
              AND COALESCE(estado_pedido, 'entregado') = 'entregado'
            GROUP BY 1
        )
        SELECT COUNT(*)::int AS total
        FROM last_sales
        WHERE last_date < CURRENT_DATE - (:days || ' days')::interval
    ", ['empresa' => $empresaId, 'days' => $inactiveRuleDays], $errors);
    $inactiveClients = (int)($inactiveRow['total'] ?? 0);
}

$quoteSummary = dash_query_one($pdo, 'cotizaciones', "
    SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE estado = 'pendiente')::int AS abiertas,
        COUNT(*) FILTER (WHERE estado IN ('aceptada','aprobada'))::int AS aprobadas,
        COUNT(*) FILTER (WHERE estado = 'pendiente' AND fecha_vencimiento < CURRENT_DATE)::int AS vencidas
    FROM presupuestos
    WHERE empresa_id = :empresa
      AND COALESCE(created_at, fecha_emision::timestamp) >= :desde
      AND COALESCE(created_at, fecha_emision::timestamp) < :hasta
", ['empresa' => $empresaId, 'desde' => $start, 'hasta' => $end], $errors);
$quoteSummary += ['total' => 0, 'abiertas' => 0, 'aprobadas' => 0, 'vencidas' => 0];

$billingSummary = dash_query_one($pdo, 'facturacion_cobranzas', "
    SELECT
        COUNT(*) FILTER (WHERE COALESCE(cae, '') <> '')::int AS facturas_emitidas,
        COUNT(*) FILTER (WHERE COALESCE(cae, '') = '' AND COALESCE(estado_pedido, 'entregado') = 'entregado')::int AS pendientes_factura,
        ROUND(COALESCE(SUM(CASE WHEN COALESCE(cae, '') <> '' THEN monto ELSE 0 END), 0), 2)::text AS importe_facturado,
        ROUND(COALESCE(SUM(CASE WHEN COALESCE(estado_cobro,'pendiente') IN ('pendiente','vencido','pendiente_aprobacion','en_proceso')
                           THEN GREATEST(monto - COALESCE(cobro_monto_registrado, 0), 0) ELSE 0 END), 0), 2)::text AS saldo_por_cobrar,
        ROUND(COALESCE(SUM(CASE WHEN COALESCE(estado_cobro,'pendiente') = 'vencido'
                           THEN GREATEST(monto - COALESCE(cobro_monto_registrado, 0), 0) ELSE 0 END), 0), 2)::text AS saldo_vencido
    FROM ventas
    WHERE empresa_id = :empresa
      AND fecha >= :desde
      AND fecha < :hasta
", ['empresa' => $empresaId, 'desde' => $start, 'hasta' => $end], $errors);
$billingSummary += ['facturas_emitidas' => 0, 'pendientes_factura' => 0, 'importe_facturado' => '0', 'saldo_por_cobrar' => '0', 'saldo_vencido' => '0'];

$ordersSummary = dash_query_one($pdo, 'pedidos_estado', "
    SELECT
        COUNT(*) FILTER (WHERE estado_pedido = 'recibido')::int AS recibidos,
        COUNT(*) FILTER (WHERE estado_pedido = 'en_proceso')::int AS en_proceso,
        COUNT(*) FILTER (WHERE estado_pedido = 'pendiente_entrega')::int AS pendientes_entrega,
        COUNT(*) FILTER (WHERE COALESCE(estado_pedido, 'entregado') = 'entregado')::int AS entregados
    FROM ventas
    WHERE empresa_id = :empresa
      AND fecha >= :desde
      AND fecha < :hasta
", ['empresa' => $empresaId, 'desde' => $start, 'hasta' => $end], $errors);
$ordersSummary += ['recibidos' => 0, 'en_proceso' => 0, 'pendientes_entrega' => 0, 'entregados' => 0];

$reminders = dash_query_all($pdo, 'recordatorios', "
    SELECT id, titulo, descripcion, prioridad, fecha_limite, usuario,
           CASE WHEN fecha_limite IS NOT NULL AND fecha_limite < NOW() THEN 'vencido' ELSE prioridad END AS status
    FROM recordatorios
    WHERE empresa_id = :empresa
      AND completado = 0
    ORDER BY
        CASE WHEN fecha_limite IS NOT NULL AND fecha_limite < NOW() THEN 0 ELSE 1 END,
        CASE WHEN prioridad = 'urgente' THEN 0 WHEN prioridad = 'alta' THEN 1 ELSE 2 END,
        fecha_creacion DESC
    LIMIT 4
", ['empresa' => $empresaId], $errors);

$dataIssues = dash_query_one($pdo, 'calidad_ventas', "
    SELECT
        COUNT(*) FILTER (WHERE fecha IS NULL)::int AS ventas_sin_fecha,
        COUNT(*) FILTER (WHERE COALESCE(dni_cliente,'') = '' AND COALESCE(nombre_cliente,'') = '')::int AS ventas_sin_cliente,
        COUNT(*) FILTER (WHERE monto < 0)::int AS ventas_negativas
    FROM ventas
    WHERE empresa_id = :empresa
", ['empresa' => $empresaId], $errors);
$dataIssues += ['ventas_sin_fecha' => 0, 'ventas_sin_cliente' => 0, 'ventas_negativas' => 0];

$alerts = [];
if ((float)$billingSummary['saldo_vencido'] > 0) $alerts[] = ['level' => 'critico', 'title' => 'Saldo vencido por cobrar', 'detail' => dash_money($billingSummary['saldo_vencido']) . ' pendiente de cobro.', 'href' => 'panel_cobros_pagos.php'];
if ((int)$ordersSummary['recibidos'] + (int)$ordersSummary['en_proceso'] > 0) $alerts[] = ['level' => 'medio', 'title' => 'Pedidos pendientes', 'detail' => dash_int((int)$ordersSummary['recibidos'] + (int)$ordersSummary['en_proceso']) . ' pedidos requieren preparacion.', 'href' => 'pedidos.php'];
if ((int)$quoteSummary['vencidas'] > 0) $alerts[] = ['level' => 'medio', 'title' => 'Cotizaciones vencidas', 'detail' => dash_int($quoteSummary['vencidas']) . ' cotizaciones necesitan seguimiento.', 'href' => 'presupuestos.php'];
if ((int)$dataIssues['ventas_sin_cliente'] > 0) $alerts[] = ['level' => 'info', 'title' => 'Calidad de datos', 'detail' => dash_int($dataIssues['ventas_sin_cliente']) . ' ventas sin cliente identificable.', 'href' => 'ventas_registradas.php'];
if (!$alerts) $alerts[] = ['level' => 'info', 'title' => 'Sin alertas criticas', 'detail' => 'No hay eventos urgentes para el periodo seleccionado.', 'href' => 'panel_empleados.php?' . dash_qs($range)];

$bucket = 'day';
$interval = '1 day';
$seriesStart = $range['start'];
$seriesEnd = $range['end']->modify('-1 day');
$prevSeriesStart = $range['prev_start'];
$prevSeriesEnd = $range['prev_end']->modify('-1 day');
$labelFormat = 'DD/MM';
if ($range['period'] === 'hoy') {
    $bucket = 'hour';
    $interval = '1 hour';
    $seriesStart = $range['start'];
    $seriesEnd = $range['end']->modify('-1 hour');
    $prevSeriesStart = $range['prev_start'];
    $prevSeriesEnd = $range['prev_end']->modify('-1 hour');
    $labelFormat = 'HH24:MI';
} elseif ($range['days'] > 31 && $range['days'] <= 186) {
    $bucket = 'week';
    $interval = '1 week';
    $seriesStart = $range['start']->modify('monday this week');
    $seriesEnd = $range['end']->modify('-1 day')->modify('monday this week');
    $prevSeriesStart = $range['prev_start']->modify('monday this week');
    $prevSeriesEnd = $range['prev_end']->modify('-1 day')->modify('monday this week');
    $labelFormat = 'DD/MM';
} elseif ($range['days'] > 186) {
    $bucket = 'month';
    $interval = '1 month';
    $seriesStart = $range['start']->modify('first day of this month');
    $seriesEnd = $range['end']->modify('-1 day')->modify('first day of this month');
    $prevSeriesStart = $range['prev_start']->modify('first day of this month');
    $prevSeriesEnd = $range['prev_end']->modify('-1 day')->modify('first day of this month');
    $labelFormat = 'MM/YYYY';
}

if ($canViewSalesAmounts) {
    $chartRows = dash_query_all($pdo, 'grafico_ventas', "
    WITH note_adjustments AS (
        SELECT id_venta,
               COALESCE(SUM(CASE WHEN clase = 'NC' THEN -monto WHEN clase = 'ND' THEN monto ELSE 0 END), 0) AS ajuste
        FROM comprobantes_venta
        WHERE empresa_id = :notes_empresa
          AND id_venta IS NOT NULL
        GROUP BY id_venta
    ),
    current_series AS (
        SELECT bucket_start, row_number() OVER () AS ord
        FROM generate_series(CAST(:series_start AS timestamp), CAST(:series_end AS timestamp), INTERVAL '{$interval}') AS bucket_start
    ),
    prev_series AS (
        SELECT bucket_start, row_number() OVER () AS ord
        FROM generate_series(CAST(:prev_series_start AS timestamp), CAST(:prev_series_end AS timestamp), INTERVAL '{$interval}') AS bucket_start
    ),
    current_group AS (
        SELECT date_trunc('{$bucket}', COALESCE(v.creado_en, v.fecha::timestamp)) AS bucket_start,
               COUNT(DISTINCT v.id)::int AS orders,
               ROUND(COALESCE(SUM((v.monto + COALESCE(na.ajuste, 0)) / 1.21), 0), 2) AS amount
        FROM ventas v
        LEFT JOIN note_adjustments na ON na.id_venta = v.id
        WHERE v.empresa_id = :empresa
          AND v.fecha >= :desde
          AND v.fecha < :hasta
          AND COALESCE(v.estado_pedido, 'entregado') = 'entregado'
        GROUP BY 1
    ),
    prev_group AS (
        SELECT date_trunc('{$bucket}', COALESCE(v.creado_en, v.fecha::timestamp)) AS bucket_start,
               COUNT(DISTINCT v.id)::int AS orders,
               ROUND(COALESCE(SUM((v.monto + COALESCE(na.ajuste, 0)) / 1.21), 0), 2) AS amount
        FROM ventas v
        LEFT JOIN note_adjustments na ON na.id_venta = v.id
        WHERE v.empresa_id = :prev_empresa
          AND v.fecha >= :prev_desde
          AND v.fecha < :prev_hasta
          AND COALESCE(v.estado_pedido, 'entregado') = 'entregado'
        GROUP BY 1
    )
    SELECT
        cs.ord::int,
        to_char(cs.bucket_start, '{$labelFormat}') AS label,
        cs.bucket_start::text AS bucket_date,
        COALESCE(cg.orders, 0)::int AS orders,
        ROUND(COALESCE(cg.amount, 0), 2)::text AS amount,
        CASE WHEN COALESCE(cg.orders, 0) = 0 THEN '0' ELSE ROUND(cg.amount / cg.orders, 2)::text END AS ticket,
        COALESCE(pg.orders, 0)::int AS prev_orders,
        ROUND(COALESCE(pg.amount, 0), 2)::text AS prev_amount,
        CASE WHEN COALESCE(pg.orders, 0) = 0 THEN '0' ELSE ROUND(pg.amount / pg.orders, 2)::text END AS prev_ticket,
        CASE WHEN COALESCE(pg.amount, 0) = 0 THEN NULL ELSE ROUND(((COALESCE(cg.amount,0) - pg.amount) / ABS(pg.amount)) * 100, 2)::text END AS amount_change
    FROM current_series cs
    LEFT JOIN current_group cg ON cg.bucket_start = cs.bucket_start
    LEFT JOIN prev_series ps ON ps.ord = cs.ord
    LEFT JOIN prev_group pg ON pg.bucket_start = ps.bucket_start
    ORDER BY cs.ord
", [
    'notes_empresa' => $empresaId,
    'series_start' => $seriesStart->format('Y-m-d H:i:s'),
    'series_end' => $seriesEnd->format('Y-m-d H:i:s'),
    'prev_series_start' => $prevSeriesStart->format('Y-m-d H:i:s'),
    'prev_series_end' => $prevSeriesEnd->format('Y-m-d H:i:s'),
    'empresa' => $empresaId,
    'desde' => $start,
    'hasta' => $end,
    'prev_empresa' => $empresaId,
    'prev_desde' => $prevStart,
    'prev_hasta' => $prevEnd,
], $errors);
} else {
    $chartRows = dash_query_all($pdo, 'grafico_operaciones', "
    WITH current_series AS (
        SELECT bucket_start, row_number() OVER () AS ord
        FROM generate_series(CAST(:series_start AS timestamp), CAST(:series_end AS timestamp), INTERVAL '{$interval}') AS bucket_start
    ),
    prev_series AS (
        SELECT bucket_start, row_number() OVER () AS ord
        FROM generate_series(CAST(:prev_series_start AS timestamp), CAST(:prev_series_end AS timestamp), INTERVAL '{$interval}') AS bucket_start
    ),
    current_group AS (
        SELECT date_trunc('{$bucket}', COALESCE(v.creado_en, v.fecha::timestamp)) AS bucket_start,
               COUNT(DISTINCT v.id)::int AS orders
        FROM ventas v
        WHERE v.empresa_id = :empresa
          AND v.fecha >= :desde
          AND v.fecha < :hasta
          AND COALESCE(v.estado_pedido, 'entregado') = 'entregado'
        GROUP BY 1
    ),
    prev_group AS (
        SELECT date_trunc('{$bucket}', COALESCE(v.creado_en, v.fecha::timestamp)) AS bucket_start,
               COUNT(DISTINCT v.id)::int AS orders
        FROM ventas v
        WHERE v.empresa_id = :prev_empresa
          AND v.fecha >= :prev_desde
          AND v.fecha < :prev_hasta
          AND COALESCE(v.estado_pedido, 'entregado') = 'entregado'
        GROUP BY 1
    )
    SELECT
        cs.ord::int,
        to_char(cs.bucket_start, '{$labelFormat}') AS label,
        cs.bucket_start::text AS bucket_date,
        COALESCE(cg.orders, 0)::int AS orders,
        '0'::text AS amount,
        '0'::text AS ticket,
        COALESCE(pg.orders, 0)::int AS prev_orders,
        '0'::text AS prev_amount,
        '0'::text AS prev_ticket,
        CASE WHEN COALESCE(pg.orders, 0) = 0 THEN NULL
             ELSE ROUND(((COALESCE(cg.orders,0) - pg.orders)::numeric / ABS(pg.orders)) * 100, 2)::text END AS amount_change
    FROM current_series cs
    LEFT JOIN current_group cg ON cg.bucket_start = cs.bucket_start
    LEFT JOIN prev_series ps ON ps.ord = cs.ord
    LEFT JOIN prev_group pg ON pg.bucket_start = ps.bucket_start
    ORDER BY cs.ord
", [
        'series_start' => $seriesStart->format('Y-m-d H:i:s'),
        'series_end' => $seriesEnd->format('Y-m-d H:i:s'),
        'prev_series_start' => $prevSeriesStart->format('Y-m-d H:i:s'),
        'prev_series_end' => $prevSeriesEnd->format('Y-m-d H:i:s'),
        'empresa' => $empresaId,
        'desde' => $start,
        'hasta' => $end,
        'prev_empresa' => $empresaId,
        'prev_desde' => $prevStart,
        'prev_hasta' => $prevEnd,
    ], $errors);
}
$chartPaths = dash_chart_paths($chartRows, $chartMetric);

$searchResults = [];
if ($searchTerm !== '') {
    $like = '%' . mb_strtolower($searchTerm) . '%';
    $searchResults = array_merge($searchResults, dash_query_all($pdo, 'busqueda_ventas', "
        SELECT CASE WHEN COALESCE(estado_pedido, 'entregado') = 'entregado' THEN 'Venta' ELSE 'Pedido' END AS tipo,
               COALESCE(NULLIF(nro_comprobante::text, '0'), id::text) AS referencia,
               nombre_cliente AS cliente,
               fecha::text AS fecha,
               ROUND(monto, 2)::text AS importe,
               COALESCE(estado_pedido, 'entregado') AS estado,
               'ventas_registradas.php?nro_factura=' || COALESCE(NULLIF(nro_comprobante::text, '0'), id::text) AS href
        FROM ventas
        WHERE empresa_id = :empresa
          AND (LOWER(COALESCE(nombre_cliente,'')) LIKE :q_nombre
               OR LOWER(COALESCE(dni_cliente,'')) LIKE :q_dni
               OR nro_comprobante::text LIKE :q_nro
               OR id::text LIKE :q_id)
        ORDER BY fecha DESC, id DESC
        LIMIT 8
    ", ['empresa' => $empresaId, 'q_nombre' => $like, 'q_dni' => $like, 'q_nro' => '%' . $searchTerm . '%', 'q_id' => '%' . $searchTerm . '%'], $errors));
    $searchResults = array_merge($searchResults, dash_query_all($pdo, 'busqueda_clientes', "
        SELECT 'Cliente' AS tipo,
               COALESCE(NULLIF(codigo_cliente,''), id::text) AS referencia,
               nombre_cliente AS cliente,
               NULL::text AS fecha,
               NULL::text AS importe,
               estado,
               'clientes.php' AS href
        FROM clientes
        WHERE empresa_id = :empresa
          AND (LOWER(COALESCE(nombre_cliente,'')) LIKE :q_nombre
               OR LOWER(COALESCE(razon_social,'')) LIKE :q_razon
               OR LOWER(COALESCE(nro_id,'')) LIKE :q_doc)
        ORDER BY nombre_cliente ASC
        LIMIT 6
    ", ['empresa' => $empresaId, 'q_nombre' => $like, 'q_razon' => $like, 'q_doc' => $like], $errors));
    $searchResults = array_merge($searchResults, dash_query_all($pdo, 'busqueda_cotizaciones', "
        SELECT 'Cotizacion' AS tipo,
               id::text AS referencia,
               cliente_nombre AS cliente,
               fecha_emision::text AS fecha,
               ROUND(total, 2)::text AS importe,
               estado,
               'presupuestos.php' AS href
        FROM presupuestos
        WHERE empresa_id = :empresa
          AND (LOWER(COALESCE(cliente_nombre,'')) LIKE :q_cliente OR id::text LIKE :q_id)
        ORDER BY COALESCE(created_at, fecha_emision::timestamp) DESC
        LIMIT 6
    ", ['empresa' => $empresaId, 'q_cliente' => $like, 'q_id' => '%' . $searchTerm . '%'], $errors));
    $searchResults = array_merge($searchResults, dash_query_all($pdo, 'busqueda_facturas', "
        SELECT 'Factura' AS tipo,
               COALESCE(NULLIF(document_number::text, ''), id::text) AS referencia,
               COALESCE(c.nombre_cliente, source_order_label, '') AS cliente,
               COALESCE(issue_date::text, created_at::date::text) AS fecha,
               ROUND(grand_total, 2)::text AS importe,
               status AS estado,
               'facturacion.php' AS href
        FROM billing_document bd
        LEFT JOIN clientes c ON c.id = bd.customer_id AND c.empresa_id = bd.company_id
        WHERE bd.company_id = :empresa
          AND (LOWER(COALESCE(c.nombre_cliente,'')) LIKE :q_cliente
               OR LOWER(COALESCE(source_order_label,'')) LIKE :q_origen
               OR bd.id::text LIKE :q_id
               OR COALESCE(document_number::text,'') LIKE :q_numero)
        ORDER BY bd.created_at DESC
        LIMIT 6
    ", ['empresa' => $empresaId, 'q_cliente' => $like, 'q_origen' => $like, 'q_id' => '%' . $searchTerm . '%', 'q_numero' => '%' . $searchTerm . '%'], $errors));
    $searchResults = array_merge($searchResults, dash_query_all($pdo, 'busqueda_productos', "
        SELECT 'Producto' AS tipo,
               COALESCE(NULLIF(codigo,''), id::text) AS referencia,
               nombre AS cliente,
               NULL::text AS fecha,
               ROUND(costo, 2)::text AS importe,
               CASE WHEN stock > 0 THEN 'con stock' ELSE 'sin stock' END AS estado,
               'stock.php' AS href
        FROM productos
        WHERE empresa_id = :empresa
          AND (LOWER(COALESCE(nombre,'')) LIKE :q_nombre OR LOWER(COALESCE(codigo,'')) LIKE :q_codigo)
        ORDER BY nombre ASC
        LIMIT 6
    ", ['empresa' => $empresaId, 'q_nombre' => $like, 'q_codigo' => $like], $errors));
    $searchResults = array_slice($searchResults, 0, 18);
}

$detailType = (string)($_GET['detalle'] ?? '');
if (!in_array($detailType, ['ventas', 'pedidos', 'clientes'], true)) $detailType = '';
if (!$canViewSalesAmounts && $detailType === 'ventas') $detailType = '';
$detailRows = [];
$detailSummary = ['count' => 0, 'sum' => '0'];
$detailTotalSelect = $canViewSalesAmounts
    ? "ROUND(((v.monto + COALESCE(na.ajuste, 0)) / 1.21)::numeric, 2)::text AS total"
    : "NULL::text AS total";
$detailSummarySumSelect = $canViewSalesAmounts
    ? "ROUND(COALESCE(SUM((v.monto + COALESCE(na.ajuste,0)) / 1.21),0), 2)::text AS sum"
    : "'0'::text AS sum";
$clientDetailTotalSelect = $canViewSalesAmounts
    ? "ROUND(SUM(net_amount), 2)::text AS total"
    : "NULL::text AS total";
$clientDetailOrder = $canViewSalesAmounts
    ? "SUM(net_amount) DESC, nombre_cliente ASC"
    : "COUNT(DISTINCT id) DESC, nombre_cliente ASC";
if ($detailType === 'ventas' || $detailType === 'pedidos') {
    $detailRows = dash_query_all($pdo, 'detalle_' . $detailType, "
        WITH note_adjustments AS (
            SELECT id_venta,
                   COALESCE(SUM(CASE WHEN clase = 'NC' THEN -monto WHEN clase = 'ND' THEN monto ELSE 0 END), 0) AS ajuste
            FROM comprobantes_venta
        WHERE empresa_id = :notes_empresa
              AND id_venta IS NOT NULL
            GROUP BY id_venta
        )
        SELECT
            v.id,
            COALESCE(NULLIF(v.nro_comprobante::text, '0'), v.id::text) AS referencia,
            v.nombre_cliente,
            v.fecha::text AS fecha,
            COALESCE(v.estado_pedido, 'entregado') AS estado,
            {$detailTotalSelect}
        FROM ventas v
        LEFT JOIN note_adjustments na ON na.id_venta = v.id
        WHERE v.empresa_id = :empresa
          AND v.fecha >= :desde
          AND v.fecha < :hasta
          AND COALESCE(v.estado_pedido, 'entregado') = 'entregado'
        ORDER BY v.fecha DESC, v.id DESC
        LIMIT 250
    ", [
        'notes_empresa' => $empresaId,
        'empresa' => $empresaId,
        'desde' => $start,
        'hasta' => $end,
    ], $errors);
    $detailSummary = dash_query_one($pdo, 'detalle_' . $detailType . '_resumen', "
        WITH note_adjustments AS (
            SELECT id_venta,
                   COALESCE(SUM(CASE WHEN clase = 'NC' THEN -monto WHEN clase = 'ND' THEN monto ELSE 0 END), 0) AS ajuste
            FROM comprobantes_venta
            WHERE empresa_id = :notes_empresa
              AND id_venta IS NOT NULL
            GROUP BY id_venta
        )
        SELECT COUNT(DISTINCT v.id)::int AS count,
               {$detailSummarySumSelect}
        FROM ventas v
        LEFT JOIN note_adjustments na ON na.id_venta = v.id
        WHERE v.empresa_id = :empresa
          AND v.fecha >= :desde
          AND v.fecha < :hasta
          AND COALESCE(v.estado_pedido, 'entregado') = 'entregado'
    ", [
        'notes_empresa' => $empresaId,
        'empresa' => $empresaId,
        'desde' => $start,
        'hasta' => $end,
    ], $errors) + $detailSummary;
} elseif ($detailType === 'clientes') {
    $detailRows = dash_query_all($pdo, 'detalle_clientes', "
        WITH note_adjustments AS (
            SELECT id_venta,
                   COALESCE(SUM(CASE WHEN clase = 'NC' THEN -monto WHEN clase = 'ND' THEN monto ELSE 0 END), 0) AS ajuste
            FROM comprobantes_venta
            WHERE empresa_id = :notes_empresa
              AND id_venta IS NOT NULL
            GROUP BY id_venta
        ),
        valid_sales AS (
            SELECT
                v.id,
                v.fecha,
                v.nombre_cliente,
                ((v.monto + COALESCE(na.ajuste, 0)) / 1.21)::numeric AS net_amount,
                COALESCE(NULLIF(REGEXP_REPLACE(COALESCE(v.dni_cliente, ''), '[^0-9]', '', 'g'), ''),
                         NULLIF('nombre:' || LOWER(TRIM(COALESCE(v.nombre_cliente, ''))), 'nombre:'),
                         'venta:' || v.id::text) AS client_key
            FROM ventas v
            LEFT JOIN note_adjustments na ON na.id_venta = v.id
            WHERE v.empresa_id = :empresa
              AND v.fecha >= :desde
              AND v.fecha < :hasta
              AND COALESCE(v.estado_pedido, 'entregado') = 'entregado'
        )
        SELECT
            client_key AS referencia,
            COALESCE(NULLIF(MAX(nombre_cliente), ''), 'Cliente sin nombre') AS nombre_cliente,
            MIN(fecha)::text AS primera_fecha,
            MAX(fecha)::text AS ultima_fecha,
            COUNT(DISTINCT id)::int AS operaciones,
            {$clientDetailTotalSelect}
        FROM valid_sales
        GROUP BY client_key
        ORDER BY {$clientDetailOrder}
        LIMIT 250
    ", [
        'notes_empresa' => $empresaId,
        'empresa' => $empresaId,
        'desde' => $start,
        'hasta' => $end,
    ], $errors);
    $detailSummary = dash_query_one($pdo, 'detalle_clientes_resumen', "
        WITH note_adjustments AS (
            SELECT id_venta,
                   COALESCE(SUM(CASE WHEN clase = 'NC' THEN -monto WHEN clase = 'ND' THEN monto ELSE 0 END), 0) AS ajuste
            FROM comprobantes_venta
            WHERE empresa_id = :notes_empresa
              AND id_venta IS NOT NULL
            GROUP BY id_venta
        ),
        valid_sales AS (
            SELECT
                v.id,
                ((v.monto + COALESCE(na.ajuste, 0)) / 1.21)::numeric AS net_amount,
                COALESCE(NULLIF(REGEXP_REPLACE(COALESCE(v.dni_cliente, ''), '[^0-9]', '', 'g'), ''),
                         NULLIF('nombre:' || LOWER(TRIM(COALESCE(v.nombre_cliente, ''))), 'nombre:'),
                         'venta:' || v.id::text) AS client_key
            FROM ventas v
            LEFT JOIN note_adjustments na ON na.id_venta = v.id
            WHERE v.empresa_id = :empresa
              AND v.fecha >= :desde
              AND v.fecha < :hasta
              AND COALESCE(v.estado_pedido, 'entregado') = 'entregado'
        )
        SELECT COUNT(DISTINCT client_key)::int AS count,
               " . ($canViewSalesAmounts ? "ROUND(COALESCE(SUM(net_amount),0), 2)::text AS sum" : "'0'::text AS sum") . "
        FROM valid_sales
    ", [
        'notes_empresa' => $empresaId,
        'empresa' => $empresaId,
        'desde' => $start,
        'hasta' => $end,
    ], $errors) + $detailSummary;
}

$kpis = [];
if ($canViewSalesAmounts) {
    $kpis[] = [
        'label' => 'Ventas netas',
        'value' => dash_money($currentKpi['ventas_netas']),
        'previous' => dash_money($previousKpi['ventas_netas']),
        'trend' => $trendVentas,
        'unit' => 'ventas',
        'definition' => 'Importe neto sin IVA: ventas entregadas + notas de debito - notas de credito, dividido por 1,21 y agrupado por venta.',
        'href' => 'panel_empleados.php?' . dash_qs($range, ['detalle' => 'ventas', 'grafico' => $chartMetric] + ($searchTerm !== '' ? ['q' => $searchTerm] : [])),
        'error' => $errors['kpi_actual'] ?? null,
    ];
}
$kpis[] = [
    'label' => 'Pedidos',
    'value' => dash_int($currentKpi['pedidos']) . ' pedidos',
    'previous' => dash_int($previousKpi['pedidos']) . ' pedidos',
    'trend' => $trendPedidos,
    'unit' => 'pedidos',
    'definition' => "Operaciones validas con estado_pedido = entregado dentro del periodo.",
    'href' => 'panel_empleados.php?' . dash_qs($range, ['detalle' => 'pedidos', 'grafico' => $chartMetric] + ($searchTerm !== '' ? ['q' => $searchTerm] : [])),
    'error' => $errors['kpi_actual'] ?? null,
];
if ($canViewSalesAmounts) {
    $kpis[] = [
        'label' => 'Ticket promedio',
        'value' => ((int)$currentKpi['pedidos'] === 0 || $currentKpi['ticket_promedio'] === null) ? 'Sin operaciones en este periodo' : dash_money($currentKpi['ticket_promedio']),
        'previous' => $previousKpi['ticket_promedio'] === null ? 'Sin operaciones' : dash_money($previousKpi['ticket_promedio']),
        'trend' => $trendTicket,
        'unit' => 'ticket',
        'definition' => 'Ventas netas sin IVA / cantidad de operaciones validas.',
        'href' => 'panel_empleados.php?' . dash_qs($range, ['detalle' => 'ventas', 'grafico' => $chartMetric] + ($searchTerm !== '' ? ['q' => $searchTerm] : [])),
        'error' => $errors['kpi_actual'] ?? null,
    ];
}
$kpis[] = [
    'label' => 'Clientes activos',
    'value' => dash_int($currentKpi['clientes_activos']) . ' clientes',
    'previous' => dash_int($previousKpi['clientes_activos']) . ' clientes',
    'trend' => $trendClientes,
    'unit' => 'clientes',
    'definition' => 'Clientes con al menos una operacion valida en el periodo.',
    'href' => 'panel_empleados.php?' . dash_qs($range, ['detalle' => 'clientes', 'grafico' => $chartMetric] + ($searchTerm !== '' ? ['q' => $searchTerm] : [])),
    'error' => $errors['kpi_actual'] ?? null,
];

$usuarioPanel = (string)($_SESSION['usuario'] ?? '');
$periodSubtitle = dash_date_label($range['start']->format('Y-m-d')) . ' - ' . dash_date_label($range['end']->modify('-1 day')->format('Y-m-d'));
$chartMetricLabels = [
    'amount' => 'Ventas netas',
    'orders' => 'Operaciones',
];
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Panel | Starlim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <link rel="stylesheet" href="../css/panel_ventas.css">
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>

<?php $NAV_ACTIVA = 'admin'; $ADMIN_ACTIVA = 'admin.panel'; include __DIR__ . '/partials/nav.php'; ?>

<main class="dash-main exec-dashboard exec-dashboard-v2">
    <header class="exec-topbar">
        <div>
            <p class="exec-kicker">Panel Starlim</p>
            <h1>Dashboard operativo</h1>
            <p>Periodo actual: <?= htmlspecialchars($range['label']) ?> (<?= htmlspecialchars($periodSubtitle) ?>). Comparacion: <?= htmlspecialchars(strtolower($range['compare_label'])) ?>.</p>
        </div>
        <div class="exec-actions">
            <span class="exec-updated"><?= htmlspecialchars(date('d/m/Y H:i')) ?> - <?= htmlspecialchars($usuarioPanel) ?></span>
        </div>
    </header>

    <form class="exec-searchbar" method="GET" action="panel_empleados.php" role="search" aria-label="Buscador global">
        <input type="hidden" name="periodo" value="<?= htmlspecialchars($range['period']) ?>">
        <input type="hidden" name="desde" value="<?= htmlspecialchars($range['start']->format('Y-m-d')) ?>">
        <input type="hidden" name="hasta" value="<?= htmlspecialchars($range['end']->modify('-1 day')->format('Y-m-d')) ?>">
        <label>
            <span>Buscar en Starlim</span>
            <input type="search" name="q" value="<?= htmlspecialchars($searchTerm) ?>" placeholder="Ventas, clientes, pedidos, cotizaciones, facturas o productos">
        </label>
        <button class="exec-btn exec-btn--primary" type="submit">Buscar</button>
        <?php if ($searchTerm !== ''): ?><a class="exec-btn exec-btn--ghost" href="panel_empleados.php?<?= htmlspecialchars(dash_qs($range)) ?>">Limpiar</a><?php endif; ?>
    </form>

    <?php if ($searchTerm !== ''): ?>
        <section class="exec-search-results" aria-label="Resultados de busqueda global">
            <div class="exec-section-head">
                <div>
                    <h2>Resultados para "<?= htmlspecialchars($searchTerm) ?>"</h2>
                    <p><?= dash_int(count($searchResults)) ?> coincidencias reales encontradas.</p>
                </div>
            </div>
            <?php if (!$searchResults): ?>
                <p class="exec-empty">No se encontraron registros para la busqueda indicada.</p>
            <?php else: ?>
                <div class="exec-search-table">
                    <?php foreach ($searchResults as $result): ?>
                        <a href="<?= htmlspecialchars((string)$result['href']) ?>">
                            <span><?= htmlspecialchars((string)$result['tipo']) ?></span>
                            <strong><?= htmlspecialchars((string)$result['referencia']) ?></strong>
                            <em><?= htmlspecialchars((string)($result['cliente'] ?: '-')) ?></em>
                            <small><?= htmlspecialchars($result['fecha'] ? dash_date_label((string)$result['fecha']) : '-') ?></small>
                            <b><?= $result['importe'] !== null ? htmlspecialchars(dash_money((string)$result['importe'])) : '-' ?></b>
                            <i><?= htmlspecialchars((string)($result['estado'] ?: '-')) ?></i>
                        </a>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>
        </section>
    <?php endif; ?>

    <form class="exec-filterbar" method="GET" action="panel_empleados.php" aria-label="Filtros globales del dashboard">
        <?php if ($searchTerm !== ''): ?><input type="hidden" name="q" value="<?= htmlspecialchars($searchTerm) ?>"><?php endif; ?>
        <label>
            <span>Periodo</span>
            <select name="periodo" id="periodo-dashboard">
                <?php foreach ([
                    'hoy' => 'Hoy',
                    '7d' => 'Ultimos 7 dias',
                    '30d' => 'Ultimos 30 dias',
                    'mes_actual' => 'Mes actual',
                    'mes_anterior' => 'Mes anterior',
                    'anio_actual' => 'Ano actual',
                    'personalizado' => 'Rango personalizado',
                ] as $value => $label): ?>
                    <option value="<?= htmlspecialchars($value) ?>" <?= $range['period'] === $value ? 'selected' : '' ?>><?= htmlspecialchars($label) ?></option>
                <?php endforeach; ?>
            </select>
        </label>
        <label class="exec-custom-date">
            <span>Desde</span>
            <input type="date" name="desde" value="<?= htmlspecialchars($range['start']->format('Y-m-d')) ?>">
        </label>
        <label class="exec-custom-date">
            <span>Hasta</span>
            <input type="date" name="hasta" value="<?= htmlspecialchars($range['end']->modify('-1 day')->format('Y-m-d')) ?>">
        </label>
        <input type="hidden" name="grafico" value="<?= htmlspecialchars($chartMetric) ?>">
        <div class="exec-filter-actions">
            <button class="exec-btn exec-btn--primary" type="submit">Actualizar</button>
            <a class="exec-btn exec-btn--ghost" href="panel_empleados.php">Limpiar filtros</a>
        </div>
    </form>

    <section class="exec-kpi-grid" aria-label="Resumen ejecutivo">
        <?php foreach ($kpis as $kpi): ?>
            <a class="exec-kpi-card" href="<?= htmlspecialchars($kpi['href']) ?>" title="<?= htmlspecialchars($kpi['definition']) ?>">
                <div class="exec-kpi-head">
                    <span><?= htmlspecialchars($kpi['label']) ?></span>
                </div>
                <?php if ($kpi['error']): ?>
                    <strong class="exec-kpi-error">No se pudieron cargar los datos</strong>
                    <div class="exec-kpi-bottom exec-trend--neutral"><em>Reintentar</em><span>La consulta fallo</span></div>
                <?php else: ?>
                    <strong><?= htmlspecialchars($kpi['value']) ?></strong>
                    <div class="exec-kpi-bottom exec-trend--<?= htmlspecialchars(dash_trend_class($kpi['trend'])) ?>">
                        <em><?= htmlspecialchars(dash_pct($kpi['trend'])) ?></em>
                        <span>Anterior: <?= htmlspecialchars($kpi['previous']) ?></span>
                    </div>
                <?php endif; ?>
            </a>
        <?php endforeach; ?>
    </section>

    <?php if ($detailType !== ''): ?>
        <section class="exec-detail-panel exec-card" aria-label="Detalle exacto del KPI">
            <div class="exec-section-head">
                <div>
                    <h2>Detalle exacto: <?= htmlspecialchars($detailType === 'clientes' ? 'clientes activos' : ($detailType === 'pedidos' ? 'pedidos validos' : 'ventas netas')) ?></h2>
                    <p>
                        <?= dash_int($detailSummary['count'] ?? 0) ?> registros para <?= htmlspecialchars($periodSubtitle) ?>.
                        <?php if ($canViewSalesAmounts): ?>Suma: <?= dash_money((string)($detailSummary['sum'] ?? '0')) ?>.<?php endif; ?>
                    </p>
                </div>
                <a href="panel_empleados.php?<?= htmlspecialchars(dash_qs($range, ['grafico' => $chartMetric] + ($searchTerm !== '' ? ['q' => $searchTerm] : []))) ?>">Cerrar detalle</a>
            </div>
            <?php if (!$detailRows): ?>
                <p class="exec-empty">No hay registros para este detalle y periodo.</p>
            <?php else: ?>
                <div class="exec-detail-table">
                    <?php if ($detailType === 'clientes'): ?>
                        <?php foreach ($detailRows as $row): ?>
                            <a href="clientes.php" title="<?= htmlspecialchars((string)$row['referencia']) ?>">
                                <strong><?= htmlspecialchars((string)$row['nombre_cliente']) ?></strong>
                                <span><?= dash_int($row['operaciones']) ?> operaciones</span>
                                <small><?= htmlspecialchars(dash_date_label((string)$row['primera_fecha'])) ?> - <?= htmlspecialchars(dash_date_label((string)$row['ultima_fecha'])) ?></small>
                                <?php if ($canViewSalesAmounts): ?><b><?= dash_money((string)$row['total']) ?></b><?php endif; ?>
                            </a>
                        <?php endforeach; ?>
                    <?php else: ?>
                        <?php foreach ($detailRows as $row): ?>
                            <a href="ventas_registradas.php?nro_factura=<?= urlencode((string)$row['referencia']) ?>">
                                <strong>#<?= htmlspecialchars((string)$row['referencia']) ?></strong>
                                <span><?= htmlspecialchars((string)($row['nombre_cliente'] ?: 'Cliente sin nombre')) ?></span>
                                <small><?= htmlspecialchars(dash_date_label((string)$row['fecha'])) ?></small>
                                <em><?= htmlspecialchars((string)$row['estado']) ?></em>
                                <?php if ($canViewSalesAmounts): ?><b><?= dash_money((string)$row['total']) ?></b><?php endif; ?>
                            </a>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </div>
            <?php endif; ?>
        </section>
    <?php endif; ?>

    <section class="exec-sales-clients-card exec-card">
        <div class="exec-section-head">
            <div>
                <h2>Ventas y clientes</h2>
                <p>Ventas validas, clientes unicos y comportamiento comercial del mismo periodo.</p>
            </div>
        </div>

        <div class="exec-sales-clients-layout">
            <div class="exec-chart-panel">
                <?php if (isset($errors['grafico_ventas']) || isset($errors['grafico_operaciones'])): ?>
                    <p class="exec-empty exec-error">No se pudieron cargar los datos. <a href="panel_empleados.php?<?= htmlspecialchars(dash_qs($range)) ?>">Reintentar</a></p>
                <?php elseif (!$chartRows): ?>
                    <p class="exec-empty">No hay ventas registradas para este periodo.</p>
                <?php else: ?>
                    <div class="exec-curve-chart" data-chart-metric="<?= htmlspecialchars($chartMetric) ?>" data-sales-sensitive="<?= $canViewSalesAmounts ? '1' : '0' ?>">
                        <svg class="exec-sales-curve" viewBox="0 0 <?= (int)$chartPaths['width'] ?> <?= (int)$chartPaths['height'] ?>" role="img" aria-label="Grafico de curva de ventas">
                            <line x1="46" y1="246" x2="802" y2="246"></line>
                            <line x1="46" y1="170" x2="802" y2="170"></line>
                            <line x1="46" y1="94" x2="802" y2="94"></line>
                            <path class="exec-chart-area" d="<?= htmlspecialchars($chartPaths['area']) ?>"></path>
                            <path class="exec-chart-previous" d="<?= htmlspecialchars($chartPaths['previous']) ?>"></path>
                            <path class="exec-chart-current" d="<?= htmlspecialchars($chartPaths['current']) ?>"></path>
                            <?php foreach ($chartRows as $idx => $row): ?>
                                <?php $point = $chartPaths['points'][$idx] ?? null; if (!$point) continue; ?>
                                <circle class="exec-chart-point" cx="<?= htmlspecialchars((string)$point['x']) ?>" cy="<?= htmlspecialchars((string)$point['y']) ?>" r="<?= count($chartRows) <= 8 ? '4' : '3' ?>"
                                    data-label="<?= htmlspecialchars((string)$row['label']) ?>"
                                    data-date="<?= htmlspecialchars(dash_datetime_label((string)$row['bucket_date'])) ?>"
                                    data-orders="<?= htmlspecialchars(dash_int($row['orders'])) ?>"
                                    data-prev-orders="<?= htmlspecialchars(dash_int($row['prev_orders'])) ?>"
                                    <?php if ($canViewSalesAmounts): ?>
                                    data-amount="<?= htmlspecialchars(dash_money((string)$row['amount'])) ?>"
                                    data-ticket="<?= htmlspecialchars(dash_money((string)$row['ticket'])) ?>"
                                    data-prev="<?= htmlspecialchars(dash_money((string)$row['prev_amount'])) ?>"
                                    <?php endif; ?>
                                    data-change="<?= htmlspecialchars(dash_pct($row['amount_change'])) ?>"></circle>
                            <?php endforeach; ?>
                        </svg>
                        <div class="exec-chart-tooltip" hidden></div>
                    </div>
                    <div class="exec-chart-legend">
                        <span><i class="exec-dot exec-dot--primary"></i><?= htmlspecialchars($chartMetricLabels[$chartMetric] ?? 'Ventas netas') ?></span>
                        <span><i class="exec-dot exec-dot--muted"></i><?= htmlspecialchars($range['compare_label']) ?></span>
                        <span>Agrupacion: <?= htmlspecialchars($bucket === 'hour' ? 'hora' : ($bucket === 'day' ? 'dia' : ($bucket === 'week' ? 'semana' : 'mes'))) ?></span>
                    </div>
                    <ul class="exec-chart-table" aria-label="Ultimos puntos del grafico">
                        <?php foreach (array_slice($chartRows, -4) as $row): ?>
                            <li>
                                <span><?= htmlspecialchars((string)$row['label']) ?></span>
                                <strong><?= $chartMetric === 'orders' ? dash_int($row['orders']) : ($chartMetric === 'ticket' ? dash_money((string)$row['ticket']) : dash_money((string)$row['amount'])) ?></strong>
                            </li>
                        <?php endforeach; ?>
                    </ul>
                <?php endif; ?>
            </div>

            <aside class="exec-client-panel">
                <div class="exec-client-summary">
                    <a href="clientes.php"><span>Clientes activos</span><strong><?= dash_int($clientSummary['activos']) ?></strong></a>
                    <a href="clientes.php"><span>Clientes nuevos</span><strong><?= dash_int($clientSummary['nuevos']) ?></strong></a>
                    <a href="clientes.php"><span>Clientes recurrentes</span><strong><?= dash_int($clientSummary['recurrentes']) ?></strong></a>
                    <a href="clientes.php" title="<?= $inactiveRuleDays ? 'Sin compras hace mas de ' . $inactiveRuleDays . ' dias' : 'No hay regla configurada en config_sistema.dashboard_clientes_sin_compras_dias' ?>">
                        <span>Sin compras recientes</span>
                        <strong><?= $inactiveClients === null ? 'No configurado' : dash_int($inactiveClients) ?></strong>
                    </a>
                    <a href="ventas_registradas.php"><span>Promedio ventas/cliente</span><strong><?= $clientSummary['promedio_operaciones_cliente'] === null ? 'Sin datos' : dash_decimal($clientSummary['promedio_operaciones_cliente'], 2) ?></strong></a>
                </div>

                <?php if ($canViewSalesAmounts): ?>
                    <div class="exec-top-clients">
                        <h3>Top clientes</h3>
                        <?php if (!$topClients): ?>
                            <p class="exec-muted">Sin ventas en el periodo.</p>
                        <?php else: ?>
                            <?php foreach ($topClients as $row): ?>
                                <a href="clientes.php" title="<?= htmlspecialchars((string)$row['nombre']) ?>">
                                    <span><?= htmlspecialchars((string)$row['nombre']) ?></span>
                                    <small><?= dash_int($row['operaciones']) ?> operaciones</small>
                                    <strong><?= dash_money((string)$row['total']) ?></strong>
                                    <em><?= dash_pct_plain($row['participacion']) ?></em>
                                </a>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </div>
                <?php endif; ?>
            </aside>
        </div>
    </section>

    <section class="exec-admin-grid">
        <article class="exec-card">
            <div class="exec-section-head">
                <div>
                    <h2>Facturacion y cobranzas</h2>
                    <p>Comprobantes y saldos del periodo seleccionado.</p>
                </div>
                <a href="facturacion.php">Abrir</a>
            </div>
            <div class="exec-kpi-list">
                <div><span>Facturas emitidas</span><strong><?= dash_int($billingSummary['facturas_emitidas']) ?></strong></div>
                <div><span>Pendiente de emitir</span><strong><?= dash_int($billingSummary['pendientes_factura']) ?></strong></div>
                <div><span>Importe facturado</span><strong><?= dash_money($billingSummary['importe_facturado']) ?></strong></div>
                <div><span>Saldo por cobrar</span><strong><?= dash_money($billingSummary['saldo_por_cobrar']) ?></strong></div>
            </div>
        </article>

        <article class="exec-card">
            <div class="exec-section-head">
                <div>
                    <h2>Pedidos y cotizaciones</h2>
                    <p>Estados comerciales que siguen abiertos.</p>
                </div>
                <a href="pedidos.php">Abrir</a>
            </div>
            <div class="exec-kpi-list">
                <a href="pedidos.php"><span>Recibidos</span><strong><?= dash_int($ordersSummary['recibidos']) ?></strong></a>
                <a href="pedidos.php"><span>En proceso</span><strong><?= dash_int($ordersSummary['en_proceso']) ?></strong></a>
                <a href="presupuestos.php"><span>Cotizaciones abiertas</span><strong><?= dash_int($quoteSummary['abiertas']) ?></strong></a>
                <a href="presupuestos.php"><span>Cotizaciones aprobadas</span><strong><?= dash_int($quoteSummary['aprobadas']) ?></strong></a>
            </div>
        </article>

        <article class="exec-card exec-alert-card">
            <div class="exec-section-head">
                <div>
                    <h2>Alertas administrativas</h2>
                    <p>Eventos reales que requieren seguimiento.</p>
                </div>
            </div>
            <div class="exec-alert-list">
                <?php foreach (array_slice($alerts, 0, 4) as $alert): ?>
                    <a class="exec-alert exec-alert--<?= htmlspecialchars($alert['level']) ?>" href="<?= htmlspecialchars($alert['href']) ?>">
                        <span><?= htmlspecialchars(ucfirst($alert['level'])) ?></span>
                        <strong><?= htmlspecialchars($alert['title']) ?></strong>
                        <em><?= htmlspecialchars($alert['detail']) ?></em>
                    </a>
                <?php endforeach; ?>
            </div>
        </article>

        <article class="exec-card">
            <div class="exec-section-head">
                <div>
                    <h2>Recordatorios</h2>
                    <p>Tareas activas ordenadas por urgencia.</p>
                </div>
                <a href="recordatorios.php">Ver todos</a>
            </div>
            <?php if (!$reminders): ?>
                <p class="exec-empty">No hay recordatorios activos.</p>
            <?php else: ?>
                <div class="exec-reminder-list">
                    <?php foreach ($reminders as $rec): ?>
                        <a href="recordatorios.php" class="exec-reminder exec-reminder--<?= htmlspecialchars((string)$rec['status']) ?>">
                            <div>
                                <strong><?= htmlspecialchars((string)$rec['titulo']) ?></strong>
                                <span>Limite: <?= htmlspecialchars($rec['fecha_limite'] ? date('d/m/Y H:i', strtotime((string)$rec['fecha_limite'])) : '-/-') ?></span>
                                <?php if (!empty($rec['usuario'])): ?><small><?= htmlspecialchars((string)$rec['usuario']) ?></small><?php endif; ?>
                            </div>
                            <em><?= htmlspecialchars(strtoupper((string)$rec['status'])) ?></em>
                        </a>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>
        </article>
    </section>
</main>

<script>
(() => {
    const tooltip = document.querySelector('.exec-chart-tooltip');
    const chart = document.querySelector('.exec-curve-chart');
    if (!tooltip || !chart) return;
    const canViewSalesAmounts = chart.dataset.salesSensitive === '1';

    chart.querySelectorAll('.exec-chart-point').forEach((point) => {
        point.addEventListener('mouseenter', () => {
            tooltip.innerHTML = canViewSalesAmounts
                ? `
                    <strong>${point.dataset.date}</strong>
                    <span>Ventas: ${point.dataset.amount}</span>
                    <span>Operaciones: ${point.dataset.orders}</span>
                    <span>Ticket: ${point.dataset.ticket}</span>
                    <span>Periodo anterior: ${point.dataset.prev}</span>
                    <span>Variacion: ${point.dataset.change}</span>
                `
                : `
                    <strong>${point.dataset.date}</strong>
                    <span>Operaciones: ${point.dataset.orders}</span>
                    <span>Periodo anterior: ${point.dataset.prevOrders}</span>
                    <span>Variacion: ${point.dataset.change}</span>
                `;
            tooltip.hidden = false;
        });
        point.addEventListener('mousemove', (event) => {
            const box = chart.getBoundingClientRect();
            tooltip.style.left = Math.min(Math.max(event.clientX - box.left + 14, 12), box.width - 250) + 'px';
            tooltip.style.top = Math.max(event.clientY - box.top - 24, 12) + 'px';
        });
        point.addEventListener('mouseleave', () => {
            tooltip.hidden = true;
        });
    });
})();
</script>
<script src="../js/global.js"></script>
</body>
</html>
