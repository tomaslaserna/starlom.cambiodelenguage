<?php
/**
 * proveedores.php — Base de datos de proveedores (Base de Datos).
 * Lista + alta + edición + baja. CRUD vía proveedores_be.php.
 * Auto-sync: incorpora proveedores presentes en productos.proveedor.
 */
$PERMITIDOS = ['Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'];
require __DIR__ . '/partials/guard.php';
include '../php/conexion_starlim_be.php';
$empresaId = starlim_bootstrap_tenant_context($conexion);

// Auto-sync: insertar proveedores presentes en productos pero ausentes en la tabla
$conexion->query("
    INSERT INTO proveedores (nombre, empresa_id)
    SELECT DISTINCT TRIM(p.proveedor), $empresaId
    FROM productos p
    WHERE TRIM(COALESCE(p.proveedor,'')) <> ''
      AND p.empresa_id = $empresaId
      AND NOT EXISTS (
          SELECT 1 FROM proveedores pv
          WHERE pv.empresa_id = p.empresa_id
            AND LOWER(pv.nombre) = LOWER(TRIM(p.proveedor))
      )
");

$proveedores = [];
$rp = $conexion->query("
    SELECT pv.id, pv.nombre, pv.contacto, pv.telefono, pv.email, pv.direccion, pv.notas,
           COUNT(p.id) AS total_productos
    FROM proveedores pv
    LEFT JOIN productos p ON p.empresa_id = pv.empresa_id AND LOWER(TRIM(p.proveedor)) = LOWER(pv.nombre)
    WHERE pv.empresa_id = $empresaId
    GROUP BY pv.id
    ORDER BY pv.nombre ASC
");
if ($rp) while ($row = $rp->fetch_assoc()) $proveedores[] = $row;
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Proveedores — Starlim</title>
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
        .db-del { padding:4px 11px; background:rgba(220,38,38,.1); color:#b91c1c; border:none; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600; font-family:inherit; }
        .db-empty { text-align:center; padding:30px; opacity:.55; font-style:italic; }
        .db-chip { display:inline-block; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:700; background:rgba(128,128,128,.12); }

        .cl-overlay { position:fixed; inset:0; background:rgba(0,0,0,.5); display:none; align-items:center; justify-content:center; z-index:9999; padding:20px; }
        .cl-overlay.open { display:flex; }
        .cl-modal { background:var(--surface,#fff); color:var(--text,#101828); border-radius:14px; max-width:560px; width:100%; max-height:90vh; overflow:auto; box-shadow:0 20px 60px rgba(0,0,0,.3); }
        .cl-head { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid rgba(128,128,128,.18); }
        .cl-head h3 { margin:0; font-size:16px; } .cl-x { background:none; border:none; font-size:22px; cursor:pointer; color:inherit; }
        .cl-body { padding:18px 20px; display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .cl-field { display:flex; flex-direction:column; gap:3px; } .cl-field.full { grid-column:1 / -1; }
        .cl-field label { font-size:11px; text-transform:uppercase; letter-spacing:.04em; opacity:.6; }
        .cl-field input, .cl-field textarea { padding:7px 9px; border:1.5px solid #d1d5db; border-radius:7px; font-size:13px; font-family:inherit; background:#fff; color:#101828; }
        .dark-mode .cl-field input, .dark-mode .cl-field textarea { background:#0c1322; border-color:rgba(255,255,255,.15); color:#e4e7ec; }
        .cl-foot { padding:14px 20px; border-top:1px solid rgba(128,128,128,.18); display:flex; justify-content:flex-end; gap:10px; }
        .cl-msg { font-size:13px; padding:0 20px; color:#991b1b; min-height:18px; }
    </style>
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>

<?php $NAV_ACTIVA = 'bd'; include __DIR__ . '/partials/nav.php'; ?>

<main class="dash-main">
<div class="ventas-layout">

<?php $BD_ACTIVA = 'proveedores'; include __DIR__ . '/partials/bd_sidebar.php'; ?>

<div class="ventas-content">
    <h1 class="dash-hello">Proveedores</h1>
    <div class="db-toolbar">
        <input type="text" id="pv-buscar" class="db-search" placeholder="Buscar proveedor...">
        <button class="db-btn" id="pv-nuevo">+ Nuevo proveedor</button>
    </div>
    <section class="dash-panel" style="overflow-x:auto;">
        <table class="db-table">
            <thead>
                <tr><th>Proveedor</th><th>Contacto</th><th>Teléfono</th><th>Email</th><th>Productos</th><th></th></tr>
            </thead>
            <tbody id="pv-tbody">
                <?php if (empty($proveedores)): ?>
                    <tr><td colspan="6" class="db-empty">No hay proveedores cargados.</td></tr>
                <?php else: foreach ($proveedores as $p): ?>
                    <tr class="pv-row">
                        <td><strong><?= htmlspecialchars($p['nombre']) ?></strong></td>
                        <td><?= htmlspecialchars($p['contacto']) ?></td>
                        <td><?= htmlspecialchars($p['telefono']) ?></td>
                        <td><?= htmlspecialchars($p['email']) ?></td>
                        <td><span class="db-chip"><?= (int)$p['total_productos'] ?></span></td>
                        <td style="white-space:nowrap;">
                            <button class="db-edit" data-pv='<?= htmlspecialchars(json_encode($p, JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_TAG | JSON_HEX_AMP), ENT_QUOTES) ?>'>Editar</button>
                            <button class="db-del" data-id="<?= (int)$p['id'] ?>" data-nombre="<?= htmlspecialchars($p['nombre'], ENT_QUOTES) ?>">Borrar</button>
                        </td>
                    </tr>
                <?php endforeach; endif; ?>
            </tbody>
        </table>
    </section>
</div>
</div>
</main>

<div class="cl-overlay" id="pv-overlay">
    <div class="cl-modal">
        <div class="cl-head"><h3 id="pv-modal-title">Nuevo proveedor</h3><button class="cl-x" id="pv-cerrar">&times;</button></div>
        <div class="cl-body">
            <input type="hidden" id="f-id">
            <div class="cl-field full"><label>Nombre *</label><input type="text" id="f-nombre"></div>
            <div class="cl-field"><label>Contacto</label><input type="text" id="f-contacto"></div>
            <div class="cl-field"><label>Teléfono</label><input type="text" id="f-telefono"></div>
            <div class="cl-field full"><label>Email</label><input type="text" id="f-email"></div>
            <div class="cl-field full"><label>Dirección</label><input type="text" id="f-direccion"></div>
            <div class="cl-field full"><label>Notas</label><textarea id="f-notas" rows="2"></textarea></div>
        </div>
        <div class="cl-msg" id="pv-msg"></div>
        <div class="cl-foot">
            <button class="db-edit" id="pv-cancelar">Cancelar</button>
            <button class="db-btn" id="pv-guardar">Guardar</button>
        </div>
    </div>
</div>

<script src="../js/global.js"></script>
<script>
    const CAMPOS = ['nombre','contacto','telefono','email','direccion','notas'];
    const overlay = document.getElementById('pv-overlay');
    const msg = document.getElementById('pv-msg');

    document.getElementById('pv-buscar').addEventListener('input', function () {
        const q = this.value.toLowerCase();
        document.querySelectorAll('#pv-tbody .pv-row').forEach(tr => {
            tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
    });

    function abrir(pv) {
        msg.textContent = '';
        document.getElementById('pv-modal-title').textContent = pv ? 'Editar proveedor' : 'Nuevo proveedor';
        document.getElementById('f-id').value = pv ? pv.id : '';
        CAMPOS.forEach(c => { document.getElementById('f-' + c).value = pv ? (pv[c] ?? '') : ''; });
        overlay.classList.add('open');
    }
    function cerrar() { overlay.classList.remove('open'); }

    document.getElementById('pv-nuevo').addEventListener('click', () => abrir(null));
    document.getElementById('pv-cerrar').addEventListener('click', cerrar);
    document.getElementById('pv-cancelar').addEventListener('click', cerrar);
    overlay.addEventListener('click', e => { if (e.target === overlay) cerrar(); });
    document.querySelectorAll('.db-edit[data-pv]').forEach(b => b.addEventListener('click', () => abrir(JSON.parse(b.dataset.pv))));

    document.getElementById('pv-guardar').addEventListener('click', async function () {
        const id = document.getElementById('f-id').value;
        if (!document.getElementById('f-nombre').value.trim()) { msg.textContent = 'El nombre es obligatorio.'; return; }
        this.disabled = true;
        const body = new URLSearchParams({ accion: id ? 'edit_proveedor' : 'add_proveedor' });
        if (id) body.set('id', id);
        CAMPOS.forEach(c => body.set(c, document.getElementById('f-' + c).value));
        try {
            const r = await (await fetch('../php/proveedores_be.php', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })).json();
            if (r.ok) window.location.reload();
            else { msg.textContent = r.error || 'Error'; this.disabled = false; }
        } catch { msg.textContent = 'Error de conexión'; this.disabled = false; }
    });

    document.querySelectorAll('.db-del').forEach(b => b.addEventListener('click', async function () {
        if (!confirm('¿Borrar el proveedor "' + this.dataset.nombre + '"?')) return;
        this.disabled = true;
        try {
            const r = await (await fetch('../php/proveedores_be.php', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ accion: 'del_proveedor', id: this.dataset.id }) })).json();
            if (r.ok) window.location.reload(); else { alert(r.error || 'Error'); this.disabled = false; }
        } catch { alert('Error de conexión'); this.disabled = false; }
    }));
</script>
</body>
</html>
