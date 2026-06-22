<?php
/**
 * presupuestos.php — Seguimiento de presupuestos (Ventas › Presupuestos › Seguimiento).
 * Vigentes (pendientes, no vencidos) → Ver PDF · Pasar a venta · Denegar.
 * Vencidos (pendientes, fecha pasada) → Ver PDF · Denegar.
 */
$PERMITIDOS = ['Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'];
require __DIR__ . '/partials/guard.php';
include '../php/conexion_starlim_be.php';
$empresaId = starlim_bootstrap_tenant_context($conexion);

$puede_aceptar = $canVentas;

$res = $conexion->query(
    "SELECT id, fecha_emision, fecha_vencimiento, cliente_nombre, cliente_cuit,
            total, creado_por, (fecha_vencimiento - CURRENT_DATE) AS dias_restantes,
            (fecha_vencimiento >= CURRENT_DATE) AS vigente
     FROM presupuestos
     WHERE empresa_id = $empresaId AND estado = 'pendiente'
     ORDER BY fecha_vencimiento DESC, id DESC"
);
$vigentes = $vencidos = [];
while ($row = $res->fetch_assoc()) {
    if ((int)$row['vigente'] === 1 || $row['vigente'] === true || $row['vigente'] === 't') $vigentes[] = $row;
    else $vencidos[] = $row;
}

