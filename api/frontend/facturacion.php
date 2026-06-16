<?php
/**
 * facturacion.php — Administración de facturación (AFIP). Solo Jefe1/Admin.
 *
 * Reúne lo que antes estaba disperso en Ventas:
 *   - Solicitudes de factura pendientes de aprobación.
 *   - Facturas emitidas (con CAE) y el IVA acumulado.
 *   - Notas de crédito/débito emitidas.
 *   - Registro de cambios de ventas (auditoría).
 */
$PERMITIDOS = ['Jefe1', 'Admin'];
require __DIR__ . '/partials/guard.php';
include '../php/conexion_starlim_be.php';

function fmtP($v) { return '$' . number_format((float)$v, 2, ',', '.'); }

$tipo_labels = [1 => 'Factura A', 6 => 'Factura B', 2 => 'ND A', 3 => 'NC A', 7 => 'ND B', 8 => 'NC B'];

/* ── Solicitudes pendientes ──────────────────────────────────────────── */
$solicitudes = [];
$rs = $conexion->query(
    "SELECT sf.id, sf.tipo_cbte, sf.solicitado_por, sf.creado_en, v.nombre_cliente, v.monto, v.nro_comprobante
     FROM solicitudes_factura sf JOIN ventas v ON v.id = sf.id_venta
     WHERE sf.estado = 'pendiente' ORDER BY sf.creado_en ASC"
);
if ($rs) while ($row = $rs->fetch_assoc()) $solicitudes[] = $row;

/* ── Facturas emitidas (con CAE) + IVA acumulado ─────────────────────── */
$tot = $conexion->query(
    "SELECT COUNT(*) AS n, COALESCE(SUM(monto),0) AS total,
            COALESCE(SUM(CASE WHEN tipo_cbte = 1 THEN monto - (monto/1.21) ELSE monto - (monto/1.21) END),0) AS iva_aprox
     FROM ventas WHERE COALESCE(cae,'') <> ''"
)->fetch_assoc();

$facturas = [];
$rf = $conexion->query(
    "SELECT id, nro_comprobante, tipo_cbte, fecha, monto, cae, nombre_cliente
     FROM ventas WHERE COALESCE(cae,'') <> '' ORDER BY fecha DESC, id DESC LIMIT 100"
);
if ($rf) while ($row = $rf->fetch_assoc()) $facturas[] = $row;

