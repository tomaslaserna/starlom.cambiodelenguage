<?php
$PERMITIDOS = ['Empleado', 'Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'];
require __DIR__ . '/partials/guard.php';
include '../php/conexion_starlim_be.php';
require_once __DIR__ . '/../php/admin_reports.php';

[$pdo, $empresaId] = admin_report_bootstrap($conexion, 'admin.calendario');
date_default_timezone_set('America/Argentina/Buenos_Aires');
$canEdit = ar_can_edit($conexion, 'admin.calendario');
$csrf = ar_csrf_token();

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $canEdit) {
    ar_check_csrf();
    $titulo = trim((string)($_POST['titulo'] ?? ''));
    $descripcion = trim((string)($_POST['descripcion'] ?? ''));
    $prioridad = in_array((string)($_POST['prioridad'] ?? ''), ['ALTA', 'MEDIA', 'BAJA'], true) ? (string)$_POST['prioridad'] : 'MEDIA';
    $fecha = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($_POST['fecha_limite'] ?? '')) ? (string)$_POST['fecha_limite'] : '';
    if ($titulo !== '' && $fecha !== '') {
        $stmt = $pdo->prepare("INSERT INTO recordatorios (titulo, descripcion, prioridad, fecha_limite, usuario, empresa_id) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([$titulo, $descripcion, $prioridad, $fecha . ' 09:00:00', (string)($_SESSION['usuario'] ?? ''), $empresaId]);
        starlim_admin_audit($conexion, 'admin.calendario', 'crear_recordatorio', 'recordatorio', '', ['titulo' => $titulo, 'fecha' => $fecha]);
    }
    header('Location: admin_calendario.php');
    exit;
}

$desde = ar_date_param('desde', date('Y-m-d'));
$hasta = ar_date_param('hasta', date('Y-m-d', strtotime('+45 days')));
$hastaExclusive = date('Y-m-d', strtotime($hasta . ' +1 day'));

$summary = ar_query_one($pdo, "
    SELECT COUNT(*)::text AS total,
           SUM(CASE WHEN completado = 0 AND fecha_limite < CURRENT_TIMESTAMP THEN 1 ELSE 0 END)::text AS vencidos,
           SUM(CASE WHEN completado = 0 AND fecha_limite >= CURRENT_TIMESTAMP AND fecha_limite < CURRENT_TIMESTAMP + interval '7 days' THEN 1 ELSE 0 END)::text AS proximos
    FROM recordatorios
    WHERE empresa_id = :empresa
      AND fecha_limite >= :desde
      AND fecha_limite < :hasta
", ['empresa' => $empresaId, 'desde' => $desde, 'hasta' => $hastaExclusive]) + ['total' => '0', 'vencidos' => '0', 'proximos' => '0'];

$items = ar_query_all($pdo, "
    SELECT id, titulo, descripcion, prioridad, fecha_limite::text AS fecha_limite, usuario, completado
    FROM recordatorios
    WHERE empresa_id = :empresa
      AND fecha_limite >= :desde
      AND fecha_limite < :hasta
    ORDER BY completado ASC,
             CASE prioridad WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 ELSE 3 END,
             fecha_limite ASC
    LIMIT 80
", ['empresa' => $empresaId, 'desde' => $desde, 'hasta' => $hastaExclusive]);
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Calendario - Starlim</title>
    <link rel="stylesheet" href="../css/global.css"><link rel="stylesheet" href="../css/styleEmpleado.css"><link rel="stylesheet" href="../css/theme.css">
</head>
<body>
<?php $NAV_ACTIVA = 'admin'; $ADMIN_ACTIVA = 'admin.calendario'; include __DIR__ . '/partials/nav.php'; ?>
<main class="dash-main admin-page">
    <header class="admin-page-head"><div><p class="exec-kicker">Administracion</p><h1>Calendario</h1><p>Recordatorios administrativos, pagos recurrentes y vencimientos operativos.</p></div><a class="exec-btn exec-btn--ghost" href="recordatorios.php">Ver recordatorios</a></header>
    <form class="admin-filterbar" method="GET"><label><span>Desde</span><input type="date" name="desde" value="<?= ar_h($desde) ?>"></label><label><span>Hasta</span><input type="date" name="hasta" value="<?= ar_h($hasta) ?>"></label><div class="admin-filter-actions"><button class="exec-btn exec-btn--primary" type="submit">Actualizar</button></div></form>
    <section class="admin-treasury-grid">
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Eventos</span><small>Rango seleccionado.</small></div><strong><?= ar_int($summary['total']) ?></strong></article>
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Vencidos</span><small>No completados.</small></div><strong><?= ar_int($summary['vencidos']) ?></strong></article>
        <article class="exec-kpi-card"><div class="exec-kpi-head"><span>Proximos 7 dias</span><small>Recordatorios activos.</small></div><strong><?= ar_int($summary['proximos']) ?></strong></article>
    </section>
    <section class="admin-treasury-split">
        <article class="admin-card">
            <div class="admin-card-head"><div><h2>Agenda</h2><p>Ordenada por urgencia y vencimiento.</p></div></div>
            <?php if (!$items): ?><p class="exec-empty">No hay eventos para este rango.</p><?php else: ?>
                <div class="exec-kpi-list">
                    <?php foreach ($items as $it): ?><a href="recordatorios.php"><span><?= ar_h($it['titulo']) ?><small><?= ar_date($it['fecha_limite']) ?> · <?= ar_h($it['prioridad']) ?> · <?= ((int)$it['completado'] === 1 ? 'Completado' : 'Pendiente') ?></small></span><strong><?= ar_h($it['usuario'] ?: 'Sistema') ?></strong></a><?php endforeach; ?>
                </div>
            <?php endif; ?>
        </article>
        <article class="admin-card">
            <div class="admin-card-head"><div><h2>Nuevo recordatorio</h2><p>Usa la misma fuente que Recordatorios.</p></div></div>
            <?php if (!$canEdit): ?>
                <p class="exec-empty">Tu usuario tiene permiso de lectura, no de edicion.</p>
            <?php else: ?>
                <form class="admin-mini-form" method="POST">
                    <input type="hidden" name="csrf_admin" value="<?= ar_h($csrf) ?>">
                    <label><span>Titulo</span><input name="titulo" required maxlength="120"></label>
                    <label><span>Fecha</span><input type="date" name="fecha_limite" required></label>
                    <label><span>Prioridad</span><select name="prioridad"><option>MEDIA</option><option>ALTA</option><option>BAJA</option></select></label>
                    <label><span>Descripcion</span><textarea name="descripcion" rows="3"></textarea></label>
                    <button class="exec-btn exec-btn--primary" type="submit">Crear</button>
                </form>
            <?php endif; ?>
        </article>
    </section>
</main>
<script src="../js/global.js"></script>
</body>
</html>
