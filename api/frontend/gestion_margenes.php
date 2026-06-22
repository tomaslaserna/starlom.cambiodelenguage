<?php
require_once __DIR__ . '/../php/session_bootstrap.php';
starlim_session_start();
include '../php/conexion_starlim_be.php';

if (!isset($_SESSION['rango']) || $_SESSION['rango'] !== 'Admin') {
    header("location: index.php");
    exit();
}

$margenes = $conexion->query("SELECT * FROM margenes ORDER BY codigo");
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gestión de Márgenes - Starlim</title>
    <link rel="stylesheet" href="../css/global.css">
    <style>
        body { font-family: sans-serif; }

        .container { max-width: 1000px; margin: 36px auto; padding: 0 20px; }
        h1 { text-align: center; margin-bottom: 6px; }
        .subtitulo { text-align: center; opacity: .6; font-size: .9rem; margin-bottom: 28px; }

        /* Tabla */
        .tabla-wrap { overflow-x: auto; border-radius: 14px; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
        table { width: 100%; border-collapse: collapse; font-size: .9rem; }
        thead th {
            background: var(--color-primario, #3b82f6);
            color: #fff;
            padding: 12px 14px;
            text-align: center;
            white-space: nowrap;
        }
        thead th:first-child { text-align: left; }
        tbody tr:nth-child(even) td { background: rgba(128,128,128,.05); }
        tbody tr:hover td { background: rgba(59,130,246,.07); }
        td { padding: 9px 14px; border-bottom: 1px solid rgba(128,128,128,.15); vertical-align: middle; }
        td.codigo { font-weight: 700; font-size: .95rem; }
        td.nombre { opacity: .8; }
        td.margen { text-align: center; }

        /* Inputs inline */
        .mult-input {
            width: 62px;
            padding: 4px 6px;
            text-align: center;
            border: 1px solid rgba(128,128,128,.3);
            border-radius: 6px;
            font-size: .88rem;
            background: transparent;
            color: inherit;
            transition: border-color .2s, box-shadow .2s;
        }
        .mult-input:focus {
            outline: none;
            border-color: var(--color-primario, #3b82f6);
            box-shadow: 0 0 0 2px rgba(59,130,246,.2);
        }
        .mult-input.modificado { border-color: #f59e0b; background: rgba(245,158,11,.08); }

        /* Badge de porcentaje */
        .pct { font-size: .75rem; opacity: .55; display: block; }

        /* Botón guardar por fila */
        .btn-guardar {
            padding: 4px 12px;
            background: var(--color-primario, #3b82f6);
            color: #fff;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: .82rem;
            opacity: 0;
            transition: opacity .2s;
        }
        .btn-guardar.visible { opacity: 1; }
        .btn-guardar:hover { opacity: .85 !important; }
        .btn-guardar.guardado { background: #10b981; opacity: 1; }

        /* Toast */
        #toast {
            position: fixed; bottom: 28px; right: 28px;
            background: #10b981; color: #fff;
            padding: 12px 22px; border-radius: 10px;
            font-weight: 600; font-size: .9rem;
            box-shadow: 0 4px 16px rgba(0,0,0,.2);
            transform: translateY(80px); opacity: 0;
            transition: all .3s;
            pointer-events: none;
        }
        #toast.show { transform: translateY(0); opacity: 1; }
        #toast.error { background: #ef4444; }

        /* Header info */
        .info-box {
            background: rgba(59,130,246,.08);
            border: 1px solid rgba(59,130,246,.2);
            border-radius: 10px;
            padding: 14px 18px;
            font-size: .88rem;
            margin-bottom: 22px;
            line-height: 1.6;
        }
        .info-box strong { color: var(--color-primario, #3b82f6); }
    </style>
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>

<div class="menu-sol">
    <img id="dark-mode-toggle" class="luyso" src="../imagenesIndex/luna.png" alt="Modo oscuro">
</div>

<main class="container">
    <h1>Gestión de Márgenes</h1>
    <p class="subtitulo">Los precios de todos los productos se calculan automáticamente: <strong>precio = costo × multiplicador</strong></p>

    <div class="info-box">
        <strong>Cómo funciona:</strong> cada producto tiene un código (A1, B3, D7, etc.) que pertenece a una categoría.
        Cada categoría tiene multiplicadores por lista de precio. Al cambiar el costo de un producto,
        <strong>todos sus precios se actualizan solos</strong> sin necesidad de hacer nada.
        <br>Ejemplo: costo <strong>$1.000</strong> con multiplicador <strong>1,6</strong> → Precio 1 = <strong>$1.600</strong>
    </div>

    <div class="tabla-wrap">
        <table id="tablaMargenes">
            <thead>
                <tr>
                    <th>Código</th>
                    <th>Categoría</th>
                    <th>Precio 1</th>
                    <th>Minorista</th>
                    <th>Precio 2</th>
                    <th>Precio 3</th>
                    <th>Precio 0</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
            <?php while ($m = $margenes->fetch_assoc()): ?>
                <tr data-codigo="<?= htmlspecialchars($m['codigo']) ?>">
                    <td class="codigo"><?= htmlspecialchars($m['codigo']) ?></td>
                    <td class="nombre"><?= htmlspecialchars($m['nombre']) ?></td>
                    <?php
                    $campos = ['precio_1','margen_minorista','precio_2','precio_3','precio_0'];
                    foreach ($campos as $c):
                        $val = number_format((float)$m[$c], 2, ',', '');
                        $pct = number_format(((float)$m[$c] - 1) * 100, 0);
                    ?>
                    <td class="margen">
                        <input class="mult-input"
                               type="number" step="0.01" min="1" max="9.99"
                               value="<?= $m[$c] ?>"
                               data-campo="<?= $c ?>"
                               data-original="<?= $m[$c] ?>">
                        <span class="pct">+<?= $pct ?>%</span>
                    </td>
                    <?php endforeach; ?>
                    <td>
                        <button class="btn-guardar" data-codigo="<?= htmlspecialchars($m['codigo']) ?>">
                            Guardar
                        </button>
                    </td>
                </tr>
            <?php endwhile; ?>
            </tbody>
        </table>
    </div>
</main>

<div id="toast"></div>

<script>
    // Marcar fila como modificada cuando cambia un input
    document.querySelectorAll('.mult-input').forEach(input => {
        input.addEventListener('input', function () {
            const original = parseFloat(this.dataset.original);
            const actual   = parseFloat(this.value);
            const fila     = this.closest('tr');
            const btn      = fila.querySelector('.btn-guardar');

            this.classList.toggle('modificado', actual !== original);

            // Actualizar badge de porcentaje
            const pct = Math.round((actual - 1) * 100);
            this.nextElementSibling.textContent = '+' + pct + '%';

            // Mostrar botón guardar si hay cambios en la fila
            const hayModificados = fila.querySelectorAll('.mult-input.modificado').length > 0;
            btn.classList.toggle('visible', hayModificados);
            btn.classList.remove('guardado');
            btn.textContent = 'Guardar';
        });
    });

    // Guardar fila
    document.querySelectorAll('.btn-guardar').forEach(btn => {
        btn.addEventListener('click', async function () {
            const codigo = this.dataset.codigo;
            const fila   = this.closest('tr');
            const inputs = fila.querySelectorAll('.mult-input');

            const datos = { codigo };
            inputs.forEach(i => { datos[i.dataset.campo] = i.value; });

            this.textContent = '...';

            try {
                const resp = await fetch('../php/actualizar_margen_be.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(datos)
                });
                const r = await resp.json();

                if (r.ok) {
                    // Actualizar data-original para que el comparador funcione
                    inputs.forEach(i => {
                        i.dataset.original = i.value;
                        i.classList.remove('modificado');
                    });
                    this.textContent = 'Guardado';
                    this.classList.add('guardado');
                    setTimeout(() => {
                        this.classList.remove('visible', 'guardado');
                        this.textContent = 'Guardar';
                    }, 2000);
                    mostrarToast('Margen de ' + codigo + ' actualizado ');
                } else {
                    this.textContent = 'Guardar';
                    mostrarToast('Error: ' + r.error, true);
                }
            } catch (e) {
                this.textContent = 'Guardar';
                mostrarToast('Error de conexión', true);
            }
        });
    });

    function mostrarToast(msg, error = false) {
        const t = document.getElementById('toast');
        t.textContent = msg;
        t.className   = 'show' + (error ? ' error' : '');
        setTimeout(() => { t.className = ''; }, 3000);
    }
</script>
</body>
</html>