function fmt_ars($n) { return '$' . number_format((float)$n, 2, ',', '.'); }
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Presupuestos — Starlim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <link rel="stylesheet" href="../css/panel_bd.css">
    <style>
        .pq-sec { margin-bottom: 26px; }
        .pq-sec h2 { font-size: 16px; margin: 0 0 4px; }
        .pq-sec p  { margin: 0 0 10px; font-size: 12.5px; opacity: .6; }
        .pq-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .pq-table th { text-align: left; padding: 9px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; opacity: .6; border-bottom: 2px solid rgba(128,128,128,.2); }
        .pq-table td { padding: 9px 10px; border-bottom: 1px solid rgba(128,128,128,.12); vertical-align: middle; }
        .pq-cli { font-weight: 600; } .pq-cuit { font-size: 11.5px; opacity: .55; }
        .pq-total { font-weight: 700; }
        .pq-dias { font-size: 12px; } .pq-dias--ok { color:#16a34a; } .pq-dias--warn { color:#d97706; } .pq-dias--urg { color:#dc2626; }
        .pq-vencido { color:#b91c1c; font-weight:600; font-size:12px; }
        .pq-actions { display:flex; gap:6px; flex-wrap:wrap; }
        .pq-btn { padding:5px 12px; border-radius:7px; border:none; font-size:12px; font-weight:700; font-family:inherit; cursor:pointer; }
        .pq-btn--pdf { background:rgba(128,128,128,.14); color:inherit; text-decoration:none; }
        .pq-btn--ok  { background:#16a34a; color:#fff; } .pq-btn--ok:hover { background:#15803d; }
        .pq-btn--no  { background:#dc2626; color:#fff; } .pq-btn--no:hover { background:#b91c1c; }
        .pq-btn:disabled { opacity:.5; cursor:wait; }
        .pq-empty { text-align:center; padding:24px; opacity:.5; font-style:italic; }
    </style>
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>

<?php $NAV_ACTIVA = 'ventas'; include __DIR__ . '/partials/nav.php'; ?>

<main class="dash-main">
<div class="ventas-layout">

<?php $VENTAS_ACTIVA = 'presupuestos'; include __DIR__ . '/partials/ventas_sidebar.php'; ?>

<div class="ventas-content">
    <?php
        $SUBTABS = ['nuevo' => ['presupuestar.php', 'Nuevo presupuesto'], 'seguimiento' => ['presupuestos.php', 'Seguimiento']];
        $SUB_ACTIVA = 'seguimiento';
        include __DIR__ . '/partials/sub_tabs.php';
    ?>
    <h1 class="dash-hello">Seguimiento de presupuestos</h1>

    <!-- Vigentes -->
    <section class="dash-panel pq-sec">
        <h2>Vigentes</h2>
        <p>Presupuestos dentro de su vigencia. Los confirmados se pasan a venta respetando los precios.</p>
        <table class="pq-table">
            <thead><tr><th>#</th><th>Cliente</th><th>Emitido</th><th>Vence</th><th>Total</th><th>Creó</th><th></th></tr></thead>
            <tbody>
            <?php if (empty($vigentes)): ?>
                <tr><td colspan="7" class="pq-empty">No hay presupuestos vigentes.</td></tr>
            <?php else: foreach ($vigentes as $p): $d = (int)$p['dias_restantes'];
                $cls = $d <= 2 ? 'pq-dias--urg' : ($d <= 5 ? 'pq-dias--warn' : 'pq-dias--ok');
                $txt = $d === 0 ? 'Vence hoy' : ($d === 1 ? 'Vence mañana' : "Vence en $d días"); ?>
                <tr>
                    <td><strong>#<?= (int)$p['id'] ?></strong></td>
                    <td><div class="pq-cli"><?= htmlspecialchars($p['cliente_nombre'] ?: '—') ?></div>
                        <?php if ($p['cliente_cuit']): ?><div class="pq-cuit"><?= htmlspecialchars($p['cliente_cuit']) ?></div><?php endif; ?></td>
                    <td><?= date('d/m/Y', strtotime($p['fecha_emision'])) ?></td>
                    <td><?= date('d/m/Y', strtotime($p['fecha_vencimiento'])) ?><br><span class="pq-dias <?= $cls ?>"><?= $txt ?></span></td>
                    <td class="pq-total"><?= fmt_ars($p['total']) ?></td>
                    <td><?= htmlspecialchars($p['creado_por'] ?: '—') ?></td>
                    <td>
                        <div class="pq-actions">
                            <a class="pq-btn pq-btn--pdf" target="_blank" href="../php/ver_presupuesto_pdf.php?id=<?= (int)$p['id'] ?>">Ver PDF</a>
                            <?php if ($puede_aceptar): ?>
                            <button class="pq-btn pq-btn--ok" onclick="aceptar(<?= (int)$p['id'] ?>, '<?= addslashes(htmlspecialchars($p['cliente_nombre'])) ?>')">Pasar a venta</button>
                            <?php endif; ?>
                            <button class="pq-btn pq-btn--no" onclick="denegar(<?= (int)$p['id'] ?>, '<?= addslashes(htmlspecialchars($p['cliente_nombre'])) ?>')">Denegar</button>
                        </div>
                    </td>
                </tr>
            <?php endforeach; endif; ?>
            </tbody>
        </table>
    </section>

    <!-- Vencidos -->
    <section class="dash-panel pq-sec">
        <h2>Vencidos</h2>
        <p>Pasaron su vigencia. Para venderlos, armá un presupuesto nuevo.</p>
        <table class="pq-table">
            <thead><tr><th>#</th><th>Cliente</th><th>Emitido</th><th>Venció</th><th>Total</th><th>Creó</th><th></th></tr></thead>
            <tbody>
            <?php if (empty($vencidos)): ?>
                <tr><td colspan="7" class="pq-empty">No hay presupuestos vencidos.</td></tr>
            <?php else: foreach ($vencidos as $p): ?>
                <tr>
                    <td><strong>#<?= (int)$p['id'] ?></strong></td>
                    <td><div class="pq-cli"><?= htmlspecialchars($p['cliente_nombre'] ?: '—') ?></div>
                        <?php if ($p['cliente_cuit']): ?><div class="pq-cuit"><?= htmlspecialchars($p['cliente_cuit']) ?></div><?php endif; ?></td>
                    <td><?= date('d/m/Y', strtotime($p['fecha_emision'])) ?></td>
                    <td><?= date('d/m/Y', strtotime($p['fecha_vencimiento'])) ?><br><span class="pq-vencido">Vencido hace <?= abs((int)$p['dias_restantes']) ?> días</span></td>
                    <td class="pq-total"><?= fmt_ars($p['total']) ?></td>
                    <td><?= htmlspecialchars($p['creado_por'] ?: '—') ?></td>
                    <td>
                        <div class="pq-actions">
                            <a class="pq-btn pq-btn--pdf" target="_blank" href="../php/ver_presupuesto_pdf.php?id=<?= (int)$p['id'] ?>">Ver PDF</a>
                            <button class="pq-btn pq-btn--no" onclick="denegar(<?= (int)$p['id'] ?>, '<?= addslashes(htmlspecialchars($p['cliente_nombre'])) ?>')">Eliminar</button>
                        </div>
                    </td>
                </tr>
            <?php endforeach; endif; ?>
            </tbody>
        </table>
    </section>
</div>
</div>
</main>

<script src="../js/global.js"></script>
<script>
async function aceptar(id, nombre) {
    if (!confirm(`¿Pasar a venta el presupuesto #${id} (${nombre || 'sin cliente'})?\n\nSe abre la carga de pedido con los datos y precios del presupuesto.`)) return;
    const btn = event.currentTarget; btn.disabled = true;
    try {
        const fd = new FormData(); fd.append('id', id);
        const r = await (await fetch('../php/aceptar_presupuesto.php', { method: 'POST', body: fd })).json();
        if (!r.ok) throw new Error(r.error || 'Error');
        window.location.href = r.redirect;
    } catch (e) { alert('Error: ' + e.message); btn.disabled = false; }
}
async function denegar(id, nombre) {
    if (!confirm(`¿Eliminar el presupuesto #${id} (${nombre || 'sin cliente'})?\n\nNo se puede deshacer.`)) return;
    const row = event.currentTarget.closest('tr');
    row.querySelectorAll('button,a').forEach(b => b.style.pointerEvents = 'none');
    try {
        const fd = new FormData(); fd.append('id', id);
        const r = await (await fetch('../php/denegar_presupuesto.php', { method: 'POST', body: fd })).json();
        if (!r.ok) throw new Error(r.error || 'Error');
        row.style.transition = 'opacity .3s'; row.style.opacity = '0'; setTimeout(() => row.remove(), 320);
    } catch (e) { alert('Error: ' + e.message); row.querySelectorAll('button,a').forEach(b => b.style.pointerEvents = ''); }
}
</script>
</body>
</html>
