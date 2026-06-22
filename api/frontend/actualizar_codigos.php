<?php
require_once __DIR__ . '/../php/session_bootstrap.php';
starlim_session_start();
include '../php/conexion_starlim_be.php';
if (!isset($_SESSION['rango']) || $_SESSION['rango'] !== 'Admin') {
    header("location: index.php"); exit();
}
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Actualizar Códigos - Starlim</title>
    <link rel="stylesheet" href="../css/global.css">
    <style>
        .container { max-width: 760px; margin: 40px auto; padding: 0 20px; }
        h1 { text-align: center; margin-bottom: 6px; }
        .subtitulo { text-align: center; opacity: .6; margin-bottom: 28px; font-size: .95rem; }

        .info-box { background:rgba(59,130,246,.08); border:1px solid rgba(59,130,246,.2); border-radius:10px; padding:14px 18px; font-size:.88rem; margin-bottom:24px; line-height:1.7; }

        .tabla-mapeo { width:100%; border-collapse:collapse; margin-bottom:28px; font-size:.88rem; }
        .tabla-mapeo th { background:var(--color-primario,#3b82f6); color:#fff; padding:10px 14px; text-align:left; }
        .tabla-mapeo td { padding:8px 14px; border-bottom:1px solid rgba(128,128,128,.2); }
        .tabla-mapeo tr:nth-child(even) td { background:rgba(128,128,128,.06); }
        .badge { display:inline-block; font-size:.75rem; padding:2px 8px; border-radius:20px; font-weight:600; }
        .badge-ok   { background:#d1fae5; color:#065f46; }
        .badge-key  { background:#e0e7ff; color:#3730a3; }

        .card-upload { background:var(--bg-color,#fff); border:2px dashed rgba(128,128,128,.35); border-radius:16px; padding:36px; text-align:center; margin-bottom:24px; transition:border-color .2s; }
        .card-upload:hover { border-color:var(--color-primario,#3b82f6); }
        .card-upload label { display:block; cursor:pointer; }
        .card-upload input[type="file"] { display:none; }
        .card-upload .nombre-archivo { margin-top:10px; font-size:.9rem; opacity:.7; }

        .btn-importar { display:block; width:100%; padding:14px; background:var(--color-primario,#3b82f6); color:#fff; border:none; border-radius:10px; font-size:1rem; font-weight:600; cursor:pointer; transition:opacity .2s; }
        .btn-importar:hover    { opacity:.85; }
        .btn-importar:disabled { opacity:.5; cursor:not-allowed; }

        #resultados { margin-top:28px; display:none; }
        .stats-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-bottom:22px; }
        .stat-card { border-radius:12px; padding:18px; text-align:center; }
        .stat-card .numero { font-size:2rem; font-weight:700; }
        .stat-card .label  { font-size:.8rem; opacity:.75; margin-top:4px; }
        .stat-ok      { background:#d1fae5; color:#065f46; }
        .stat-warning { background:#fef3c7; color:#92400e; }
        .stat-total   { background:#dbeafe; color:#1e40af; }

        .msg-exito { background:#d1fae5; border:1px solid #6ee7b7; color:#065f46; border-radius:10px; padding:14px 20px; font-weight:600; text-align:center; margin-bottom:16px; }
        .lista-box { border-radius:10px; padding:16px 20px; margin-bottom:14px; }
        .lista-box.warning { background:#fef3c7; border:1px solid #fcd34d; }
        .lista-box.error   { background:#fef2f2; border:1px solid #fca5a5; }
        .lista-box h3 { margin:0 0 10px; font-size:.95rem; }
        .lista-box.warning h3 { color:#92400e; }
        .lista-box.error   h3 { color:#991b1b; }
        .lista-box ul { margin:0; padding-left:18px; }
        .lista-box li { font-size:.85rem; margin-bottom:4px; }
        .lista-box.warning li { color:#78350f; }
        .lista-box.error   li { color:#7f1d1d; }

        .spinner { display:none; width:22px; height:22px; border:3px solid rgba(255,255,255,.4); border-top-color:#fff; border-radius:50%; animation:spin .7s linear infinite; margin:0 auto; }
        @keyframes spin { to { transform:rotate(360deg); } }
    </style>
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>
<div class="menu-sol">
    <img id="dark-mode-toggle" class="luyso" src="../imagenesIndex/luna.png" alt="Modo oscuro">
</div>
<main class="container">

    <h1>Actualizar Códigos de Productos</h1>
    <p class="subtitulo">Asigna los códigos de margen (A14, D25, etc.) a los productos existentes en la BD.</p>

    <div class="info-box">
        El script busca cada producto por <strong>nombre + costo</strong> y actualiza su código.
        Después de esto, la <strong>vista de precios calculará los valores automáticamente</strong>
        usando los márgenes de cada categoría.
    </div>

    <details open>
        <summary style="cursor:pointer; font-weight:600; margin-bottom:14px;">Orden de columnas del CSV</summary>
        <table class="tabla-mapeo">
            <thead><tr><th>#</th><th>Columna</th><th>Uso</th></tr></thead>
            <tbody>
                <tr><td>1</td><td>codigo</td><td><span class="badge badge-ok">Nuevo código (A14, D25…)</span></td></tr>
                <tr><td>2</td><td>NOMBRES</td><td><span class="badge badge-key">Búsqueda en BD</span></td></tr>
                <tr><td>3</td><td>COSTO</td><td><span class="badge badge-key">Búsqueda en BD (diferencia duplicados)</span></td></tr>
            </tbody>
        </table>
    </details>

    <form id="formUpdate" enctype="multipart/form-data">
        <div class="card-upload" id="dropZone">
            <label for="csv_file">
                <span style="font-size:3rem;display:block;margin-bottom:12px;"></span>
                <strong>Hacé clic para seleccionar el archivo</strong><br>
                <small style="opacity:.6">Solo archivos .CSV</small>
                <input type="file" id="csv_file" name="csv_file" accept=".csv">
            </label>
            <p class="nombre-archivo" id="nombreArchivo">Ningún archivo seleccionado</p>
        </div>
        <button type="submit" class="btn-importar" id="btnUpdate" disabled>
            <div class="spinner" id="spinner"></div>
            <span id="btnTexto">Seleccioná un archivo primero</span>
        </button>
    </form>

    <div id="resultados">
        <div class="stats-grid">
            <div class="stat-card stat-ok">
                <div class="numero" id="statActualizados">0</div>
                <div class="label">Productos actualizados</div>
            </div>
            <div class="stat-card stat-warning">
                <div class="numero" id="statNoEncontrados">0</div>
                <div class="label">No encontrados</div>
            </div>
            <div class="stat-card stat-total">
                <div class="numero" id="statTotal">0</div>
                <div class="label">Filas procesadas</div>
            </div>
        </div>

        <div id="msgExito" class="msg-exito" style="display:none"></div>

        <div id="noEncontradosBox" class="lista-box warning" style="display:none">
            <h3>Productos no encontrados en la BD</h3>
            <ul id="noEncontradosList"></ul>
        </div>

        <div id="erroresBox" class="lista-box error" style="display:none">
            <h3>Errores</h3>
            <ul id="erroresList"></ul>
        </div>
    </div>

</main>
<script>
    const inputFile   = document.getElementById('csv_file');
    const nombreLabel = document.getElementById('nombreArchivo');
    const btnUpdate   = document.getElementById('btnUpdate');
    const btnTexto    = document.getElementById('btnTexto');

    inputFile.addEventListener('change', function () {
        if (this.files.length > 0) {
            nombreLabel.textContent = '' + this.files[0].name;
            btnUpdate.disabled      = false;
            btnTexto.textContent    = 'Actualizar códigos';
        } else {
            nombreLabel.textContent = 'Ningún archivo seleccionado';
            btnUpdate.disabled      = true;
            btnTexto.textContent    = 'Seleccioná un archivo primero';
        }
    });

    document.getElementById('formUpdate').addEventListener('submit', async function (e) {
        e.preventDefault();
        btnUpdate.disabled = true;
        document.getElementById('spinner').style.display = 'block';
        btnTexto.textContent = 'Actualizando...';
        document.getElementById('resultados').style.display = 'none';

        const fd = new FormData();
        fd.append('csv_file', inputFile.files[0]);

        try {
            const resp = await fetch('../php/actualizar_codigos_be.php', { method: 'POST', body: fd });
            const data = await resp.json();

            document.getElementById('spinner').style.display = 'none';
            btnTexto.textContent = 'Actualizar códigos';
            btnUpdate.disabled   = false;

            if (data.error) { alert('' + data.error); return; }

            document.getElementById('statActualizados').textContent  = data.actualizados;
            document.getElementById('statNoEncontrados').textContent = data.no_encontrados.length;
            document.getElementById('statTotal').textContent          = data.total_procesadas;
            document.getElementById('resultados').style.display       = 'block';

            const msgExito = document.getElementById('msgExito');
            if (data.actualizados > 0) {
                msgExito.textContent   = `Se actualizaron ${data.actualizados} producto(s) correctamente.`;
                msgExito.style.display = 'block';
            } else { msgExito.style.display = 'none'; }

            const neBox  = document.getElementById('noEncontradosBox');
            const neList = document.getElementById('noEncontradosList');
            if (data.no_encontrados.length > 0) {
                neList.innerHTML    = data.no_encontrados.map(e => `<li>${e}</li>`).join('');
                neBox.style.display = 'block';
            } else { neBox.style.display = 'none'; }

            const errBox  = document.getElementById('erroresBox');
            const errList = document.getElementById('erroresList');
            if (data.errores.length > 0) {
                errList.innerHTML    = data.errores.map(e => `<li>${e}</li>`).join('');
                errBox.style.display = 'block';
            } else { errBox.style.display = 'none'; }

            document.getElementById('resultados').scrollIntoView({ behavior: 'smooth' });

        } catch (err) {
            document.getElementById('spinner').style.display = 'none';
            btnTexto.textContent = 'Actualizar códigos';
            btnUpdate.disabled   = false;
            alert('Error de conexión: ' + err.message);
        }
    });

    // Drag & drop
    const dropZone = document.getElementById('dropZone');
    dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.style.borderColor = 'var(--color-primario,#3b82f6)'; });
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
</script>
</body>
</html>
