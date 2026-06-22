<?php
$PERMITIDOS = ['Jefe', 'Jefe1', 'Admin'];
require __DIR__ . '/partials/guard.php';

include '../php/conexion_starlim_be.php';

/* Esquema gestionado en supabase_migration.sql + db_fixes.sql */

$limite_pag = 30;
$pagina     = max(1, intval($_GET['pagina'] ?? 1));
$buscar     = trim($_GET['buscar'] ?? '');

$where = '';
if ($buscar !== '') {
    $s = $buscar;
    $l = '%' . str_replace(['%', '_'], ['\%', '\_'], $s) . '%';
    $where = "WHERE (empleado LIKE '$l' OR producto_nombre LIKE '$l' OR justificacion LIKE '$l')";
}

$count_res  = $conexion->query("SELECT COUNT(*) AS total FROM stock_modificaciones $where");
$total      = (int)$count_res->fetch_assoc()['total'];
$total_pags = max(1, (int)ceil($total / $limite_pag));
$pagina     = min($pagina, $total_pags);
$offset     = ($pagina - 1) * $limite_pag;
$q          = $buscar !== '' ? '&buscar=' . urlencode($buscar) : '';

$res = $conexion->query("SELECT id, empleado, producto_nombre, cambios, justificacion, fecha
     FROM stock_modificaciones
     $where
     ORDER BY fecha DESC
     LIMIT $limite_pag OFFSET $offset"
);

