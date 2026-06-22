<?php
$PERMITIDOS = ['Empleado', 'Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'];
require __DIR__ . '/partials/guard.php';

include '../php/conexion_starlim_be.php';
require_once __DIR__ . '/../php/admin_permissions.php';

$empresaId = starlim_bootstrap_tenant_context($conexion);
starlim_admin_require($conexion, 'admin.tesoreria', 'ver');
$pdo = $conexion->getPDO();

date_default_timezone_set('America/Argentina/Buenos_Aires');

function tes_h($value): string { return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8'); }
function tes_decimal($value, int $decimals = 2): string {
    $raw = trim((string)($value ?? '0'));
    if ($raw === '' || !is_numeric($raw)) $raw = '0';
    $negative = str_starts_with($raw, '-');
    $raw = ltrim($raw, '+-');
    [$whole, $fraction] = array_pad(explode('.', $raw, 2), 2, '');
    $whole = $whole === '' ? '0' : ltrim($whole, '0');
    $whole = $whole === '' ? '0' : $whole;
    $fraction = substr(str_pad($fraction, $decimals, '0'), 0, $decimals);
    $formattedWhole = number_format((int)$whole, 0, ',', '.');
    return ($negative ? '-' : '') . $formattedWhole . ',' . $fraction;
}
function tes_money($value): string {
    return '$ ' . tes_decimal($value, 2);
}
function tes_query_one(PDO $pdo, string $sql, array $params): array {
    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
    } catch (Throwable $e) {
        error_log('[Starlim Tesoreria] ' . $e->getMessage());
        return [];
    }
}
function tes_query_all(PDO $pdo, string $sql, array $params): array {
    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        error_log('[Starlim Tesoreria] ' . $e->getMessage());
        return [];
    }
}

$desde = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($_GET['desde'] ?? '')) ? (string)$_GET['desde'] : date('Y-m-01');
$hasta = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($_GET['hasta'] ?? '')) ? (string)$_GET['hasta'] : date('Y-m-d');
$hastaExclusive = date('Y-m-d', strtotime($hasta . ' +1 day'));

