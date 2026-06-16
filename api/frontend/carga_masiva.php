<?php
$PERMITIDOS = ['Jefe', 'Jefe1', 'Admin'];
require __DIR__ . '/partials/guard.php';

include '../php/conexion_starlim_be.php';

$esJefe1 = ($rango === 'Jefe1');
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Carga Masiva — Star Lim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <style>
        .cm-wrap    { max-width: 860px; margin: 36px auto; padding: 0 20px; }
        h1          { text-align:center; margin-bottom:6px; }
        .subtitulo  { text-align:center; opacity:.6; font-size:.9rem; margin-bottom:28px; }

        /* ── Alerta roja ── */
        .alerta-danger {
            background:#fef2f2; border:1px solid #fca5a5; border-radius:12px;
            padding:16px 20px; margin-bottom:24px; display:flex; gap:14px; align-items:flex-start;
        }
        .alerta-danger .icono { font-size:1.6rem; line-height:1; }
        .alerta-danger p { margin:4px 0 0; font-size:.88rem; color:#7f1d1d; line-height:1.6; }
        .alerta-danger strong { color:#991b1b; }

        /* ── Card instrucciones ── */
        .card {
            background:var(--bg-color,#fff);
            border:1px solid rgba(128,128,128,.18);
            border-radius:14px; padding:22px 24px; margin-bottom:22px;
            box-shadow:0 2px 8px rgba(0,0,0,.06);
        }
        .card h2 { margin:0 0 14px; font-size:1rem; }

        /* Tabla de ejemplo */
        .ejemplo-tabla { width:100%; border-collapse:collapse; font-size:.85rem; margin-bottom:12px; }
        .ejemplo-tabla th { background:var(--color-primario,#3b82f6); color:#fff; padding:8px 12px; text-align:left; }
        .ejemplo-tabla td { padding:7px 12px; border-bottom:1px solid rgba(128,128,128,.15); font-family:monospace; }
        .ejemplo-tabla tr:nth-child(even) td { background:rgba(128,128,128,.05); }

        .instrucciones { list-style:none; padding:0; margin:0; }
        .instrucciones li { padding:6px 0; font-size:.88rem; border-bottom:1px solid rgba(128,128,128,.1); }
        .instrucciones li:last-child { border:none; }
        .instrucciones li::before { content:'→ '; color:var(--color-primario,#3b82f6); font-weight:700; }

        /* ── Formulario ── */
        .fm-pass-row { display:flex; gap:12px; align-items:flex-end; margin-bottom:16px; }
        .fm-pass-row label { font-size:.88rem; font-weight:600; display:block; margin-bottom:6px; }
        .fm-pass-row input {
            flex:1; padding:10px 14px; border:1px solid rgba(128,128,128,.3);
            border-radius:8px; font-size:.95rem; background:transparent; color:inherit;
        }
        .fm-pass-row input:focus { outline:none; border-color:var(--color-primario,#3b82f6); }

        .card-upload {
            border:2px dashed rgba(128,128,128,.35); border-radius:12px;
            padding:28px; text-align:center; margin-bottom:18px; transition:border-color .2s; cursor:pointer;
        }
        .card-upload:hover { border-color:var(--color-primario,#3b82f6); }
        .card-upload input[type="file"] { display:none; }
        .nombre-archivo { margin-top:8px; font-size:.88rem; opacity:.65; }

        .btn-importar {
            display:block; width:100%; padding:14px;
            background:#ef4444; color:#fff; border:none;
            border-radius:10px; font-size:1rem; font-weight:700;
            cursor:pointer; transition:opacity .2s; letter-spacing:.3px;
        }
        .btn-importar:hover    { opacity:.85; }
        .btn-importar:disabled { opacity:.45; cursor:not-allowed; }

        /* ── Botón cambiar contraseña (Jefe1) ── */
        .btn-change-pass {
            display:inline-flex; align-items:center; gap:8px;
            padding:8px 16px; background:transparent;
            border:1px solid rgba(128,128,128,.35); border-radius:8px;
            font-size:.85rem; cursor:pointer; color:inherit;
            transition:background .2s;
        }
        .btn-change-pass:hover { background:rgba(128,128,128,.1); }

        /* ── Resultados ── */
        #resultados { margin-top:28px; display:none; }
        .stats-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-bottom:20px; }
        .stat-card  { border-radius:12px; padding:18px; text-align:center; }
        .stat-card .numero { font-size:2rem; font-weight:700; }
        .stat-card .label  { font-size:.78rem; opacity:.75; margin-top:4px; }
        .stat-ok   { background:#d1fae5; color:#065f46; }
        .stat-err  { background:#fef2f2; color:#991b1b; }
        .stat-tot  { background:#dbeafe; color:#1e40af; }
        .msg-exito { background:#d1fae5; border:1px solid #6ee7b7; color:#065f46; border-radius:10px; padding:14px 20px; font-weight:600; text-align:center; margin-bottom:14px; }
        .lista-box { border-radius:10px; padding:16px 20px; margin-bottom:12px; }
        .lista-box.error   { background:#fef2f2; border:1px solid #fca5a5; }
        .lista-box h3 { margin:0 0 10px; font-size:.92rem; color:#991b1b; }
        .lista-box ul { margin:0; padding-left:18px; }
        .lista-box li { font-size:.84rem; color:#7f1d1d; margin-bottom:3px; }

        /* ── Modal cambiar contraseña ── */
        .modal-overlay {
            display:none; position:fixed; inset:0;
            background:rgba(0,0,0,.55); z-index:1000;
            align-items:center; justify-content:center;
        }
        .modal-overlay.open { display:flex; }
        .modal {
            background:var(--bg-color,#fff); border-radius:16px;
            padding:28px 32px; width:100%; max-width:420px;
            box-shadow:0 8px 32px rgba(0,0,0,.2);
        }
        .modal h2 { margin:0 0 20px; font-size:1.1rem; }
        .modal label { font-size:.85rem; font-weight:600; display:block; margin-bottom:5px; }
        .modal input {
            width:100%; padding:9px 12px; margin-bottom:14px;
            border:1px solid rgba(128,128,128,.3); border-radius:8px;
            font-size:.9rem; background:transparent; color:inherit; box-sizing:border-box;
        }
        .modal input:focus { outline:none; border-color:var(--color-primario,#3b82f6); }
        .modal-btns { display:flex; gap:10px; justify-content:flex-end; margin-top:6px; }
        .modal-btns button { padding:9px 20px; border-radius:8px; border:none; cursor:pointer; font-size:.88rem; font-weight:600; }
        .btn-modal-cancel { background:rgba(128,128,128,.15); color:inherit; }
        .btn-modal-save   { background:var(--color-primario,#3b82f6); color:#fff; }
        #modal-msg { font-size:.83rem; margin-top:10px; min-height:18px; }
        #modal-msg.ok  { color:#065f46; }
        #modal-msg.err { color:#991b1b; }

        .spinner { display:none; width:20px; height:20px; border:3px solid rgba(255,255,255,.4); border-top-color:#fff; border-radius:50%; animation:spin .7s linear infinite; margin:0 auto; }
        @keyframes spin { to { transform:rotate(360deg); } }
    </style>
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>

<?php $NAV_ACTIVA = 'stock'; include __DIR__ . '/partials/nav.php'; ?>

<main class="cm-wrap">

    <h1>Carga Masiva de Productos</h1>
    <p class="subtitulo">Esta operación reemplaza <strong>completamente</strong> la base de productos.</p>

    <!-- Alerta -->
    <div class="alerta-danger">
        <span class="icono">!</span>
        <div>
            <strong>ATENCIÓN: Acción irreversible</strong>
            <p>Al importar el CSV se <strong>borrará toda la tabla de productos</strong> y se cargará
            la nueva información. Asegurate de tener el archivo correcto antes de continuar.
            Se requiere contraseña para proceder.</p>
        </div>
    </div>

    <!-- Instrucciones -->
    <div class="card">
        <h2>Cómo preparar el archivo Excel antes de exportar a CSV</h2>

        <p style="font-size:.88rem; margin-bottom:12px; opacity:.8;">
            El archivo debe tener <strong>exactamente 4 columnas</strong> en este orden, con encabezados en la fila 1:
        </p>

        <table class="ejemplo-tabla">
            <thead>
                <tr>
                    <th>codigo</th>
                    <th>PROVEEDOR</th>
                    <th>DESCRIPCION</th>
                    <th>COSTO</th>
                </tr>
            </thead>
            <tbody>
                <tr><td>A1</td><td>MARALIMM</td><td>ABRILLANTADOR LAVAVAJILLA X 1 LT</td><td>$9.710</td></tr>
                <tr><td>A1</td><td>MARALIMM</td><td>ABRILLANTADOR P/PISOS X 5 LTS</td><td>$2.899</td></tr>
                <tr><td>D25</td><td>PROVEEDOR X</td><td>AGITADOR CAFE REMO BLANCO x1000u</td><td>$3.806</td></tr>
            </tbody>
        </table>

        <ul class="instrucciones">
            <li>El <strong>código</strong> debe coincidir con los márgenes definidos (A1, A2, B1, D25, etc.)</li>
            <li>Los <strong>costos</strong> usan formato argentino: punto = miles, coma = decimal ($1.500 = $1500, $1.500,50 = $1500.50)</li>
            <li>Si un producto no tiene código de margen asignado, su precio calculado será $0</li>
            <li>Exportar desde Excel como <strong>CSV UTF-8 (delimitado por comas)</strong></li>
            <li>El campo <em>stock</em> se inicializa en <strong>0</strong> para todos los productos importados</li>
        </ul>
    </div>

    <!-- Formulario de carga -->
    <div class="card">
        <h2>Importar CSV</h2>

        <form id="formCarga" enctype="multipart/form-data">

            <div class="fm-pass-row">
                <div style="flex:1">
                    <label for="password">Contraseña de autorización</label>
                    <input type="password" id="password" name="password"
                           placeholder="Ingresá la contraseña" autocomplete="off">
                </div>
            </div>

            <div class="card-upload" id="dropZone">
                <label for="csv_file" style="display:block; cursor:pointer;">
                    <span style="font-size:2.5rem;display:block;margin-bottom:10px;"></span>
                    <strong>Hacé clic para seleccionar el CSV</strong><br>
                    <small style="opacity:.6">Solo archivos .csv</small>
                    <input type="file" id="csv_file" name="csv_file" accept=".csv" style="display:none">
                </label>
                <p class="nombre-archivo" id="nombreArchivo">Ningún archivo seleccionado</p>
            </div>

            <button type="submit" class="btn-importar" id="btnImportar" disabled>
                <div class="spinner" id="spinner"></div>
                <span id="btnTexto">Seleccioná un archivo primero</span>
            </button>

        </form>

        <?php if ($esJefe1): ?>
        <div style="margin-top:18px; text-align:right;">
            <button class="btn-change-pass" id="btnAbrirModal">
                Cambiar contraseña de importación
            </button>
        </div>
        <?php endif; ?>
    </div>

    <!-- Resultados -->
    <div id="resultados">
        <div class="stats-grid">
            <div class="stat-card stat-ok">
                <div class="numero" id="statInsertados">0</div>
                <div class="label">Productos importados</div>
            </div>
            <div class="stat-card stat-err">
                <div class="numero" id="statErrores">0</div>
                <div class="label">Filas con error</div>
            </div>
            <div class="stat-card stat-tot">
                <div class="numero" id="statTotal">0</div>
                <div class="label">Filas procesadas</div>
            </div>
        </div>
        <div id="msgExito" class="msg-exito" style="display:none"></div>
        <div id="erroresBox" class="lista-box error" style="display:none">
            <h3>Errores durante la importación</h3>
            <ul id="erroresList"></ul>
        </div>
    </div>

</main>

<!-- Modal cambiar contraseña (solo Jefe1) -->
<?php if ($esJefe1): ?>
<div class="modal-overlay" id="modalOverlay">
    <div class="modal">
        <h2>Cambiar contraseña de importación</h2>
        <label>Contraseña actual</label>
        <input type="password" id="passActual" placeholder="Contraseña actual">
        <label>Nueva contraseña</label>
        <input type="password" id="passNueva" placeholder="Nueva contraseña">
        <label>Confirmar nueva contraseña</label>
        <input type="password" id="passConfirm" placeholder="Repetir nueva contraseña">
        <div id="modal-msg"></div>
        <div class="modal-btns">
            <button class="btn-modal-cancel" id="btnCerrarModal">Cancelar</button>
            <button class="btn-modal-save"   id="btnGuardarPass">Guardar</button>
        </div>
    </div>
</div>
<?php endif; ?>

<script src="../js/global.js"></script>
<script>
/* ── Archivo seleccionado ── */
const inputFile   = document.getElementById('csv_file');
const nombreLabel = document.getElementById('nombreArchivo');
const btnImportar = document.getElementById('btnImportar');
const btnTexto    = document.getElementById('btnTexto');

inputFile.addEventListener('change', function () {
    if (this.files.length > 0) {
        nombreLabel.textContent = this.files[0].name;
        btnImportar.disabled    = false;
        btnTexto.textContent    = 'Vaciar BD e importar';
    } else {
        nombreLabel.textContent = 'Ningún archivo seleccionado';
        btnImportar.disabled    = true;
        btnTexto.textContent    = 'Seleccioná un archivo primero';
    }
});

/* ── Drag & drop ── */
const dropZone = document.getElementById('dropZone');
dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.style.borderColor = '#f59e0b'; });
dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = 'rgba(128,128,128,.35)'; });
dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.style.borderColor = 'rgba(128,128,128,.35)';
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith('.csv')) {
        const dt = new DataTransfer(); dt.items.add(f); inputFile.files = dt.files;
        inputFile.dispatchEvent(new Event('change'));
    } else { alert('Solo se aceptan archivos .csv'); }
});

/* ── Envío del formulario ── */
document.getElementById('formCarga').addEventListener('submit', async function (e) {
    e.preventDefault();

    const pass = document.getElementById('password').value;
    if (!pass) { alert('Ingresá la contraseña.'); return; }
    if (!inputFile.files.length) { alert('Seleccioná un archivo.'); return; }

    if (!confirm('ATENCIÓN\n\nEsta acción borrará TODOS los productos actuales y los reemplazará con el CSV.\n\n¿Estás seguro?')) return;

    btnImportar.disabled = true;
    document.getElementById('spinner').style.display = 'block';
    btnTexto.textContent = 'Importando...';
    document.getElementById('resultados').style.display = 'none';

    const fd = new FormData();
    fd.append('csv_file', inputFile.files[0]);
    fd.append('password', pass);

    try {
        const resp = await fetch('../php/carga_masiva_be.php', { method: 'POST', body: fd });
        const data = await resp.json();

        document.getElementById('spinner').style.display = 'none';
        btnTexto.textContent = 'Vaciar BD e importar';
        btnImportar.disabled = false;

        if (data.error) { alert(data.error); return; }

        document.getElementById('statInsertados').textContent = data.insertados;
        document.getElementById('statErrores').textContent    = data.errores.length;
        document.getElementById('statTotal').textContent      = data.total_procesadas;
        document.getElementById('resultados').style.display   = 'block';

        const msgExito = document.getElementById('msgExito');
        if (data.insertados > 0) {
            msgExito.textContent   = `Se importaron ${data.insertados} producto(s). La base fue reemplazada correctamente.`;
            msgExito.style.display = 'block';
        } else { msgExito.style.display = 'none'; }

        const errBox  = document.getElementById('erroresBox');
        const errList = document.getElementById('erroresList');
        if (data.errores.length > 0) {
            errList.innerHTML    = data.errores.map(e => `<li>${e}</li>`).join('');
            errBox.style.display = 'block';
        } else { errBox.style.display = 'none'; }

        document.getElementById('resultados').scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
        document.getElementById('spinner').style.display = 'none';
        btnTexto.textContent = 'Vaciar BD e importar';
        btnImportar.disabled = false;
        alert('Error de conexión: ' + err.message);
    }
});

<?php if ($esJefe1): ?>
/* ── Modal contraseña (solo Jefe1) ── */
document.getElementById('btnAbrirModal').addEventListener('click', () => {
    document.getElementById('modalOverlay').classList.add('open');
    document.getElementById('passActual').value  = '';
    document.getElementById('passNueva').value   = '';
    document.getElementById('passConfirm').value = '';
    document.getElementById('modal-msg').textContent = '';
    document.getElementById('modal-msg').className   = '';
});
document.getElementById('btnCerrarModal').addEventListener('click', () => {
    document.getElementById('modalOverlay').classList.remove('open');
});
document.getElementById('modalOverlay').addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('open');
});

document.getElementById('btnGuardarPass').addEventListener('click', async function () {
    const actual   = document.getElementById('passActual').value;
    const nueva    = document.getElementById('passNueva').value;
    const confirm  = document.getElementById('passConfirm').value;
    const msgEl    = document.getElementById('modal-msg');

    if (!actual || !nueva || !confirm) { msgEl.className = 'err'; msgEl.textContent = 'Completá todos los campos.'; return; }
    if (nueva !== confirm)             { msgEl.className = 'err'; msgEl.textContent = 'Las contraseñas nuevas no coinciden.'; return; }
    if (nueva.length < 6)              { msgEl.className = 'err'; msgEl.textContent = 'La nueva contraseña debe tener al menos 6 caracteres.'; return; }

    this.disabled = true;
    const fd = new FormData();
    fd.append('pass_actual', actual);
    fd.append('pass_nueva', nueva);

    try {
        const resp = await fetch('../php/cambiar_pass_masiva_be.php', { method: 'POST', body: fd });
        const data = await resp.json();
        if (data.ok) {
            msgEl.className   = 'ok';
            msgEl.textContent = 'Contraseña actualizada correctamente.';
            setTimeout(() => document.getElementById('modalOverlay').classList.remove('open'), 1800);
        } else {
            msgEl.className   = 'err';
            msgEl.textContent = data.error || 'Error al cambiar la contraseña.';
        }
    } catch (err) {
        msgEl.className   = 'err';
        msgEl.textContent = 'Error de conexión.';
    }
    this.disabled = false;
});
<?php endif; ?>
</script>
</body>
</html>
