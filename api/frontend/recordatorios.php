<?php
    require __DIR__ . '/partials/guard.php';

    include '../php/conexion_starlim_be.php';

    /* Esquema gestionado en supabase_migration.sql + db_fixes.sql */

    /* ── Lista de usuarios para asignar ──────────────────────────────── */
    $empleados = [];
    $re = $conexion->query(
        "SELECT usuario FROM usuarios
         WHERE rango NOT IN ('Minorista', 'Mayorista')
         ORDER BY usuario ASC"
    );
    if ($re) {
        while ($e = $re->fetch_assoc()) {
            if ($e['usuario'] !== $usuario) $empleados[] = $e['usuario'];
        }
    }

    /* ── Handle POST ──────────────────────────────────────────────────── */
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $accion = $_POST['accion'] ?? '';

        if ($accion === 'agregar') {
            $titulo      = trim($_POST['titulo'] ?? '');
            $descripcion = trim($_POST['descripcion'] ?? '');
            $prioridad   = in_array($_POST['prioridad'] ?? '', ['urgente', 'alta', 'normal'])
                           ? $_POST['prioridad'] : 'normal';
            $fecha_limite = !empty($_POST['fecha_limite'])
                            ? date('Y-m-d H:i:s', strtotime($_POST['fecha_limite']))
                            : null;
            $fecha_envio  = !empty($_POST['fecha_envio'])
                            ? date('Y-m-d H:i:s', strtotime($_POST['fecha_envio']))
                            : null;

            if ($titulo !== '') {
                $stmt = $conexion->prepare(
                    "INSERT INTO recordatorios (titulo, descripcion, prioridad, fecha_limite, fecha_envio, usuario)
                     VALUES (?, ?, ?, ?, ?, ?)"
                );
                $stmt->bind_param('ssssss', $titulo, $descripcion, $prioridad, $fecha_limite, $fecha_envio, $usuario);
                $stmt->execute();
                $stmt->close();
            }
        }

        if ($accion === 'completar') {
            $id = (int)($_POST['id'] ?? 0);
            if ($id > 0) {
                $stmt = $conexion->prepare(
                    "UPDATE recordatorios SET completado = 1
                     WHERE id = ? AND (usuario = '' OR usuario = ?)"
                );
                $stmt->bind_param('is', $id, $usuario);
                $stmt->execute();
                $stmt->close();
            }
        }

        if ($accion === 'agregar_asignada') {
            $titulo      = trim($_POST['titulo'] ?? '');
            $descripcion = trim($_POST['descripcion'] ?? '');
            $prioridad   = in_array($_POST['prioridad'] ?? '', ['urgente', 'alta', 'normal'])
                           ? $_POST['prioridad'] : 'normal';
            $fecha_limite = !empty($_POST['fecha_limite'])
                            ? date('Y-m-d H:i:s', strtotime($_POST['fecha_limite']))
                            : null;
            $fecha_envio  = !empty($_POST['fecha_envio'])
                            ? date('Y-m-d H:i:s', strtotime($_POST['fecha_envio']))
                            : null;
            $asignado_a  = trim($_POST['asignado_a'] ?? '');

            if ($titulo !== '' && $asignado_a !== '') {
                $chk = $conexion->prepare("SELECT id FROM usuarios WHERE usuario = ?");
                $chk->bind_param('s', $asignado_a);
                $chk->execute();
                if ($chk->get_result()->num_rows > 0) {
                    $stmt = $conexion->prepare(
                        "INSERT INTO tareas_asignadas
                            (titulo, descripcion, prioridad, fecha_limite, fecha_envio, asignado_por, asignado_a)
                         VALUES (?, ?, ?, ?, ?, ?, ?)"
                    );
                    $stmt->bind_param('sssssss', $titulo, $descripcion, $prioridad, $fecha_limite, $fecha_envio, $usuario, $asignado_a);
                    $stmt->execute();
                    $stmt->close();

                    // Notificar al usuario asignado via mensajes
                    $asunto_msg = "Nueva tarea asignada: $titulo";
                    $cuerpo_msg = "El usuario $usuario te asignó una nueva tarea: \"$titulo\"";
                    if ($descripcion !== '') {
                        $cuerpo_msg .= "\n\nDescripción: $descripcion";
                    }
                    $tipo_msg = 'tarea_asignada';
                    $nm = $conexion->prepare(
                        "INSERT INTO mensajes (de, para, asunto, cuerpo, tipo) VALUES (?, ?, ?, ?, ?)"
                    );
                    $nm->bind_param('sssss', $usuario, $asignado_a, $asunto_msg, $cuerpo_msg, $tipo_msg);
                    $nm->execute();
                    $nm->close();
                }
                $chk->close();
            }
        }

        $tab = $_POST['tab_after'] ?? 'mis-tareas';
        $qs  = http_build_query([
            'tab'    => $tab,
            'buscar' => $_POST['buscar_after'] ?? '',
            'orden'  => $_POST['orden_after']  ?? 'prioridad',
        ]);
        header("Location: recordatorios.php?$qs");
        exit;
    }

    /* ── Tab activo ───────────────────────────────────────────────────── */
    $activeTab = ($_GET['tab'] ?? 'mis-tareas') === 'asignadas' ? 'asignadas' : 'mis-tareas';

    /* ── Fetch tareas personales ──────────────────────────────────────── */
    $buscar = trim($_GET['buscar'] ?? '');
    $orden  = ($_GET['orden'] ?? '') === 'reciente' ? 'reciente' : 'prioridad';

    $orderBy = $orden === 'reciente'
        ? "fecha_creacion DESC"
        : "CASE WHEN fecha_limite IS NOT NULL AND fecha_limite < NOW() THEN 0 ELSE 1 END,
           CASE WHEN prioridad = 'urgente' THEN 0 WHEN prioridad = 'alta' THEN 1 ELSE 2 END,
           fecha_creacion DESC";

    $misTareas = [];
    if ($buscar !== '') {
        $like = '%' . $buscar . '%';
        $stmt = $conexion->prepare(
            "SELECT id, titulo, descripcion, prioridad, fecha_creacion, fecha_limite
             FROM recordatorios
             WHERE completado = 0
               AND (usuario = '' OR usuario = ?)
               AND (fecha_envio IS NULL OR fecha_envio <= NOW())
               AND titulo LIKE ?
             ORDER BY $orderBy"
        );
        $stmt->bind_param('ss', $usuario, $like);
        $stmt->execute();
        $r = $stmt->get_result();
        $stmt->close();
    } else {
        $stmt = $conexion->prepare(
            "SELECT id, titulo, descripcion, prioridad, fecha_creacion, fecha_limite
             FROM recordatorios
             WHERE completado = 0
               AND (usuario = '' OR usuario = ?)
               AND (fecha_envio IS NULL OR fecha_envio <= NOW())
             ORDER BY $orderBy"
        );
        $stmt->bind_param('s', $usuario);
        $stmt->execute();
        $r = $stmt->get_result();
        $stmt->close();
    }
    if ($r) {
        while ($row = $r->fetch_assoc()) {
            $row['status']      = ($row['fecha_limite'] && strtotime($row['fecha_limite']) < time())
                                  ? 'vencido' : $row['prioridad'];
            $row['fecha_c_fmt'] = date('d/m/Y h:i A', strtotime($row['fecha_creacion']));
            $row['fecha_l_fmt'] = $row['fecha_limite']
                                  ? date('d/m/Y h:i A', strtotime($row['fecha_limite'])) : '-/-/-';
            $misTareas[] = $row;
        }
    }

    /* ── Fetch tareas recibidas (asignadas a mí, pendientes) ─────────── */
    $tareasRecibidas = [];
    $stmt = $conexion->prepare(
        "SELECT id, titulo, descripcion, prioridad, fecha_creacion, fecha_limite, asignado_por
         FROM tareas_asignadas
         WHERE asignado_a = ? AND completado = 0
           AND (fecha_envio IS NULL OR fecha_envio <= NOW())
         ORDER BY CASE WHEN fecha_limite IS NOT NULL AND fecha_limite < NOW() THEN 0 ELSE 1 END,
                  CASE WHEN prioridad = 'urgente' THEN 0 WHEN prioridad = 'alta' THEN 1 ELSE 2 END,
                  fecha_creacion DESC"
    );
    $stmt->bind_param('s', $usuario);
    $stmt->execute();
    $rr = $stmt->get_result();
    $stmt->close();
    if ($rr) {
        while ($row = $rr->fetch_assoc()) {
            $row['status']      = ($row['fecha_limite'] && strtotime($row['fecha_limite']) < time())
                                  ? 'vencido' : $row['prioridad'];
            $row['fecha_c_fmt'] = date('d/m/Y h:i A', strtotime($row['fecha_creacion']));
            $row['fecha_l_fmt'] = $row['fecha_limite']
                                  ? date('d/m/Y h:i A', strtotime($row['fecha_limite'])) : '-/-/-';
            $tareasRecibidas[] = $row;
        }
    }

    /* ── Fetch tareas asignadas por mí ───────────────────────────────── */
    $tareasAsignadas = [];
    $stmt = $conexion->prepare(
        "SELECT id, titulo, descripcion, prioridad, fecha_creacion, fecha_limite,
                asignado_a, completado, mensaje_completado, fecha_completado
         FROM tareas_asignadas
         WHERE asignado_por = ?
         ORDER BY completado ASC,
                  CASE WHEN fecha_limite IS NOT NULL AND fecha_limite < NOW() THEN 0 ELSE 1 END,
                  CASE WHEN prioridad = 'urgente' THEN 0 WHEN prioridad = 'alta' THEN 1 ELSE 2 END,
                  fecha_creacion DESC"
    );
    $stmt->bind_param('s', $usuario);
    $stmt->execute();
    $ra = $stmt->get_result();
    $stmt->close();
    if ($ra) {
        while ($row = $ra->fetch_assoc()) {
            if ($row['completado']) {
                $row['status'] = 'completado';
                $row['fecha_comp_fmt'] = date('d/m/Y h:i A', strtotime($row['fecha_completado']));
            } else {
                $row['status'] = ($row['fecha_limite'] && strtotime($row['fecha_limite']) < time())
                                 ? 'vencido' : $row['prioridad'];
            }
            $row['fecha_c_fmt'] = date('d/m/Y h:i A', strtotime($row['fecha_creacion']));
            $row['fecha_l_fmt'] = $row['fecha_limite']
                                  ? date('d/m/Y h:i A', strtotime($row['fecha_limite'])) : '-/-/-';
            $tareasAsignadas[] = $row;
        }
    }
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tareas — Star Lim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <link rel="stylesheet" href="../css/panel_ventas.css">
    <style>
        /* ── Encabezado ── */
        .rec-page-header {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 24px;
        }
        .rec-back-link {
            font-size: 13px;
            font-weight: 600;
            color: rgba(255,255,255,0.38);
            transition: color 0.2s;
            flex-shrink: 0;
        }
        .rec-back-link:hover { color: #fff; }
        .rec-page-title {
            font-size: 24px;
            font-weight: 700;
            color: var(--text-color);
            margin: 0;
        }

        /* ── Tabs ── */
        .tarea-tabs {
            display: flex;
            gap: 6px;
            margin-bottom: 22px;
            border-bottom: 1px solid rgba(128,128,128,0.15);
            padding-bottom: 0;
        }
        .tarea-tab-btn {
            padding: 9px 22px;
            border: none;
            background: transparent;
            color: rgba(255,255,255,0.45);
            font-size: 13.5px;
            font-weight: 600;
            font-family: inherit;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            margin-bottom: -1px;
            transition: color 0.2s, border-color 0.2s;
            position: relative;
        }
        .tarea-tab-btn:hover { color: rgba(255,255,255,0.8); }
        .tarea-tab-btn--active {
            color: var(--text-color);
            border-bottom-color: #2563eb;
        }
        .tarea-tab-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: #2563eb;
            color: #fff;
            font-size: 9px;
            font-weight: 700;
            border-radius: 50px;
            min-width: 16px;
            height: 16px;
            padding: 0 4px;
            margin-left: 6px;
            vertical-align: middle;
        }

        /* ── Sección (tab content) ── */
        .tarea-section { display: block; }
        .tarea-section--hidden { display: none; }

        /* ── Layout 2 columnas ── */
        .rec-page-layout {
            display: grid;
            grid-template-columns: 1fr 320px;
            gap: 24px;
            align-items: start;
        }
        @media (max-width: 860px) {
            .rec-page-layout { grid-template-columns: 1fr; }
        }

        /* ── Controles búsqueda/orden ── */
        .rec-controls {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 14px;
            flex-wrap: wrap;
        }
        .rec-search-form {
            display: flex;
            gap: 8px;
            flex: 1;
            min-width: 180px;
        }
        .rec-search-input {
            flex: 1;
            padding: 9px 14px;
            border-radius: 8px;
            border: 1px solid rgba(255,255,255,0.1);
            background: rgba(255,255,255,0.05);
            color: var(--text-color);
            font-size: 14px;
            font-family: inherit;
            outline: none;
            transition: border-color 0.2s;
        }
        .rec-search-input:focus { border-color: #2563eb; }
        .rec-search-btn {
            padding: 9px 18px;
            border-radius: 8px;
            background: #2563eb;
            color: #fff;
            border: none;
            font-size: 13px;
            font-weight: 600;
            font-family: inherit;
            cursor: pointer;
            white-space: nowrap;
            transition: background 0.2s;
        }
        .rec-search-btn:hover { background: #1e3a8a; }
        .rec-sort-group { display: flex; gap: 6px; flex-shrink: 0; }
        .rec-sort-btn {
            padding: 8px 14px;
            border-radius: 8px;
            border: 1px solid rgba(255,255,255,0.12);
            background: transparent;
            color: rgba(255,255,255,0.5);
            font-size: 12px;
            font-weight: 600;
            font-family: inherit;
            cursor: pointer;
            text-decoration: none;
            transition: background 0.2s, color 0.2s, border-color 0.2s;
            white-space: nowrap;
        }
        .rec-sort-btn:hover {
            background: rgba(255,255,255,0.08);
            color: #fff;
            border-color: rgba(255,255,255,0.25);
        }
        .rec-sort-btn--active,
        .rec-sort-btn--active:hover {
            background: #2563eb;
            border-color: #2563eb;
            color: #fff;
        }
        .rec-count {
            font-size: 12px;
            opacity: 0.42;
            margin-bottom: 8px;
        }

        /* ── Subsección "Recibidas" ── */
        .tarea-sub-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin: 20px 0 10px;
        }
        .tarea-sub-title {
            font-size: 13px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.07em;
            color: rgba(255,255,255,0.45);
            margin: 0;
        }
        .tarea-sub-line {
            flex: 1;
            height: 1px;
            background: rgba(128,128,128,0.18);
        }

        /* ── Badge "asignado por" en tarjeta recibida ── */
        .rec-asignado-por {
            font-size: 11px;
            color: #2563eb;
            font-weight: 600;
            margin-bottom: 4px;
        }

        /* ── Formulario ── */
        .rec-form-title {
            font-size: 16px;
            font-weight: 700;
            margin: 0 0 18px;
            color: var(--text-color);
        }
        .rec-field {
            margin-bottom: 13px;
            display: flex;
            flex-direction: column;
            gap: 5px;
        }
        .rec-field label {
            font-size: 10.5px;
            font-weight: 600;
            letter-spacing: 0.07em;
            text-transform: uppercase;
            color: #667085;
        }
        .rec-input,
        .rec-textarea,
        .rec-select {
            padding: 9px 12px;
            border-radius: 8px;
            border: 1px solid rgba(128,128,128,0.2);
            background: rgba(128,128,128,0.07);
            color: var(--text-color);
            font-size: 13.5px;
            font-family: inherit;
            outline: none;
            transition: border-color 0.2s;
            width: 100%;
            box-sizing: border-box;
        }
        .rec-input:focus,
        .rec-textarea:focus,
        .rec-select:focus { border-color: #2563eb; }
        .rec-textarea { resize: vertical; min-height: 70px; }
        .rec-select option { background: #fff; color: #101828; }
        .rec-submit-btn {
            width: 100%;
            padding: 11px;
            border-radius: 8px;
            background: #2563eb;
            color: #fff;
            border: none;
            font-size: 14px;
            font-weight: 600;
            font-family: inherit;
            cursor: pointer;
            margin-top: 2px;
            transition: background 0.2s, transform 0.15s;
        }
        .rec-submit-btn:hover { background: #1e3a8a; transform: translateY(-1px); }

        /* ── Descripción ── */
        .rec-desc {
            font-size: 13px;
            color: var(--text-color);
            opacity: 0.65;
            margin: 6px 0 10px;
            line-height: 1.5;
        }
        .rec-card--vencido .rec-desc { color: #fff; opacity: 0.82; }

        /* ── Empty state ── */
        .rec-list-empty {
            text-align: center;
            padding: 40px 0;
            font-size: 14px;
            opacity: 0.38;
            color: var(--text-color);
        }

        /* ── Botón completar ── */
        .rec-card-actions {
            display: flex;
            justify-content: flex-end;
            margin-top: 10px;
        }
        .rec-completar-btn {
            background: none;
            border: 1px solid rgba(128,128,128,0.25);
            border-radius: 6px;
            color: rgba(128,128,128,0.6);
            font-size: 11px;
            font-weight: 600;
            font-family: inherit;
            padding: 4px 12px;
            cursor: pointer;
            transition: background 0.2s, color 0.2s, border-color 0.2s;
        }
        .rec-completar-btn:hover {
            background: rgba(22,163,74,0.12);
            color: #16a34a;
            border-color: #16a34a;
        }
        .rec-card--vencido .rec-completar-btn {
            border-color: rgba(255,255,255,0.3);
            color: rgba(255,255,255,0.6);
        }
        .rec-card--vencido .rec-completar-btn:hover {
            background: rgba(255,255,255,0.15);
            color: #fff;
            border-color: #fff;
        }

        /* ── Tarjeta completada (asignadas) ── */
        .rec-card--completado {
            opacity: 0.55;
        }
        .rec-card--completado .rec-title { text-decoration: line-through; }

        /* ── Mensaje de completado ── */
        .rec-completion-note {
            margin-top: 8px;
            padding: 8px 12px;
            border-radius: 8px;
            background: rgba(22,163,74,0.1);
            border-left: 3px solid #16a34a;
            font-size: 12px;
            color: #16a34a;
            line-height: 1.5;
        }
        .dark-mode .rec-completion-note { background: rgba(34,197,94,0.08); color: #22c55e; }
        .rec-completion-note strong { display: block; margin-bottom: 2px; font-size: 11px; opacity: 0.8; }

        /* ── Info asignado a ── */
        .rec-asignado-a {
            font-size: 11.5px;
            color: rgba(128,128,128,0.7);
            margin-top: 4px;
        }
        .rec-asignado-a span { font-weight: 700; color: rgba(255,255,255,0.65); }

        /* ── Modal ── */
        .tarea-modal-overlay {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.6);
            backdrop-filter: blur(4px);
            z-index: 1000;
            align-items: center;
            justify-content: center;
        }
        .tarea-modal-overlay.open { display: flex; }
        .tarea-modal {
            background: #101828;
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 16px;
            padding: 28px;
            width: 100%;
            max-width: 460px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.6);
        }
        .tarea-modal-title {
            font-size: 18px;
            font-weight: 700;
            margin: 0 0 6px;
            color: var(--text-color);
        }
        .tarea-modal-nombre {
            font-size: 13px;
            color: rgba(255,255,255,0.45);
            margin: 0 0 20px;
        }
        .tarea-modal-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 18px;
        }
        .tarea-modal-cancel {
            padding: 9px 20px;
            border-radius: 8px;
            border: 1px solid rgba(255,255,255,0.15);
            background: transparent;
            color: rgba(255,255,255,0.55);
            font-size: 13px;
            font-weight: 600;
            font-family: inherit;
            cursor: pointer;
            transition: background 0.2s, color 0.2s;
        }
        .tarea-modal-cancel:hover { background: rgba(255,255,255,0.07); color: #fff; }
        .tarea-modal-confirm {
            padding: 9px 22px;
            border-radius: 8px;
            border: none;
            background: #16a34a;
            color: #fff;
            font-size: 13px;
            font-weight: 600;
            font-family: inherit;
            cursor: pointer;
            transition: background 0.2s, transform 0.15s;
        }
        .tarea-modal-confirm:hover:not(:disabled) { background: #15803d; transform: translateY(-1px); }
        .tarea-modal-confirm:disabled { opacity: 0.55; cursor: not-allowed; }
    </style>
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>

    <?php $NAV_ACTIVA = ''; include __DIR__ . '/partials/nav.php'; ?>

    <main class="dash-main">

        <!-- Encabezado -->
        <div class="rec-page-header">
            <a href="panel_empleados.php" class="rec-back-link">&larr; Volver</a>
            <h1 class="rec-page-title">Tareas</h1>
        </div>

        <!-- Tabs -->
        <div class="tarea-tabs">
            <button class="tarea-tab-btn <?= $activeTab === 'mis-tareas' ? 'tarea-tab-btn--active' : '' ?>"
                    data-tab="mis-tareas">
                Mis Tareas
                <?php $totalMias = count($misTareas) + count($tareasRecibidas); ?>
                <?php if ($totalMias > 0): ?>
                    <span class="tarea-tab-badge"><?= $totalMias ?></span>
                <?php endif; ?>
            </button>
            <button class="tarea-tab-btn <?= $activeTab === 'asignadas' ? 'tarea-tab-btn--active' : '' ?>"
                    data-tab="asignadas">
                Tareas de Equipo
                <?php $pendAsig = count(array_filter($tareasAsignadas, fn($t) => !$t['completado'])); ?>
                <?php if ($pendAsig > 0): ?>
                    <span class="tarea-tab-badge"><?= $pendAsig ?></span>
                <?php endif; ?>
            </button>
        </div>

        <!-- ══ TAB 1: MIS TAREAS ══ -->
        <div class="tarea-section <?= $activeTab !== 'mis-tareas' ? 'tarea-section--hidden' : '' ?>"
             id="tab-mis-tareas">
            <div class="rec-page-layout">

                <!-- Lista -->
                <div>
                    <!-- Búsqueda + orden -->
                    <div class="rec-controls">
                        <form class="rec-search-form" method="GET" action="recordatorios.php">
                            <input type="hidden" name="tab"   value="mis-tareas">
                            <input type="hidden" name="orden" value="<?= htmlspecialchars($orden) ?>">
                            <input class="rec-search-input" type="text" name="buscar"
                                   placeholder="Buscar por título..."
                                   value="<?= htmlspecialchars($buscar) ?>">
                            <button class="rec-search-btn" type="submit">Buscar</button>
                        </form>
                        <div class="rec-sort-group">
                            <a href="?tab=mis-tareas&buscar=<?= urlencode($buscar) ?>&orden=prioridad"
                               class="rec-sort-btn <?= $orden === 'prioridad' ? 'rec-sort-btn--active' : '' ?>">Por prioridad</a>
                            <a href="?tab=mis-tareas&buscar=<?= urlencode($buscar) ?>&orden=reciente"
                               class="rec-sort-btn <?= $orden === 'reciente' ? 'rec-sort-btn--active' : '' ?>">Más recientes</a>
                        </div>
                    </div>

                    <p class="rec-count">
                        <?= count($misTareas) ?> tarea<?= count($misTareas) !== 1 ? 's' : '' ?>
                        <?= $buscar !== '' ? ' encontrada' . (count($misTareas) !== 1 ? 's' : '') . ' para "' . htmlspecialchars($buscar) . '"' : ' personal' . (count($misTareas) !== 1 ? 'es' : '') ?>
                    </p>

                    <!-- Tareas personales -->
                    <section class="dash-panel recordatorios-panel">
                        <?php if (empty($misTareas)): ?>
                            <p class="rec-list-empty">
                                <?= $buscar !== '' ? 'No se encontraron tareas con ese título.' : 'Sin tareas personales activas.' ?>
                            </p>
                        <?php else: ?>
                            <?php foreach ($misTareas as $rec): ?>
                            <div class="rec-card rec-card--<?= htmlspecialchars($rec['status']) ?>">
                                <div class="rec-header">
                                    <span class="rec-title">
                                        <strong>Título:</strong> <?= htmlspecialchars($rec['titulo']) ?>
                                    </span>
                                    <span class="rec-badge rec-badge--<?= htmlspecialchars($rec['status']) ?>">
                                        <?= strtoupper(htmlspecialchars($rec['status'])) ?>
                                    </span>
                                </div>
                                <?php if (!empty($rec['descripcion'])): ?>
                                    <p class="rec-desc"><?= nl2br(htmlspecialchars($rec['descripcion'])) ?></p>
                                <?php else: ?>
                                    <span class="rec-link-placeholder"></span>
                                <?php endif; ?>
                                <div class="rec-meta">
                                    <span><?= htmlspecialchars($rec['fecha_c_fmt']) ?></span>
                                    <span>Fecha límite: <?= htmlspecialchars($rec['fecha_l_fmt']) ?></span>
                                </div>
                                <div class="rec-card-actions">
                                    <form method="POST" action="recordatorios.php">
                                        <input type="hidden" name="accion"       value="completar">
                                        <input type="hidden" name="id"           value="<?= (int)$rec['id'] ?>">
                                        <input type="hidden" name="tab_after"    value="mis-tareas">
                                        <input type="hidden" name="buscar_after" value="<?= htmlspecialchars($buscar) ?>">
                                        <input type="hidden" name="orden_after"  value="<?= htmlspecialchars($orden) ?>">
                                        <button class="rec-completar-btn" type="submit">&#10003; Completar</button>
                                    </form>
                                </div>
                            </div>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </section>

                    <!-- Tareas recibidas -->
                    <?php if (!empty($tareasRecibidas)): ?>
                    <div class="tarea-sub-header">
                        <h3 class="tarea-sub-title">Asignadas a mí (<?= count($tareasRecibidas) ?>)</h3>
                        <div class="tarea-sub-line"></div>
                    </div>
                    <section class="dash-panel recordatorios-panel">
                        <?php foreach ($tareasRecibidas as $rec): ?>
                        <div class="rec-card rec-card--<?= htmlspecialchars($rec['status']) ?>">
                            <p class="rec-asignado-por">Asignada por <?= htmlspecialchars($rec['asignado_por']) ?></p>
                            <div class="rec-header">
                                <span class="rec-title">
                                    <strong>Título:</strong> <?= htmlspecialchars($rec['titulo']) ?>
                                </span>
                                <span class="rec-badge rec-badge--<?= htmlspecialchars($rec['status']) ?>">
                                    <?= strtoupper(htmlspecialchars($rec['status'])) ?>
                                </span>
                            </div>
                            <?php if (!empty($rec['descripcion'])): ?>
                                <p class="rec-desc"><?= nl2br(htmlspecialchars($rec['descripcion'])) ?></p>
                            <?php else: ?>
                                <span class="rec-link-placeholder"></span>
                            <?php endif; ?>
                            <div class="rec-meta">
                                <span><?= htmlspecialchars($rec['fecha_c_fmt']) ?></span>
                                <span>Fecha límite: <?= htmlspecialchars($rec['fecha_l_fmt']) ?></span>
                            </div>
                            <div class="rec-card-actions">
                                <button class="rec-completar-btn rec-completar-recibida"
                                        type="button"
                                        data-id="<?= (int)$rec['id'] ?>"
                                        data-titulo="<?= htmlspecialchars($rec['titulo'], ENT_QUOTES) ?>">
                                    &#10003; Completar
                                </button>
                            </div>
                        </div>
                        <?php endforeach; ?>
                    </section>
                    <?php elseif (empty($misTareas)): ?>
                    <?php endif; ?>

                </div>

                <!-- Formulario nueva tarea personal -->
                <div>
                    <section class="dash-panel">
                        <h2 class="rec-form-title">Nueva Tarea Personal</h2>
                        <form method="POST" action="recordatorios.php">
                            <input type="hidden" name="accion"       value="agregar">
                            <input type="hidden" name="tab_after"    value="mis-tareas">
                            <input type="hidden" name="buscar_after" value="<?= htmlspecialchars($buscar) ?>">
                            <input type="hidden" name="orden_after"  value="<?= htmlspecialchars($orden) ?>">

                            <div class="rec-field">
                                <label for="rec-titulo">Título *</label>
                                <input class="rec-input" type="text" id="rec-titulo" name="titulo"
                                       required placeholder="Nombre de la tarea">
                            </div>
                            <div class="rec-field">
                                <label for="rec-desc">Descripción</label>
                                <textarea class="rec-textarea" id="rec-desc" name="descripcion"
                                          placeholder="Detalle opcional..."></textarea>
                            </div>
                            <div class="rec-field">
                                <label for="rec-prioridad">Prioridad</label>
                                <select class="rec-select" id="rec-prioridad" name="prioridad">
                                    <option value="normal">Normal</option>
                                    <option value="alta">Alta</option>
                                    <option value="urgente">Urgente</option>
                                </select>
                            </div>
                            <div class="rec-field">
                                <label for="rec-fecha">Fecha límite</label>
                                <input class="rec-input" type="datetime-local" id="rec-fecha" name="fecha_limite">
                            </div>
                            <div class="rec-field">
                                <label for="rec-envio">Fecha de envío <span style="font-weight:400;opacity:.6">(no aparece hasta esa fecha)</span></label>
                                <input class="rec-input" type="datetime-local" id="rec-envio" name="fecha_envio">
                            </div>
                            <button class="rec-submit-btn" type="submit">Agregar tarea</button>
                        </form>
                    </section>
                </div>

            </div>
        </div><!-- /tab-mis-tareas -->


        <!-- ══ TAB 2: TAREAS DE EQUIPO ══ -->
        <div class="tarea-section <?= $activeTab !== 'asignadas' ? 'tarea-section--hidden' : '' ?>"
             id="tab-asignadas">
            <div class="rec-page-layout">

                <!-- Lista tareas asignadas por mí -->
                <div>
                    <p class="rec-count">
                        <?= count($tareasAsignadas) ?> tarea<?= count($tareasAsignadas) !== 1 ? 's' : '' ?> asignada<?= count($tareasAsignadas) !== 1 ? 's' : '' ?>
                        &nbsp;·&nbsp;
                        <?= $pendAsig ?> pendiente<?= $pendAsig !== 1 ? 's' : '' ?>
                    </p>

                    <section class="dash-panel recordatorios-panel">
                        <?php if (empty($tareasAsignadas)): ?>
                            <p class="rec-list-empty">Todavía no asignaste ninguna tarea.</p>
                        <?php else: ?>
                            <?php foreach ($tareasAsignadas as $rec): ?>
                            <div class="rec-card rec-card--<?= htmlspecialchars($rec['status']) ?>">
                                <div class="rec-header">
                                    <span class="rec-title">
                                        <strong>Título:</strong> <?= htmlspecialchars($rec['titulo']) ?>
                                    </span>
                                    <span class="rec-badge rec-badge--<?= htmlspecialchars($rec['status']) ?>">
                                        <?= $rec['status'] === 'completado' ? '&#10003; COMPLETADA' : strtoupper(htmlspecialchars($rec['status'])) ?>
                                    </span>
                                </div>
                                <p class="rec-asignado-a">Para: <span><?= htmlspecialchars($rec['asignado_a']) ?></span></p>
                                <?php if (!empty($rec['descripcion'])): ?>
                                    <p class="rec-desc"><?= nl2br(htmlspecialchars($rec['descripcion'])) ?></p>
                                <?php else: ?>
                                    <span class="rec-link-placeholder"></span>
                                <?php endif; ?>
                                <div class="rec-meta">
                                    <span>Asignada: <?= htmlspecialchars($rec['fecha_c_fmt']) ?></span>
                                    <span>Fecha límite: <?= htmlspecialchars($rec['fecha_l_fmt']) ?></span>
                                </div>
                                <?php if ($rec['completado'] && !empty($rec['mensaje_completado'])): ?>
                                    <div class="rec-completion-note">
                                        <strong>Completada el <?= htmlspecialchars($rec['fecha_comp_fmt']) ?></strong>
                                        <?= nl2br(htmlspecialchars($rec['mensaje_completado'])) ?>
                                    </div>
                                <?php elseif ($rec['completado']): ?>
                                    <div class="rec-completion-note">
                                        <strong>Completada el <?= htmlspecialchars($rec['fecha_comp_fmt']) ?></strong>
                                        Sin mensaje adicional.
                                    </div>
                                <?php endif; ?>
                            </div>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </section>
                </div>

                <!-- Formulario asignar tarea -->
                <div>
                    <section class="dash-panel">
                        <h2 class="rec-form-title">Asignar Tarea</h2>
                        <form method="POST" action="recordatorios.php">
                            <input type="hidden" name="accion"    value="agregar_asignada">
                            <input type="hidden" name="tab_after" value="asignadas">

                            <div class="rec-field">
                                <label for="asig-titulo">Título *</label>
                                <input class="rec-input" type="text" id="asig-titulo" name="titulo"
                                       required placeholder="Nombre de la tarea">
                            </div>
                            <div class="rec-field">
                                <label for="asig-desc">Descripción</label>
                                <textarea class="rec-textarea" id="asig-desc" name="descripcion"
                                          placeholder="Instrucciones o detalle..."></textarea>
                            </div>
                            <div class="rec-field">
                                <label for="asig-prioridad">Prioridad</label>
                                <select class="rec-select" id="asig-prioridad" name="prioridad">
                                    <option value="normal">Normal</option>
                                    <option value="alta">Alta</option>
                                    <option value="urgente">Urgente</option>
                                </select>
                            </div>
                            <div class="rec-field">
                                <label for="asig-fecha">Fecha límite</label>
                                <input class="rec-input" type="datetime-local" id="asig-fecha" name="fecha_limite">
                            </div>
                            <div class="rec-field">
                                <label for="asig-envio">Fecha de envío <span style="font-weight:400;opacity:.6">(no aparece hasta esa fecha)</span></label>
                                <input class="rec-input" type="datetime-local" id="asig-envio" name="fecha_envio">
                            </div>
                            <div class="rec-field">
                                <label for="asig-usuario">Asignar a *</label>
                                <input class="rec-input" type="text" id="asig-usuario" name="asignado_a"
                                       list="lista-empleados-asig"
                                       autocomplete="off"
                                       placeholder="Nombre de usuario"
                                       required>
                                <datalist id="lista-empleados-asig">
                                    <?php foreach ($empleados as $e): ?>
                                        <option value="<?= htmlspecialchars($e, ENT_QUOTES) ?>">
                                    <?php endforeach; ?>
                                </datalist>
                            </div>
                            <button class="rec-submit-btn" type="submit">Asignar tarea</button>
                        </form>
                    </section>
                </div>

            </div>
        </div><!-- /tab-asignadas -->

    </main>

    <!-- Modal: completar tarea recibida -->
    <div class="tarea-modal-overlay" id="completar-modal">
        <div class="tarea-modal">
            <h3 class="tarea-modal-title">Completar Tarea</h3>
            <p class="tarea-modal-nombre" id="modal-tarea-nombre"></p>
            <div class="rec-field">
                <label for="modal-mensaje">Mensaje (opcional)</label>
                <textarea class="rec-textarea" id="modal-mensaje"
                          placeholder="Podés dejar un comentario sobre cómo fue la tarea..."></textarea>
            </div>
            <div class="tarea-modal-actions">
                <button class="tarea-modal-cancel" type="button" onclick="cerrarModal()">Cancelar</button>
                <button class="tarea-modal-confirm" type="button" id="modal-confirmar" onclick="confirmarCompletar()">
                    &#10003; Confirmar
                </button>
            </div>
        </div>
    </div>

    <script src="../js/global.js"></script>
    <script>
        // ── Tabs ──────────────────────────────────────────────────────────
        document.querySelectorAll('.tarea-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                document.querySelectorAll('.tarea-tab-btn').forEach(b => b.classList.remove('tarea-tab-btn--active'));
                document.querySelectorAll('.tarea-section').forEach(s => s.classList.add('tarea-section--hidden'));
                btn.classList.add('tarea-tab-btn--active');
                document.getElementById('tab-' + tab).classList.remove('tarea-section--hidden');

                // Actualizar URL sin recargar
                const url = new URL(window.location);
                url.searchParams.set('tab', tab);
                window.history.replaceState({}, '', url);
            });
        });

        // ── Modal completar tarea recibida ────────────────────────────────
        document.addEventListener('click', function (e) {
            const btn = e.target.closest('.rec-completar-recibida');
            if (btn) {
                abrirModal(parseInt(btn.dataset.id, 10), btn.dataset.titulo);
            }
        });

        let modalTareaId = null;

        function abrirModal(id, nombre) {
            modalTareaId = id;
            document.getElementById('modal-tarea-nombre').textContent = nombre;
            document.getElementById('modal-mensaje').value = '';
            const btn = document.getElementById('modal-confirmar');
            btn.disabled = false;
            btn.textContent = 'Confirmar';
            document.getElementById('completar-modal').classList.add('open');
        }

        function cerrarModal() {
            document.getElementById('completar-modal').classList.remove('open');
            modalTareaId = null;
        }

        async function confirmarCompletar() {
            if (!modalTareaId) return;
            const btn     = document.getElementById('modal-confirmar');
            const mensaje = document.getElementById('modal-mensaje').value;

            btn.disabled    = true;
            btn.textContent = 'Completando...';

            try {
                const fd = new FormData();
                fd.append('id', modalTareaId);
                fd.append('mensaje', mensaje);

                const resp = await fetch('../php/completar_tarea_ajax.php', { method: 'POST', body: fd });
                const data = await resp.json();

                if (data.ok) {
                    cerrarModal();
                    location.reload();
                } else {
                    alert('Error: ' + (data.error || 'No se pudo completar la tarea.'));
                    btn.disabled    = false;
                    btn.textContent = 'Confirmar';
                }
            } catch (e) {
                alert('Error de conexión. Intentá de nuevo.');
                btn.disabled    = false;
                btn.textContent = 'Confirmar';
            }
        }

        // Cerrar modal al hacer click en el overlay
        document.getElementById('completar-modal').addEventListener('click', function (e) {
            if (e.target === this) cerrarModal();
        });

        // Cerrar modal con Escape
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') cerrarModal();
        });
    </script>
</body>
</html>
