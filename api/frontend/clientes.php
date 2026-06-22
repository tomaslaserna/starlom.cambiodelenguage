<?php
/**
 * clientes.php — Base de datos de clientes (Base de Datos).
 * Lista buscable + alta + edición. CRUD vía clientes_be.php.
 */
$PERMITIDOS = ['Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'];
require __DIR__ . '/partials/guard.php';
include '../php/conexion_starlim_be.php';
$empresaId = starlim_bootstrap_tenant_context($conexion);

$clientes = [];
$res = $conexion->query(
    "SELECT id, nombre_cliente, razon_social, tipo_id, nro_id, cond_iva, telefono,
            domicilio, ciudad, provincia, lista_precios, estado, vendedor_cl, observacion
     FROM clientes WHERE empresa_id = $empresaId ORDER BY nombre_cliente ASC"
);
if ($res) while ($r = $res->fetch_assoc()) $clientes[] = $r;

// Plazo de pago (columna nueva). Consulta separada y tolerante: si la migración
// (db_fixes.sql) aún no corrió, la página sigue funcionando sin romperse.
$plazos_cl = [];
try {
    $rpl = $conexion->query("SELECT id, plazo_pago_dias FROM clientes WHERE empresa_id = $empresaId");
    if ($rpl) while ($row = $rpl->fetch_assoc()) $plazos_cl[(int)$row['id']] = (int)$row['plazo_pago_dias'];
} catch (Throwable $e) { $plazos_cl = []; }
foreach ($clientes as &$c) $c['plazo_pago_dias'] = $plazos_cl[(int)$c['id']] ?? 0;
unset($c);

