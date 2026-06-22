<?php
require_once __DIR__ . '/../php/session_bootstrap.php';
starlim_session_start();
include '../php/conexion_starlim_be.php';

if (!isset($_SESSION['rango']) || $_SESSION['rango'] !== 'Admin') {
    header("location: index.php");
    exit();
}
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Importar Lista de Precios - Starlim</title>
    <link rel="stylesheet" href="../css/global.css">
    <style>
        .import-container { max-width: 780px; margin: 40px auto; padding: 0 20px; }
        .import-container h1 { text-align: center; margin-bottom: 6px; }
        .import-container .subtitulo { text-align: center; opacity: .6; margin-bottom: 30px; font-size: .95rem; }

        .tabla-mapeo { width: 100%; border-collapse: collapse; margin-bottom: 32px; font-size: .88rem; }
        .tabla-mapeo th { background: var(--color-primario, #3b82f6); color: #fff; padding: 10px 14px; text-align: left; }
        .tabla-mapeo td { padding: 8px 14px; border-bottom: 1px solid rgba(128,128,128,.2); }
        .tabla-mapeo tr:nth-child(even) td { background: rgba(128,128,128,.06); }
        .badge { display:inline-block; font-size:.75rem; padding:2px 8px; border-radius:20px; font-weight:600; }
        .badge-ok   { background:#d1fae5; color:#065f46; }
        .badge-skip { background:#e0e7ff; color:#3730a3; }
        .badge-num  { background:#fef3c7; color:#92400e; }

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
        .stat-insertados { background:#d1fae5; color:#065f46; }
        .stat-omitidos   { background:#fef3c7; color:#92400e; }
        .stat-total      { background:#dbeafe; color:#1e40af; }

        .msg-exito { background:#d1fae5; border:1px solid #6ee7b7; color:#065f46; border-radius:10px; padding:14px 20px; font-weight:600; text-align:center; }
        .errores-lista { background:#fef2f2; border:1px solid #fca5a5; border-radius:10px; padding:16px 20px; }
        .errores-lista h3 { color:#991b1b; margin:0 0 10px; font-size:.95rem; }
        .errores-lista ul { margin:0; padding-left:18px; }
        .errores-lista li { font-size:.85rem; color:#7f1d1d; margin-bottom:4px; }

        .spinner { display:none; width:22px; height:22px; border:3px solid rgba(255,255,255,.4); border-top-color:#fff; border-radius:50%; animation:spin .7s linear infinite; margin:0 auto; }
        @keyframes spin { to { transform:rotate(360deg); } }
    </style>
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>

    <div class="menu-sol">
        <img id="dark-mode-toggle" class="luyso" src="../imagenesIndex/luna.png" alt="Modo oscuro">
    </div>

    <main class="import-container">

        <h1>Importar Lista de Precios</h1>
        <p class="subtitulo">Cargá un archivo <strong>.CSV</strong> para importar precios a la tabla <em>listas_precios</em>.</p>

        <details open>
            <summary style="cursor:pointer; font-weight:600; margin-bottom:14px;">
                Orden de columnas requerido en el CSV
            </summary>
            <table class="tabla-mapeo">
                <thead>
                    <tr><th>#</th><th>Columna en CSV</th><th>Campo en la BD</th><th>Nota</th></tr>
                </thead>
                <tbody>
                    <tr><td>1</td><td>id</td><td>—</td><td><span class="badge badge-skip">Se ignora (auto-increment)</span></td></tr>
                    <tr><td>2</td><td>nombre_producto</td><td><code>nombre_producto</code></td><td><span class="badge badge-ok">Clave para duplicados</span></td></tr>
                    <tr><td>3</td><td>precio_1</td><td><code>precio_1</code></td><td><span class="badge badge-num">Acepta , o .</span></td></tr>
                    <tr><td>4</td><td>precio_2</td><td><code>precio_2</code></td><td><span class="badge badge-num">Acepta , o .</span></td></tr>
                    <tr><td>5</td><td>precio_3</td><td><code>precio_3</code></td><td><span class="badge badge-num">Acepta , o .</span></td></tr>
                    <tr><td>6</td><td>precio_4</td><td><code>precio_4</code></td><td><span class="badge badge-num">Acepta , o .</span></td></tr>
                    <tr><td>7</td><td>precio_0</td><td><code>precio_0</code></td><td><span class="badge badge-num">Acepta , o .</span></td></tr>
                    <tr><td>8</td><td>precio_minorista</td><td><code>precio_minorista</code></td><td><span class="badge badge-num">Acepta , o .</span></td></tr>
                    <tr><td>9</td><td>precio_minorista_r</td><td><code>precio_minorista_r</code></td><td><span class="badge badge-num">Acepta , o .</span></td></tr>
                </tbody>
            </table>
        </details>

        <form id="formImport" enctype="multipart/form-data">
            <div class="card-upload" id="dropZone">
                <label for="csv_file">
                    <span style="font-size:3rem; display:block; margin-bottom:12px;"></span>
                    <strong>Hacé clic para seleccionar el archivo</strong><br>
                    <small style="opacity:.6">Solo archivos .CSV</small>
                    <input type="file" id="csv_file" name="csv_file" accept=".csv">
                </label>
                <p class="nombre-archivo" id="nombreArchivo">Ningún archivo seleccionado</p>
            </div>

            <button type="submit" class="btn-importar" id="btnImportar" disabled>
                <div class="spinner" id="spinner"></div>
                <span id="btnTexto">Seleccioná un archivo primero</span>
            </button>
        </form>

        <div id="resultados">
            <div class="stats-grid">
                <div class="stat-card stat-insertados">
                    <div class="numero" id="statInsertados">0</div>
                    <div class="label">Precios importados</div>
                </div>
                <div class="stat-card stat-omitidos">
                    <div class="numero" id="statOmitidos">0</div>
                    <div class="label">Omitidos (duplicados)</div>
                </div>
                <div class="stat-card stat-total">
                    <div class="numero" id="statTotal">0</div>
                    <div class="label">Filas procesadas</div>
                </div>
            </div>

            <div id="msgExito" class="msg-exito" style="display:none"></div>

            <div id="erroresContainer" class="errores-lista" style="display:none">
                <h3>Filas con problemas</h3>
                <ul id="erroresList"></ul>
            </div>
        </div>

    </main>

    <script>
        const inputFile   = document.getElementById('csv_file');
        const nombreLabel = document.getElementById('nombreArchivo');
        const btnImportar = document.getElementById('btnImportar');
        const btnTexto    = document.getElementById('btnTexto');

        inputFile.addEventListener('change', function () {
            if (this.files.length > 0) {
                nombreLabel.textContent = '' + this.files[0].name;
                btnImportar.disabled    = false;
                btnTexto.textContent    = 'Importar precios';
            } else {
                nombreLabel.textContent = 'Ningún archivo seleccionado';
                btnImportar.disabled    = true;
                btnTexto.textContent    = 'Seleccioná un archivo primero';
            }
        });

        document.getElementById('formImport').addEventListener('submit', async function (e) {
            e.preventDefault();
            btnImportar.disabled = true;
            document.getElementById('spinner').style.display = 'block';
            btnTexto.textContent = 'Importando...';
            document.getElementById('resultados').style.display = 'none';

            const fd = new FormData();
            fd.append('csv_file', inputFile.files[0]);

            try {
                const resp = await fetch('../php/importar_precios_be.php', { method: 'POST', body: fd });
                const data = await resp.json();

                document.getElementById('spinner').style.display = 'none';
                btnTexto.textContent = 'Importar precios';
                btnImportar.disabled = false;

                if (data.error) { alert('' + data.error); return; }

                document.getElementById('statInsertados').textContent = data.insertados;
                document.getElementById('statOmitidos').textContent   = data.omitidos;
                document.getElementById('statTotal').textContent       = data.total_procesadas;
                document.getElementById('resultados').style.display   = 'block';

                const msgExito = document.getElementById('msgExito');
                if (data.insertados > 0) {
                    msgExito.textContent   = `Se importaron ${data.insertados} precio(s) correctamente.`;
                    msgExito.style.display = 'block';
                } else {
                    msgExito.style.display = 'none';
                }

                const errBox  = document.getElementById('erroresContainer');
                const errList = document.getElementById('erroresList');
                if (data.errores && data.errores.length > 0) {
                    errList.innerHTML    = data.errores.map(e => `<li>${e}</li>`).join('');
                    errBox.style.display = 'block';
                } else {
                    errBox.style.display = 'none';
                }

                document.getElementById('resultados').scrollIntoView({ behavior: 'smooth' });

            } catch (err) {
                document.getElementById('spinner').style.display = 'none';
                btnTexto.textContent = 'Importar precios';
                btnImportar.disabled = false;
                alert('Error de conexión: ' + err.message);
            }
        });

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