$registros   = [];
$cambios_map = [];
while ($row = $res->fetch_assoc()) {
    $arr = json_decode($row['cambios'], true) ?? [];
    $cambios_map[(int)$row['id']] = $arr;
    $registros[] = $row;
}
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Registro de Modificaciones - Starlim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <link rel="stylesheet" href="../css/panel_bd.css">
    <link rel="stylesheet" href="../css/style_edit_stock.css">
    <style>
        /* ── Tabla de registro ─────────────────────────── */
        .rs-table-wrap {
            border-radius: 12px;
            overflow: hidden;
            border: 1px solid var(--es-border);
            margin-top: 1rem;
        }
        .rs-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.875rem;
        }
        .rs-table thead th {
            padding: 9px 14px;
            text-align: left;
            font-size: 0.72rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            opacity: 0.5;
            border-bottom: 1px solid var(--es-border);
            background: var(--es-header-bg);
            white-space: nowrap;
        }
        .rs-row {
            border-bottom: 1px solid var(--es-border);
            transition: background 0.1s;
        }
        .rs-row:last-child { border-bottom: none; }
        .rs-row:hover      { background: var(--es-row-hover); }
        .rs-row td {
            padding: 10px 14px;
            vertical-align: middle;
        }
        .rs-col-id      { width: 52px; font-size: 0.75rem; font-weight: 600; opacity: 0.4; }
        .rs-col-emp     { width: 130px; font-weight: 600; }
        .rs-col-fecha   { width: 170px; font-size: 0.8rem; opacity: 0.65; white-space: nowrap; }
        .rs-col-cambios { width: 90px; text-align: center; }
        .rs-col-porque  { }

        /* Botón Ver */
        .rs-btn-ver {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 12px;
            border-radius: 6px;
            background: rgba(37,99,235,0.1);
            color: #2563eb;
            border: 1px solid rgba(37,99,235,0.25);
            font-size: 0.78rem;
            font-weight: 600;
            cursor: pointer;
            font-family: inherit;
            transition: background 0.13s;
        }
        .rs-btn-ver:hover { background: rgba(37,99,235,0.18); }
        .dark-mode .rs-btn-ver { color: #60a5fa; border-color: rgba(77,159,255,0.25); background: rgba(77,159,255,0.1); }
        .dark-mode .rs-btn-ver:hover { background: rgba(77,159,255,0.18); }

        /* Justificación truncada */
        .rs-just-text    { font-size: 0.82rem; opacity: 0.75; }
        .rs-just-full    { display: none; }
        .rs-just-short   { }
        .rs-just-more    {
            display: inline;
            font-size: 0.78rem;
            color: #2563eb;
            cursor: pointer;
            margin-left: 3px;
            border: none;
            background: none;
            font-family: inherit;
            padding: 0;
        }
        .dark-mode .rs-just-more { color: #60a5fa; }

        /* ── Modal de cambios ──────────────────────────── */
        .rs-modal-producto {
            font-size: 1rem;
            font-weight: 700;
            margin-bottom: 1rem;
            padding-bottom: 0.75rem;
            border-bottom: 1px solid var(--es-border);
        }
        .rs-cambios-grid {
            display: grid;
            grid-template-columns: 1fr 40px 1fr;
            gap: 0;
            border: 1px solid var(--es-border);
            border-radius: 10px;
            overflow: hidden;
        }
        .rs-cambios-header {
            padding: 8px 14px;
            font-size: 0.7rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            opacity: 0.45;
            background: var(--es-header-bg);
            border-bottom: 1px solid var(--es-border);
        }
        .rs-cambios-arrow-header {
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--es-header-bg);
            border-bottom: 1px solid var(--es-border);
            opacity: 0.3;
        }
        .rs-cambios-cell {
            padding: 9px 14px;
            font-size: 0.85rem;
            border-bottom: 1px solid var(--es-border);
            word-break: break-word;
        }
        .rs-cambios-cell:last-of-type,
        .rs-cambios-cell.rs-last { border-bottom: none; }
        .rs-cambios-arrow-cell {
            display: flex;
            align-items: center;
            justify-content: center;
            border-bottom: 1px solid var(--es-border);
            opacity: 0.35;
            font-size: 1rem;
        }
        .rs-cambios-arrow-cell.rs-last { border-bottom: none; }
        .rs-label {
            display: block;
            font-size: 0.65rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            opacity: 0.4;
            margin-bottom: 2px;
        }
        .rs-val-antes  { color: #dc2626; }
        .rs-val-despues { color: #16a34a; }
        .dark-mode .rs-val-antes   { color: #f87171; }
        .dark-mode .rs-val-despues { color: #4ade80; }

        /* Barra de búsqueda (reutilizada) */
        .rs-search-bar {
            display: flex;
            align-items: center;
            gap: 1rem;
            flex-wrap: wrap;
        }
        .rs-search-wrap {
            position: relative;
            display: flex;
            align-items: center;
            flex: 1;
            min-width: 220px;
        }
        .rs-search-icon { position: absolute; left: 11px; pointer-events: none; font-size: 0.85rem; opacity: 0.5; }
        .rs-search-wrap input {
            width: 100%;
            padding: 9px 36px 9px 34px;
            border-radius: 8px;
            border: 1px solid var(--es-border);
            background: var(--es-input-bg);
            color: inherit;
            font-size: 0.88rem;
            font-family: inherit;
            transition: border-color 0.15s;
        }
        .rs-search-wrap input:focus { outline: none; border-color: #2563eb; }
        .rs-search-info { font-size: 0.8rem; opacity: 0.5; white-space: nowrap; }

        .rs-empty {
            text-align: center;
            padding: 3.5rem 1rem;
            opacity: 0.45;
            font-size: 0.95rem;
        }
    </style>
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body class="cambio-pagina">

<?php $NAV_ACTIVA = 'stock'; include __DIR__ . '/partials/nav.php'; ?>

<main class="dash-main">
<div class="ventas-layout">

<aside class="ventas-sidebar" id="ventas-sidebar">
    <button class="sidebar-open-btn" id="sidebar-open-btn">EXPANDIR &rsaquo;</button>
    <div class="ventas-sidebar-inner">
        <button class="sidebar-close-btn" id="sidebar-close-btn">&lsaquo; MINIMIZAR</button>
        <div class="bd-cards">
            <?php if (in_array($rango, ['Jefe1', 'Admin'], true)): ?>
            <a href="edit_stock.php" class="bd-card">
                <div class="bd-card-body">
                    <span class="bd-card-title">Cambiar Stock</span>
                    <span class="bd-card-desc">Editar productos existentes del inventario</span>
                </div>
                <span class="bd-card-arrow">→</span>
            </a>
            <a href="new_stock.php" class="bd-card">
                <div class="bd-card-body">
                    <span class="bd-card-title">Nuevo Stock</span>
                    <span class="bd-card-desc">Agregar nuevos productos al inventario</span>
                </div>
                <span class="bd-card-arrow">→</span>
            </a>
            <a href="recontar_stock.php" class="bd-card">
                <div class="bd-card-body">
                    <span class="bd-card-title">Recontar Stock</span>
                    <span class="bd-card-desc">Ajustar stock por reconteo o inventario</span>
                </div>
                <span class="bd-card-arrow">→</span>
            </a>
            <a href="carga_masiva.php" class="bd-card" style="border-left: 3px solid #f59e0b;">
                <div class="bd-card-body">
                    <span class="bd-card-title">Carga Masiva</span>
                    <span class="bd-card-desc">Reemplazar toda la base de productos</span>
                </div>
                <span class="bd-card-arrow">→</span>
            </a>
            <?php endif; ?>
            <a href="registro_stock.php" class="bd-card bd-card--active" style="border-left: 3px solid #2563eb;">
                <div class="bd-card-body">
                    <span class="bd-card-title">Registro de Cambios</span>
                    <span class="bd-card-desc">Historial de modificaciones de stock</span>
                </div>
                <span class="bd-card-arrow">→</span>
            </a>
        </div>
    </div>
</aside>

<div class="ventas-content">
    <h1 class="es-titulo">Registro de Modificaciones</h1>

    <div class="rs-search-bar">
        <div class="rs-search-wrap">
            <span class="rs-search-icon"></span>
            <input type="text" id="buscar-input"
                   value="<?= htmlspecialchars($buscar) ?>"
                   placeholder="Buscar por empleado, producto o justificación...">
        </div>
        <span class="rs-search-info">
            <?= $total ?> registro<?= $total != 1 ? 's' : '' ?>
            <?= $buscar !== '' ? ' · <strong>' . htmlspecialchars($buscar) . '</strong>' : '' ?>
        </span>
    </div>

    <?php if (empty($registros)): ?>
    <div class="rs-empty">
        <p><?= $buscar !== '' ? 'No se encontraron registros para &ldquo;' . htmlspecialchars($buscar) . '&rdquo;.' : 'Todavía no hay modificaciones registradas.' ?></p>
    </div>
    <?php else: ?>

    <div class="rs-table-wrap">
        <table class="rs-table">
            <thead>
                <tr>
                    <th class="rs-col-id">#</th>
                    <th class="rs-col-emp">Empleado</th>
                    <th class="rs-col-fecha">Fecha de modificación</th>
                    <th class="rs-col-cambios">Cambios</th>
                    <th class="rs-col-porque">Por qué</th>
                </tr>
            </thead>
            <tbody>
            <?php foreach ($registros as $reg):
                $fecha_dt = new DateTime($reg['fecha']);
                $fecha_fmt = $fecha_dt->format('d/m/y H:i') . ' hrs.';
                $just = $reg['justificacion'];
                $just_corta = mb_strlen($just) > 70 ? mb_substr($just, 0, 70) : null;
            ?>
                <tr class="rs-row">
                    <td class="rs-col-id"><?= (int)$reg['id'] ?></td>
                    <td class="rs-col-emp"><?= htmlspecialchars($reg['empleado']) ?></td>
                    <td class="rs-col-fecha"><?= htmlspecialchars($fecha_fmt) ?></td>
                    <td class="rs-col-cambios">
                        <button class="rs-btn-ver" onclick="verCambios(<?= (int)$reg['id'] ?>, <?= htmlspecialchars(json_encode($reg['producto_nombre']), ENT_QUOTES) ?>)">
                            Ver
                        </button>
                    </td>
                    <td class="rs-col-porque">
                        <span class="rs-just-text">
                            <?php if ($just_corta !== null): ?>
                                <span class="rs-just-short"><?= htmlspecialchars($just_corta) ?>…<button class="rs-just-more" onclick="toggleJust(this)">Ver más →</button></span>
                                <span class="rs-just-full"><?= htmlspecialchars($just) ?> <button class="rs-just-more" onclick="toggleJust(this)">← Ver menos</button></span>
                            <?php else: ?>
                                <?= htmlspecialchars($just) ?>
                            <?php endif; ?>
                        </span>
                    </td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
    </div>

    <?php if ($total_pags > 1):
        $start = max(1, $pagina - 2);
        $end   = min($total_pags, $pagina + 2);
    ?>
    <div class="paginacion">
        <?php if ($pagina > 1): ?>
            <a href="?pagina=1<?= $q ?>" class="pag-btn" title="Primera">&#171;</a>
            <a href="?pagina=<?= $pagina - 1 ?><?= $q ?>" class="pag-btn" title="Anterior">&#8249;</a>
        <?php endif; ?>
        <?php if ($start > 1): ?><span class="pag-ellipsis">&hellip;</span><?php endif; ?>
        <?php for ($i = $start; $i <= $end; $i++): ?>
            <?php if ($i === $pagina): ?>
                <span class="pag-btn pag-btn--activo"><?= $i ?></span>
            <?php else: ?>
                <a href="?pagina=<?= $i ?><?= $q ?>" class="pag-btn"><?= $i ?></a>
            <?php endif; ?>
        <?php endfor; ?>
        <?php if ($end < $total_pags): ?><span class="pag-ellipsis">&hellip;</span><?php endif; ?>
        <?php if ($pagina < $total_pags): ?>
            <a href="?pagina=<?= $pagina + 1 ?><?= $q ?>" class="pag-btn" title="Siguiente">&#8250;</a>
            <a href="?pagina=<?= $total_pags ?><?= $q ?>" class="pag-btn" title="Última">&#187;</a>
        <?php endif; ?>
    </div>
    <div class="pag-info">
        Página <?= $pagina ?> de <?= $total_pags ?> &mdash; mostrando <?= count($registros) ?> de <?= $total ?> registros
    </div>
    <?php endif; ?>

    <?php endif; ?>
</div><!-- /ventas-content -->
</div><!-- /ventas-layout -->
</main>

<!-- ── Modal de detalle de cambios ───────────────────── -->
<div class="es-modal-overlay" id="rs-modal-overlay">
    <div class="es-modal-card" id="rs-modal-card" style="width: min(560px, 95vw);">
        <div class="es-modal-header">
            <h2 class="es-modal-title" id="rs-modal-title">Cambios realizados</h2>
            <button class="es-modal-close" id="rs-modal-close" aria-label="Cerrar">&#10005;</button>
        </div>
        <div class="es-modal-body" style="flex-direction: column; gap: 12px;">
            <div class="rs-modal-producto" id="rs-modal-producto"></div>
            <div class="rs-cambios-grid" id="rs-cambios-grid"></div>
        </div>
        <div class="es-modal-footer">
            <button class="es-btn-cancel" id="rs-btn-close">Cerrar</button>
        </div>
    </div>
</div>

<script src="../js/global.js"></script>
<script>
/* ── Sidebar ─────────────────────────────────────────── */
const _sidebar  = document.getElementById('ventas-sidebar');
const _openBtn  = document.getElementById('sidebar-open-btn');
const _closeBtn = document.getElementById('sidebar-close-btn');
_openBtn .addEventListener('click', () => _sidebar.classList.remove('sidebar-collapsed'));
_closeBtn.addEventListener('click', () => _sidebar.classList.add('sidebar-collapsed'));

/* ── Datos de cambios (embebidos desde PHP) ──────────── */
const cambiosData = <?= json_encode($cambios_map, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP) ?>;

/* ── Búsqueda con debounce ───────────────────────────── */
let searchTimer;
document.getElementById('buscar-input').addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        const url = new URL(window.location.href);
        const val = this.value.trim();
        if (val) url.searchParams.set('buscar', val);
        else     url.searchParams.delete('buscar');
        url.searchParams.set('pagina', '1');
        window.location.href = url.toString();
    }, 500);
});

/* ── Modal de cambios ────────────────────────────────── */
const rsOverlay   = document.getElementById('rs-modal-overlay');
const rsTitle     = document.getElementById('rs-modal-title');
const rsProducto  = document.getElementById('rs-modal-producto');
const rsGrid      = document.getElementById('rs-cambios-grid');

function verCambios(id, productoNombre) {
    const cambios = cambiosData[id] || [];

    rsTitle.textContent    = 'Cambios realizados';
    rsProducto.textContent = productoNombre;

    rsGrid.innerHTML = '';

    if (cambios.length === 0) {
        rsGrid.innerHTML = '<div style="padding:14px;opacity:.5;font-size:.85rem;grid-column:1/-1">Sin cambios registrados.</div>';
    } else {
        // Encabezados
        const hAntes   = document.createElement('div');
        const hArrow   = document.createElement('div');
        const hDespues = document.createElement('div');
        hAntes.className   = 'rs-cambios-header';
        hArrow.className   = 'rs-cambios-arrow-header';
        hDespues.className = 'rs-cambios-header';
        hAntes.textContent   = 'Antes';
        hArrow.textContent   = '→';
        hDespues.textContent = 'Después';
        rsGrid.appendChild(hAntes);
        rsGrid.appendChild(hArrow);
        rsGrid.appendChild(hDespues);

        cambios.forEach((c, idx) => {
            const isLast = idx === cambios.length - 1;

            const cAntes   = document.createElement('div');
            const cArrow   = document.createElement('div');
            const cDespues = document.createElement('div');

            cAntes.className   = 'rs-cambios-cell rs-val-antes'   + (isLast ? ' rs-last' : '');
            cArrow.className   = 'rs-cambios-arrow-cell'          + (isLast ? ' rs-last' : '');
            cDespues.className = 'rs-cambios-cell rs-val-despues' + (isLast ? ' rs-last' : '');

            cAntes.innerHTML   = `<span class="rs-label">${escHtml(c.label)}</span>${escHtml(c.antes)}`;
            cArrow.textContent = '→';
            cDespues.innerHTML = `<span class="rs-label">${escHtml(c.label)}</span>${escHtml(c.despues)}`;

            rsGrid.appendChild(cAntes);
            rsGrid.appendChild(cArrow);
            rsGrid.appendChild(cDespues);
        });
    }

    rsOverlay.classList.add('active');
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function closeRsModal() {
    rsOverlay.classList.remove('active');
}

document.getElementById('rs-modal-close').addEventListener('click', closeRsModal);
document.getElementById('rs-btn-close').addEventListener('click', closeRsModal);
rsOverlay.addEventListener('click', e => { if (e.target === rsOverlay) closeRsModal(); });
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && rsOverlay.classList.contains('active')) closeRsModal();
});

/* ── Alternar justificación completa ─────────────────── */
function toggleJust(btn) {
    const wrapper = btn.closest('.rs-just-text');
    const short   = wrapper.querySelector('.rs-just-short');
    const full    = wrapper.querySelector('.rs-just-full');
    if (!short || !full) return;
    const isShowing = full.style.display === 'inline';
    short.style.display = isShowing ? 'inline' : 'none';
    full.style.display  = isShowing ? 'none'   : 'inline';
}
</script>
</body>
</html>