// Recuento por estado (Activo / En Riesgo / Perdido) para el encabezado
$cuenta = ['Activo' => 0, 'En Riesgo' => 0, 'Perdido' => 0];
foreach ($clientes as $c) {
    $e = trim($c['estado'] ?? '');
    if (isset($cuenta[$e])) $cuenta[$e]++;
}
$total_cli  = count($clientes);
$activos    = $cuenta['Activo'];
$inactivos  = $cuenta['En Riesgo'] + $cuenta['Perdido'];
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Clientes — Starlim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <link rel="stylesheet" href="../css/panel_bd.css">
    <style>
        .db-toolbar { display:flex; gap:12px; align-items:center; justify-content:space-between; flex-wrap:wrap; margin-bottom:14px; }
        .db-search { padding:8px 12px; border:1.5px solid #d1d5db; border-radius:8px; font-size:14px; min-width:240px; background:#fff; color:#101828; font-family:inherit; }
        .dark-mode .db-search { background:#0c1322; border-color:rgba(255,255,255,.15); color:#e4e7ec; }
        .db-btn { padding:8px 16px; background:#2563eb; color:#fff; border:none; border-radius:8px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit; }
        .db-btn:hover { background:#1d4ed8; }
        .db-table { width:100%; border-collapse:collapse; font-size:13px; }
        .db-table th { text-align:left; padding:9px 10px; font-size:11px; text-transform:uppercase; letter-spacing:.05em; opacity:.6; border-bottom:2px solid rgba(128,128,128,.2); }
        .db-table td { padding:8px 10px; border-bottom:1px solid rgba(128,128,128,.12); }
        .db-edit { padding:4px 11px; background:rgba(128,128,128,.14); color:inherit; border:none; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600; font-family:inherit; }
        .db-edit:hover { background:rgba(128,128,128,.24); }
        .db-empty { text-align:center; padding:30px; opacity:.55; font-style:italic; }
        .db-chip { display:inline-block; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:700; background:rgba(128,128,128,.12); }
        .cli-stats { display:flex; gap:12px; flex-wrap:wrap; margin:4px 0 16px; }
        .cli-stat { background:var(--surface,#fff); border:1px solid rgba(128,128,128,.18); border-radius:12px; padding:10px 18px; min-width:96px; }
        .cli-stat-lbl { display:block; font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; opacity:.6; }
        .cli-stat-val { font-size:22px; font-weight:800; }
        .cli-stat-val.c-act { color:#16a34a; } .cli-stat-val.c-ina { color:#b45309; }
        .cli-stat-val.c-rie { color:#b45309; } .cli-stat-val.c-per { color:#b91c1c; }

        .cl-overlay { position:fixed; inset:0; background:rgba(0,0,0,.5); display:none; align-items:center; justify-content:center; z-index:9999; padding:20px; }
        .cl-overlay.open { display:flex; }
        .cl-modal { background:var(--surface,#fff); color:var(--text,#101828); border-radius:14px; max-width:640px; width:100%; max-height:90vh; overflow:auto; box-shadow:0 20px 60px rgba(0,0,0,.3); }
        .cl-head { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid rgba(128,128,128,.18); position:sticky; top:0; background:inherit; }
        .cl-head h3 { margin:0; font-size:16px; } .cl-x { background:none; border:none; font-size:22px; cursor:pointer; color:inherit; }
        .cl-body { padding:18px 20px; display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .cl-field { display:flex; flex-direction:column; gap:3px; } .cl-field.full { grid-column:1 / -1; }
        .cl-field label { font-size:11px; text-transform:uppercase; letter-spacing:.04em; opacity:.6; }
        .cl-field input, .cl-field select, .cl-field textarea { padding:7px 9px; border:1.5px solid #d1d5db; border-radius:7px; font-size:13px; font-family:inherit; background:#fff; color:#101828; }
        .dark-mode .cl-field input, .dark-mode .cl-field select, .dark-mode .cl-field textarea { background:#0c1322; border-color:rgba(255,255,255,.15); color:#e4e7ec; }
        .cl-foot { padding:14px 20px; border-top:1px solid rgba(128,128,128,.18); display:flex; justify-content:flex-end; gap:10px; }
        .cl-msg { font-size:13px; padding:0 20px; color:#991b1b; min-height:18px; }
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
        $SUB_ACTIVA = 'base';
        include __DIR__ . '/partials/sub_tabs.php';
    ?>
    <h1 class="dash-hello">Clientes</h1>
    <div class="cli-stats">
        <div class="cli-stat"><span class="cli-stat-lbl">Total</span><span class="cli-stat-val"><?= $total_cli ?></span></div>
        <div class="cli-stat"><span class="cli-stat-lbl">Activos</span><span class="cli-stat-val c-act"><?= $activos ?></span></div>
        <div class="cli-stat"><span class="cli-stat-lbl">Inactivos</span><span class="cli-stat-val c-ina"><?= $inactivos ?></span></div>
        <div class="cli-stat"><span class="cli-stat-lbl">En riesgo</span><span class="cli-stat-val c-rie"><?= $cuenta['En Riesgo'] ?></span></div>
        <div class="cli-stat"><span class="cli-stat-lbl">Perdidos</span><span class="cli-stat-val c-per"><?= $cuenta['Perdido'] ?></span></div>
    </div>
    <div class="db-toolbar">
        <input type="text" id="cl-buscar" class="db-search" placeholder="Buscar por nombre, CUIT, ciudad...">
        <button class="db-btn" id="cl-nuevo">+ Nuevo cliente</button>
    </div>
    <section class="dash-panel" style="overflow-x:auto;">
        <table class="db-table">
            <thead>
                <tr>
                    <th>Cliente</th><th>CUIT/DNI</th><th>Cond. IVA</th><th>Teléfono</th>
                    <th>Lista</th><th>Ciudad</th><th>Estado</th><th>Vendedor</th><th></th>
                </tr>
            </thead>
            <tbody id="cl-tbody">
                <?php if (empty($clientes)): ?>
                    <tr><td colspan="9" class="db-empty">No hay clientes cargados.</td></tr>
                <?php else: foreach ($clientes as $c): ?>
                    <tr class="cl-row">
                        <td>
                            <strong><?= htmlspecialchars($c['nombre_cliente']) ?></strong>
                            <?php if (!empty($c['razon_social'])): ?><br><span style="opacity:.6;font-size:11.5px;"><?= htmlspecialchars($c['razon_social']) ?></span><?php endif; ?>
                        </td>
                        <td><?= htmlspecialchars(($c['tipo_id'] ? $c['tipo_id'].': ' : '') . $c['nro_id']) ?></td>
                        <td><?= htmlspecialchars($c['cond_iva']) ?></td>
                        <td><?= htmlspecialchars($c['telefono']) ?></td>
                        <td><span class="db-chip"><?= htmlspecialchars($c['lista_precios'] ?: '—') ?></span></td>
                        <td><?= htmlspecialchars(trim(($c['ciudad'] ?: '') . (($c['ciudad'] && $c['provincia']) ? ', ' : '') . ($c['provincia'] ?: ''))) ?></td>
                        <td><?= htmlspecialchars($c['estado'] ?: '—') ?></td>
                        <td><?= htmlspecialchars($c['vendedor_cl']) ?></td>
                        <td><button class="db-edit" data-cli='<?= htmlspecialchars(json_encode($c, JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_TAG | JSON_HEX_AMP), ENT_QUOTES) ?>'>Editar</button></td>
                    </tr>
                <?php endforeach; endif; ?>
            </tbody>
        </table>
    </section>
</div>
</div>
</main>

<!-- Modal alta/edición -->
<div class="cl-overlay" id="cl-overlay">
    <div class="cl-modal">
        <div class="cl-head"><h3 id="cl-modal-title">Nuevo cliente</h3><button class="cl-x" id="cl-cerrar">&times;</button></div>
        <div class="cl-body">
            <input type="hidden" id="f-id">
            <div class="cl-field full"><label>Nombre *</label><input type="text" id="f-nombre_cliente"></div>
            <div class="cl-field"><label>Razón social</label><input type="text" id="f-razon_social"></div>
            <div class="cl-field"><label>Vendedor</label><input type="text" id="f-vendedor_cl"></div>
            <div class="cl-field"><label>Tipo doc</label>
                <select id="f-tipo_id"><option value="">—</option><option>CUIT</option><option>DNI</option><option>CUIL</option></select>
            </div>
            <div class="cl-field"><label>CUIT/DNI</label><input type="text" id="f-nro_id"></div>
            <div class="cl-field"><label>Condición IVA</label><input type="text" id="f-cond_iva" list="cl-iva">
                <datalist id="cl-iva"><option value="Responsable Inscripto"><option value="Monotributo"><option value="Consumidor Final"><option value="Exento"></datalist>
            </div>
            <div class="cl-field"><label>Teléfono</label><input type="text" id="f-telefono"></div>
            <div class="cl-field"><label>Lista de precios</label>
                <select id="f-lista_precios"><option value="">—</option><option>0</option><option>1</option><option>2</option><option>3</option><option>4</option><option value="rev">rev</option></select>
            </div>
            <div class="cl-field"><label>Estado</label>
                <select id="f-estado"><option value="">—</option><option>Activo</option><option>En Riesgo</option><option>Perdido</option></select>
            </div>
            <div class="cl-field"><label>Plazo de pago (días)</label><input type="number" id="f-plazo_pago_dias" min="0" max="365" value="0" title="Días de plazo acordado; autocompleta el vencimiento del cobro al cargar pedidos"></div>
            <div class="cl-field full"><label>Domicilio</label><input type="text" id="f-domicilio"></div>
            <div class="cl-field"><label>Ciudad</label><input type="text" id="f-ciudad"></div>
            <div class="cl-field"><label>Provincia</label><input type="text" id="f-provincia"></div>
            <div class="cl-field full"><label>Observación</label><textarea id="f-observacion" rows="2"></textarea></div>
        </div>
        <div class="cl-msg" id="cl-msg"></div>
        <div class="cl-foot">
            <button class="db-edit" id="cl-cancelar">Cancelar</button>
            <button class="db-btn" id="cl-guardar">Guardar</button>
        </div>
    </div>
</div>

<script src="../js/global.js"></script>
<script>
    const CAMPOS = ['nombre_cliente','razon_social','tipo_id','nro_id','cond_iva','telefono','domicilio','ciudad','provincia','lista_precios','estado','vendedor_cl','observacion','plazo_pago_dias'];
    const overlay = document.getElementById('cl-overlay');
    const msg = document.getElementById('cl-msg');

    // Buscador (filtra filas en cliente)
    document.getElementById('cl-buscar').addEventListener('input', function () {
        const q = this.value.toLowerCase();
        document.querySelectorAll('#cl-tbody .cl-row').forEach(tr => {
            tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
    });

    function abrirModal(cli) {
        msg.textContent = '';
        document.getElementById('cl-modal-title').textContent = cli ? 'Editar cliente' : 'Nuevo cliente';
        document.getElementById('f-id').value = cli ? cli.id : '';
        CAMPOS.forEach(c => { const el = document.getElementById('f-' + c); if (el) el.value = cli ? (cli[c] ?? '') : ''; });
        overlay.classList.add('open');
    }
    function cerrar() { overlay.classList.remove('open'); }

    document.getElementById('cl-nuevo').addEventListener('click', () => abrirModal(null));
    document.getElementById('cl-cerrar').addEventListener('click', cerrar);
    document.getElementById('cl-cancelar').addEventListener('click', cerrar);
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(); });
    document.querySelectorAll('.db-edit[data-cli]').forEach(b =>
        b.addEventListener('click', () => abrirModal(JSON.parse(b.dataset.cli))));

    document.getElementById('cl-guardar').addEventListener('click', async function () {
        const id = document.getElementById('f-id').value;
        if (!document.getElementById('f-nombre_cliente').value.trim()) { msg.textContent = 'El nombre es obligatorio.'; return; }
        this.disabled = true;
        const body = new URLSearchParams({ accion: id ? 'editar' : 'crear' });
        if (id) body.set('id', id);
        CAMPOS.forEach(c => body.set(c, document.getElementById('f-' + c).value));
        try {
            const r = await (await fetch('../php/clientes_be.php', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })).json();
            if (r.ok) { window.location.reload(); }
            else { msg.textContent = r.error || 'Error'; this.disabled = false; }
        } catch { msg.textContent = 'Error de conexión'; this.disabled = false; }
    });
</script>
</body>
</html>
