<?php
    $PERMITIDOS = ['Jefe1', 'Admin'];
    require __DIR__ . '/partials/guard.php';

    include '../php/conexion_starlim_be.php';

    // Consultamos a todos los usuarios (excepto a los Admin para que el Jefe1 no los toque)
    $query = "SELECT id, nombre_completo, usuario, correo, rango, COALESCE(telefono,'') AS telefono FROM usuarios
            WHERE rango NOT IN ('Minorista', 'Mayorista')
            ORDER BY nombre_completo";
    $resultado = $conexion->query($query);
?>

<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <title>Gestión de Empleados — Star Lim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <link rel="stylesheet" href="../css/panel_bd.css">
    <link rel="stylesheet" href="../css/style_rango.css">
    <style>
        .emp-table { width:100%; border-collapse:collapse; font-size:14px; }
        .emp-table th { text-align:left; padding:10px 12px; font-size:11px; text-transform:uppercase; letter-spacing:.05em; opacity:.6; border-bottom:2px solid rgba(128,128,128,.2); }
        .emp-table td { padding:9px 12px; border-bottom:1px solid rgba(128,128,128,.12); }
        .emp-tel { padding:5px 8px; border:1.5px solid #d1d5db; border-radius:6px; font-family:inherit; font-size:13px; width:150px; background:#fff; color:#101828; }
        .dark-mode .emp-tel { background:#0c1322; border-color:rgba(255,255,255,.15); color:#e4e7ec; }
        .emp-tel-save { padding:5px 11px; margin-left:6px; background:#2563eb; color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600; font-family:inherit; }
        .emp-tel-save:hover { background:#1d4ed8; }
        .emp-tel-save.ok { background:#16a34a; }
        .emp-rango-form { display:flex; gap:6px; align-items:center; }
        .emp-rango { padding:5px 8px; border:1.5px solid #d1d5db; border-radius:6px; font-family:inherit; font-size:13px; background:#fff; color:#101828; }
        .dark-mode .emp-rango { background:#0c1322; border-color:rgba(255,255,255,.15); color:#e4e7ec; }
        .emp-rango-save { padding:5px 11px; background:rgba(128,128,128,.14); color:inherit; border:none; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600; font-family:inherit; }
        .emp-rango-save:hover { background:rgba(128,128,128,.24); }
        .alta-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; align-items:end; }
        .alta-campo { display:flex; flex-direction:column; gap:4px; }
        .alta-campo label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; opacity:.6; }
        .alta-campo input, .alta-campo select { padding:7px 10px; border:1.5px solid #d1d5db; border-radius:6px; font-family:inherit; font-size:13.5px; background:#fff; color:#101828; }
        .dark-mode .alta-campo input, .dark-mode .alta-campo select { background:#0c1322; border-color:rgba(255,255,255,.15); color:#e4e7ec; }
        .alta-msg { margin:0 0 14px; padding:10px 14px; border-radius:8px; font-size:13.5px; }
    </style>
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>

<?php $NAV_ACTIVA = 'bd'; include __DIR__ . '/partials/nav.php'; ?>

<main class="dash-main">
<div class="ventas-layout">

<?php $BD_ACTIVA = 'empleados'; include __DIR__ . '/partials/bd_sidebar.php'; ?>

<div class="ventas-content">
        <h1>Panel de control de empleados</h1>
        <p style="opacity:.65;font-size:13.5px;margin:-6px 0 16px;">El teléfono se usa para avisar los repartos por WhatsApp. Incluí el código de país (ej. 54 9 351...).</p>

        <?php if (isset($_GET['msg'])): $alta_ok = ($_GET['ok'] ?? '0') === '1'; ?>
        <div class="alta-msg" style="background:<?= $alta_ok ? '#dcfce7' : '#fee2e2' ?>;color:<?= $alta_ok ? '#166534' : '#991b1b' ?>;">
            <?= htmlspecialchars($_GET['msg']) ?>
        </div>
        <?php endif; ?>

        <div style="margin-bottom:14px;">
            <button type="button" class="emp-tel-save emp-add-toggle" id="btn-toggle-alta" style="background:#2563eb;">+ Agregar empleado</button>
        </div>

        <section class="dash-panel" id="alta-empleado-panel" style="display:none;margin-bottom:18px;">
            <h2 style="margin:0 0 14px;font-size:16px;">Nuevo empleado</h2>
            <form action="../php/crear_empleado_be.php" method="POST" class="alta-grid">
                <div class="alta-campo">
                    <label>Nombre completo *</label>
                    <input type="text" name="nombre_completo" required>
                </div>
                <div class="alta-campo">
                    <label>Usuario *</label>
                    <input type="text" name="usuario" required autocomplete="off">
                </div>
                <div class="alta-campo">
                    <label>Correo</label>
                    <input type="email" name="correo" autocomplete="off">
                </div>
                <div class="alta-campo">
                    <label>Contraseña *</label>
                    <input type="text" name="contrasena" required minlength="6" placeholder="mínimo 6 caracteres">
                </div>
                <div class="alta-campo">
                    <label>Rango *</label>
                    <select name="rango" class="emp-rango">
                        <?php
                        $alta_opciones = [
                            'Empleado'   => 'Empleado Nivel 0',
                            'Empleado_1' => 'Empleado Nivel 1',
                            'Empleado_2' => 'Empleado Nivel 2',
                            'Jefe'       => 'Jefe',
                            'Minorista'  => 'Minorista',
                            'Mayorista'  => 'Mayorista',
                        ];
                        if (($_SESSION['rango'] ?? '') === 'Admin') $alta_opciones['Jefe1'] = 'Jefe 1';
                        foreach ($alta_opciones as $val => $lbl):
                        ?>
                            <option value="<?= $val ?>"><?= $lbl ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="alta-campo">
                    <button type="submit" class="emp-rango-save" style="background:#16a34a;color:#fff;padding:8px 16px;">Crear empleado</button>
                </div>
            </form>
        </section>

        <section class="dash-panel" style="overflow-x:auto;">
            <table class="emp-table">
                <thead>
                    <tr>
                        <th>Id</th>
                        <th>Nombre Completo</th>
                        <th>Usuario</th>
                        <th>Correo</th>
                        <th>Rango</th>
                        <th>Teléfono</th>
                    </tr>
                </thead>
                <tbody>
                    <?php while($row = $resultado->fetch_assoc()): ?>
                    <tr>
                        <td><?php echo (int)$row['id']; ?></td>
                        <td><strong><?php echo htmlspecialchars($row['nombre_completo']); ?></strong></td>
                        <td><?php echo htmlspecialchars($row['usuario']); ?></td>
                        <td><?php echo htmlspecialchars($row['correo']); ?></td>
                        <td>
                            <?php if ($canRangos && $row['rango'] !== 'Admin'): ?>
                            <form action="../php/actualizar_rango_be.php" method="POST" class="emp-rango-form">
                                <input type="hidden" name="id_usuario" value="<?php echo (int)$row['id']; ?>">
                                <select name="nuevo_rango" class="emp-rango">
                                    <?php
                                    $opciones = [
                                        'Minorista'  => 'Minorista',
                                        'Mayorista'  => 'Mayorista',
                                        'Empleado'   => 'Empleado Nivel 0',
                                        'Empleado_1' => 'Empleado Nivel 1',
                                        'Empleado_2' => 'Empleado Nivel 2',
                                        'Jefe'       => 'Jefe',
                                    ];
                                    if (($_SESSION['rango'] ?? '') === 'Admin') $opciones['Jefe1'] = 'Jefe 1';
                                    foreach ($opciones as $val => $lbl):
                                    ?>
                                        <option value="<?php echo $val; ?>" <?php echo $row['rango'] === $val ? 'selected' : ''; ?>><?php echo $lbl; ?></option>
                                    <?php endforeach; ?>
                                </select>
                                <button type="submit" class="emp-rango-save">Guardar</button>
                            </form>
                            <?php else: ?>
                                <strong><?php echo htmlspecialchars($row['rango']); ?></strong>
                            <?php endif; ?>
                        </td>
                        <td>
                            <input type="text" class="emp-tel" value="<?php echo htmlspecialchars($row['telefono']); ?>"
                                   data-id="<?php echo (int)$row['id']; ?>" placeholder="—" inputmode="tel">
                            <button class="emp-tel-save" data-id="<?php echo (int)$row['id']; ?>">Guardar</button>
                        </td>
                    </tr>
                    <?php endwhile; ?>
                </tbody>
            </table>
        </section>
        <div style="text-align:center;margin-top:16px;">
            <a href="panel_base_datos.php" class="volver">Volver al Panel</a>
        </div>
        </main>

        <script src="../js/global.js"></script>
        <script>
            document.querySelectorAll('.emp-tel-save[data-id]').forEach(btn => btn.addEventListener('click', async function () {
                const id  = this.dataset.id;
                const inp = document.querySelector(`.emp-tel[data-id="${id}"]`);
                this.disabled = true;
                try {
                    const res = await fetch('../php/actualizar_telefono_empleado.php', {
                        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({ id, telefono: inp.value }),
                    });
                    const data = await res.json();
                    if (data.ok) {
                        const txt = this.textContent; this.textContent = 'Guardado'; this.classList.add('ok');
                        setTimeout(() => { this.textContent = txt; this.classList.remove('ok'); this.disabled = false; }, 1200);
                    } else { alert(data.error || 'No se pudo guardar'); this.disabled = false; }
                } catch { alert('Error de conexión'); this.disabled = false; }
            }));

            document.getElementById('btn-toggle-alta')?.addEventListener('click', function () {
                const p = document.getElementById('alta-empleado-panel');
                const show = p.style.display === 'none';
                p.style.display = show ? 'block' : 'none';
                this.textContent = show ? '− Cerrar' : '+ Agregar empleado';
            });
        </script>
</div><!-- /ventas-content -->
</div><!-- /ventas-layout -->
</main>
</body>
</html>
