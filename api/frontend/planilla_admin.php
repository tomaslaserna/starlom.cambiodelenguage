<?php
    $PERMITIDOS = ['Jefe', 'Jefe1', 'Admin'];
    require __DIR__ . '/partials/guard.php';

    include '../php/conexion_starlim_be.php';

    /* ── Handle POST ────────────────────────────────────────────────── */
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $accion = $_POST['accion'] ?? '';

        if ($accion === 'add_costo') {
            $concepto  = trim($_POST['concepto'] ?? '');
            $monto     = (float)($_POST['monto'] ?? 0);
            $categoria = trim($_POST['categoria'] ?? 'Otros');
            $fecha     = !empty($_POST['fecha']) ? $_POST['fecha'] : date('Y-m-d');

            if ($concepto !== '' && $monto > 0) {
                $stmt = $conexion->prepare(
                    "INSERT INTO costos_operativos (concepto, monto, categoria, fecha) VALUES (?, ?, ?, ?)"
                );
                $stmt->bind_param('sdss', $concepto, $monto, $categoria, $fecha);
                $stmt->execute();
                $stmt->close();
            }
        }

        if ($accion === 'del_costo') {
            $id = (int)($_POST['id'] ?? 0);
            if ($id > 0) {
                $stmt = $conexion->prepare("DELETE FROM costos_operativos WHERE id = ?");
                $stmt->bind_param('i', $id);
                $stmt->execute();
                $stmt->close();
            }
        }

        header('Location: planilla_admin.php');
        exit;
    }

    /* ── Helpers de fecha ───────────────────────────────────────────── */
    $now_y = (int)date('Y');
    $now_m = (int)date('n');
    $prev_y = $now_m === 1 ? $now_y - 1 : $now_y;
    $prev_m = $now_m === 1 ? 12 : $now_m - 1;

    $inicio_mes    = sprintf('%04d-%02d-01', $now_y, $now_m);
    $inicio_pasado = sprintf('%04d-%02d-01', $prev_y, $prev_m);
    $inicio_sig    = $now_m === 12
                     ? sprintf('%04d-01-01', $now_y + 1)
                     : sprintf('%04d-%02d-01', $now_y, $now_m + 1);

    $meses_es = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    $nombre_mes        = $meses_es[$now_m] . ' ' . $now_y;
    $nombre_mes_pasado = $meses_es[$prev_m] . ' ' . $prev_y;

    /* ── Ventas (solo entregadas = ventas concretadas) ──────────────── */
    $r = $conexion->query("SELECT COALESCE(SUM(monto),0) AS t FROM ventas
                           WHERE fecha >= '$inicio_mes' AND fecha < '$inicio_sig'
                           AND COALESCE(estado_pedido,'entregado') = 'entregado'");
    $ventas_mes = (float)($r ? $r->fetch_assoc()['t'] : 0);

    $r = $conexion->query("SELECT COALESCE(SUM(monto),0) AS t FROM ventas
                           WHERE fecha >= '$inicio_pasado' AND fecha < '$inicio_mes'
                           AND COALESCE(estado_pedido,'entregado') = 'entregado'");
    $ventas_pasado = (float)($r ? $r->fetch_assoc()['t'] : 0);

    /* ── Cobros ─────────────────────────────────────────────────────── */
    $r = $conexion->query("SELECT COALESCE(SUM(monto),0) AS t FROM ventas
                           WHERE fecha >= '$inicio_mes' AND fecha < '$inicio_sig'
                           AND COALESCE(estado_cobro,'pendiente') = 'recibido'
                           AND COALESCE(estado_pedido,'entregado') = 'entregado'");
    $cobros_mes = (float)($r ? $r->fetch_assoc()['t'] : 0);

    $r = $conexion->query("SELECT COALESCE(SUM(monto),0) AS t FROM ventas
                           WHERE fecha >= '$inicio_pasado' AND fecha < '$inicio_mes'
                           AND COALESCE(estado_cobro,'pendiente') = 'recibido'
                           AND COALESCE(estado_pedido,'entregado') = 'entregado'");
    $cobros_pasado = (float)($r ? $r->fetch_assoc()['t'] : 0);

    /* ── CMV ────────────────────────────────────────────────────────── */
    $tc = $conexion->query("SHOW TABLES LIKE 'detalle_ventas'");
    $tiene_detalle = $tc && $tc->num_rows > 0;
    $cmv_mes = $cmv_pasado = 0;

    if ($tiene_detalle) {
        $r = $conexion->query("
            SELECT COALESCE(SUM(dv.cantidad * p.costo), 0) AS cmv
            FROM detalle_ventas dv
            JOIN ventas    v ON v.id = dv.id_venta
            JOIN productos p ON p.id = dv.id_producto
            WHERE v.fecha >= '$inicio_mes' AND v.fecha < '$inicio_sig'
              AND COALESCE(v.estado_pedido,'entregado') = 'entregado'
        ");
        $cmv_mes = (float)($r ? $r->fetch_assoc()['cmv'] : 0);

        $r = $conexion->query("
            SELECT COALESCE(SUM(dv.cantidad * p.costo), 0) AS cmv
            FROM detalle_ventas dv
            JOIN ventas    v ON v.id = dv.id_venta
            JOIN productos p ON p.id = dv.id_producto
            WHERE v.fecha >= '$inicio_pasado' AND v.fecha < '$inicio_mes'
              AND COALESCE(v.estado_pedido,'entregado') = 'entregado'
        ");
        $cmv_pasado = (float)($r ? $r->fetch_assoc()['cmv'] : 0);
    }

    /* ── Ganancias brutas ───────────────────────────────────────────── */
    $ganancia_mes    = $ventas_mes    - $cmv_mes;
    $ganancia_pasado = $ventas_pasado - $cmv_pasado;

    /* ── CMV% y Mark-up% ────────────────────────────────────────────── */
    $cmv_pct        = ($tiene_detalle && $ventas_mes    > 0) ? ($cmv_mes    / $ventas_mes    * 100) : null;
    $cmv_pct_pasado = ($tiene_detalle && $ventas_pasado > 0) ? ($cmv_pasado / $ventas_pasado * 100) : null;
    $markup_pct        = ($tiene_detalle && $cmv_mes    > 0) ? (($ventas_mes    - $cmv_mes)    / $cmv_mes    * 100) : null;
    $markup_pct_pasado = ($tiene_detalle && $cmv_pasado > 0) ? (($ventas_pasado - $cmv_pasado) / $cmv_pasado * 100) : null;

    /* ── Valor de Stock ─────────────────────────────────────────────── */
    $r = $conexion->query("
        SELECT COALESCE(SUM(stock * costo), 0) AS valor,
               COALESCE(SUM(stock), 0)         AS unidades,
               COUNT(*)                         AS productos
        FROM productos WHERE stock > 0
    ");
    $sd = $r ? $r->fetch_assoc() : ['valor' => 0, 'unidades' => 0, 'productos' => 0];

    /* ── Costos operativos mes actual ───────────────────────────────── */
    $r = $conexion->query("
        SELECT id, concepto, monto, categoria, fecha
        FROM costos_operativos
        WHERE fecha >= '$inicio_mes' AND fecha < '$inicio_sig'
        ORDER BY fecha DESC, id DESC
    ");
    $costos_op = [];
    $total_costos_op = 0;
    if ($r) {
        while ($row = $r->fetch_assoc()) {
            $costos_op[]     = $row;
            $total_costos_op += (float)$row['monto'];
        }
    }
    $resultado_neto = $ganancia_mes - $total_costos_op;

    /* ── Presupuestos ───────────────────────────────────────────────── */
    $tp = $conexion->query("SHOW TABLES LIKE 'presupuestos'");
    $presupuestos_mes = $presupuestos_pasado = null;
    if ($tp && $tp->num_rows > 0) {
        $r = $conexion->query("SELECT COUNT(*) AS c FROM presupuestos
                               WHERE fecha >= '$inicio_mes' AND fecha < '$inicio_sig'");
        if ($r) $presupuestos_mes = (int)$r->fetch_assoc()['c'];
        $r = $conexion->query("SELECT COUNT(*) AS c FROM presupuestos
                               WHERE fecha >= '$inicio_pasado' AND fecha < '$inicio_mes'");
        if ($r) $presupuestos_pasado = (int)$r->fetch_assoc()['c'];
    }

    /* ── Datos para gráfico — últimos 12 meses ─────────────────────── */
    $chart_desde  = date('Y-m-01', strtotime('-11 months'));
    $chart_labels = [];
    $chart_months = [];

    for ($i = 11; $i >= 0; $i--) {
        $ts  = strtotime("-$i months");
        $key = date('Y-m', $ts);
        $chart_months[$key] = ['ventas' => 0, 'cmv' => 0];
        $chart_labels[]     = $meses_es[(int)date('n', $ts)] . " '" . date('y', $ts);
    }

    $r = $conexion->query("
        SELECT TO_CHAR(fecha, 'YYYY-MM') AS mes, COALESCE(SUM(monto), 0) AS total
        FROM ventas
        WHERE fecha >= '$chart_desde'
          AND COALESCE(estado_pedido,'entregado') = 'entregado'
        GROUP BY TO_CHAR(fecha, 'YYYY-MM')
    ");
    if ($r) while ($row = $r->fetch_assoc())
        if (isset($chart_months[$row['mes']]))
            $chart_months[$row['mes']]['ventas'] = (float)$row['total'];

    if ($tiene_detalle) {
        $r = $conexion->query("
            SELECT TO_CHAR(v.fecha, 'YYYY-MM') AS mes,
                   COALESCE(SUM(dv.cantidad * p.costo), 0) AS total
            FROM detalle_ventas dv
            JOIN ventas    v ON v.id = dv.id_venta
            JOIN productos p ON p.id = dv.id_producto
            WHERE v.fecha >= '$chart_desde'
              AND COALESCE(v.estado_pedido,'entregado') = 'entregado'
            GROUP BY TO_CHAR(v.fecha, 'YYYY-MM')
        ");
        if ($r) while ($row = $r->fetch_assoc())
            if (isset($chart_months[$row['mes']]))
                $chart_months[$row['mes']]['cmv'] = (float)$row['total'];
    }

    $chart_ventas    = [];
    $chart_cmv       = [];
    $chart_ganancias = [];
    foreach ($chart_months as $d) {
        $chart_ventas[]    = $d['ventas'];
        $chart_cmv[]       = $d['cmv'];
        $chart_ganancias[] = round($d['ventas'] - $d['cmv'], 2);
    }

    /* ── Helpers ────────────────────────────────────────────────────── */
    function fp(float $v): string {
        return '$' . number_format($v, 2, ',', '.');
    }
    function delta(?float $a, ?float $b): ?float {
        if ($a === null || $b === null || $b == 0) return null;
        return (($a - $b) / abs($b)) * 100;
    }
    function delta_badge(?float $d, string $unit = '%'): string {
        if ($d === null)
            return '<span class="adm-delta adm-delta--neutral">Sin datos anteriores</span>';
        $sign  = $d >= 0 ? '+' : '';
        $arrow = $d > 0 ? '↑' : ($d < 0 ? '↓' : '');
        $cls   = $d > 0 ? 'adm-delta--up' : ($d < 0 ? 'adm-delta--down' : 'adm-delta--neutral');
        return '<span class="adm-delta ' . $cls . '">'
             . $sign . number_format($d, 1) . $unit . ' ' . $arrow
             . '</span>';
    }
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Planilla Admin — Star Lim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <link rel="stylesheet" href="../css/panel_ventas.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
    <style>
        /* ── Gráfico ─────────────────────────────────────────────── */
        .adm-chart-panel { margin-bottom: 24px; }
        .adm-chart-wrap  { position: relative; height: 300px; }
        .adm-chart-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 10px;
            margin-bottom: 18px;
        }
        .adm-chart-legend {
            display: flex;
            gap: 16px;
            flex-wrap: wrap;
            align-items: center;
        }
        .adm-legend-dot {
            display: inline-block;
            width: 10px; height: 10px;
            border-radius: 50%;
            margin-right: 5px;
            vertical-align: middle;
        }
        /* ── Encabezado ─────────────────────────────────────────── */
        .adm-header {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 30px;
        }
        .adm-back {
            font-size: 13px;
            font-weight: 600;
            color: rgba(255,255,255,.38);
            transition: color .2s;
            flex-shrink: 0;
        }
        .adm-back:hover { color: #fff; }
        .adm-title {
            font-size: 23px;
            font-weight: 700;
            color: var(--text-color);
            margin: 0;
        }
        .adm-subtitle {
            font-size: 12px;
            opacity: .38;
            margin-left: auto;
            flex-shrink: 0;
        }

        /* ── Fila 3 cards superiores ────────────────────────────── */
        .adm-top-row {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 18px;
            margin-bottom: 24px;
        }
        @media (max-width: 780px) { .adm-top-row { grid-template-columns: 1fr; } }

        .adm-top-card {
            border-radius: 16px;
            padding: 24px 26px;
            border-left: 4px solid #2563eb;
            background: #f4f6f8;
            box-shadow: 0 2px 16px rgba(0,0,0,.06);
            display: flex;
            flex-direction: column;
            gap: 6px;
            transition: background .3s;
        }
        .dark-mode .adm-top-card { background: #101828; box-shadow: 0 4px 32px rgba(0,0,0,.4); }
        .adm-top-card--cost { border-left-color: #667085; }
        .adm-top-card--gain { border-left-color: #16a34a; }
        .adm-top-card--loss { border-left-color: #dc2626; }

        .adm-top-label {
            font-size: 10px; font-weight: 700;
            letter-spacing: .09em; text-transform: uppercase; color: #667085;
        }
        .adm-top-value {
            font-size: 28px; font-weight: 800;
            color: var(--text-color); line-height: 1.1; word-break: break-word;
        }
        .adm-top-value--green { color: #16a34a; }
        .adm-top-value--red   { color: #dc2626; }
        .dark-mode .adm-top-value--green { color: #22c55e; }
        .dark-mode .adm-top-value--red   { color: #ef4444; }
        .adm-top-note { font-size: 11px; opacity: .38; margin-top: 2px; }

        /* ── Grid principal ─────────────────────────────────────── */
        .adm-main-grid {
            display: grid;
            grid-template-columns: 1fr 360px;
            gap: 24px;
            align-items: start;
        }
        @media (max-width: 980px) { .adm-main-grid { grid-template-columns: 1fr; } }

        /* ── Planilla Balance ───────────────────────────────────── */
        .adm-balance-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 18px;
            gap: 12px;
            flex-wrap: wrap;
        }
        .adm-balance-toggle {
            font-size: 12px; font-weight: 600;
            color: #2563eb;
            background: none;
            border: 1px solid rgba(0,85,204,.25);
            border-radius: 6px;
            padding: 5px 12px;
            cursor: pointer;
            font-family: inherit;
            transition: background .2s;
            white-space: nowrap;
        }
        .adm-balance-toggle:hover { background: rgba(0,85,204,.08); }

        .adm-costo-form {
            background: rgba(128,128,128,.05);
            border: 1px solid rgba(128,128,128,.12);
            border-radius: 12px;
            padding: 16px 18px;
            margin-bottom: 18px;
            display: none;
        }
        .adm-costo-form.open { display: block; }

        .adm-form-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-bottom: 10px;
        }
        @media (max-width: 620px) { .adm-form-grid { grid-template-columns: 1fr; } }

        .adm-form-field { display: flex; flex-direction: column; gap: 4px; }
        .adm-form-field.span-full { grid-column: 1 / -1; }
        .adm-form-label {
            font-size: 10px; font-weight: 700;
            letter-spacing: .07em; text-transform: uppercase; color: #667085;
        }
        .adm-form-input, .adm-form-select {
            padding: 8px 11px;
            border-radius: 7px;
            border: 1px solid rgba(128,128,128,.2);
            background: rgba(128,128,128,.06);
            color: var(--text-color);
            font-size: 13.5px;
            font-family: inherit;
            outline: none;
            transition: border-color .2s;
            width: 100%;
            box-sizing: border-box;
        }
        .adm-form-input:focus, .adm-form-select:focus { border-color: #2563eb; }
        .adm-form-select option { background: #101828; }

        .adm-form-submit {
            padding: 8px 20px;
            border-radius: 7px;
            background: #2563eb;
            color: #fff;
            border: none;
            font-size: 13px; font-weight: 600; font-family: inherit;
            cursor: pointer;
            transition: background .2s;
        }
        .adm-form-submit:hover { background: #1e3a8a; }

        /* ── Tabla costos ───────────────────────────────────────── */
        .adm-costos-table {
            width: 100%; border-collapse: collapse; font-size: 13px;
        }
        .adm-costos-table thead th {
            text-align: left;
            font-size: 9.5px; font-weight: 700;
            letter-spacing: .08em; text-transform: uppercase; color: #667085;
            padding: 0 12px 10px 0;
            border-bottom: 1px solid rgba(128,128,128,.12);
        }
        .adm-costos-table tbody td {
            padding: 10px 12px 10px 0;
            border-bottom: 1px solid rgba(128,128,128,.07);
            color: var(--text-color);
            vertical-align: middle;
        }
        .adm-costos-table tbody tr:last-child td { border-bottom: none; }

        .adm-cat-chip {
            display: inline-block; font-size: 10px; font-weight: 600;
            padding: 2px 8px; border-radius: 99px;
            background: rgba(0,85,204,.1); color: #2563eb;
        }
        .dark-mode .adm-cat-chip { background: rgba(77,159,255,.12); color: #60a5fa; }

        .adm-del-btn {
            background: none; border: none;
            color: #dc2626; font-size: 14px;
            cursor: pointer; padding: 2px 6px;
            border-radius: 4px; opacity: .55;
            transition: opacity .2s, background .2s;
        }
        .adm-del-btn:hover { opacity: 1; background: rgba(220,38,38,.08); }

        .adm-costos-empty {
            text-align: center; padding: 28px 0; opacity: .38; font-size: 13px;
        }

        .adm-total-row {
            display: flex; justify-content: space-between; align-items: center;
            padding: 14px 0 0; margin-top: 12px;
            border-top: 2px solid rgba(128,128,128,.12);
            font-weight: 700; font-size: 14px;
        }
        .adm-resultado-row {
            display: flex; justify-content: space-between; align-items: center;
            padding: 12px 16px; margin-top: 10px;
            border-radius: 10px;
            background: rgba(22,163,74,.08);
            font-weight: 700;
        }
        .adm-resultado-row--neg { background: rgba(220,38,38,.08); }

        /* ── Columna derecha ────────────────────────────────────── */
        .adm-right-col { display: flex; flex-direction: column; gap: 18px; }

        .adm-stock-card {
            border-radius: 16px;
            padding: 22px 24px;
            background: linear-gradient(135deg, #2563eb, #1e3a8a);
            color: #fff;
            box-shadow: 0 18px 40px rgba(37,99,235,.28);
        }
        .adm-stock-label {
            font-size: 10px; font-weight: 700;
            letter-spacing: .09em; text-transform: uppercase;
            opacity: .75; margin-bottom: 6px;
        }
        .adm-stock-value {
            font-size: 30px; font-weight: 800;
            line-height: 1.1; word-break: break-word;
        }
        .adm-stock-sub { font-size: 12px; opacity: .65; margin-top: 6px; }

        /* ── Métricas ───────────────────────────────────────────── */
        .adm-metrics-title {
            font-size: 16px; font-weight: 700;
            margin: 0 0 14px; color: var(--text-color);
        }
        .adm-metrics-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }
        .adm-metric-card {
            border-radius: 12px; padding: 14px 16px;
            background: #f4f6f8;
            box-shadow: 0 1px 8px rgba(0,0,0,.05);
            display: flex; flex-direction: column; gap: 4px;
            transition: background .3s;
        }
        .dark-mode .adm-metric-card { background: #101828; box-shadow: none; }
        .adm-metric-label {
            font-size: 9.5px; font-weight: 700;
            letter-spacing: .07em; text-transform: uppercase; color: #667085;
        }
        .adm-metric-value {
            font-size: 16px; font-weight: 700;
            color: var(--text-color); line-height: 1.2; word-break: break-word;
        }
        .adm-metric-vs { font-size: 10px; opacity: .38; }

        /* ── Delta badges ───────────────────────────────────────── */
        .adm-delta { display: inline-block; font-size: 11px; font-weight: 700; }
        .adm-delta--up      { color: #16a34a; }
        .adm-delta--down    { color: #dc2626; }
        .adm-delta--neutral { color: #667085; font-weight: 400; }
        .dark-mode .adm-delta--up   { color: #22c55e; }
        .dark-mode .adm-delta--down { color: #ef4444; }
    </style>
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>

    <?php $NAV_ACTIVA = ''; include __DIR__ . '/partials/nav.php'; ?>

    <main class="dash-main">

        <!-- ── Encabezado ── -->
        <div class="adm-header">
            <a href="panel_empleados.php" class="adm-back">&larr; Volver</a>
            <h1 class="adm-title">Planilla de Administración</h1>
            <span class="adm-subtitle"><?= $nombre_mes ?></span>
        </div>

        <!-- ══════════════════════════════════════════════════════════
             SECCIÓN 1 — Ventas · CMV · Ganancias
        ═══════════════════════════════════════════════════════════ -->
        <div class="adm-top-row">

            <div class="adm-top-card">
                <span class="adm-top-label">Ventas — <?= $nombre_mes ?></span>
                <span class="adm-top-value"><?= fp($ventas_mes) ?></span>
                <span class="adm-top-note">
                    vs <?= $nombre_mes_pasado ?>: <?= fp($ventas_pasado) ?>
                    &nbsp;<?= delta_badge(delta($ventas_mes, $ventas_pasado)) ?>
                </span>
            </div>

            <div class="adm-top-card adm-top-card--cost">
                <span class="adm-top-label">CMV — Costo de Mercadería Vendida</span>
                <?php if ($tiene_detalle): ?>
                    <span class="adm-top-value"><?= fp($cmv_mes) ?></span>
                    <span class="adm-top-note">
                        vs <?= $nombre_mes_pasado ?>: <?= fp($cmv_pasado) ?>
                        &nbsp;<?= delta_badge(delta($cmv_mes, $cmv_pasado)) ?>
                    </span>
                <?php else: ?>
                    <span class="adm-top-value">—</span>
                    <span class="adm-top-note">Sin tabla detalle_ventas</span>
                <?php endif; ?>
            </div>

            <?php
                $g_cls = $ganancia_mes >= 0 ? 'adm-top-card--gain' : 'adm-top-card--loss';
                $g_val = $ganancia_mes >= 0 ? 'adm-top-value--green' : 'adm-top-value--red';
            ?>
            <div class="adm-top-card <?= $g_cls ?>">
                <span class="adm-top-label">Ganancia Bruta — <?= $nombre_mes ?></span>
                <?php if ($tiene_detalle): ?>
                    <span class="adm-top-value <?= $g_val ?>"><?= fp($ganancia_mes) ?></span>
                    <span class="adm-top-note">
                        vs <?= $nombre_mes_pasado ?>: <?= fp($ganancia_pasado) ?>
                        &nbsp;<?= delta_badge(delta($ganancia_mes, $ganancia_pasado)) ?>
                    </span>
                <?php else: ?>
                    <span class="adm-top-value adm-top-value--green"><?= fp($ventas_mes) ?></span>
                    <span class="adm-top-note">Sin CMV — mostrando ventas brutas</span>
                <?php endif; ?>
            </div>

        </div>

        <!-- ══════════════════════════════════════════════════════════
             GRÁFICO LINEAL — últimos 12 meses
        ═══════════════════════════════════════════════════════════ -->
        <section class="dash-panel adm-chart-panel">
            <div class="adm-chart-header">
                <div>
                    <h2 class="panel-title" style="margin-bottom:3px;">Tendencia — últimos 12 meses</h2>
                    <p style="font-size:12px;opacity:.4;margin:0;">
                        Evolución mensual de ventas<?= $tiene_detalle ? ', CMV y ganancia bruta' : '' ?>
                    </p>
                </div>
                <div class="adm-chart-legend" style="font-size:12px;opacity:.7;">
                    <span>
                        <span class="adm-legend-dot" style="background:#2563eb;"></span>Ventas
                    </span>
                    <?php if ($tiene_detalle): ?>
                    <span>
                        <span class="adm-legend-dot" style="background:#667085;"></span>CMV
                    </span>
                    <span>
                        <span class="adm-legend-dot" style="background:#16a34a;"></span>Ganancia
                    </span>
                    <?php endif; ?>
                </div>
            </div>
            <div class="adm-chart-wrap">
                <canvas id="main-chart"></canvas>
            </div>
        </section>

        <!-- ══════════════════════════════════════════════════════════
             GRID PRINCIPAL: Planilla Balance | Stock + Métricas
        ═══════════════════════════════════════════════════════════ -->
        <div class="adm-main-grid">

            <!-- ══ SECCIÓN 2 — Planilla Balance / Costos Operativos ══ -->
            <section class="dash-panel">

                <div class="adm-balance-header">
                    <div>
                        <h2 class="panel-title" style="margin-bottom:2px;">Planilla Balance</h2>
                        <p style="font-size:12px;opacity:.45;margin:0;">
                            Costos operativos — <?= $nombre_mes ?>
                        </p>
                    </div>
                    <button class="adm-balance-toggle" id="toggle-form-btn"
                            onclick="toggleForm()">+ Agregar costo</button>
                </div>

                <!-- Formulario -->
                <form class="adm-costo-form" id="costo-form" method="POST" action="planilla_admin.php">
                    <input type="hidden" name="accion" value="add_costo">
                    <div class="adm-form-grid">
                        <div class="adm-form-field span-full">
                            <label class="adm-form-label">Concepto *</label>
                            <input class="adm-form-input" type="text" name="concepto"
                                   required placeholder="Ej: Alquiler local, Sueldo vendedor...">
                        </div>
                        <div class="adm-form-field">
                            <label class="adm-form-label">Monto ($) *</label>
                            <input class="adm-form-input" type="number" name="monto"
                                   required min="0.01" step="0.01" placeholder="0,00">
                        </div>
                        <div class="adm-form-field">
                            <label class="adm-form-label">Fecha</label>
                            <input class="adm-form-input" type="date" name="fecha"
                                   value="<?= date('Y-m-d') ?>">
                        </div>
                        <div class="adm-form-field span-full">
                            <label class="adm-form-label">Categoría</label>
                            <select class="adm-form-select" name="categoria">
                                <option value="Alquiler">Alquiler</option>
                                <option value="Sueldos">Sueldos</option>
                                <option value="Servicios">Servicios (agua / luz / gas)</option>
                                <option value="Transporte">Transporte / Logística</option>
                                <option value="Marketing">Marketing</option>
                                <option value="Impuestos">Impuestos / Tasas</option>
                                <option value="Otros" selected>Otros</option>
                            </select>
                        </div>
                    </div>
                    <button class="adm-form-submit" type="submit">Guardar costo</button>
                </form>

                <!-- Tabla -->
                <?php if (empty($costos_op)): ?>
                    <p class="adm-costos-empty">Sin costos operativos registrados este mes.</p>
                <?php else: ?>
                <table class="adm-costos-table">
                    <thead>
                        <tr>
                            <th>Concepto</th>
                            <th>Categoría</th>
                            <th>Fecha</th>
                            <th style="text-align:right;">Monto</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($costos_op as $c): ?>
                        <tr>
                            <td><?= htmlspecialchars($c['concepto']) ?></td>
                            <td><span class="adm-cat-chip"><?= htmlspecialchars($c['categoria']) ?></span></td>
                            <td style="opacity:.55;font-size:12px;"><?= date('d/m', strtotime($c['fecha'])) ?></td>
                            <td style="text-align:right;font-weight:600;"><?= fp((float)$c['monto']) ?></td>
                            <td>
                                <form method="POST" action="planilla_admin.php"
                                      onsubmit="return confirm('¿Eliminar este costo?')">
                                    <input type="hidden" name="accion" value="del_costo">
                                    <input type="hidden" name="id"     value="<?= (int)$c['id'] ?>">
                                    <button class="adm-del-btn" type="submit" title="Eliminar"></button>
                                </form>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
                <?php endif; ?>

                <!-- Totales -->
                <div class="adm-total-row">
                    <span>Total costos operativos <?= $nombre_mes ?></span>
                    <span class="c-red"><?= fp($total_costos_op) ?></span>
                </div>

                <?php
                    $r_cls = $resultado_neto >= 0 ? '' : ' adm-resultado-row--neg';
                    $r_col = $resultado_neto >= 0 ? 'adm-top-value--green' : 'adm-top-value--red';
                ?>
                <div class="adm-resultado-row<?= $r_cls ?>">
                    <div>
                        <div style="font-size:13px;font-weight:700;color:var(--text-color);">
                            Resultado Neto — <?= $nombre_mes ?>
                        </div>
                        <div style="font-size:11px;opacity:.45;font-weight:400;">
                            Ganancia bruta − costos operativos
                        </div>
                    </div>
                    <span class="adm-top-value <?= $r_col ?>" style="font-size:20px;">
                        <?= fp($resultado_neto) ?>
                    </span>
                </div>

            </section>

            <!-- ══ Columna derecha ══ -->
            <div class="adm-right-col">

                <!-- SECCIÓN 3 — Valor de Stock -->
                <div class="adm-stock-card">
                    <p class="adm-stock-label">Valor de Stock ($)</p>
                    <p class="adm-stock-value"><?= fp((float)$sd['valor']) ?></p>
                    <p class="adm-stock-sub">
                        <?= number_format((int)$sd['unidades'], 0, ',', '.') ?> unidades
                        en <?= (int)$sd['productos'] ?> productos con stock
                    </p>
                </div>

                <!-- SECCIÓN 4 — Métricas comparación mes pasado -->
                <section class="dash-panel" style="padding-bottom:20px;">
                    <h2 class="adm-metrics-title">
                        Métricas
                        <small style="font-size:11px;font-weight:400;opacity:.4;">
                            vs <?= $nombre_mes_pasado ?>
                        </small>
                    </h2>

                    <div class="adm-metrics-grid">

                        <div class="adm-metric-card">
                            <span class="adm-metric-label">Ventas</span>
                            <span class="adm-metric-value"><?= fp($ventas_mes) ?></span>
                            <?= delta_badge(delta($ventas_mes, $ventas_pasado)) ?>
                            <span class="adm-metric-vs">vs <?= fp($ventas_pasado) ?></span>
                        </div>

                        <div class="adm-metric-card">
                            <span class="adm-metric-label">Cobros</span>
                            <span class="adm-metric-value"><?= fp($cobros_mes) ?></span>
                            <?= delta_badge(delta($cobros_mes, $cobros_pasado)) ?>
                            <span class="adm-metric-vs">vs <?= fp($cobros_pasado) ?></span>
                        </div>

                        <div class="adm-metric-card">
                            <span class="adm-metric-label">Stock ($)</span>
                            <span class="adm-metric-value"><?= fp((float)$sd['valor']) ?></span>
                            <span class="adm-delta adm-delta--neutral">Valor actual</span>
                            <span class="adm-metric-vs"><?= number_format((int)$sd['unidades'],0,',','.') ?> uds.</span>
                        </div>

                        <div class="adm-metric-card">
                            <span class="adm-metric-label">Presupuestos</span>
                            <?php if ($presupuestos_mes !== null): ?>
                                <span class="adm-metric-value"><?= $presupuestos_mes ?></span>
                                <?= delta_badge(delta((float)$presupuestos_mes, (float)$presupuestos_pasado), '') ?>
                                <span class="adm-metric-vs">vs <?= $presupuestos_pasado ?></span>
                            <?php else: ?>
                                <span class="adm-metric-value" style="font-size:18px;opacity:.3;">—</span>
                                <span class="adm-delta adm-delta--neutral">Sin módulo activo</span>
                            <?php endif; ?>
                        </div>

                        <div class="adm-metric-card">
                            <span class="adm-metric-label">CMV %</span>
                            <?php if ($cmv_pct !== null): ?>
                                <span class="adm-metric-value"><?= number_format($cmv_pct, 1) ?>%</span>
                                <?php
                                    /* CMV% más bajo = mejor → invertimos el delta */
                                    $d_cmv_inv = ($cmv_pct_pasado !== null)
                                        ? -delta($cmv_pct, $cmv_pct_pasado) : null;
                                    echo delta_badge($d_cmv_inv);
                                ?>
                                <span class="adm-metric-vs">vs <?= $cmv_pct_pasado !== null ? number_format($cmv_pct_pasado,1).'%' : '—' ?></span>
                            <?php else: ?>
                                <span class="adm-metric-value" style="font-size:18px;opacity:.3;">—</span>
                                <span class="adm-delta adm-delta--neutral">Sin detalle de ventas</span>
                            <?php endif; ?>
                        </div>

                        <div class="adm-metric-card">
                            <span class="adm-metric-label">Mark-up %</span>
                            <?php if ($markup_pct !== null): ?>
                                <span class="adm-metric-value"><?= number_format($markup_pct, 1) ?>%</span>
                                <?= delta_badge(delta($markup_pct, $markup_pct_pasado)) ?>
                                <span class="adm-metric-vs">vs <?= $markup_pct_pasado !== null ? number_format($markup_pct_pasado,1).'%' : '—' ?></span>
                            <?php else: ?>
                                <span class="adm-metric-value" style="font-size:18px;opacity:.3;">—</span>
                                <span class="adm-delta adm-delta--neutral">Sin detalle de ventas</span>
                            <?php endif; ?>
                        </div>

                    </div>
                </section>

            </div><!-- /.adm-right-col -->

        </div><!-- /.adm-main-grid -->

    </main>

    <script>
        function toggleForm() {
            const form = document.getElementById('costo-form');
            const btn  = document.getElementById('toggle-form-btn');
            form.classList.toggle('open');
            btn.textContent = form.classList.contains('open') ? '− Cerrar' : '+ Agregar costo';
        }

        /* ── Gráfico lineal ── */
        (function () {
            const isDark  = () => document.body.classList.contains('dark-mode');
            const textClr = () => isDark() ? '#98a2b3' : '#667085';
            const gridClr = () => isDark() ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';

            const labels    = <?= json_encode($chart_labels) ?>;
            const dVentas   = <?= json_encode($chart_ventas) ?>;
            const dCmv      = <?= json_encode($chart_cmv) ?>;
            const dGanancia = <?= json_encode($chart_ganancias) ?>;
            const tieneDet  = <?= $tiene_detalle ? 'true' : 'false' ?>;

            const fmt = v => {
                if (Math.abs(v) >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M';
                if (Math.abs(v) >= 1_000)     return '$' + (v / 1_000).toFixed(0) + 'k';
                return '$' + v;
            };
            const fmtFull = v =>
                '$' + v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            const datasets = [
                {
                    label: 'Ventas',
                    data: dVentas,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(0,119,255,0.08)',
                    borderWidth: 2.5,
                    tension: 0.35,
                    fill: true,
                    pointRadius: 4,
                    pointHoverRadius: 7,
                    pointBackgroundColor: '#2563eb',
                }
            ];

            if (tieneDet) {
                datasets.push({
                    label: 'CMV',
                    data: dCmv,
                    borderColor: '#667085',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [6, 4],
                    tension: 0.35,
                    fill: false,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#667085',
                });
                datasets.push({
                    label: 'Ganancia Bruta',
                    data: dGanancia,
                    borderColor: '#16a34a',
                    backgroundColor: 'rgba(22,163,74,0.07)',
                    borderWidth: 2.5,
                    tension: 0.35,
                    fill: true,
                    pointRadius: 4,
                    pointHoverRadius: 7,
                    pointBackgroundColor: '#16a34a',
                });
            }

            const config = {
                type: 'line',
                data: { labels, datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: isDark() ? '#101828' : '#fff',
                            borderColor: isDark() ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                            borderWidth: 1,
                            titleColor: textClr(),
                            bodyColor: textClr(),
                            padding: 12,
                            callbacks: {
                                label: ctx => ' ' + ctx.dataset.label + ': ' + fmtFull(ctx.parsed.y)
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid:  { color: gridClr() },
                            ticks: { color: textClr(), font: { size: 11 } }
                        },
                        y: {
                            grid:  { color: gridClr() },
                            ticks: {
                                color: textClr(),
                                font: { size: 11 },
                                callback: fmt
                            }
                        }
                    }
                }
            };

            const chart = new Chart(
                document.getElementById('main-chart').getContext('2d'),
                config
            );

            /* Actualizar colores al cambiar modo oscuro */
            document.getElementById('dark-mode-toggle')?.addEventListener('click', () => {
                setTimeout(() => {
                    chart.options.plugins.tooltip.backgroundColor = isDark() ? '#101828' : '#fff';
                    chart.options.plugins.tooltip.titleColor = textClr();
                    chart.options.plugins.tooltip.bodyColor  = textClr();
                    chart.options.scales.x.grid.color  = gridClr();
                    chart.options.scales.x.ticks.color = textClr();
                    chart.options.scales.y.grid.color  = gridClr();
                    chart.options.scales.y.ticks.color = textClr();
                    chart.update();
                }, 50);
            });
        })();
    </script>
    <script src="../js/global.js"></script>
</body>
</html>
