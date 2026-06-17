<?php
/**
 * seguimiento_clientes.php — Análisis de recompra para anticiparse al pedido.
 * Calcula en vivo desde ventas entregadas el ritmo de compra de cada cliente
 * y lo clasifica (relativo a SU promedio):
 *   Contactar          0,85 ≤ r ≤ 1,25   (está por necesitar mercadería)
 *   En riesgo          1,25 < r ≤ 2       (pasó su fecha esperada)
 *   Perdido/recuperar  r > 2              (pasó más de un ciclo completo)
 * donde r = días desde la última compra ÷ promedio de días entre compras.
 */
$PERMITIDOS = ['Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'];
require __DIR__ . '/partials/guard.php';
include '../php/conexion_starlim_be.php';
require_once '../php/seguimiento_lib.php';

$seg        = starlim_calcular_seguimiento($conexion);
$grupos     = $seg['grupos'];
$vendedores = $seg['vendedores'];

function wa_link($tel) {
    $t = preg_replace('/[^0-9]/', '', $tel ?? '');
    if ($t === '') return '';
    if (strpos($t, '54') !== 0) $t = '54' . $t;
    return 'https://wa.me/' . $t;
}

$SECCIONES = [
    'al_dia'    => ['Al dia', 'Todavia no llegaron a su proxima fecha esperada.', 's-ok'],
    'contactar' => ['Para contactar', 'Están en su fecha de recompra — adelantarse al pedido.', 's-contactar'],
    'riesgo'    => ['En riesgo',      'Pasaron su fecha esperada — contactar cuanto antes.',     's-riesgo'],
    'perdido'   => ['Perdidos / a recuperar', 'Sin comprar hace más de un ciclo completo.',      's-perdido'],
    'sin_historial' => ['Sin historial suficiente', 'Clientes sin dos compras entregadas para calcular ritmo.', 's-info'],
];
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Seguimiento de clientes — Star Lim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <link rel="stylesheet" href="../css/panel_bd.css">
    <style>
        .sg-row { display:flex; gap:14px; margin-bottom:18px; flex-wrap:wrap; }
        .sg-card { background:var(--surface,#fff); border:1px solid rgba(128,128,128,.18); border-radius:14px; padding:13px 20px; min-width:160px; }
        .sg-card .lbl { font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; opacity:.6; }
        .sg-card .val { font-size:24px; font-weight:800; margin-top:2px; }
        .s-ok .val { color:#16a34a; } .s-contactar .val { color:#2563eb; } .s-riesgo .val { color:#b45309; } .s-perdido .val { color:#b91c1c; } .s-info .val { color:#64748b; }
        .sg-sec { margin-bottom:26px; }
        .sg-sec h2 { font-size:16px; margin:0 0 2px; } .sg-sec p { margin:0 0 10px; font-size:12.5px; opacity:.6; }
        .sg-table { width:100%; border-collapse:collapse; font-size:13px; }
        .sg-table th { text-align:left; padding:8px 10px; font-size:11px; text-transform:uppercase; letter-spacing:.05em; opacity:.6; border-bottom:2px solid rgba(128,128,128,.2); }
        .sg-table td { padding:8px 10px; border-bottom:1px solid rgba(128,128,128,.12); }
        .sg-empty { padding:16px; text-align:center; opacity:.55; font-style:italic; }
        .sg-wa { padding:4px 11px; background:#16a34a; color:#fff; border-radius:6px; text-decoration:none; font-size:12px; font-weight:700; white-space:nowrap; }
        .sg-wa.off { background:rgba(128,128,128,.2); color:inherit; pointer-events:none; }
        .sg-baja { font-size:10.5px; background:rgba(128,128,128,.15); border-radius:10px; padding:1px 7px; margin-left:6px; opacity:.8; }
        .sg-desv { font-size:11px; opacity:.55; }
        .sg-atraso { font-weight:700; }
    </style>
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>

<?php $NAV_ACTIVA = 'bd'; include __DIR__ . '/partials/nav.php'; ?>

<main class="dash-main">
<div class="ventas-layout">

<?php $BD_ACTIVA = 'clientes'; include __DIR__ . '/partials/bd_sidebar.php'; ?>

<div class="ventas-content">
    <?php
        $SUBTABS = ['base' => ['clientes.php', 'Base de datos'], 'seguimiento' => ['seguimiento_clientes.php', 'Seguimiento']];
        $SUB_ACTIVA = 'seguimiento';
        include __DIR__ . '/partials/sub_tabs.php';
    ?>
    <h1 class="dash-hello">Seguimiento de clientes</h1>
    <p style="opacity:.65;font-size:13.5px;margin:-6px 0 14px;">Calculado según el ritmo de compra real de cada cliente, para anticiparse al pedido.</p>

    <?php if (!empty($vendedores)): ?>
    <div style="margin-bottom:14px;">
        <label style="font-size:12.5px;opacity:.7;margin-right:8px;">Vendedor:</label>
        <select id="sg-filtro-vendedor" style="padding:7px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-family:inherit;font-size:13px;">
            <option value="">Todos</option>
            <?php foreach ($vendedores as $v): ?><option value="<?= htmlspecialchars($v, ENT_QUOTES) ?>"><?= htmlspecialchars($v) ?></option><?php endforeach; ?>
        </select>
    </div>
    <?php endif; ?>

    <div class="sg-row">
        <?php foreach ($SECCIONES as $k => [$titulo, , $cls]): ?>
        <div class="sg-card <?= $cls ?>">
            <div class="lbl"><?= htmlspecialchars($titulo) ?></div>
            <div class="val" id="sg-count-<?= $k ?>"><?= count($grupos[$k]) ?></div>
        </div>
        <?php endforeach; ?>
    </div>

    <?php foreach ($SECCIONES as $k => [$titulo, $desc, $cls]): ?>
    <section class="dash-panel sg-sec">
        <h2><?= htmlspecialchars($titulo) ?></h2>
        <p><?= htmlspecialchars($desc) ?></p>
        <table class="sg-table" data-grupo="<?= $k ?>">
            <thead>
                <tr><th>Cliente</th><th>Vendedor</th><th>Última compra</th><th>Promedio</th><th>Próxima esperada</th><th>Días sin comprar</th><th>Atraso</th><th>Compras</th><th></th></tr>
            </thead>
            <tbody>
            <?php if (empty($grupos[$k])): ?>
                <tr class="sg-vacia"><td colspan="9" class="sg-empty">Sin clientes en este grupo.</td></tr>
            <?php else: foreach ($grupos[$k] as $c):
                $wa = wa_link($c['telefono']);
                $compras = isset($c['compras']) ? (int)$c['compras'] : ((int)$c['intervalos'] + 1);
                $tiene_promedio = isset($c['promedio']) && $c['promedio'] !== null;
                $dias_sin = isset($c['desde_ult']) && $c['desde_ult'] !== null ? (int)$c['desde_ult'] . ' dias' : '-';
                $atraso_txt = $tiene_promedio
                    ? ((int)$c['atraso'] > 0 ? '+' . (int)$c['atraso'] . ' dias' : 'al dia')
                    : ($c['motivo'] ?? '-');
                $atraso_color = $tiene_promedio && (int)$c['atraso'] > 0 ? '#b45309' : '#16a34a';
            ?>
                <tr class="sg-fila" data-vendedor="<?= htmlspecialchars($c['vendedor'], ENT_QUOTES) ?>">
                    <td><strong><?= htmlspecialchars($c['nombre_cliente']) ?></strong></td>
                    <td><?= htmlspecialchars($c['vendedor']) ?></td>
                    <td><?= htmlspecialchars($c['ultima_fmt'] ?? '-') ?></td>
                    <?php if (!$tiene_promedio): ?>
                    <td>-</td>
                    <td>-</td>
                    <td><?= htmlspecialchars($dias_sin) ?></td>
                    <td class="sg-atraso" style="color:#64748b;">
                        <?= htmlspecialchars($atraso_txt) ?>
                    </td>
                    <?php else: ?>
                    <td>cada <?= $c['promedio'] ?> días<?= $c['desvio'] > 0 ? ' <span class="sg-desv" title="Variación típica entre compras">± ' . $c['desvio'] . '</span>' : '' ?></td>
                    <td><?= htmlspecialchars($c['proxima'] ?? '-') ?></td>
                    <td><?= (int)$c['desde_ult'] ?> días</td>
                    <td class="sg-atraso" style="color:<?= $c['atraso'] > 0 ? '#b45309' : '#16a34a' ?>;">
                        <?= $c['atraso'] > 0 ? '+' . $c['atraso'] . ' días' : 'al día' ?>
                    </td>
                    <?php endif; ?>
                    <td><?= $compras ?><?= $compras === 2 ? '<span class="sg-baja">estimación baja</span>' : '' ?></td>
                    <td>
                        <?php if ($wa): ?><a class="sg-wa" target="_blank" href="<?= $wa ?>">WhatsApp</a>
                        <?php else: ?><span class="sg-wa off">Sin teléfono</span><?php endif; ?>
                    </td>
                </tr>
            <?php endforeach; endif; ?>
            </tbody>
        </table>
    </section>
    <?php endforeach; ?>
</div>
</div>
</main>

<script src="../js/global.js"></script>
<script>
    const sgFiltro = document.getElementById('sg-filtro-vendedor');
    if (sgFiltro) sgFiltro.addEventListener('change', function () {
        const v = this.value;
        document.querySelectorAll('table.sg-table').forEach(tabla => {
            let visibles = 0;
            tabla.querySelectorAll('tbody .sg-fila').forEach(tr => {
                const ok = !v || tr.dataset.vendedor === v;
                tr.style.display = ok ? '' : 'none';
                if (ok) visibles++;
            });
            // contador del grupo
            const grupo = tabla.dataset.grupo;
            const cnt = document.getElementById('sg-count-' + grupo);
            if (cnt) cnt.textContent = visibles;
            // fila "sin clientes" si el grupo quedó vacío tras filtrar
            let vacia = tabla.querySelector('tbody .sg-vacia-filtro');
            if (visibles === 0 && !tabla.querySelector('tbody .sg-vacia')) {
                if (!vacia) {
                    const tr = document.createElement('tr');
                    tr.className = 'sg-vacia-filtro';
                    tr.innerHTML = '<td colspan="9" class="sg-empty">Sin clientes de este vendedor en el grupo.</td>';
                    tabla.querySelector('tbody').appendChild(tr);
                }
            } else if (vacia) { vacia.remove(); }
        });
    });
</script>
</body>
</html>