/* ── Notas de crédito/débito emitidas ────────────────────────────────── */
$notas = [];
$rn = $conexion->query(
    "SELECT cv.id, cv.clase, cv.fiscal, cv.nro_comprobante, cv.monto, cv.creado_en, cv.creado_por,
            COALESCE(v.nombre_cliente, r.nombre_cliente, '') AS nombre_cliente
     FROM comprobantes_venta cv
     LEFT JOIN ventas v  ON v.id = cv.id_venta
     LEFT JOIN remitos r ON r.id = cv.id_remito
     ORDER BY cv.id DESC LIMIT 100"
);
if ($rn) while ($row = $rn->fetch_assoc()) $notas[] = $row;
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Facturación (AFIP) — Star Lim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <style>
        .summ-row { display:flex; gap:14px; margin-bottom:18px; flex-wrap:wrap; }
        .summ-card { background:var(--surface,#fff); border:1px solid rgba(128,128,128,.18); border-radius:14px; padding:14px 22px; min-width:170px; }
        .summ-label { font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; opacity:.6; }
        .summ-val { font-size:24px; font-weight:800; margin-top:2px; }
        .fac-sec { margin-bottom:26px; }
        .fac-sec h2 { font-size:16px; margin:0 0 10px; }
        .fac-table { width:100%; border-collapse:collapse; font-size:13px; }
        .fac-table th { text-align:left; padding:8px 10px; font-size:11px; text-transform:uppercase; letter-spacing:.05em; opacity:.6; border-bottom:2px solid rgba(128,128,128,.2); }
        .fac-table td { padding:8px 10px; border-bottom:1px solid rgba(128,128,128,.12); }
        .fac-empty { padding:18px; text-align:center; opacity:.55; font-style:italic; }
        .fac-btn { padding:5px 12px; border:none; border-radius:7px; cursor:pointer; font-size:12px; font-weight:600; font-family:inherit; }
        .fac-btn-ok { background:#2563eb; color:#fff; } .fac-btn-ok:hover { background:#1d4ed8; }
        .fac-btn-no { background:rgba(128,128,128,.14); color:inherit; }
        .fac-chip { display:inline-block; padding:2px 9px; border-radius:12px; font-size:11px; font-weight:700; background:rgba(128,128,128,.12); }
        .fac-link { color:#2563eb; text-decoration:none; } .fac-link:hover { text-decoration:underline; }
        .fac-msg { font-size:13px; padding:8px 10px; border-radius:8px; margin-bottom:10px; display:none; }
    </style>
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>

<?php $NAV_ACTIVA = ''; include __DIR__ . '/partials/nav.php'; ?>

<main class="dash-main">
    <h1 class="dash-hello">Facturación (AFIP)</h1>
    <p style="opacity:.65;font-size:13.5px;margin:-6px 0 18px;">Aprobación de facturas, comprobantes emitidos e IVA acumulado.</p>

    <div class="summ-row">
        <div class="summ-card">
            <div class="summ-label">Facturas emitidas</div>
            <div class="summ-val"><?= (int)$tot['n'] ?></div>
        </div>
        <div class="summ-card">
            <div class="summ-label">Total facturado</div>
            <div class="summ-val"><?= fmtP($tot['total']) ?></div>
        </div>
        <div class="summ-card">
            <div class="summ-label">IVA acumulado (aprox.)</div>
            <div class="summ-val"><?= fmtP($tot['iva_aprox']) ?></div>
        </div>
        <div class="summ-card">
            <div class="summ-label">Solicitudes pendientes</div>
            <div class="summ-val" style="color:#b45309;"><?= count($solicitudes) ?></div>
        </div>
    </div>

    <div class="fac-msg" id="fac-msg"></div>

    <!-- Solicitudes pendientes -->
    <section class="dash-panel fac-sec">
        <h2>Solicitudes de factura pendientes</h2>
        <table class="fac-table">
            <thead><tr><th>Cliente</th><th>Pedido</th><th>Tipo</th><th>Monto</th><th>Solicitó</th><th></th></tr></thead>
            <tbody>
            <?php if (empty($solicitudes)): ?>
                <tr><td colspan="6" class="fac-empty">No hay solicitudes pendientes.</td></tr>
            <?php else: foreach ($solicitudes as $s): ?>
                <tr data-sol="<?= (int)$s['id'] ?>">
                    <td><?= htmlspecialchars($s['nombre_cliente']) ?></td>
                    <td>#<?= str_pad((int)$s['nro_comprobante'], 8, '0', STR_PAD_LEFT) ?></td>
                    <td><span class="fac-chip"><?= ((int)$s['tipo_cbte'] === 1) ? 'Factura A' : 'Factura B' ?></span></td>
                    <td><?= fmtP($s['monto']) ?></td>
                    <td><?= htmlspecialchars($s['solicitado_por']) ?></td>
                    <td style="white-space:nowrap;">
                        <button class="fac-btn fac-btn-ok" data-acc="aprobar"  data-id="<?= (int)$s['id'] ?>">Aprobar y emitir</button>
                        <button class="fac-btn fac-btn-no" data-acc="rechazar" data-id="<?= (int)$s['id'] ?>">Rechazar</button>
                    </td>
                </tr>
            <?php endforeach; endif; ?>
            </tbody>
        </table>
    </section>

    <!-- Facturas emitidas -->
    <section class="dash-panel fac-sec">
        <h2>Facturas emitidas</h2>
        <table class="fac-table">
            <thead><tr><th>Nro</th><th>Tipo</th><th>Cliente</th><th>Fecha</th><th>Monto</th><th>CAE</th><th></th></tr></thead>
            <tbody>
            <?php if (empty($facturas)): ?>
                <tr><td colspan="7" class="fac-empty">Todavía no se emitieron facturas.</td></tr>
            <?php else: foreach ($facturas as $f): ?>
                <tr>
                    <td><?= str_pad((int)$f['nro_comprobante'], 8, '0', STR_PAD_LEFT) ?></td>
                    <td><span class="fac-chip"><?= $tipo_labels[(int)$f['tipo_cbte']] ?? '?' ?></span></td>
                    <td><?= htmlspecialchars($f['nombre_cliente']) ?></td>
                    <td><?= $f['fecha'] ? date('d-m-Y', strtotime($f['fecha'])) : '—' ?></td>
                    <td><?= fmtP($f['monto']) ?></td>
                    <td style="font-size:11px;opacity:.7;"><?= htmlspecialchars($f['cae']) ?></td>
                    <td><a class="fac-link" target="_blank" href="../php/generar_pdf_factura.php?id_venta=<?= (int)$f['id'] ?>&view=1">PDF</a></td>
                </tr>
            <?php endforeach; endif; ?>
            </tbody>
        </table>
    </section>

    <!-- Notas de crédito / débito -->
    <section class="dash-panel fac-sec">
        <h2>Notas de crédito / débito emitidas</h2>
        <table class="fac-table">
            <thead><tr><th>Nro</th><th>Clase</th><th>Cliente</th><th>Monto</th><th>Fecha</th><th>Por</th><th></th></tr></thead>
            <tbody>
            <?php if (empty($notas)): ?>
                <tr><td colspan="7" class="fac-empty">No se emitieron notas.</td></tr>
            <?php else: foreach ($notas as $n): ?>
                <tr>
                    <td><?= str_pad((int)$n['nro_comprobante'], 8, '0', STR_PAD_LEFT) ?></td>
                    <td><span class="fac-chip"><?= $n['clase'] ?><?= (int)$n['fiscal'] ? ' fiscal' : ' interna' ?></span></td>
                    <td><?= htmlspecialchars($n['nombre_cliente']) ?></td>
                    <td><?= fmtP($n['monto']) ?></td>
                    <td><?= $n['creado_en'] ? date('d-m-Y', strtotime($n['creado_en'])) : '—' ?></td>
                    <td><?= htmlspecialchars($n['creado_por']) ?></td>
                    <td><a class="fac-link" target="_blank" href="../php/generar_pdf_comprobante.php?id=<?= (int)$n['id'] ?>&view=1">PDF</a></td>
                </tr>
            <?php endforeach; endif; ?>
            </tbody>
        </table>
    </section>

    <div style="text-align:center;margin-top:10px;">
        <a href="panel_empleados.php" class="volver">Volver al Inicio</a>
    </div>
</main>

<script src="../js/global.js"></script>
<script>
    const _msg = document.getElementById('fac-msg');
    function mostrar(t, ok) { _msg.textContent = t; _msg.style.display = 'block';
        _msg.style.background = ok ? '#dcfce7' : '#fee2e2'; _msg.style.color = ok ? '#166534' : '#991b1b'; }

    document.querySelectorAll('[data-acc]').forEach(btn => btn.addEventListener('click', async function () {
        const acc = this.dataset.acc, id = this.dataset.id;
        let motivo = '';
        if (acc === 'rechazar') { motivo = prompt('Motivo del rechazo:') || ''; if (motivo === '') return; }
        this.disabled = true;
        try {
            const res = await fetch('../php/resolver_solicitud_factura.php', {
                method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ accion: acc, id_solicitud: id, motivo }),
            });
            const r = await res.json();
            if (r.ok) {
                document.querySelector(`[data-sol="${id}"]`)?.remove();
                mostrar(acc === 'aprobar' ? `Factura emitida (CAE ${r.cae || ''}).` : 'Solicitud rechazada.', true);
                setTimeout(() => window.location.reload(), 1400);
            } else { mostrar(r.error || 'Error', false); this.disabled = false; }
        } catch { mostrar('Error de conexión', false); this.disabled = false; }
    }));
</script>
</body>
</html>
