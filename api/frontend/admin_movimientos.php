<?php
$PERMITIDOS = ['Empleado', 'Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'];
require __DIR__ . '/partials/guard.php';

include '../php/conexion_starlim_be.php';
require_once __DIR__ . '/../php/admin_permissions.php';

$empresaId = starlim_bootstrap_tenant_context($conexion);
starlim_admin_require($conexion, 'admin.movimientos', 'ver');
$pdo = $conexion->getPDO();

date_default_timezone_set('America/Argentina/Buenos_Aires');

function adm_h($value): string { return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8'); }
function adm_dt(?string $value): string {
    if (!$value) return '-';
    $ts = strtotime($value);
    return $ts ? date('d/m/Y H:i', $ts) : '-';
}

function adm_table_exists(PDO $pdo, string $table): bool {
    $stmt = $pdo->prepare("SELECT to_regclass(?) IS NOT NULL");
    $stmt->execute(['public.' . $table]);
    return (bool)$stmt->fetchColumn();
}

function adm_fetch_all(PDO $pdo, string $sql, array $params): array {
    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        error_log('[Starlim Admin Movimientos] ' . $e->getMessage());
        return [];
    }
}

$desde = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($_GET['desde'] ?? '')) ? (string)$_GET['desde'] : date('Y-m-d', strtotime('-30 days'));
$hasta = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($_GET['hasta'] ?? '')) ? (string)$_GET['hasta'] : date('Y-m-d');
$usuarioFiltro = trim((string)($_GET['usuario'] ?? ''));
$tipoFiltro = trim((string)($_GET['tipo'] ?? ''));
$hastaExclusive = date('Y-m-d', strtotime($hasta . ' +1 day'));

