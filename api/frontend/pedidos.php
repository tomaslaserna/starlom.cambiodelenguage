<?php
/**
 * pedidos.php — Ventana de Pedidos (depósito y logística).
 *
 * Todo pedido cargado entra acá como 'recibido' y depósito lo avanza:
 * recibido → en_proceso → pendiente_entrega → entregado.
 * Al entregarse descuenta stock y pasa a verse en Ventas registradas.
 *
 * Visible para TODO el staff. Los rangos Empleado y Empleado_1 (depósito)
 * NO ven montos: los importes se omiten server-side (no viajan al browser).
 */
require __DIR__ . '/partials/guard.php';
include '../php/conexion_starlim_be.php';
$empresaId = starlim_bootstrap_tenant_context($conexion);

$ve_montos = in_array($rango, ['Empleado_2', 'Jefe', 'Jefe1', 'Admin'], true);
$vista = ($_GET['vista'] ?? 'activos') === 'entregados' ? 'entregados' : 'activos';
$where_pedidos = $vista === 'entregados'
    ? "v.estado_pedido = 'entregado'"
    : "v.estado_pedido IN ('recibido', 'en_proceso', 'pendiente_entrega')";
$order_pedidos = $vista === 'entregados'
    ? "v.fecha DESC, v.id DESC"
    : "v.creado_en ASC, v.id ASC";

/* ── Pedidos vivos (lo no entregado) + reparto asignado ──────────────── */
$pedidos = [];
$res = $conexion->query(
    "SELECT v.id, v.fecha, v.creado_en, v.nombre_cliente, v.dni_cliente, v.monto,
            v.estado_pedido, v.observacion, v.comprobante_deseado, v.vendedor, v.condicion_pago,
            r.id AS id_remito, r.nro_remito,
            rp.id_reparto, rep.repartidor_nombre
     FROM ventas v
     LEFT JOIN LATERAL (
         SELECT id, nro_remito FROM remitos WHERE id_venta = v.id AND empresa_id = v.empresa_id ORDER BY id LIMIT 1
     ) r ON TRUE
     LEFT JOIN reparto_pedidos rp ON rp.id_venta = v.id AND rp.empresa_id = v.empresa_id
     LEFT JOIN repartos rep       ON rep.id = rp.id_reparto AND rep.empresa_id = v.empresa_id
     WHERE v.empresa_id = $empresaId AND $where_pedidos
     ORDER BY $order_pedidos"
);
if ($res) while ($row = $res->fetch_assoc()) $pedidos[] = $row;

/* ── Repartidores: empleados con teléfono cargado (logística = todo el staff) */
$repartidores = [];
$rr = $conexion->query(
    "SELECT u.id, u.nombre_completo, u.telefono
     FROM usuarios u
     JOIN usuario_empresa ue ON ue.id_usuario = u.id
     WHERE ue.empresa_id = $empresaId
       AND ue.activo = TRUE
       AND COALESCE(u.telefono,'') <> ''
       AND COALESCE(ue.rango, u.rango) NOT IN ('Minorista','Mayorista')
     ORDER BY u.nombre_completo"
);
if ($rr) while ($row = $rr->fetch_assoc()) $repartidores[] = $row;

/* ── Detalle de productos por pedido ─────────────────────────────────── */
$detalles = [];
if ($pedidos) {
    $ids = implode(',', array_map(fn($p) => (int)$p['id'], $pedidos));
    $rd  = $conexion->query(
        "SELECT id_venta, nombre_producto, cantidad, precio_unit, subtotal
         FROM detalle_ventas WHERE empresa_id = $empresaId AND id_venta IN ($ids) ORDER BY id"
    );
    if ($rd) while ($d = $rd->fetch_assoc()) {
        $fila = ['nombre' => $d['nombre_producto'], 'cantidad' => (int)$d['cantidad']];
        if ($ve_montos) {
            $fila['precio_unit'] = (float)$d['precio_unit'];
            $fila['subtotal']    = (float)$d['subtotal'];
        }
        $detalles[(int)$d['id_venta']][] = $fila;
    }
}

/* ── Helpers ─────────────────────────────────────────────────────────── */
function fmtP($n) { return '$' . number_format((float)$n, 2, ',', '.'); }

/** Antigüedad legible desde creado_en (guardado en UTC). */
function pedido_edad(?string $creado_en): array {
    if (!$creado_en) return ['—', 0];
    try { $dt = new DateTime($creado_en, new DateTimeZone('UTC')); }
    catch (Exception $e) { return ['—', 0]; }
    $mins = max(0, (int)floor((time() - $dt->getTimestamp()) / 60));
    if ($mins < 60)        $txt = "hace {$mins} min";
    elseif ($mins < 1440)  $txt = 'hace ' . intdiv($mins, 60) . ' h';
    else                   $txt = 'hace ' . intdiv($mins, 1440) . ' día' . (intdiv($mins, 1440) > 1 ? 's' : '');
    return [$txt, $mins];
}

