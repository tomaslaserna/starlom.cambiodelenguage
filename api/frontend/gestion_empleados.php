<?php
$PERMITIDOS = ['Jefe1', 'Admin'];
require __DIR__ . '/partials/guard.php';

include '../php/conexion_starlim_be.php';
require_once __DIR__ . '/../php/empleados_lib.php';

$pdo = $conexion->getPDO();
starlim_empleados_ensure_schema($pdo);

$adminWhere = (($_SESSION['rango'] ?? '') === 'Admin') ? '' : "AND rango <> 'Admin'";
$empleados = $pdo->query("
    SELECT id, nombre_completo, nombre, apellido, dni, telefono, correo, usuario,
           rango, cargo, activo, fecha_ingreso, observaciones
    FROM usuarios
    WHERE rango NOT IN ('Minorista', 'Mayorista')
      $adminWhere
    ORDER BY activo DESC, nombre_completo ASC, usuario ASC
")->fetchAll(PDO::FETCH_ASSOC);

$permisos = starlim_empleados_permisos($pdo);
$permisosPorUsuario = starlim_empleados_permisos_usuario($pdo);
$permisosPorModulo = [];
foreach ($permisos as $permiso) {
    $permisosPorModulo[$permiso['modulo']][] = $permiso;
}

$rangos = [
    'Empleado'   => 'Empleado base',
    'Empleado_1' => 'Deposito / stock',
    'Empleado_2' => 'Ventas',
    'Jefe'       => 'Jefe operativo',
];
if (($_SESSION['rango'] ?? '') === 'Admin') $rangos['Jefe1'] = 'Jefe administrador';
if (($_SESSION['rango'] ?? '') === 'Admin') $rangos['Admin'] = 'Administrador';

function emp_h($v): string { return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8'); }
function emp_checked(bool $v): string { return $v ? ' checked' : ''; }
function emp_selected(bool $v): string { return $v ? ' selected' : ''; }
function emp_nombre(array $e): string {
    $nombre = trim(($e['nombre'] ?? '') . ' ' . ($e['apellido'] ?? ''));
    return $nombre !== '' ? $nombre : (string)($e['nombre_completo'] ?? $e['usuario'] ?? '');
}
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gestion de Empleados - Star Lim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <link rel="stylesheet" href="../css/panel_bd.css">
    <style>
        .emp-head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; margin-bottom:18px; }
        .emp-head h1 { margin:0; }
        .emp-head p { margin:4px 0 0; color:#667085; font-size:13.5px; }
        .emp-search { width:min(360px,100%); min-height:38px; padding:8px 12px; border:1.5px solid #d0d5dd; border-radius:8px; background:#fff; color:#101828; font-family:inherit; }
        .emp-msg { margin:0 0 14px; padding:10px 14px; border-radius:8px; font-size:13.5px; }
        .emp-msg--ok { background:#dcfce7; color:#166534; }
        .emp-msg--error { background:#fee2e2; color:#991b1b; }
        .emp-create { margin-bottom:18px; }
        .emp-create summary, .emp-card summary { cursor:pointer; list-style:none; }
        .emp-create summary::-webkit-details-marker, .emp-card summary::-webkit-details-marker { display:none; }
        .emp-create-title { display:inline-flex; align-items:center; min-height:38px; padding:8px 14px; border-radius:8px; background:#2563eb; color:#fff; font-size:13px; font-weight:800; }
        .emp-form { display:grid; gap:18px; margin-top:16px; }
        .emp-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:12px; }
        .emp-field { display:flex; flex-direction:column; gap:5px; }
        .emp-field label { font-size:11px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; color:#667085; }
        .emp-field input, .emp-field select, .emp-field textarea { width:100%; min-height:38px; padding:8px 10px; border:1.5px solid #d0d5dd; border-radius:8px; background:#fff; color:#101828; font-family:inherit; font-size:13.5px; }
        .emp-field textarea { min-height:76px; resize:vertical; }
        .emp-checkline { display:flex; align-items:center; gap:8px; min-height:38px; font-size:13.5px; font-weight:700; }
        .emp-checkline input { width:16px; height:16px; }
        .emp-list { display:grid; gap:12px; }
        .emp-card { background:var(--surface,#fff); border:1px solid rgba(128,128,128,.18); border-radius:10px; padding:0; overflow:hidden; }
        .emp-card-summary { display:grid; grid-template-columns:minmax(220px,1fr) repeat(4, minmax(110px, auto)); gap:12px; align-items:center; padding:14px 16px; }
        .emp-name { display:flex; flex-direction:column; gap:2px; min-width:0; }
        .emp-name strong { font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .emp-name span, .emp-meta { font-size:12px; color:#667085; }
        .emp-badge { display:inline-flex; justify-content:center; min-width:72px; padding:4px 9px; border-radius:999px; font-size:11.5px; font-weight:800; background:#eef2ff; color:#3730a3; white-space:nowrap; }
        .emp-badge--off { background:#f2f4f7; color:#667085; }
        .emp-card-body { padding:0 16px 16px; border-top:1px solid rgba(128,128,128,.12); }
        .emp-perms { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:12px; }
        .emp-perm-group { border:1px solid rgba(128,128,128,.16); border-radius:10px; padding:12px; background:#fff; }
        .emp-perm-title { margin:0 0 8px; font-size:12px; font-weight:900; text-transform:uppercase; letter-spacing:.06em; color:#344054; }
        .emp-perm-list { display:grid; gap:7px; }
        .emp-perm { display:flex; gap:7px; align-items:flex-start; font-size:12.8px; line-height:1.25; color:#344054; }
        .emp-perm input { margin-top:1px; }
        .emp-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .emp-btn { min-height:36px; padding:8px 14px; border:0; border-radius:8px; font-family:inherit; font-size:13px; font-weight:800; cursor:pointer; }
        .emp-btn--save { background:#16a34a; color:#fff; }
        .emp-btn--toggle { background:#475467; color:#fff; }
        .emp-btn--danger { background:#dc2626; color:#fff; }
        .emp-empty { padding:28px; text-align:center; color:#98a2b3; font-style:italic; }
        @media (max-width: 900px) {
            .emp-card-summary { grid-template-columns:1fr; }
            .emp-meta, .emp-badge { justify-self:start; }
        }
    </style>
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>

<?php $NAV_ACTIVA = 'bd'; include __DIR__ . '/partials/nav.php'; ?>

<main class="dash-main">
    <div class="ventas-layout">
        <?php $BD_ACTIVA = 'empleados'; include __DIR__ . '/partials/bd_sidebar.php'; ?>

        <div class="ventas-content">
            <div class="emp-head">
                <div>
                    <h1 class="dash-hello">Empleados</h1>
                    <p class="ventas-page-sub">Alta manual, perfiles, estado y permisos por modulo.</p>
                </div>
                <input type="search" class="emp-search" id="emp-search" placeholder="Buscar empleado...">
            </div>

            <?php if (isset($_GET['msg'])): $okMsg = ($_GET['ok'] ?? '0') === '1'; ?>
                <div class="emp-msg <?= $okMsg ? 'emp-msg--ok' : 'emp-msg--error' ?>"><?= emp_h($_GET['msg']) ?></div>
            <?php endif; ?>

            <details class="dash-panel emp-create">
                <summary><span class="emp-create-title">+ Nuevo empleado</span></summary>
                <form class="emp-form" action="../php/empleados_be.php" method="POST">
                    <input type="hidden" name="accion" value="crear">
                    <div class="emp-grid">
                        <div class="emp-field"><label>Nombre *</label><input name="nombre" required autocomplete="off"></div>
                        <div class="emp-field"><label>Apellido</label><input name="apellido" autocomplete="off"></div>
                        <div class="emp-field"><label>DNI</label><input name="dni" autocomplete="off"></div>
                        <div class="emp-field"><label>Telefono</label><input name="telefono" inputmode="tel" autocomplete="off"></div>
                        <div class="emp-field"><label>Email *</label><input name="correo" type="email" required autocomplete="off"></div>
                        <div class="emp-field"><label>Usuario *</label><input name="usuario" required autocomplete="off"></div>
                        <div class="emp-field"><label>Contraseña *</label><input name="contrasena" type="text" required minlength="6" autocomplete="off"></div>
                        <div class="emp-field"><label>Cargo</label><input name="cargo" autocomplete="off"></div>
                        <div class="emp-field">
                            <label>Rol principal *</label>
                            <select name="rango">
                                <?php foreach ($rangos as $val => $lbl): ?>
                                    <option value="<?= emp_h($val) ?>"><?= emp_h($lbl) ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <div class="emp-field"><label>Fecha ingreso</label><input name="fecha_ingreso" type="date"></div>
                        <label class="emp-checkline"><input type="checkbox" name="activo" value="1" checked> Activo</label>
                    </div>
                    <div class="emp-field"><label>Observaciones</label><textarea name="observaciones"></textarea></div>
                    <div class="emp-perms">
                        <?php foreach ($permisosPorModulo as $modulo => $items): ?>
                            <div class="emp-perm-group">
                                <h3 class="emp-perm-title"><?= emp_h($modulo) ?></h3>
                                <div class="emp-perm-list">
                                    <?php foreach ($items as $p): ?>
                                        <label class="emp-perm"><input type="checkbox" name="permisos[]" value="<?= (int)$p['id'] ?>"> <?= emp_h($p['nombre']) ?></label>
                                    <?php endforeach; ?>
                                </div>
                            </div>
                        <?php endforeach; ?>
                    </div>
                    <div class="emp-actions"><button class="emp-btn emp-btn--save" type="submit">Crear empleado</button></div>
                </form>
            </details>

            <section class="emp-list" id="emp-list">
                <?php if (empty($empleados)): ?>
                    <div class="dash-panel emp-empty">No hay empleados cargados.</div>
                <?php endif; ?>

                <?php foreach ($empleados as $e):
                    $idEmp = (int)$e['id'];
                    $nombreMostrar = emp_nombre($e);
                    $selectedPerms = $permisosPorUsuario[$idEmp] ?? [];
                    $activo = (int)($e['activo'] ?? 1) === 1;
                ?>
                    <details class="emp-card" data-search="<?= emp_h(mb_strtolower($nombreMostrar . ' ' . $e['usuario'] . ' ' . $e['correo'] . ' ' . $e['dni'] . ' ' . $e['cargo'])) ?>">
                        <summary class="emp-card-summary">
                            <div class="emp-name">
                                <strong><?= emp_h($nombreMostrar) ?></strong>
                                <span><?= emp_h($e['usuario']) ?> · <?= emp_h($e['correo']) ?></span>
                            </div>
                            <span class="emp-meta"><?= emp_h($e['cargo'] ?: 'Sin cargo') ?></span>
                            <span class="emp-meta"><?= emp_h($e['telefono'] ?: 'Sin telefono') ?></span>
                            <span class="emp-badge"><?= emp_h($rangos[$e['rango']] ?? $e['rango']) ?></span>
                            <span class="emp-badge <?= $activo ? '' : 'emp-badge--off' ?>"><?= $activo ? 'Activo' : 'Inactivo' ?></span>
                        </summary>
                        <div class="emp-card-body">
                            <form class="emp-form" action="../php/empleados_be.php" method="POST">
                                <input type="hidden" name="accion" value="editar">
                                <input type="hidden" name="id" value="<?= $idEmp ?>">
                                <div class="emp-grid">
                                    <div class="emp-field"><label>Nombre *</label><input name="nombre" value="<?= emp_h($e['nombre'] ?: $nombreMostrar) ?>" required></div>
                                    <div class="emp-field"><label>Apellido</label><input name="apellido" value="<?= emp_h($e['apellido']) ?>"></div>
                                    <div class="emp-field"><label>DNI</label><input name="dni" value="<?= emp_h($e['dni']) ?>"></div>
                                    <div class="emp-field"><label>Telefono</label><input name="telefono" value="<?= emp_h($e['telefono']) ?>" inputmode="tel"></div>
                                    <div class="emp-field"><label>Email *</label><input name="correo" type="email" value="<?= emp_h($e['correo']) ?>" required></div>
                                    <div class="emp-field"><label>Usuario *</label><input name="usuario" value="<?= emp_h($e['usuario']) ?>" required></div>
                                    <div class="emp-field"><label>Nueva contraseña</label><input name="contrasena" type="text" minlength="6" placeholder="Dejar vacio"></div>
                                    <div class="emp-field"><label>Cargo</label><input name="cargo" value="<?= emp_h($e['cargo']) ?>"></div>
                                    <div class="emp-field">
                                        <label>Rol principal *</label>
                                        <select name="rango">
                                            <?php foreach ($rangos as $val => $lbl): ?>
                                                <option value="<?= emp_h($val) ?>"<?= emp_selected($e['rango'] === $val) ?>><?= emp_h($lbl) ?></option>
                                            <?php endforeach; ?>
                                        </select>
                                    </div>
                                    <div class="emp-field"><label>Fecha ingreso</label><input name="fecha_ingreso" type="date" value="<?= emp_h($e['fecha_ingreso']) ?>"></div>
                                    <label class="emp-checkline"><input type="checkbox" name="activo" value="1"<?= emp_checked($activo) ?>> Activo</label>
                                </div>
                                <div class="emp-field"><label>Observaciones</label><textarea name="observaciones"><?= emp_h($e['observaciones']) ?></textarea></div>
                                <div class="emp-perms">
                                    <?php foreach ($permisosPorModulo as $modulo => $items): ?>
                                        <div class="emp-perm-group">
                                            <h3 class="emp-perm-title"><?= emp_h($modulo) ?></h3>
                                            <div class="emp-perm-list">
                                                <?php foreach ($items as $p): ?>
                                                    <label class="emp-perm"><input type="checkbox" name="permisos[]" value="<?= (int)$p['id'] ?>"<?= emp_checked(isset($selectedPerms[(int)$p['id']])) ?>> <?= emp_h($p['nombre']) ?></label>
                                                <?php endforeach; ?>
                                            </div>
                                        </div>
                                    <?php endforeach; ?>
                                </div>
                                <div class="emp-actions">
                                    <button class="emp-btn emp-btn--save" type="submit">Guardar cambios</button>
                                </div>
                            </form>
                            <form action="../php/empleados_be.php" method="POST" class="emp-actions" style="margin-top:10px;">
                                <input type="hidden" name="accion" value="toggle_estado">
                                <input type="hidden" name="id" value="<?= $idEmp ?>">
                                <button class="emp-btn <?= $activo ? 'emp-btn--danger' : 'emp-btn--toggle' ?>" type="submit">
                                    <?= $activo ? 'Desactivar' : 'Activar' ?>
                                </button>
                            </form>
                        </div>
                    </details>
                <?php endforeach; ?>
            </section>
        </div>
    </div>
</main>

<script src="../js/global.js"></script>
<script>
document.getElementById('emp-search')?.addEventListener('input', function () {
    const q = this.value.trim().toLowerCase();
    document.querySelectorAll('.emp-card').forEach(card => {
        card.style.display = !q || card.dataset.search.includes(q) ? '' : 'none';
    });
});
</script>
</body>
</html>