$usuarios = [];
try {
    $stmt = $pdo->prepare("
        SELECT DISTINCT COALESCE(NULLIF(usuario,''), nombre_completo) AS usuario
        FROM usuarios u
        JOIN usuario_empresa ue ON ue.id_usuario = u.id
        WHERE ue.empresa_id = ?
          AND COALESCE(NULLIF(usuario,''), nombre_completo) <> ''
        ORDER BY 1
    ");
    $stmt->execute([$empresaId]);
    $usuarios = array_map(fn($r) => (string)$r['usuario'], $stmt->fetchAll(PDO::FETCH_ASSOC));
} catch (Throwable $e) {
    $usuarios = [];
}

$movimientos = [];

if (adm_table_exists($pdo, 'admin_audit_log')) {
    $where = ['empresa_id = :empresa_admin', 'created_at >= :desde_admin', 'created_at < :hasta_admin'];
    $params = ['empresa_admin' => $empresaId, 'desde_admin' => $desde, 'hasta_admin' => $hastaExclusive];
    if ($usuarioFiltro !== '') { $where[] = 'usuario = :usuario_admin'; $params['usuario_admin'] = $usuarioFiltro; }
    if ($tipoFiltro !== '') { $where[] = '(recurso = :tipo_admin OR accion = :accion_admin)'; $params['tipo_admin'] = $tipoFiltro; $params['accion_admin'] = $tipoFiltro; }
    $movimientos = array_merge($movimientos, adm_fetch_all($pdo, "
        SELECT created_at::text AS fecha,
               usuario,
               recurso,
               accion,
               objeto_tipo,
               objeto_id,
               detalle_json::text AS detalle,
               'Administracion' AS origen
        FROM admin_audit_log
        WHERE " . implode(' AND ', $where) . "
        ORDER BY created_at DESC
        LIMIT 250
    ", $params));
}

if (adm_table_exists($pdo, 'ventas_modificaciones')) {
    $where = ['empresa_id = :empresa_ventas', 'fecha >= :desde_ventas', 'fecha < :hasta_ventas'];
    $params = ['empresa_ventas' => $empresaId, 'desde_ventas' => $desde, 'hasta_ventas' => $hastaExclusive];
    if ($usuarioFiltro !== '') { $where[] = 'empleado = :usuario_ventas'; $params['usuario_ventas'] = $usuarioFiltro; }
    if ($tipoFiltro !== '') { $where[] = 'accion = :accion_ventas'; $params['accion_ventas'] = $tipoFiltro; }
    $movimientos = array_merge($movimientos, adm_fetch_all($pdo, "
        SELECT fecha::text AS fecha,
               empleado AS usuario,
               'ventas' AS recurso,
               accion,
               'venta' AS objeto_tipo,
               venta_id::text AS objeto_id,
               cambios AS detalle,
               'Ventas' AS origen
        FROM ventas_modificaciones
        WHERE " . implode(' AND ', $where) . "
        ORDER BY fecha DESC
        LIMIT 250
    ", $params));
}

if (adm_table_exists($pdo, 'eventos_integracion')) {
    $where = ['empresa_id = :empresa_eventos', 'creado_en >= :desde_eventos', 'creado_en < :hasta_eventos'];
    $params = ['empresa_eventos' => $empresaId, 'desde_eventos' => $desde, 'hasta_eventos' => $hastaExclusive];
    if ($tipoFiltro !== '') { $where[] = 'tipo = :tipo_eventos'; $params['tipo_eventos'] = $tipoFiltro; }
    $movimientos = array_merge($movimientos, adm_fetch_all($pdo, "
        SELECT creado_en::text AS fecha,
               COALESCE(datos::jsonb->>'usuario', datos::jsonb->>'empleado', '') AS usuario,
               'integracion' AS recurso,
               tipo AS accion,
               COALESCE(datos::jsonb->>'objeto', datos::jsonb->>'entidad', '') AS objeto_tipo,
               COALESCE(datos::jsonb->>'id', datos::jsonb->>'venta_id', '') AS objeto_id,
               datos::text AS detalle,
               'Integraciones' AS origen
        FROM eventos_integracion
        WHERE " . implode(' AND ', $where) . "
        ORDER BY creado_en DESC
        LIMIT 250
    ", $params));
}

usort($movimientos, fn($a, $b) => strcmp((string)($b['fecha'] ?? ''), (string)($a['fecha'] ?? '')));
$movimientos = array_slice($movimientos, 0, 300);

$tipos = [];
foreach ($movimientos as $mov) {
    $accion = trim((string)($mov['accion'] ?? ''));
    if ($accion !== '') $tipos[$accion] = true;
}
$tipos = array_keys($tipos);
sort($tipos);
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Registros de movimientos - Starlim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>
<?php $NAV_ACTIVA = 'admin'; $ADMIN_ACTIVA = 'admin.movimientos'; include __DIR__ . '/partials/nav.php'; ?>

<main class="dash-main admin-page">
    <header class="admin-page-head">
        <div>
            <p class="exec-kicker">Administracion</p>
            <h1>Registros de movimientos</h1>
            <p>Auditoria de acciones administrativas, ediciones de ventas y eventos operativos registrados.</p>
        </div>
    </header>

    <form class="admin-filterbar" method="GET">
        <label><span>Desde</span><input type="date" name="desde" value="<?= adm_h($desde) ?>"></label>
        <label><span>Hasta</span><input type="date" name="hasta" value="<?= adm_h($hasta) ?>"></label>
        <label>
            <span>Empleado</span>
            <select name="usuario">
                <option value="">Todos</option>
                <?php foreach ($usuarios as $u): ?>
                    <option value="<?= adm_h($u) ?>" <?= $usuarioFiltro === $u ? 'selected' : '' ?>><?= adm_h($u) ?></option>
                <?php endforeach; ?>
            </select>
        </label>
        <label>
            <span>Tipo</span>
            <input type="text" name="tipo" value="<?= adm_h($tipoFiltro) ?>" placeholder="accion o recurso">
        </label>
        <div class="admin-filter-actions">
            <button class="exec-btn exec-btn--primary" type="submit">Filtrar</button>
            <a class="exec-btn exec-btn--ghost" href="admin_movimientos.php">Limpiar</a>
        </div>
    </form>

    <section class="admin-card">
        <div class="admin-card-head">
            <div>
                <h2>Movimientos</h2>
                <p><?= count($movimientos) ?> registros encontrados.</p>
            </div>
        </div>

        <?php if (!$movimientos): ?>
            <p class="exec-empty">No hay movimientos para los filtros seleccionados.</p>
        <?php else: ?>
            <div class="admin-movement-list">
                <?php foreach ($movimientos as $mov): ?>
                    <article class="admin-movement">
                        <div>
                            <span><?= adm_h($mov['origen'] ?? '') ?></span>
                            <strong><?= adm_h(($mov['recurso'] ?? '-') . ' / ' . ($mov['accion'] ?? '-')) ?></strong>
                            <p><?= adm_h($mov['detalle'] ?? '') ?></p>
                        </div>
                        <aside>
                            <strong><?= adm_h($mov['usuario'] ?: 'Sistema') ?></strong>
                            <span><?= adm_dt((string)($mov['fecha'] ?? '')) ?></span>
                            <?php if (!empty($mov['objeto_tipo']) || !empty($mov['objeto_id'])): ?>
                                <em><?= adm_h(trim(($mov['objeto_tipo'] ?? '') . ' #' . ($mov['objeto_id'] ?? ''))) ?></em>
                            <?php endif; ?>
                        </aside>
                    </article>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>
    </section>
</main>

<script src="../js/global.js"></script>
</body>
</html>