$ESTADOS = [
    'recibido'          => 'Recibido',
    'en_proceso'        => 'En proceso',
    'pendiente_entrega' => 'Pendiente de entrega',
];
$SIGUIENTE = [
    'recibido'          => ['en_proceso', 'Comenzar armado'],
    'en_proceso'        => ['pendiente_entrega', 'Armado listo'],
    'pendiente_entrega' => ['entregado', 'Marcar entregado'],
];
$COMPROBANTE_LBL = ['remito' => 'Remito'];

$stats = ['recibido' => 0, 'en_proceso' => 0, 'pendiente_entrega' => 0];
foreach ($pedidos as $p) $stats[$p['estado_pedido']] = ($stats[$p['estado_pedido']] ?? 0) + 1;
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pedidos — Starlim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <style>
        .summ-row { display:flex; gap:14px; margin-bottom:18px; flex-wrap:wrap; }
        .summ-card { background:var(--surface,#fff); border:1px solid rgba(128,128,128,.18); border-radius:14px; padding:14px 22px; min-width:170px; }
        .summ-label { font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; opacity:.6; }
        .summ-val { font-size:26px; font-weight:800; margin-top:2px; }
        .s-recibido .summ-val { color:#2563eb; } .s-proceso .summ-val { color:#b45309; } .s-entrega .summ-val { color:#7c3aed; }

        .filter-pills { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:14px; }
        .filter-pill { padding:5px 14px; border-radius:20px; border:1.5px solid #d1d5db; background:#fff; font-size:13px; font-weight:500; cursor:pointer; color:#374151; transition:all .15s; font-family:inherit; }
        .filter-pill.active,.filter-pill:hover { background:#2563eb; color:#fff; border-color:#2563eb; }
        .dark-mode .filter-pill { background:#101828; border-color:rgba(255,255,255,0.12); color:#e4e7ec; }
        .dark-mode .filter-pill.active,.dark-mode .filter-pill:hover { background:#1d4ed8; border-color:#1d4ed8; color:#fff; }

        .ped-table { width:100%; border-collapse:collapse; font-size:13.5px; }
        .ped-table th { text-align:left; padding:9px 10px; font-size:11px; text-transform:uppercase; letter-spacing:.06em; opacity:.6; border-bottom:2px solid rgba(128,128,128,.2); }
        .ped-table td { padding:9px 10px; border-bottom:1px solid rgba(128,128,128,.12); vertical-align:top; }

        .badge-ped { display:inline-block; padding:3px 11px; border-radius:20px; font-size:12px; font-weight:700; white-space:nowrap; }
        .badge-ped-recibido          { background:#dbeafe; color:#1e40af; }
        .badge-ped-en_proceso        { background:#fef3c7; color:#92400e; }
        .badge-ped-pendiente_entrega { background:#ede9fe; color:#5b21b6; }
        .dark-mode .badge-ped-recibido          { background:#1e3a8a; color:#93c5fd; }
        .dark-mode .badge-ped-en_proceso        { background:#451a03; color:#fbbf24; }
        .dark-mode .badge-ped-pendiente_entrega { background:#2e1065; color:#c4b5fd; }

        .edad { font-size:12px; opacity:.75; white-space:nowrap; }
        .edad-vieja { color:#dc2626; font-weight:700; opacity:1; }

        .btn-avanzar { padding:5px 12px; background:#2563eb; color:#fff; border:none; border-radius:8px; cursor:pointer; font-size:12px; font-weight:700; font-family:inherit; white-space:nowrap; }
        .btn-avanzar:hover { background:#1d4ed8; }
        .btn-avanzar.btn-entregar { background:#16a34a; }
        .btn-avanzar.btn-entregar:hover { background:#15803d; }
        .btn-avanzar:disabled { opacity:.5; cursor:wait; }

        .btn-mini { padding:4px 10px; background:rgba(128,128,128,.08); color:inherit; border:1px solid rgba(128,128,128,.2); border-radius:6px; font-size:11px; font-weight:600; text-decoration:none; cursor:pointer; font-family:inherit; white-space:nowrap; }
        .btn-mini:hover { background:rgba(128,128,128,.18); }

        .ped-detalle { display:none; }
        .ped-detalle.open { display:table-row; }
        .ped-detalle-inner { background:rgba(37,99,235,.04); border-radius:10px; padding:10px 14px; margin:2px 0 6px; }
        .dark-mode .ped-detalle-inner { background:rgba(37,99,235,.10); }
        .ped-detalle-inner table { width:100%; font-size:12.5px; border-collapse:collapse; }
        .ped-detalle-inner td, .ped-detalle-inner th { padding:3px 8px; border:none; text-align:left; }

        .obs-txt { font-size:12.5px; opacity:.85; max-width:260px; white-space:pre-wrap; }
        .obs-vacia { opacity:.4; font-style:italic; }
        .obs-edit { display:none; }
        .obs-edit.open { display:block; }
        .obs-edit textarea { width:100%; min-height:54px; padding:6px 8px; border:1.5px solid #d1d5db; border-radius:6px; font-size:12.5px; font-family:inherit; background:#fff; color:inherit; }
        .dark-mode .obs-edit textarea { background:#0c1322; border-color:rgba(255,255,255,0.12); color:#e4e7ec; }

        .ped-empty { text-align:center; padding:42px; color:#9ca3af; font-style:italic; }
        .comp-chip { display:inline-block; padding:2px 9px; border-radius:14px; font-size:11px; font-weight:700; background:rgba(128,128,128,.12); }

        .ped-order-cell { display:flex; flex-direction:column; align-items:flex-start; gap:6px; min-width:104px; }
        .ped-order-number { font-weight:800; line-height:1.1; }
        .ped-doc-actions { display:flex; flex-direction:column; align-items:flex-start; gap:5px; }
        .ped-doc-actions .btn-mini {
            display:inline-flex;
            align-items:center;
            justify-content:center;
            min-height:25px;
            padding:5px 9px;
            line-height:1;
            white-space:nowrap;
        }

        .col-check { width:34px; text-align:center; }
        .col-check input { width:16px; height:16px; cursor:pointer; }

        .reparto-panel { display:flex; flex-wrap:wrap; align-items:center; gap:14px; justify-content:space-between;
            background:var(--surface,#fff); border:1px solid rgba(128,128,128,.18); border-radius:12px; padding:12px 16px; margin-bottom:16px; }
        .reparto-info { display:flex; flex-direction:column; gap:2px; }
        .reparto-sel { font-size:13px; color:#2563eb; font-weight:600; }
        .reparto-hint { font-size:12px; opacity:.6; }
        .reparto-acciones { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        .reparto-select { padding:7px 12px; border-radius:8px; border:1.5px solid #d1d5db; font-family:inherit; font-size:13px; background:#fff; color:#101828; }
        .dark-mode .reparto-select { background:#0c1322; border-color:rgba(255,255,255,.15); color:#e4e7ec; }
        .btn-reparto { padding:8px 16px; background:#16a34a; color:#fff; border:none; border-radius:8px; cursor:pointer; font-size:13px; font-weight:700; font-family:inherit; }
        .btn-reparto:hover { background:#15803d; }
        .btn-reparto:disabled { opacity:.45; cursor:not-allowed; }
        .reparto-warn { width:100%; margin:6px 0 0; font-size:12.5px; color:#b45309; }
        .en-reparto { font-size:11px; font-weight:700; color:#2563eb; }
    </style>
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>

    <?php $NAV_ACTIVA = 'pedidos'; include __DIR__ . '/partials/nav.php'; ?>

    <main class="dash-main">

        <h1 class="dash-hello">Pedidos</h1>
        <p style="opacity:.65;font-size:13.5px;margin:-6px 0 18px;">
            <?= $vista === 'entregados'
                ? 'Historial de pedidos ya entregados para consulta y reimpresión.'
                : 'Los pedidos cargados entran acá. Depósito los avanza hasta <strong>Entregado</strong>: recién ahí descuentan stock y pasan a Ventas.' ?>
        </p>

        <div class="summ-row">
            <div class="summ-card s-recibido">
                <div class="summ-label">Recibidos</div>
                <div class="summ-val"><?= $stats['recibido'] ?></div>
            </div>
            <div class="summ-card s-proceso">
                <div class="summ-label">En proceso</div>
                <div class="summ-val"><?= $stats['en_proceso'] ?></div>
            </div>
            <div class="summ-card s-entrega">
                <div class="summ-label">Pendiente de entrega</div>
                <div class="summ-val"><?= $stats['pendiente_entrega'] ?></div>
            </div>
        </div>

        <div class="filter-pills" id="filtros-estado">
            <a class="filter-pill <?= $vista === 'activos' ? 'active' : '' ?>" href="pedidos.php">Activos</a>
            <a class="filter-pill <?= $vista === 'entregados' ? 'active' : '' ?>" href="pedidos.php?vista=entregados">Entregados</a>
            <?php if ($vista === 'activos'): ?>
            <button class="filter-pill active" data-estado="">Todos</button>
            <?php foreach ($ESTADOS as $clave => $lbl): ?>
                <button class="filter-pill" data-estado="<?= $clave ?>"><?= $lbl ?></button>
            <?php endforeach; ?>
            <?php endif; ?>
            <?php if (!empty($pedidos)): ?>
                <a class="btn-mini" target="_blank"
                   href="<?= $vista === 'entregados' ? '../php/generar_pdf_solicitud_pedido.php?todos=entregados&view=1' : '../php/generar_pdf_solicitud_pedido.php?todos=1&view=1' ?>"
                   style="margin-left:auto;padding:7px 14px;font-size:12.5px;font-weight:700;">Imprimir solicitudes</a>
            <?php endif; ?>
        </div>

        <!-- Panel de armado de reparto (logística) -->
        <?php if ($vista === 'activos'): ?>
        <div class="reparto-panel" id="reparto-panel">
            <div class="reparto-info">
                <strong>Armar reparto</strong>
                <span class="reparto-sel"><span id="reparto-count">0</span> pedido(s) seleccionado(s)</span>
                <span class="reparto-hint">Seleccioná pedidos en <em>Pendiente de entrega</em> para asignarlos a un repartidor.</span>
            </div>
            <div class="reparto-acciones">
                <select id="reparto-repartidor" class="reparto-select">
                    <option value="">— Elegí un repartidor —</option>
                    <?php foreach ($repartidores as $r): ?>
                        <option value="<?= (int)$r['id'] ?>"><?= htmlspecialchars($r['nombre_completo']) ?></option>
                    <?php endforeach; ?>
                </select>
                <button class="btn-reparto" id="btn-generar-reparto" disabled>Generar reparto y avisar</button>
            </div>
            <?php if (empty($repartidores)): ?>
                <p class="reparto-warn">No hay empleados con teléfono cargado. Cargalos en Gestión de empleados para poder armar repartos.</p>
            <?php endif; ?>
        </div>
        <?php endif; ?>

        <?php if (empty($pedidos)): ?>
            <div class="ped-empty"><?= $vista === 'entregados' ? 'No hay pedidos entregados para consultar.' : 'No hay pedidos pendientes.' ?></div>
        <?php else: ?>
        <section class="dash-panel" style="overflow-x:auto;">
            <table class="ped-table">
                <thead>
                    <tr>
                        <th class="col-check"><input type="checkbox" id="check-todos" title="Seleccionar todos los pendientes de entrega"></th>
                        <th>Pedido</th>
                        <th>Ingresó</th>
                        <th>Cliente</th>
                        <th>Productos</th>
                        <?php if ($ve_montos): ?><th>Monto</th><?php endif; ?>
                        <th>Comprobante</th>
                        <th>Observación</th>
                        <th>Estado</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                <?php foreach ($pedidos as $p):
                    [$edad_txt, $edad_min] = pedido_edad($p['creado_en']);
                    $det   = $detalles[(int)$p['id']] ?? [];
                    $n_det = array_sum(array_column($det, 'cantidad'));
                    $sig   = $SIGUIENTE[$p['estado_pedido']] ?? null;
                    $cols  = $ve_montos ? 10 : 9;
                    $en_reparto = !empty($p['id_reparto']);
                    $seleccionable = ($p['estado_pedido'] === 'pendiente_entrega' && !$en_reparto);
                ?>
                    <tr class="ped-row" data-estado="<?= htmlspecialchars($p['estado_pedido']) ?>" data-id="<?= (int)$p['id'] ?>">
                        <td class="col-check">
                            <?php if ($seleccionable): ?>
                                <input type="checkbox" class="check-pedido" value="<?= (int)$p['id'] ?>">
                            <?php endif; ?>
                        </td>
                        <td>
                            <div class="ped-order-cell">
                                <span class="ped-order-number">#<?= str_pad((string)(int)$p['nro_remito'], 4, '0', STR_PAD_LEFT) ?></span>
                                <div class="ped-doc-actions">
                                    <a class="btn-mini" target="_blank"
                                       href="../php/generar_pdf_solicitud_pedido.php?id_venta=<?= (int)$p['id'] ?>&view=1">Solicitud PDF</a>
                                    <?php if ($p['id_remito']): ?>
                                        <a class="btn-mini" target="_blank"
                                           href="../php/generar_pdf_remito.php?id_remito=<?= (int)$p['id_remito'] ?>&view=1">Remito PDF</a>
                                    <?php endif; ?>
                                </div>
                            </div>
                        </td>
                        <td>
                            <span class="edad <?= $edad_min >= 1440 ? 'edad-vieja' : '' ?>" title="<?= htmlspecialchars((string)$p['creado_en']) ?> UTC"><?= $edad_txt ?></span>
                        </td>
                        <td>
                            <?= htmlspecialchars($p['nombre_cliente'] ?: '—') ?>
                            <?php if (!empty($p['vendedor'])): ?>
                                <br><span style="font-size:11.5px;opacity:.55;">Vend: <?= htmlspecialchars($p['vendedor']) ?></span>
                            <?php endif; ?>
                        </td>
                        <td>
                            <button class="btn-mini btn-detalle" data-id="<?= (int)$p['id'] ?>">
                                <?= count($det) ?> ítem<?= count($det) === 1 ? '' : 's' ?> (<?= $n_det ?> u.) ▾
                            </button>
                        </td>
                        <?php if ($ve_montos): ?>
                            <td><strong><?= fmtP($p['monto']) ?></strong></td>
                        <?php endif; ?>
                        <td><span class="comp-chip"><?= $COMPROBANTE_LBL[$p['comprobante_deseado']] ?? 'Remito' ?></span></td>
                        <td>
                            <div class="obs-txt <?= trim((string)$p['observacion']) === '' ? 'obs-vacia' : '' ?>" id="obs-txt-<?= (int)$p['id'] ?>"><?= trim((string)$p['observacion']) !== '' ? htmlspecialchars($p['observacion']) : 'Sin observación' ?></div>
                            <div class="obs-edit" id="obs-edit-<?= (int)$p['id'] ?>">
                                <textarea id="obs-input-<?= (int)$p['id'] ?>"><?= htmlspecialchars($p['observacion']) ?></textarea>
                                <button class="btn-mini" onclick="guardarObs(<?= (int)$p['id'] ?>)">Guardar</button>
                                <button class="btn-mini" onclick="toggleObs(<?= (int)$p['id'] ?>, false)">Cancelar</button>
                            </div>
                            <button class="btn-mini" onclick="toggleObs(<?= (int)$p['id'] ?>, true)">Editar</button>
                        </td>
                        <td>
                            <span class="badge-ped badge-ped-<?= htmlspecialchars($p['estado_pedido']) ?>" id="badge-<?= (int)$p['id'] ?>"><?= $ESTADOS[$p['estado_pedido']] ?? $p['estado_pedido'] ?></span>
                            <?php if ($en_reparto): ?>
                                <br><span class="en-reparto">En reparto — <?= htmlspecialchars($p['repartidor_nombre']) ?></span>
                            <?php endif; ?>
                        </td>
                        <td>
                            <?php if ($sig): ?>
                                <button class="btn-avanzar <?= $sig[0] === 'entregado' ? 'btn-entregar' : '' ?>"
                                        data-id="<?= (int)$p['id'] ?>" data-siguiente="<?= $sig[0] ?>">
                                    <?= $sig[1] ?> →
                                </button>
                            <?php endif; ?>
                        </td>
                    </tr>
                    <tr class="ped-detalle" id="detalle-<?= (int)$p['id'] ?>" data-estado="<?= htmlspecialchars($p['estado_pedido']) ?>">
                        <td colspan="<?= $cols ?>">
                            <div class="ped-detalle-inner">
                                <table>
                                    <thead>
                                        <tr><th>Producto</th><th>Cantidad</th><?php if ($ve_montos): ?><th>Precio unit.</th><th>Subtotal</th><?php endif; ?></tr>
                                    </thead>
                                    <tbody>
                                    <?php foreach ($det as $d): ?>
                                        <tr>
                                            <td><?= htmlspecialchars($d['nombre']) ?></td>
                                            <td><?= (int)$d['cantidad'] ?></td>
                                            <?php if ($ve_montos): ?>
                                                <td><?= fmtP($d['precio_unit']) ?></td>
                                                <td><?= fmtP($d['subtotal']) ?></td>
                                            <?php endif; ?>
                                        </tr>
                                    <?php endforeach; ?>
                                    <?php if (empty($det)): ?>
                                        <tr><td colspan="<?= $ve_montos ? 4 : 2 ?>" style="opacity:.5;font-style:italic;">Sin detalle de productos</td></tr>
                                    <?php endif; ?>
                                    </tbody>
                                </table>
                            </div>
                        </td>
                    </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </section>
        <?php endif; ?>

    </main>

    <script src="../js/global.js"></script>
    <script src="../js/pedidos.js?v=2"></script>
</body>
</html>