$periodo = tes_query_one($pdo, "
    SELECT
        ROUND(COALESCE(SUM(CASE WHEN tipo = 'cobro' THEN monto ELSE 0 END), 0), 2)::text AS ingresos,
        ROUND(COALESCE(SUM(CASE WHEN tipo = 'pago' THEN monto ELSE 0 END), 0), 2)::text AS egresos,
        ROUND(COALESCE(SUM(CASE WHEN tipo = 'cobro' THEN monto ELSE -monto END), 0), 2)::text AS neto
    FROM pagos_registro
    WHERE empresa_id = :empresa_periodo
      AND fecha >= :desde_periodo
      AND fecha < :hasta_periodo
", ['empresa_periodo' => $empresaId, 'desde_periodo' => $desde, 'hasta_periodo' => $hastaExclusive]) + ['ingresos' => '0', 'egresos' => '0', 'neto' => '0'];

$acumulado = tes_query_one($pdo, "
    SELECT ROUND(COALESCE(SUM(CASE WHEN tipo = 'cobro' THEN monto ELSE -monto END), 0), 2)::text AS saldo
    FROM pagos_registro
    WHERE empresa_id = :empresa_acum
      AND fecha < :hasta_acum
", ['empresa_acum' => $empresaId, 'hasta_acum' => $hastaExclusive]) + ['saldo' => '0'];

$cuentas = tes_query_all($pdo, "
    WITH ingresos_por_destino AS (
        SELECT COALESCE(NULLIF(TRIM(cobro_destino), ''), 'Cuenta no informada') AS cuenta,
               ROUND(COALESCE(SUM(COALESCE(cobro_monto_registrado, monto)), 0), 2) AS ingresos
        FROM ventas
        WHERE empresa_id = :empresa_ing
          AND COALESCE(estado_cobro, 'pendiente') = 'recibido'
          AND cobro_fecha IS NOT NULL
          AND cobro_fecha < :hasta_ing
        GROUP BY 1
    ),
    egresos_sin_cuenta AS (
        SELECT 'Egresos sin cuenta asignada' AS cuenta,
               ROUND(COALESCE(SUM(monto), 0), 2) AS egresos
        FROM pagos_registro
        WHERE empresa_id = :empresa_egr
          AND tipo = 'pago'
          AND fecha < :hasta_egr
    )
    SELECT cuenta, ingresos::text, '0'::text AS egresos, ingresos::text AS saldo
    FROM ingresos_por_destino
    UNION ALL
    SELECT cuenta, '0'::text AS ingresos, egresos::text AS egresos, (-egresos)::text AS saldo
    FROM egresos_sin_cuenta
    WHERE egresos > 0
    ORDER BY cuenta
", ['empresa_ing' => $empresaId, 'hasta_ing' => $hastaExclusive, 'empresa_egr' => $empresaId, 'hasta_egr' => $hastaExclusive]);

$proyeccion = tes_query_one($pdo, "
    SELECT
        (SELECT ROUND(COALESCE(SUM(GREATEST(monto - COALESCE(cobro_monto_registrado,0), 0)), 0), 2)::text
         FROM ventas
         WHERE empresa_id = :empresa_cobros
           AND COALESCE(estado_cobro,'pendiente') IN ('pendiente','vencido','en_proceso','pendiente_aprobacion')
           AND COALESCE(estado_pedido,'entregado') = 'entregado') AS cobros_pendientes,
        (SELECT ROUND(COALESCE(SUM(GREATEST(total - COALESCE(monto_pagado,0), 0)), 0), 2)::text
         FROM compras_registro
         WHERE empresa_id = :empresa_pagos
           AND COALESCE(pagado,0) = 0
           AND COALESCE(estado,'') <> 'cancelada') AS pagos_pendientes
", ['empresa_cobros' => $empresaId, 'empresa_pagos' => $empresaId]) + ['cobros_pendientes' => '0', 'pagos_pendientes' => '0'];

$saldoProyectado = tes_query_one($pdo, "
    SELECT ROUND(
        CAST(:saldo_actual AS numeric)
        + CAST(:cobros_pendientes AS numeric)
        - CAST(:pagos_pendientes AS numeric),
        2
    )::text AS saldo
", [
    'saldo_actual' => $acumulado['saldo'],
    'cobros_pendientes' => $proyeccion['cobros_pendientes'],
    'pagos_pendientes' => $proyeccion['pagos_pendientes'],
]) + ['saldo' => '0'];

$ultimos = tes_query_all($pdo, "
    SELECT tipo, entidad_nombre, concepto, ROUND(monto, 2)::text AS monto, fecha::text AS fecha
    FROM pagos_registro
    WHERE empresa_id = :empresa_ultimos
      AND fecha >= :desde_ultimos
      AND fecha < :hasta_ultimos
    ORDER BY fecha DESC, id DESC
    LIMIT 12
", ['empresa_ultimos' => $empresaId, 'desde_ultimos' => $desde, 'hasta_ultimos' => $hastaExclusive]);
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tesoreria - Starlim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>
<?php $NAV_ACTIVA = 'admin'; $ADMIN_ACTIVA = 'admin.tesoreria'; include __DIR__ . '/partials/nav.php'; ?>

<main class="dash-main admin-page">
    <header class="admin-page-head">
        <div>
            <p class="exec-kicker">Administracion</p>
            <h1>Tesoreria</h1>
            <p>Analisis de liquidez basado en Cobros y Pagos, cuentas registradas y arqueo acumulado.</p>
        </div>
    </header>

    <form class="admin-filterbar" method="GET">
        <label><span>Desde</span><input type="date" name="desde" value="<?= tes_h($desde) ?>"></label>
        <label><span>Hasta</span><input type="date" name="hasta" value="<?= tes_h($hasta) ?>"></label>
        <div class="admin-filter-actions">
            <button class="exec-btn exec-btn--primary" type="submit">Actualizar</button>
            <a class="exec-btn exec-btn--ghost" href="admin_tesoreria.php">Mes actual</a>
        </div>
    </form>

    <section class="admin-treasury-grid">
        <article class="exec-kpi-card">
            <div class="exec-kpi-head"><span>Liquidez acumulada</span><small>Cobros menos pagos registrados hasta <?= tes_h($hasta) ?>.</small></div>
            <strong><?= tes_money($acumulado['saldo']) ?></strong>
        </article>
        <article class="exec-kpi-card">
            <div class="exec-kpi-head"><span>Ingresos del periodo</span><small>Cobros registrados en Cobros y Pagos.</small></div>
            <strong><?= tes_money($periodo['ingresos']) ?></strong>
        </article>
        <article class="exec-kpi-card">
            <div class="exec-kpi-head"><span>Egresos del periodo</span><small>Pagos registrados en Cobros y Pagos.</small></div>
            <strong><?= tes_money($periodo['egresos']) ?></strong>
        </article>
        <article class="exec-kpi-card">
            <div class="exec-kpi-head"><span>Flujo neto periodo</span><small>Ingresos menos egresos del rango.</small></div>
            <strong><?= tes_money($periodo['neto']) ?></strong>
        </article>
    </section>

    <section class="admin-card">
        <div class="admin-card-head"><div><h2>Arqueo por cuenta</h2><p>Destino declarado en cobros aprobados y egresos registrados.</p></div></div>
        <?php if (!$cuentas): ?>
            <p class="exec-empty">No hay cuentas o destinos registrados.</p>
        <?php else: ?>
            <div class="admin-treasury-table">
                <div class="admin-treasury-row admin-treasury-row--head"><span>Cuenta</span><span>Ingresos</span><span>Egresos</span><span>Saldo</span></div>
                <?php foreach ($cuentas as $row): ?>
                    <div class="admin-treasury-row">
                        <strong><?= tes_h($row['cuenta']) ?></strong>
                        <span><?= tes_money($row['ingresos']) ?></span>
                        <span><?= tes_money($row['egresos']) ?></span>
                        <b><?= tes_money($row['saldo']) ?></b>
                    </div>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>
    </section>

    <section class="admin-treasury-split">
        <article class="admin-card">
            <div class="admin-card-head"><div><h2>Liquidez proyectada</h2><p>Pendientes detectados desde ventas y compras.</p></div></div>
            <div class="exec-kpi-list">
                <a href="panel_cobros_pagos.php?tab=cobros"><span>Cobros pendientes</span><strong><?= tes_money($proyeccion['cobros_pendientes']) ?></strong></a>
                <a href="panel_cobros_pagos.php?tab=pagos"><span>Pagos pendientes</span><strong><?= tes_money($proyeccion['pagos_pendientes']) ?></strong></a>
                <div><span>Saldo proyectado</span><strong><?= tes_money($saldoProyectado['saldo']) ?></strong></div>
            </div>
        </article>
        <article class="admin-card">
            <div class="admin-card-head"><div><h2>Ultimos movimientos</h2><p>Cobros y pagos del periodo seleccionado.</p></div></div>
            <?php if (!$ultimos): ?>
                <p class="exec-empty">No hay movimientos en este periodo.</p>
            <?php else: ?>
                <div class="exec-kpi-list">
                    <?php foreach ($ultimos as $row): ?>
                        <a href="panel_cobros_pagos.php?tab=registro">
                            <span><?= tes_h(ucfirst($row['tipo']) . ' - ' . ($row['entidad_nombre'] ?: 'Sin entidad')) ?></span>
                            <strong><?= tes_money($row['monto']) ?></strong>
                        </a>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>
        </article>
    </section>
</main>

<script src="../js/global.js"></script>
</body>
</html>
