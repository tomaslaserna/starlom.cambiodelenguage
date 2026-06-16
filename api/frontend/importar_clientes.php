<?php
session_start();
include '../php/conexion_starlim_be.php';

// Seguridad: solo Admin puede importar
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
    <title>Importar Clientes - Star Lim</title>
    <link rel="stylesheet" href="../css/global.css">
    <style>
        .import-container {
            max-width: 860px;
            margin: 40px auto;
            padding: 0 20px;
        }
        .import-container h1 {
            text-align: center;
            margin-bottom: 8px;
        }
        .import-container .subtitulo {
            text-align: center;
            opacity: 0.6;
            margin-bottom: 32px;
            font-size: 0.95rem;
        }

        /* ── Tabla de mapeo ── */
        .tabla-mapeo {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 36px;
            font-size: 0.88rem;
        }
        .tabla-mapeo th {
            background: var(--color-primario, #3b82f6);
            color: #fff;
            padding: 10px 14px;
            text-align: left;
        }
        .tabla-mapeo td {
            padding: 8px 14px;
            border-bottom: 1px solid rgba(128,128,128,0.2);
        }
        .tabla-mapeo tr:nth-child(even) td {
            background: rgba(128,128,128,0.06);
        }
        .badge {
            display: inline-block;
            font-size: 0.75rem;
            padding: 2px 8px;
            border-radius: 20px;
            font-weight: 600;
        }
        .badge-ok  { background: #d1fae5; color: #065f46; }
        .badge-obs { background: #fef3c7; color: #92400e; }

        /* ── Card de upload ── */
        .card-upload {
            background: var(--bg-color, #fff);
            border: 2px dashed rgba(128,128,128,0.35);
            border-radius: 16px;
            padding: 36px;
            text-align: center;
            margin-bottom: 28px;
            transition: border-color 0.2s;
        }
        .card-upload:hover { border-color: var(--color-primario, #3b82f6); }
        .card-upload label {
            display: block;
            cursor: pointer;
        }
        .card-upload .icono {
            font-size: 3rem;
            display: block;
            margin-bottom: 12px;
        }
        .card-upload input[type="file"] { display: none; }
        .card-upload .nombre-archivo {
            margin-top: 10px;
            font-size: 0.9rem;
            opacity: 0.7;
        }

        /* ── Botón importar ── */
        .btn-importar {
            display: block;
            width: 100%;
            padding: 14px;
            background: var(--color-primario, #3b82f6);
            color: #fff;
            border: none;
            border-radius: 10px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: opacity 0.2s;
        }
        .btn-importar:hover   { opacity: 0.85; }
        .btn-importar:disabled { opacity: 0.5; cursor: not-allowed; }

        /* ── Resultados ── */
        #resultados { margin-top: 32px; display: none; }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            margin-bottom: 24px;
        }
        .stat-card {
            border-radius: 12px;
            padding: 18px;
            text-align: center;
        }
        .stat-card .numero { font-size: 2rem; font-weight: 700; }
        .stat-card .label  { font-size: 0.8rem; opacity: 0.75; margin-top: 4px; }
        .stat-insertados { background: #d1fae5; color: #065f46; }
        .stat-omitidos   { background: #fef3c7; color: #92400e; }
        .stat-total      { background: #dbeafe; color: #1e40af; }

        .errores-lista {
            background: #fef2f2;
            border: 1px solid #fca5a5;
            border-radius: 10px;
            padding: 16px 20px;
        }
        .errores-lista h3 { color: #991b1b; margin: 0 0 12px; font-size: 0.95rem; }
        .errores-lista ul { margin: 0; padding-left: 18px; }
        .errores-lista li { font-size: 0.85rem; color: #7f1d1d; margin-bottom: 4px; }

        .msg-exito {
            background: #d1fae5;
            border: 1px solid #6ee7b7;
            color: #065f46;
            border-radius: 10px;
            padding: 14px 20px;
            font-weight: 600;
            text-align: center;
        }

        /* ── Spinner ── */
        .spinner {
            display: none;
            width: 22px; height: 22px;
            border: 3px solid rgba(255,255,255,0.4);
            border-top-color: #fff;
            border-radius: 50%;
            animation: spin 0.7s linear infinite;
            margin: 0 auto;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>

    <div class="menu-sol">
        <img id="dark-mode-toggle" class="luyso" src="../imagenesIndex/luna.png" alt="Modo oscuro">
    </div>

    <main class="import-container">

        <h1>Importar Clientes</h1>
        <p class="subtitulo">Cargá un archivo <strong>.CSV</strong> exportado desde Excel para importar clientes a la BD <em>starlim</em>.</p>

        <!-- ── Tabla de mapeo de columnas ── -->
        <details open>
            <summary style="cursor:pointer; font-weight:600; margin-bottom:14px;">
                ¿Cómo debe estar armado el CSV? (orden de columnas)
            </summary>
            <table class="tabla-mapeo">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Columna en Excel / CSV</th>
                        <th>Campo en la BD</th>
                        <th>Nota</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td>1</td><td>ID CLIENTE</td><td><code>codigo_cliente</code></td><td><span class="badge badge-ok">Clave única</span></td></tr>
                    <tr><td>2</td><td>NOMBRE COMERCIAL</td><td><code>nombre_cliente</code></td><td></td></tr>
                    <tr><td>3</td><td>RAZON SOCIAL</td><td><code>razon_social</code></td><td></td></tr>
                    <tr><td>4</td><td>VENDEDOR</td><td><code>vendedor_cl</code></td><td></td></tr>
                    <tr><td>5</td><td>CUIT</td><td><code>nro_id</code> + <code>tipo_id</code></td><td><span class="badge badge-ok">tipo_id = 'CUIT'</span></td></tr>
                    <tr><td>6</td><td>PLAZO (CANT DIAS)</td><td><code>observacion</code></td><td><span class="badge badge-obs">Se adjunta a notas</span></td></tr>
                    <tr><td>7</td><td>CONDICION FRENTE AL IVA</td><td><code>cond_iva</code></td><td></td></tr>
                    <tr><td>8</td><td>TELEFONO</td><td><code>telefono</code></td><td></td></tr>
                    <tr><td>9</td><td>ESTADO</td><td><code>estado</code></td><td><span class="badge badge-ok">Activo / En Riesgo / Perdido</span></td></tr>
                    <tr><td>10</td><td>DIRECCION</td><td><code>domicilio</code></td><td></td></tr>
                    <tr><td>11</td><td>PRECIO</td><td><code>lista_precios</code></td><td></td></tr>
                    <tr><td>12</td><td>HORARIOS</td><td><code>horarios</code></td><td></td></tr>
                    <tr><td>13</td><td>NOTAS ADICIONALES</td><td><code>observacion</code></td><td></td></tr>
                    <tr><td>14</td><td>COMPROBANTE</td><td><code>comprobante</code></td><td><span class="badge badge-ok">Factura A / Factura B / Remito</span></td></tr>
                    <tr><td>15</td><td>ULTIMA COMPRA</td><td><code>ultima_compra</code></td><td><span class="badge badge-ok">dd/mm/aaaa</span></td></tr>
                    <tr><td>16</td><td>ANTIGUEDAD ULTIMA COMPRA</td><td><code>antiguedad_uc</code></td><td></td></tr>
                    <tr><td>17</td><td>PROMEDIO DE COMPRA</td><td><code>promedio_compra</code></td><td></td></tr>
                    <tr><td>18</td><td>DIA DE RECOMPRA</td><td><code>dia_recompra</code></td><td></td></tr>
                </tbody>
            </table>
        </details>

        <!-- ── Formulario de carga ── -->
        <form id="formImport" enctype="multipart/form-data">

            <div class="card-upload" id="dropZone">
                <label for="csv_file">
                    <span class="icono"></span>
                    <strong>Hacé clic para seleccionar el archivo</strong><br>
                    <small style="opacity:0.6">Solo archivos .CSV — Tamaño máximo: 10 MB</small>
                    <input type="file" id="csv_file" name="csv_file" accept=".csv">
                </label>
                <p class="nombre-archivo" id="nombreArchivo">Ningún archivo seleccionado</p>
            </div>

            <button type="submit" class="btn-importar" id="btnImportar" disabled>
                <div class="spinner" id="spinner"></div>
                <span id="btnTexto">Seleccioná un archivo primero</span>
            </button>

        </form>

        <!-- ── Resultados ── -->
        <div id="resultados">
            <div class="stats-grid">
                <div class="stat-card stat-insertados">
                    <div class="numero" id="statInsertados">0</div>
                    <div class="label">Clientes importados</div>
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
        // ── Actualizar nombre del archivo seleccionado ─────────────────────────
        const inputFile   = document.getElementById('csv_file');
        const nombreLabel = document.getElementById('nombreArchivo');
        const btnImportar = document.getElementById('btnImportar');
        const btnTexto    = document.getElementById('btnTexto');

        inputFile.addEventListener('change', function () {
            if (this.files.length > 0) {
                nombreLabel.textContent = '' + this.files[0].name;
                btnImportar.disabled    = false;
                btnTexto.textContent    = 'Importar clientes';
            } else {
                nombreLabel.textContent = 'Ningún archivo seleccionado';
                btnImportar.disabled    = true;
                btnTexto.textContent    = 'Seleccioná un archivo primero';
            }
        });

        // ── Submit del formulario ──────────────────────────────────────────────
        document.getElementById('formImport').addEventListener('submit', async function (e) {
            e.preventDefault();

            // Mostrar spinner
            btnImportar.disabled               = true;
            document.getElementById('spinner').style.display = 'block';
            btnTexto.textContent               = 'Importando...';
            document.getElementById('resultados').style.display = 'none';

            const formData = new FormData();
            formData.append('csv_file', inputFile.files[0]);

            try {
                const resp = await fetch('../php/importar_clientes_be.php', {
                    method: 'POST',
                    body: formData
                });

                const data = await resp.json();

                // Ocultar spinner
                document.getElementById('spinner').style.display = 'none';
                btnTexto.textContent = 'Importar clientes';
                btnImportar.disabled = false;

                if (data.error) {
                    alert('Error: ' + data.error);
                    return;
                }

                // Mostrar stats
                document.getElementById('statInsertados').textContent = data.insertados;
                document.getElementById('statOmitidos').textContent   = data.omitidos;
                document.getElementById('statTotal').textContent       = data.total_procesadas;
                document.getElementById('resultados').style.display   = 'block';

                // Mensaje de éxito
                const msgExito = document.getElementById('msgExito');
                if (data.insertados > 0) {
                    msgExito.textContent = `Se importaron ${data.insertados} cliente(s) correctamente.`;
                    msgExito.style.display = 'block';
                } else {
                    msgExito.style.display = 'none';
                }

                // Mostrar errores si los hay
                const erroresContainer = document.getElementById('erroresContainer');
                const erroresList      = document.getElementById('erroresList');
                if (data.errores && data.errores.length > 0) {
                    erroresList.innerHTML = data.errores
                        .map(e => `<li>${e}</li>`)
                        .join('');
                    erroresContainer.style.display = 'block';
                } else {
                    erroresContainer.style.display = 'none';
                }

                // Scroll suave hacia los resultados
                document.getElementById('resultados').scrollIntoView({ behavior: 'smooth' });

            } catch (err) {
                document.getElementById('spinner').style.display = 'none';
                btnTexto.textContent = 'Importar clientes';
                btnImportar.disabled = false;
                alert('Error de conexión: ' + err.message);
            }
        });

        // ── Drag & drop ───────────────────────────────────────────────────────
        const dropZone = document.getElementById('dropZone');

        dropZone.addEventListener('dragover', e => {
            e.preventDefault();
            dropZone.style.borderColor = 'var(--color-primario, #3b82f6)';
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.style.borderColor = 'rgba(128,128,128,0.35)';
        });
        dropZone.addEventListener('drop', e => {
            e.preventDefault();
            dropZone.style.borderColor = 'rgba(128,128,128,0.35)';
            const droppedFile = e.dataTransfer.files[0];
            if (droppedFile && droppedFile.name.endsWith('.csv')) {
                // Asignar al input
                const dt = new DataTransfer();
                dt.items.add(droppedFile);
                inputFile.files = dt.files;
                inputFile.dispatchEvent(new Event('change'));
            } else {
                alert('Solo se aceptan archivos .csv');
            }
        });
    </script>

</body>
</html>
