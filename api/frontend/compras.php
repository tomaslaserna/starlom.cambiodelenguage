<?php
    require __DIR__ . '/partials/guard.php';

    include '../php/conexion_starlim_be.php';

    /* Esquema gestionado en supabase_migration.sql + db_fixes.sql (los bloques
       de auto-migración MySQL que vivían acá fallaban silenciosamente en Postgres) */

    /* ── Handle POST ────────────────────────────────────────────────── */
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $accion    = $_POST['accion']    ?? '';
        $redir_tab = $_POST['redir_tab'] ?? 'urgencia';


        /* Registro de compras */
        if ($accion === 'add_registro') {
            $id_prov  = !empty($_POST['id_proveedor']) ? (int)$_POST['id_proveedor'] : null;
            $desc     = trim($_POST['descripcion'] ?? '');
            $total    = !empty($_POST['total']) ? (float)$_POST['total'] : null;
            $fecha    = !empty($_POST['fecha']) ? $_POST['fecha'] : date('Y-m-d');
            $estado   = in_array($_POST['estado'] ?? '', ['pendiente','en_camino','recibida','cancelada'])
                        ? $_POST['estado'] : 'pendiente';
            $prod_ids = $_POST['prod_id']  ?? [];
            $prod_qty = $_POST['prod_qty'] ?? [];

            if ($desc !== '') {
                $s = $conexion->prepare(
                    "INSERT INTO compras_registro (id_proveedor,descripcion,total,fecha,estado,tipo)
                     VALUES (?,?,?,?,?,'manual')"
                );
                $s->bind_param('isdss', $id_prov, $desc, $total, $fecha, $estado);
                $s->execute();
                $id_compra = $conexion->insert_id;
                $s->close();

                /* Guardar detalle de productos */
                foreach ($prod_ids as $idx => $pid) {
                    $pid = (int)$pid;
                    $qty = max(1, (int)($prod_qty[$idx] ?? 1));
                    if ($pid > 0) {
                        $sd = $conexion->prepare(
                            "INSERT INTO detalle_compras_registro (id_compra, id_producto, cantidad)
                             VALUES (?, ?, ?)"
                        );
                        $sd->bind_param('iii', $id_compra, $pid, $qty);
                        $sd->execute(); $sd->close();
                    }
                }

            }
        }
        if ($accion === 'del_registro') {
            $id = (int)($_POST['id'] ?? 0);
            if ($id > 0) {
                $s = $conexion->prepare("DELETE FROM compras_registro WHERE id = ?");
                $s->bind_param('i', $id); $s->execute(); $s->close();
            }
        }
        if ($accion === 'update_estado') {
            $id     = (int)($_POST['id'] ?? 0);
            $estado = in_array($_POST['estado'] ?? '', ['pendiente','en_camino','recibida','cancelada'])
                      ? $_POST['estado'] : 'pendiente';
            if ($id > 0) {
                $s = $conexion->prepare("UPDATE compras_registro SET estado = ? WHERE id = ?");
                $s->bind_param('si', $estado, $id); $s->execute(); $s->close();
            }
        }

        /* Compras automáticas → registro */
        if ($accion === 'generar_orden') {
            $id_prov   = !empty($_POST['id_proveedor']) ? (int)$_POST['id_proveedor'] : null;
            $fecha     = !empty($_POST['fecha']) ? $_POST['fecha'] : date('Y-m-d');
            $notas_ord = trim($_POST['notas'] ?? '');
            $ids_prod  = $_POST['prod_ids']  ?? [];
            $qtys      = $_POST['prod_qty']  ?? [];

            $lineas = [];
            $total  = 0.0;

            foreach ($ids_prod as $pid) {
                $pid = (int)$pid;
                $qty = max(1, (int)($qtys[$pid] ?? 1));
                $rp  = $conexion->prepare("SELECT nombre, costo FROM productos WHERE id = ?");
                $rp->bind_param('i', $pid);
                $rp->execute();
                $prod = $rp->get_result()->fetch_assoc();
                $rp->close();
                if ($prod) {
                    $lineas[] = '- ' . $prod['nombre'] . ': ' . $qty . ' uds.';
                    $total   += $qty * (float)$prod['costo'];
                }
            }

            if (!empty($lineas)) {
                $desc = "Orden generada automáticamente\n\nProductos:\n" . implode("\n", $lineas);
                if ($notas_ord !== '') $desc .= "\n\nNotas: $notas_ord";
                $s = $conexion->prepare(
                    "INSERT INTO compras_registro (id_proveedor,descripcion,total,fecha,estado,tipo)
                     VALUES (?,?,?,?,'pendiente','automatica')"
                );
                $s->bind_param('isds', $id_prov, $desc, $total, $fecha);
                $s->execute();
                $id_orden = $conexion->insert_id;
                $s->close();

                /* Guardar detalle estructurado */
                foreach ($ids_prod as $pid) {
                    $pid = (int)$pid;
                    $qty = max(1, (int)($qtys[$pid] ?? 1));
                    if ($pid > 0) {
                        $sd = $conexion->prepare(
                            "INSERT INTO detalle_compras_registro (id_compra, id_producto, cantidad)
                             VALUES (?, ?, ?)"
                        );
                        $sd->bind_param('iii', $id_orden, $pid, $qty);
                        $sd->execute(); $sd->close();
                    }
                }
            }
            $redir_tab = 'registro';
        }

        header("Location: compras.php?tab=$redir_tab");
        exit;
    }

    /* ── Tab activo ─────────────────────────────────────────────────── */
    $valid_tabs = ['urgencia', 'anticipadas', 'registro', 'automaticas'];
    $tab = $_GET['tab'] ?? 'urgencia';
    if (!in_array($tab, $valid_tabs, true)) $tab = 'urgencia';
    $abrir_nueva_compra = !empty($_GET['nuevo']);

    $tipo_labels = [1 => 'A', 2 => 'ND', 3 => 'NC', 6 => 'B', 7 => 'ND', 8 => 'NC'];

    /* ── Verificar detalle_ventas ────────────────────────────────────── */
    $tc = $conexion->query("SHOW TABLES LIKE 'detalle_ventas'");
    $tiene_detalle = $tc && $tc->num_rows > 0;

    /* ── Tab: Urgencia ──────────────────────────────────────────────── */
    $urgentes = $detalles_map = [];
    if ($tab === 'urgencia' && $tiene_detalle) {
        $ru = $conexion->query("
            SELECT v.id, v.nro_comprobante, v.nombre_cliente, v.dni_cliente,
                   v.fecha, v.tipo_cbte, MIN(r.id) AS remito_id,
                   SUM(GREATEST(dv.cantidad - p.stock, 0)) AS total_exceso
            FROM ventas v
            JOIN detalle_ventas dv ON dv.id_venta  = v.id
            JOIN productos     p  ON p.id          = dv.id_producto
            LEFT JOIN remitos  r  ON r.id_venta    = v.id
            WHERE v.estado_pedido IN ('recibido', 'en_proceso', 'pendiente_entrega')
            GROUP BY v.id, v.nro_comprobante, v.nombre_cliente, v.dni_cliente, v.fecha, v.tipo_cbte
            HAVING SUM(GREATEST(dv.cantidad - p.stock, 0)) > 0
            ORDER BY DATE(v.fecha) ASC, total_exceso DESC
        ");
        if ($ru) while ($row = $ru->fetch_assoc()) {
            $row['nro_fmt']    = str_pad((int)$row['nro_comprobante'], 8, '0', STR_PAD_LEFT);
            $row['fecha_fmt']  = $row['fecha'] ? date('d/m/y', strtotime($row['fecha'])) : '—';
            $row['tipo_label'] = $tipo_labels[(int)$row['tipo_cbte']] ?? '?';
            $urgentes[] = $row;
        }
        if (!empty($urgentes)) {
            $ids = implode(',', array_map('intval', array_column($urgentes, 'id')));
            $rd  = $conexion->query("
                SELECT dv.id_venta, p.id AS cod_producto, p.nombre AS nombre_producto,
                       dv.cantidad AS cantidad_vendida, p.stock AS stock_actual
                FROM detalle_ventas dv JOIN productos p ON p.id = dv.id_producto
                WHERE dv.id_venta IN ($ids)
                ORDER BY dv.id_venta, (dv.cantidad > p.stock) DESC, p.nombre ASC
            ");
            if ($rd) while ($row = $rd->fetch_assoc())
                $detalles_map[(int)$row['id_venta']][] = $row;
            foreach ($urgentes as &$u) $u['detalles'] = $detalles_map[(int)$u['id']] ?? [];
            unset($u);
        }
    }

    /* ── Tab: Anticipadas / Automáticas (reponer algorithm) ─────────── */
    $reponer       = [];
    $reponer_mode  = 'sales';
    $reponer_total = 0;
    if (in_array($tab, ['anticipadas', 'automaticas'], true)) {
        if ($tiene_detalle) {
            /* Une por id_producto para mantener el mismo criterio que Stock/Reponer
               y evitar diferencias cuando cambia el nombre de un producto. */
            $rr = $conexion->query("
                SELECT base.id, base.nombre, base.stock_actual, base.costo,
                       base.cnt_recomendada, base.prov_nombre
                FROM (
                    SELECT p.id, p.nombre, p.stock AS stock_actual, p.costo,
                           COALESCE(p.proveedor,'') AS prov_nombre,
                           CEIL(GREATEST(
                               SUM(dv.cantidad)::numeric
                               / GREATEST(EXTRACT(YEAR FROM age(CURRENT_DATE, MIN(v.fecha))) * 12
                                          + EXTRACT(MONTH FROM age(CURRENT_DATE, MIN(v.fecha))), 1)
                               * 2, 1
                           )) AS cnt_recomendada
                    FROM productos p
                    JOIN detalle_ventas dv ON dv.id_producto = p.id
                    JOIN ventas        v  ON v.id = dv.id_venta
                    WHERE v.fecha >= CURRENT_DATE - INTERVAL '6 months'
                    GROUP BY p.id, p.nombre, p.stock, p.costo, p.proveedor
                ) AS base
                WHERE base.stock_actual < base.cnt_recomendada
                ORDER BY base.prov_nombre ASC, (base.cnt_recomendada - base.stock_actual) DESC
            ");
            if ($rr) while ($row = $rr->fetch_assoc()) $reponer[] = $row;
        }
        $reponer_total = count($reponer);
        if (empty($reponer)) {
            $reponer_mode = 'fallback';
            /* Sin LIMIT esta lista puede traer miles de productos y el HTML
               resultante supera el límite de 4.5MB de respuesta de Vercel
               (FUNCTION_RESPONSE_PAYLOAD_TOO_LARGE). */
            $rc = $conexion->query("SELECT COUNT(*) AS c FROM productos WHERE stock <= 0");
            $reponer_total = $rc && ($cr = $rc->fetch_assoc()) ? (int)$cr['c'] : 0;
            $rr2 = $conexion->query("
                SELECT id, nombre, stock AS stock_actual, costo, NULL AS cnt_recomendada,
                       COALESCE(proveedor,'') AS prov_nombre
                FROM productos WHERE stock <= 0 ORDER BY proveedor ASC, nombre ASC
                LIMIT 400
            ");
            if ($rr2) while ($row = $rr2->fetch_assoc()) $reponer[] = $row;
        }
    }

    /* ── Tab: Registro ──────────────────────────────────────────────── */
    $registros        = [];
    $prov_map         = [];
    $productos_all    = [];
    $detalle_reg_map  = [];
    $prov_contact_map = [];
    if ($tab === 'registro') {
        $rp = $conexion->query("SELECT id, nombre FROM proveedores ORDER BY nombre ASC");
        if ($rp) while ($row = $rp->fetch_assoc()) $prov_map[$row['id']] = $row['nombre'];

        $rpa = $conexion->query("SELECT id, nombre, COALESCE(proveedor,'') AS proveedor FROM productos ORDER BY nombre ASC");
        if ($rpa) while ($row = $rpa->fetch_assoc()) $productos_all[] = $row;

        $rr = $conexion->query("
            SELECT cr.id, cr.id_proveedor, cr.descripcion, cr.total,
                   cr.fecha, cr.estado, cr.tipo, cr.created_at,
                   cr.estado_paquete, cr.falla_descripcion, cr.recibo_foto,
                   p.nombre AS proveedor_nombre
            FROM compras_registro cr
            LEFT JOIN proveedores p ON p.id = cr.id_proveedor
            ORDER BY cr.fecha DESC, cr.id DESC
        ");
        if ($rr) while ($row = $rr->fetch_assoc()) $registros[] = $row;

        /* Detalle productos + contacto proveedor (para botones copiar/WA/email) */
        if (!empty($registros)) {
            $ids_reg = implode(',', array_map('intval', array_column($registros, 'id')));
            $rd = $conexion->query("
                SELECT dcr.id_compra, p.nombre AS prod_nombre, dcr.cantidad
                FROM detalle_compras_registro dcr
                JOIN productos p ON p.id = dcr.id_producto
                WHERE dcr.id_compra IN ($ids_reg)
                ORDER BY dcr.id_compra, p.nombre
            ");
            if ($rd) while ($row = $rd->fetch_assoc())
                $detalle_reg_map[(int)$row['id_compra']][] = $row;

            $rpc = $conexion->query("SELECT id, telefono, email, contacto FROM proveedores");
            if ($rpc) while ($row = $rpc->fetch_assoc())
                $prov_contact_map[(int)$row['id']] = $row;
        }

        /* Jefes para asignación de tareas */
        $jefes_lista = [];
        $rj = $conexion->query("SELECT usuario FROM usuarios WHERE rango IN ('Jefe','Jefe1','Admin') ORDER BY usuario ASC");
        if ($rj) while ($row = $rj->fetch_assoc()) $jefes_lista[] = $row['usuario'];

        /* Detalle de productos para compras recibidas (tabla en modal de falla) */
        $detalle_recibida_map = [];
        $ids_rec = array_values(array_filter(array_map(
            fn($r) => $r['estado'] === 'recibida' ? (int)$r['id'] : 0, $registros
        )));
        if (!empty($ids_rec)) {
            $ids_str_r = implode(',', $ids_rec);
            $rdr = $conexion->query("
                SELECT dcr.id_compra, dcr.id_producto, p.nombre, p.costo, dcr.cantidad
                FROM detalle_compras_registro dcr
                JOIN productos p ON p.id = dcr.id_producto
                WHERE dcr.id_compra IN ($ids_str_r)
                ORDER BY dcr.id_compra, p.nombre ASC
            ");
            if ($rdr) while ($row = $rdr->fetch_assoc())
                $detalle_recibida_map[(int)$row['id_compra']][] = [
                    'id'       => (int)$row['id_producto'],
                    'nombre'   => $row['nombre'],
                    'costo'    => (float)$row['costo'],
                    'cantidad' => (int)$row['cantidad'],
                ];
        }
    }


    /* ── Tab: Automáticas — agrupar por proveedor ───────────────────── */
    $reponer_auto_grouped = [];
    $prov_info_by_name    = [];
    if ($tab === 'automaticas') {
        $rpi = $conexion->query("SELECT id, nombre, telefono, email FROM proveedores ORDER BY nombre ASC");
        if ($rpi) while ($row = $rpi->fetch_assoc())
            $prov_info_by_name[$row['nombre']] = ['id' => (int)$row['id'], 'telefono' => $row['telefono'] ?? '', 'email' => $row['email'] ?? ''];

        foreach ($reponer as $prod) {
            $key = $prod['prov_nombre'] !== '' ? $prod['prov_nombre'] : '__sin_proveedor__';
            $reponer_auto_grouped[$key][] = $prod;
        }
        uksort($reponer_auto_grouped, fn($a, $b) =>
            ($a === '__sin_proveedor__') <=> ($b === '__sin_proveedor__') ?: strcmp($a, $b)
        );
    }

    function fp2(float $v): string {
        return '$' . number_format($v, 2, ',', '.');
    }
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Compras — Star Lim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <link rel="stylesheet" href="../css/panel_bd.css">
    <style>
        /* ── Tabs ─────────────────────────────────────────────────── */
        .comp-page-header {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }
        .comp-back {
            font-size: 13px; font-weight: 600;
            color: rgba(255,255,255,.38);
            transition: color .2s; flex-shrink: 0;
        }
        .comp-back:hover { color: #fff; }
        .comp-page-title { font-size: 22px; font-weight: 700; color: var(--text-color); margin: 0; }
        .comp-page-actions {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 8px;
            margin-left: auto;
            flex-wrap: wrap;
        }
        .comp-action-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 38px;
            padding: 8px 14px;
            border-radius: 8px;
            border: 1px solid rgba(37, 99, 235, .22);
            background: #fff;
            color: #1d4ed8;
            font-size: 13px;
            font-weight: 800;
            text-decoration: none;
            box-shadow: 0 1px 2px rgba(16, 24, 40, .05);
            transition: background .2s, border-color .2s, color .2s, box-shadow .2s;
        }
        .comp-action-btn:hover,
        .comp-action-btn--active {
            background: #2563eb;
            border-color: #2563eb;
            color: #fff;
            box-shadow: 0 10px 22px rgba(37, 99, 235, .22);
        }
        @media (max-width: 820px) {
            .comp-page-actions {
                width: 100%;
                justify-content: flex-start;
            }
            .comp-action-btn {
                flex: 1 1 145px;
            }
        }

        .comp-tabs {
            display: flex;
            gap: 6px;
            margin-bottom: 24px;
            flex-wrap: wrap;
        }
        .comp-tab {
            padding: 8px 20px;
            border-radius: 50px;
            font-size: 13px; font-weight: 600;
            color: #344054;
            border: 1px solid rgba(37,99,235,.18);
            background: rgba(255,255,255,.82);
            transition: background .2s, color .2s, border-color .2s, box-shadow .2s;
            white-space: nowrap;
            text-decoration: none;
            box-shadow: 0 1px 2px rgba(16,24,40,.04);
        }
        .comp-tab:hover {
            background: #eef4ff;
            color: #1d4ed8;
            border-color: rgba(37,99,235,.35);
            box-shadow: 0 6px 16px rgba(37,99,235,.10);
        }
        .comp-tab--active, .comp-tab--active:hover {
            background: #2563eb;
            border-color: #2563eb;
            color: #fff;
        }

        /* ── Anticipadas table ─────────────────────────────────────── */
        .ant-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .ant-table thead th {
            text-align: left; padding: 0 14px 10px 0;
            font-size: 9.5px; font-weight: 700; letter-spacing: .08em;
            text-transform: uppercase; color: #667085;
            border-bottom: 1px solid rgba(128,128,128,.12);
        }
        .ant-table tbody td {
            padding: 11px 14px 11px 0;
            border-bottom: 1px solid rgba(128,128,128,.07);
            color: var(--text-color); vertical-align: middle;
        }
        .ant-table tbody tr:last-child td { border-bottom: none; }
        .ant-deficit { font-weight: 700; color: #dc2626; }
        .dark-mode .ant-deficit { color: #ef4444; }
        .ant-empty { text-align:center; padding:40px 0; opacity:.38; font-size:14px; }

        /* ── Formularios generales ────────────────────────────────── */
        .comp-form-panel {
            background: rgba(128,128,128,.05);
            border: 1px solid rgba(128,128,128,.12);
            border-radius: 12px;
            padding: 18px 20px;
            margin-bottom: 20px;
            display: none;
        }
        .comp-form-panel.open { display: block; }
        .comp-form-title { font-size: 14px; font-weight: 700; margin: 0 0 14px; color: var(--text-color); }

        .comp-form-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 10px;
            margin-bottom: 12px;
        }
        .comp-form-field { display:flex; flex-direction:column; gap:4px; }
        .comp-form-field.span-full { grid-column: 1 / -1; }
        .comp-form-label { font-size:10px; font-weight:700; letter-spacing:.07em; text-transform:uppercase; color:#667085; }
        .comp-form-input, .comp-form-select, .comp-form-textarea {
            padding: 8px 11px;
            border-radius: 7px;
            border: 1px solid rgba(128,128,128,.2);
            background: rgba(128,128,128,.06);
            color: var(--text-color);
            font-size: 13.5px; font-family: inherit;
            outline: none; width: 100%; box-sizing: border-box;
            transition: border-color .2s;
        }
        .comp-form-input:focus, .comp-form-select:focus, .comp-form-textarea:focus { border-color: #2563eb; }
        .comp-form-textarea { resize: vertical; min-height: 68px; }
        .comp-form-select option { background: #fff; color: #101828; }

        /* ── Dark mode: forzar opciones oscuras en todos los selects ── */
        select { color-scheme: light; }

        /* ── Columna Paquete ─────────────────────────────────────────── */
        .paq-cell { vertical-align: middle; min-width: 160px; }
        /* Descripción expandible */
        .reg-desc-cell { max-width: 280px; }
        .reg-desc-toggle {
            display: block; margin-top: 3px;
            font-size: 10px; font-weight: 600;
            color: #2563eb; background: none; border: none;
            cursor: pointer; padding: 0; font-family: inherit;
            opacity: .7; transition: opacity .15s;
        }
        .reg-desc-toggle:hover { opacity: 1; }
        .dark-mode .reg-desc-toggle { color: #60a5fa; }
        .paq-na   { font-size: 12px; color: #667085; }
        .paq-badge {
            display: inline-block; font-size: 10px; font-weight: 700;
            padding: 3px 10px; border-radius: 99px;
            letter-spacing: .04em; white-space: nowrap;
        }
        .paq-badge--pendiente  { background: rgba(217,119,6,.13);  color: #d97706; }
        .paq-badge--revisado   { background: rgba(22,163,74,.12);  color: #16a34a; }
        .paq-badge--falla      { background: rgba(220,38,38,.12);  color: #dc2626; }
        .dark-mode .paq-badge--pendiente { color: #f59e0b; }
        .dark-mode .paq-badge--revisado  { color: #22c55e; }
        .dark-mode .paq-badge--falla     { color: #f87171; }
        /* Foto del recibo */
        .paq-foto-upload { display: flex; flex-direction: column; gap: 4px; }
        .paq-foto-label  { font-size: 11px; font-weight: 600; opacity: .7; }
        .paq-foto-pick-btn {
            display: inline-block; font-size: 11px; font-weight: 600;
            background: rgba(0,85,204,.1); color: #2563eb;
            border: 1px solid rgba(0,85,204,.25);
            border-radius: 6px; padding: 4px 10px; cursor: pointer;
            font-family: inherit; transition: background .15s;
        }
        .paq-foto-pick-btn:hover { background: rgba(0,85,204,.18); }
        .dark-mode .paq-foto-pick-btn { color: #60a5fa; border-color: rgba(77,159,255,.3); }
        .paq-foto-hint { font-size: 10px; opacity: .5; }
        .paq-recibo-link {
            display: inline-block; font-size: 10px; font-weight: 600;
            color: #2563eb; text-decoration: none;
            background: rgba(0,85,204,.08);
            border: 1px solid rgba(0,85,204,.2);
            border-radius: 5px; padding: 2px 8px;
            transition: background .15s;
        }
        .paq-recibo-link:hover { background: rgba(0,85,204,.15); }
        .dark-mode .paq-recibo-link { color: #60a5fa; border-color: rgba(77,159,255,.25); }
        /* Tabla de productos en modal de falla */
        .paq-prod-table {
            width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 4px;
        }
        .paq-prod-table th, .paq-prod-table td {
            border: 1px solid rgba(128,128,128,.15); padding: 5px 8px; text-align: left;
        }
        .paq-prod-table th {
            font-weight: 600; opacity: .7; font-size: 11px;
            background: rgba(128,128,128,.06);
        }
        /* Stepper llegó */
        .paq-stepper { display: inline-flex; align-items: center; gap: 3px; }
        .paq-step-btn {
            width: 22px; height: 22px; border-radius: 4px;
            border: 1px solid rgba(128,128,128,.25);
            background: rgba(128,128,128,.08);
            color: var(--text-color); font-size: 14px; font-weight: 700;
            cursor: pointer; display: flex; align-items: center; justify-content: center;
            padding: 0; font-family: inherit; line-height: 1;
            transition: background .12s;
        }
        .paq-step-btn:hover { background: rgba(128,128,128,.2); }
        .paq-llego-input {
            width: 50px; text-align: center; padding: 3px 4px;
            border-radius: 5px; border: 1px solid rgba(128,128,128,.2);
            background: rgba(128,128,128,.06);
            color: var(--text-color); font-family: inherit; font-size: 12px; outline: none;
        }
        .paq-llego-input:focus { border-color: #2563eb; }
        /* Margen de error */
        .paq-margen-val { font-weight: 700; font-size: 11px; white-space: nowrap; }
        .paq-margen--pos { color: #16a34a; }
        .paq-margen--neg { color: #dc2626; }
        .dark-mode .paq-margen--pos { color: #22c55e; }
        .dark-mode .paq-margen--neg { color: #f87171; }
        .paq-totales {
            margin-top: 10px; padding: 10px 12px;
            background: rgba(128,128,128,.06);
            border-radius: 8px; border: 1px solid rgba(128,128,128,.12);
            font-size: 12px;
        }
        .paq-total-row { display: flex; justify-content: space-between; padding: 3px 0; }
        .paq-total-row span:last-child { font-weight: 700; }
        .paq-total-perdido { color: #dc2626; }
        .dark-mode .paq-total-perdido { color: #f87171; }
        .paq-falla-text {
            font-size: 11px; opacity: .6; margin-top: 3px;
            max-width: 160px; word-break: break-word;
        }
        .paq-action-select {
            font-size: 11px; font-weight: 600;
            border: 1px solid rgba(128,128,128,.2);
            background: rgba(128,128,128,.06);
            color: var(--text-color); font-family: inherit;
            border-radius: 6px; padding: 3px 7px;
            cursor: pointer; outline: none;
            transition: border-color .15s;
        }
        .paq-action-select:focus { border-color: #2563eb; }

        /* ── Modal Paquete (falla + tarea) ──────────────────────────── */
        .paq-overlay {
            display: none; position: fixed; inset: 0;
            background: rgba(0,0,0,.58); z-index: 1100;
            align-items: center; justify-content: center;
        }
        .paq-overlay.open { display: flex; }
        .paq-modal {
            background: var(--bg-color, #101828);
            border: 1px solid rgba(128,128,128,.18);
            border-radius: 14px; padding: 24px 26px;
            width: 100%; max-width: 540px;
            max-height: 90vh; overflow-y: auto;
            box-shadow: 0 8px 40px rgba(0,0,0,.5);
        }
        .paq-modal-title {
            font-size: 16px; font-weight: 700;
            color: var(--text-color); margin: 0 0 4px;
        }
        .paq-modal-info {
            font-size: 12px; opacity: .5; margin-bottom: 16px;
            border-bottom: 1px solid rgba(128,128,128,.1);
            padding-bottom: 12px;
        }
        .paq-modal-footer {
            display: flex; align-items: center;
            justify-content: flex-end; gap: 8px;
            margin-top: 18px; flex-wrap: wrap;
        }
        .paq-acciones { display: flex; gap: 8px; flex-wrap: wrap; }
        .paq-btn {
            padding: 9px 16px; border-radius: 8px;
            font-size: 13px; font-weight: 600;
            font-family: inherit; cursor: pointer;
            border: 1px solid transparent; transition: background .2s;
        }
        .paq-btn--avisar  { background: #2563eb; color: #fff; border-color: #2563eb; }
        .paq-btn--avisar:hover  { background: #1e3a8a; }
        .paq-btn--tarea   { background: rgba(22,163,74,.12); color: #16a34a; border-color: rgba(22,163,74,.3); }
        .paq-btn--tarea:hover   { background: rgba(22,163,74,.2); }
        .paq-btn--silent  { background: rgba(128,128,128,.1); color: var(--text-color); border-color: rgba(128,128,128,.25); }
        .paq-btn--silent:hover  { background: rgba(128,128,128,.18); }
        .dark-mode .paq-btn--tarea  { color: #22c55e; }
        .dark-mode .paq-btn--avisar { background: #1d4ed8; }

        /* Modal tarea */
        .paq-tarea-modal { max-width: 580px; }
        .paq-tarea-grid {
            display: grid; grid-template-columns: 1fr 1fr;
            gap: 10px; margin-bottom: 12px;
        }
        .paq-tarea-grid .span2 { grid-column: 1 / -1; }
        .paq-asignar-row { display: flex; gap: 18px; align-items: center; margin: 10px 0; }
        .paq-radio-label { display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; }
        .paq-empleado-search {
            margin-top: 8px; padding: 8px 11px;
            border-radius: 7px; width: 100%; box-sizing: border-box;
            border: 1px solid rgba(128,128,128,.2);
            background: rgba(128,128,128,.06);
            color: var(--text-color); font-size: 13px; font-family: inherit; outline: none;
        }
        .paq-empleado-search:focus { border-color: #2563eb; }
        .paq-check-label { display: flex; align-items: center; gap: 7px; font-size: 13px; margin-top: 10px; cursor: pointer; }

        /* Confirm mini-overlay */
        .paq-confirm-overlay {
            display: none; position: fixed; inset: 0;
            background: rgba(0,0,0,.65); z-index: 1200;
            align-items: center; justify-content: center;
        }
        .paq-confirm-overlay.open { display: flex; }
        .paq-confirm-box {
            background: var(--bg-color, #101828);
            border: 1px solid rgba(128,128,128,.2);
            border-radius: 12px; padding: 22px 24px;
            width: 100%; max-width: 380px;
            box-shadow: 0 6px 32px rgba(0,0,0,.5);
            text-align: center;
        }
        .paq-confirm-title { font-size: 15px; font-weight: 700; margin: 0 0 8px; color: var(--text-color); }
        .paq-confirm-msg   { font-size: 13px; opacity: .65; margin: 0 0 18px; }
        .paq-confirm-btns  { display: flex; justify-content: center; gap: 10px; }
        .paq-confirm-ok    { padding: 9px 22px; border-radius: 8px; background: #2563eb; color: #fff; border: none; font-size: 13px; font-weight: 600; font-family: inherit; cursor: pointer; }
        .paq-confirm-ok:hover { background: #1e3a8a; }
        .paq-confirm-cancel { padding: 9px 18px; border-radius: 8px; background: rgba(128,128,128,.1); color: var(--text-color); border: 1px solid rgba(128,128,128,.2); font-size: 13px; font-weight: 600; font-family: inherit; cursor: pointer; }
        .paq-confirm-cancel:hover { background: rgba(128,128,128,.18); }

        .comp-toggle-btn {
            font-size: 12px; font-weight: 600;
            color: #2563eb; background: none;
            border: 1px solid rgba(0,85,204,.25);
            border-radius: 6px; padding: 5px 14px;
            cursor: pointer; font-family: inherit;
            transition: background .2s; white-space: nowrap;
        }
        .comp-toggle-btn:hover { background: rgba(0,85,204,.08); }
        .comp-submit-btn {
            padding: 9px 22px; border-radius: 8px;
            background: #2563eb; color: #fff;
            border: none; font-size: 13px; font-weight: 600;
            font-family: inherit; cursor: pointer;
            transition: background .2s;
        }
        .comp-submit-btn:hover { background: #1e3a8a; }

        /* ── Panel header row ─────────────────────────────────────── */
        .comp-panel-header {
            display: flex; align-items: center;
            justify-content: space-between;
            margin-bottom: 16px; gap: 12px; flex-wrap: wrap;
        }
        .comp-panel-header h2 { margin: 0; font-size: 18px; font-weight: 700; color: var(--text-color); }
        .comp-panel-sub { font-size: 12px; opacity: .42; margin: 2px 0 0; }

        /* ── Delete button ────────────────────────────────────────── */
        .comp-del-btn {
            background: none; border: none; color: #dc2626;
            font-size: 14px; cursor: pointer; padding: 2px 6px;
            border-radius: 4px; opacity: .5;
            transition: opacity .2s, background .2s;
        }
        .comp-del-btn:hover { opacity: 1; background: rgba(220,38,38,.08); }

        /* ── Estado badges ────────────────────────────────────────── */
        .estado-badge {
            display: inline-block; font-size: 10px; font-weight: 700;
            padding: 3px 10px; border-radius: 99px;
            letter-spacing: .05em; text-transform: uppercase;
        }
        .estado-badge--pendiente { background: rgba(217,119,6,.15); color: #d97706; }
        .estado-badge--en_camino { background: rgba(0,85,204,.12); color: #2563eb; }
        .estado-badge--recibida  { background: rgba(22,163,74,.12); color: #16a34a; }
        .estado-badge--cancelada { background: rgba(128,128,128,.12); color: #667085; }
        .dark-mode .estado-badge--pendiente { color: #f59e0b; }
        .dark-mode .estado-badge--en_camino { color: #60a5fa; }
        .dark-mode .estado-badge--recibida  { color: #22c55e; }

        .tipo-badge {
            display: inline-block; font-size: 9px; font-weight: 700;
            padding: 2px 7px; border-radius: 99px;
            text-transform: uppercase; letter-spacing: .05em;
        }
        .tipo-badge--manual    { background: rgba(128,128,128,.1); color: #667085; }
        .tipo-badge--automatica{ background: rgba(0,85,204,.1); color: #2563eb; }
        .dark-mode .tipo-badge--automatica { color: #60a5fa; }

        /* ── Registro table ───────────────────────────────────────── */
        .reg-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .reg-table thead th {
            text-align: left; padding: 0 14px 10px 0;
            font-size: 9.5px; font-weight: 700;
            letter-spacing: .08em; text-transform: uppercase; color: #667085;
            border-bottom: 1px solid rgba(128,128,128,.12);
        }
        .reg-table tbody td {
            padding: 12px 14px 12px 0;
            border-bottom: 1px solid rgba(128,128,128,.07);
            color: var(--text-color); vertical-align: top;
        }
        .reg-table tbody tr:last-child td { border-bottom: none; }
        .reg-desc-text { font-size: 12px; opacity: .6; white-space: pre-wrap; margin-top: 4px; }

        /* Estado inline select */
        .reg-estado-select {
            font-size: 11px; font-weight: 600;
            border: none; background: none;
            color: inherit; font-family: inherit;
            cursor: pointer; padding: 0;
        }
        .reg-empty { text-align:center; padding:40px 0; opacity:.38; font-size:13px; }

        /* ── Proveedores table ────────────────────────────────────── */
        .prov-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .prov-table thead th {
            text-align: left; padding: 0 14px 10px 0;
            font-size: 9.5px; font-weight: 700;
            letter-spacing: .08em; text-transform: uppercase; color: #667085;
            border-bottom: 1px solid rgba(128,128,128,.12);
        }
        .prov-table tbody td {
            padding: 11px 14px 11px 0;
            border-bottom: 1px solid rgba(128,128,128,.07);
            color: var(--text-color); vertical-align: middle;
        }
        .prov-table tbody tr:last-child td { border-bottom: none; }
        .prov-empty { text-align:center; padding:40px 0; opacity:.38; font-size:13px; }

        /* ── Compras Automáticas ─────────────────────────────────── */
        .auto-config-row {
            display: grid;
            grid-template-columns: 220px 160px 1fr;
            gap: 12px; margin-bottom: 20px; align-items: end;
        }
        @media (max-width: 720px) { .auto-config-row { grid-template-columns: 1fr; } }

        .auto-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .auto-table thead th {
            text-align: left; padding: 0 12px 10px 0;
            font-size: 9.5px; font-weight: 700;
            letter-spacing: .08em; text-transform: uppercase; color: #667085;
            border-bottom: 1px solid rgba(128,128,128,.12);
        }
        .auto-table tbody td {
            padding: 10px 12px 10px 0;
            border-bottom: 1px solid rgba(128,128,128,.07);
            color: var(--text-color); vertical-align: middle;
        }
        .auto-table tbody tr:last-child td { border-bottom: none; }

        .auto-qty-input {
            width: 72px; padding: 5px 8px;
            border-radius: 6px;
            border: 1px solid rgba(128,128,128,.2);
            background: rgba(128,128,128,.06);
            color: var(--text-color);
            font-size: 13px; font-family: inherit;
            outline: none; text-align: center;
        }
        .auto-qty-input:focus { border-color: #2563eb; }

        .auto-footer {
            display: flex; align-items: center;
            justify-content: space-between;
            padding: 16px 0 0; margin-top: 16px;
            border-top: 2px solid rgba(128,128,128,.12);
            gap: 16px; flex-wrap: wrap;
        }
        .auto-total-label { font-size: 13px; opacity: .55; }
        .auto-total-val   { font-size: 20px; font-weight: 800; color: var(--text-color); }
        .auto-submit-btn {
            padding: 11px 28px; border-radius: 8px;
            background: #16a34a; color: #fff;
            border: none; font-size: 14px; font-weight: 700;
            font-family: inherit; cursor: pointer;
            transition: background .2s;
        }
        .auto-submit-btn:hover { background: #15803d; }

        .auto-no-reponer {
            text-align: center; padding: 52px 0;
            font-size: 14px; opacity: .38;
        }

        /* ── Modal editar proveedor ─────────────────────────────── */
        .prov-modal-overlay {
            display: none; position: fixed; inset: 0;
            background: rgba(0,0,0,.55); z-index: 1000;
            align-items: center; justify-content: center;
        }
        .prov-modal-overlay.open { display: flex; }
        .prov-modal {
            background: var(--bg-color, #101828);
            border: 1px solid rgba(128,128,128,.18);
            border-radius: 14px;
            padding: 24px 26px;
            width: 100%; max-width: 520px;
            max-height: 90vh; overflow-y: auto;
            box-shadow: 0 8px 40px rgba(0,0,0,.45);
        }
        .prov-modal-title {
            font-size: 16px; font-weight: 700;
            color: var(--text-color); margin: 0 0 18px;
        }
        .prov-modal-footer {
            display: flex; justify-content: flex-end;
            gap: 10px; margin-top: 16px;
        }
        .prov-cancel-btn {
            padding: 9px 20px; border-radius: 8px;
            background: rgba(128,128,128,.1);
            color: var(--text-color);
            border: 1px solid rgba(128,128,128,.2);
            font-size: 13px; font-weight: 600;
            font-family: inherit; cursor: pointer;
        }
        .prov-cancel-btn:hover { background: rgba(128,128,128,.18); }
        .prov-ver-prods-btn {
            padding: 9px 16px; border-radius: 8px;
            background: rgba(0,85,204,.08);
            color: #2563eb;
            border: 1px solid rgba(0,85,204,.22);
            font-size: 13px; font-weight: 600;
            font-family: inherit; text-decoration: none;
            display: inline-flex; align-items: center; gap: 5px;
            transition: background .2s;
        }
        .prov-ver-prods-btn:hover { background: rgba(0,85,204,.15); }
        .dark-mode .prov-ver-prods-btn { color: #60a5fa; }
        .prov-edit-btn {
            background: none; border: none;
            color: #2563eb; font-size: 14px;
            cursor: pointer; padding: 2px 6px;
            border-radius: 4px; opacity: .6;
            transition: opacity .2s, background .2s;
        }
        .prov-edit-btn:hover { opacity: 1; background: rgba(0,85,204,.08); }
        .prov-prod-count {
            display: inline-block; font-size: 11px; font-weight: 700;
            padding: 2px 9px; border-radius: 99px;
            background: rgba(0,85,204,.1); color: #2563eb;
        }
        .dark-mode .prov-prod-count { color: #60a5fa; background: rgba(77,159,255,.1); }
        .prov-prod-count--zero { background: rgba(128,128,128,.1); color: #667085; }

        /* ── Proveedores: nombre duplicado ──────────────────────── */
        .prov-nombre--dup { color: #f97316; }
        .dark-mode .prov-nombre--dup { color: #fb923c; }

        /* ── Proveedores: rubro chips ───────────────────────────── */
        .prov-rubros-row { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 3px; justify-content: center; }
        .prov-rubro-chip {
            display: inline-block; font-size: 10px; font-weight: 600;
            padding: 2px 8px; border-radius: 99px;
            background: rgba(128,128,128,.1); color: rgba(200,200,200,.75);
            cursor: pointer; position: relative;
            border: 1px solid rgba(128,128,128,.18);
            transition: background .15s, color .15s;
            white-space: nowrap; user-select: none;
        }
        .prov-rubro-chip:hover { background: rgba(128,128,128,.2); color: var(--text-color); }
        .rubro-popover {
            position: absolute; bottom: calc(100% + 5px); left: 50%;
            transform: translateX(-50%);
            background: #101828; color: #fff;
            border: 1px solid rgba(255,255,255,.15);
            border-radius: 6px; padding: 5px 11px;
            font-size: 11px; font-weight: 700;
            white-space: nowrap; z-index: 200;
            pointer-events: none;
            animation: popIn .1s ease;
        }
        @keyframes popIn {
            from { opacity:0; transform:translateX(-50%) translateY(4px); }
            to   { opacity:1; transform:translateX(-50%) translateY(0); }
        }

        /* ── Proveedores: aviso auto-agregado ───────────────────── */
        .prov-autoadd-notice {
            background: rgba(22,163,74,.07);
            border: 1px solid rgba(22,163,74,.22);
            border-radius: 8px; padding: 9px 14px;
            font-size: 12px; color: #16a34a;
            margin-bottom: 16px;
        }
        .dark-mode .prov-autoadd-notice { color: #22c55e; }

        /* ── Registro: botones de acción ────────────────────────── */
        .reg-action-btn {
            background: none; border: none; font-size: 14px;
            cursor: pointer; padding: 2px 5px; border-radius: 4px;
            text-decoration: none; opacity: .5;
            transition: opacity .2s, background .2s;
            display: inline-flex; align-items: center;
        }
        .reg-action-btn:hover { opacity: 1; background: rgba(128,128,128,.1); }

        /* ── Automáticas: secciones por proveedor ────────────────── */
        .auto-supplier-block {
            border: 1px solid rgba(128,128,128,.1);
            border-radius: 12px; margin-bottom: 20px; overflow: hidden;
        }
        .auto-supplier-hdr {
            display: flex; align-items: center;
            justify-content: space-between; flex-wrap: wrap; gap: 10px;
            padding: 13px 18px;
            background: rgba(128,128,128,.05);
            border-bottom: 1px solid rgba(128,128,128,.1);
        }
        .auto-supplier-name { font-size: 15px; font-weight: 700; color: var(--text-color); }
        .auto-supplier-badge {
            display: inline-block; font-size: 10px; font-weight: 700;
            padding: 2px 9px; border-radius: 99px;
            background: rgba(0,85,204,.1); color: #2563eb; margin-left: 8px;
        }
        .dark-mode .auto-supplier-badge { color: #60a5fa; }
        .auto-supplier-no-prov .auto-supplier-name { color: #667085; font-style: italic; }
        .auto-supplier-contact { display: flex; align-items: center; gap: 6px; }
        .auto-contact-btn {
            display: inline-flex; align-items: center; gap: 5px;
            padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 600;
            border: 1px solid rgba(128,128,128,.2); text-decoration: none;
            color: var(--text-color); background: none;
            cursor: pointer; font-family: inherit;
            transition: background .2s, border-color .2s; white-space: nowrap;
        }
        .auto-contact-btn:hover { background: rgba(128,128,128,.08); border-color: rgba(128,128,128,.35); }
        .auto-contact-btn--wa   { border-color: rgba(37,211,102,.35); color: #22c55e; }
        .auto-contact-btn--wa:hover { background: rgba(37,211,102,.07); }
        .auto-contact-btn--mail { border-color: rgba(0,85,204,.25); color: #2563eb; }
        .dark-mode .auto-contact-btn--mail { color: #60a5fa; }
        .auto-contact-btn--mail:hover { background: rgba(0,85,204,.06); }
        .auto-supplier-body { padding: 0 18px 4px; }

        /* ── Toast ─────────────────────────────────────────────── */
        .comp-toast {
            position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
            background: #101828; color: #fff;
            border: 1px solid rgba(255,255,255,.12);
            border-radius: 8px; padding: 10px 22px;
            font-size: 13px; font-weight: 600;
            z-index: 3000; pointer-events: none;
            animation: toastIn .18s ease;
        }
        .comp-toast--error { background: #7f1d1d; border-color: rgba(220,38,38,.35); }
        @keyframes toastIn {
            from { opacity:0; transform:translateX(-50%) translateY(8px); }
            to   { opacity:1; transform:translateX(-50%) translateY(0); }
        }

        /* ── Urgencia badge ──────────────────────────────────────── */
        .comp-count-badge {
            display: inline-flex; align-items: center; justify-content: center;
            min-width: 26px; height: 26px; border-radius: 99px;
            background: #dc2626; color: #fff;
            font-size: 12px; font-weight: 700; padding: 0 8px;
        }
    </style>
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>

    <?php $NAV_ACTIVA = 'compras'; include __DIR__ . '/partials/nav.php'; ?>

    <main class="dash-main">

        <!-- Encabezado -->
        <div class="comp-page-header">
            <h1 class="comp-page-title">Compras</h1>
            <div class="comp-page-actions" aria-label="Acciones de compra">
                <a href="compras.php?tab=registro" class="comp-action-btn <?= $tab === 'registro' && !$abrir_nueva_compra ? 'comp-action-btn--active' : '' ?>">Registro</a>
                <a href="compras.php?tab=registro&nuevo=1" class="comp-action-btn <?= $tab === 'registro' && $abrir_nueva_compra ? 'comp-action-btn--active' : '' ?>">Registrar compra</a>
                <a href="compras.php?tab=automaticas" class="comp-action-btn <?= $tab === 'automaticas' ? 'comp-action-btn--active' : '' ?>">Generar orden</a>
            </div>
        </div>

        <!-- Tabs -->
        <div class="comp-tabs">
            <a href="?tab=urgencia"    class="comp-tab <?= $tab==='urgencia'    ? 'comp-tab--active' : '' ?>">
                Urgencia
                <?php if ($tab === 'urgencia' && count($urgentes) > 0): ?>
                    <span class="comp-count-badge"><?= count($urgentes) ?></span>
                <?php endif; ?>
            </a>
            <a href="?tab=anticipadas"  class="comp-tab <?= $tab==='anticipadas'  ? 'comp-tab--active' : '' ?>">Anticipadas</a>
            <a href="?tab=automaticas"  class="comp-tab <?= $tab==='automaticas'  ? 'comp-tab--active' : '' ?>">Automáticas</a>
        </div>

        <!-- ══════════════════════════════════════════════════════════
             TAB 1: URGENCIA (ya vendido sin stock)
        ═══════════════════════════════════════════════════════════ -->
        <?php if ($tab === 'urgencia'): ?>
        <section class="bd-panel">
            <div class="comp-panel-header">
                <div>
                    <h2>Compras de Urgencia</h2>
                    <p class="comp-panel-sub">Ventas con productos que superan el stock disponible</p>
                </div>
                <?php if (!empty($urgentes)): ?>
                    <span class="comp-count-badge"><?= count($urgentes) ?> venta<?= count($urgentes)!==1?'s':'' ?></span>
                <?php endif; ?>
            </div>

            <?php if (!$tiene_detalle): ?>
                <p class="ant-empty">Sin datos de detalle de ventas disponibles.</p>
            <?php elseif (empty($urgentes)): ?>
                <p class="ant-empty">No hay ventas con déficit de stock.</p>
            <?php else: ?>

            <div class="urgente-col-header">
                <span>ID</span><span>Factura</span><span>Fecha</span>
            </div>

            <?php foreach ($urgentes as $idx => $u):
                $nc = match(true) { $idx===0=>'urgente-num--1', $idx===1=>'urgente-num--2', $idx===2=>'urgente-num--3', default=>'urgente-num--n' };
            ?>
            <div class="urgente-row">
                <div class="urgente-row-hdr" onclick="toggleUrgente(<?= (int)$u['id'] ?>)">
                    <span class="urgente-num <?= $nc ?>"><?= $idx + 1 ?></span>
                    <div class="urgente-info">
                        <span class="urgente-cliente">Cliente: <?= htmlspecialchars($u['nombre_cliente'] ?: '—') ?></span>
                        <span class="urgente-nro">Nro: <?= $u['nro_fmt'] ?></span>
                        <span class="urgente-hint">— Haga click para ver más detalles —</span>
                    </div>
                    <div class="urgente-fecha-col">
                        <span class="urgente-fecha-label">Fecha</span>
                        <span class="urgente-fecha-val"><?= $u['fecha_fmt'] ?></span>
                    </div>
                </div>
                <div class="urgente-detail" id="detail-<?= (int)$u['id'] ?>">
                    <div class="urgente-detail-top">
                        <a href="../php/generar_pdf_factura.php?id_venta=<?= (int)$u['id'] ?>&view=1"
                           target="_blank" class="urgente-btn urgente-btn--factura">Factura</a>
                        <?php if (!empty($u['remito_id'])): ?>
                        <a href="../php/generar_pdf_remito.php?id=<?= (int)$u['remito_id'] ?>&view=1"
                           target="_blank" class="urgente-btn urgente-btn--remito">Remito</a>
                        <?php endif; ?>
                        <span class="inv-badge inv-badge--<?= strtolower(htmlspecialchars($u['tipo_label'])) ?>">
                            <?= htmlspecialchars($u['tipo_label']) ?>
                        </span>
                    </div>
                    <?php if (!empty($u['detalles'])): ?>
                    <table class="urgente-products">
                        <thead><tr><th>Código</th><th>Producto</th><th>Vendido</th><th>Stock actual</th></tr></thead>
                        <tbody>
                            <?php foreach ($u['detalles'] as $d):
                                $over = (int)$d['cantidad_vendida'] > (int)$d['stock_actual'];
                            ?>
                            <tr>
                                <td><?= (int)$d['cod_producto'] ?></td>
                                <td><strong><?= htmlspecialchars($d['nombre_producto']) ?></strong></td>
                                <td class="<?= $over ? 'urgente-qty-over' : 'urgente-qty-ok' ?>"><?= (int)$d['cantidad_vendida'] ?></td>
                                <td><?= (int)$d['stock_actual'] ?></td>
                            </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                    <?php endif; ?>
                </div>
            </div>
            <?php endforeach; ?>
            <?php endif; ?>
        </section>

        <!-- ══════════════════════════════════════════════════════════
             TAB 2: ANTICIPADAS (en base a ventas pasadas)
        ═══════════════════════════════════════════════════════════ -->
        <?php elseif ($tab === 'anticipadas'): ?>
        <section class="bd-panel">
            <div class="comp-panel-header">
                <div>
                    <h2>Compras Anticipadas</h2>
                    <p class="comp-panel-sub">
                        <?= $reponer_mode === 'sales'
                            ? 'Productos con stock menor al recomendado · promedio mensual × 2 (últimos 6 meses)'
                            : 'Sin historial de ventas — productos con stock en cero' ?>
                        <?php if ($reponer_total > count($reponer)): ?>
                            · mostrando los primeros <?= count($reponer) ?> de <?= number_format($reponer_total, 0, ',', '.') ?>
                        <?php endif; ?>
                    </p>
                </div>
                <?php if (!empty($reponer)): ?>
                    <span class="comp-count-badge"><?= count($reponer) ?></span>
                <?php endif; ?>
            </div>

            <?php if (empty($reponer)): ?>
                <p class="ant-empty">Todos los productos tienen stock suficiente.</p>
            <?php else: ?>
            <table class="ant-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Producto</th>
                        <th style="text-align:center;">Stock actual</th>
                        <th style="text-align:center;">Recomendado</th>
                        <th style="text-align:center;">Déficit</th>
                        <th style="text-align:right;">Costo unit.</th>
                        <th style="text-align:right;">Costo estimado</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($reponer as $p):
                        $deficit = max(0, (int)($p['cnt_recomendada'] ?? 0) - (int)$p['stock_actual']);
                        $costo_total = $deficit * (float)$p['costo'];
                    ?>
                    <tr>
                        <td style="opacity:.5;font-size:12px;"><?= (int)$p['id'] ?></td>
                        <td><strong><?= htmlspecialchars($p['nombre']) ?></strong></td>
                        <td style="text-align:center;"><?= (int)$p['stock_actual'] ?></td>
                        <td style="text-align:center;"><?= $p['cnt_recomendada'] !== null ? (int)$p['cnt_recomendada'] : '—' ?></td>
                        <td style="text-align:center;" class="ant-deficit"><?= $deficit > 0 ? $deficit : '—' ?></td>
                        <td style="text-align:right;"><?= fp2((float)$p['costo']) ?></td>
                        <td style="text-align:right;font-weight:600;"><?= $deficit > 0 ? fp2($costo_total) : '—' ?></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
            <?php endif; ?>
        </section>

        <!-- ══════════════════════════════════════════════════════════
             TAB 3: REGISTRO DE COMPRAS A PROVEEDORES
        ═══════════════════════════════════════════════════════════ -->
        <?php elseif ($tab === 'registro'): ?>
        <section class="bd-panel">
            <div class="comp-panel-header">
                <div>
                    <h2>Registro de Compras</h2>
                    <p class="comp-panel-sub">Historial de compras realizadas a proveedores</p>
                </div>
                <button class="comp-toggle-btn" id="toggle-reg-form"
                        onclick="toggleForm('reg-form', this, '+ Nueva compra', '− Cerrar')">
                    + Nueva compra
                </button>
            </div>

            <!-- Formulario agregar -->
            <div class="comp-form-panel" id="reg-form">
                <p class="comp-form-title">Registrar compra</p>
                <form method="POST" action="compras.php" id="form-add-registro">
                    <input type="hidden" name="accion"    value="add_registro">
                    <input type="hidden" name="redir_tab" value="registro">
                    <div class="comp-form-grid">
                        <div class="comp-form-field">
                            <label class="comp-form-label">Proveedor</label>
                            <select class="comp-form-select" name="id_proveedor" id="compra-proveedor-select">
                                <option value="">Sin proveedor</option>
                                <?php foreach ($prov_map as $pid => $pnombre): ?>
                                <option value="<?= $pid ?>" data-nombre="<?= htmlspecialchars($pnombre, ENT_QUOTES) ?>"><?= htmlspecialchars($pnombre) ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <div class="comp-form-field">
                            <label class="comp-form-label">Total ($)</label>
                            <input class="comp-form-input" type="number" name="total" min="0" step="0.01" placeholder="0,00">
                        </div>
                        <div class="comp-form-field">
                            <label class="comp-form-label">Fecha *</label>
                            <input class="comp-form-input" type="date" name="fecha" value="<?= date('Y-m-d') ?>" required>
                        </div>
                        <div class="comp-form-field">
                            <label class="comp-form-label">Estado</label>
                            <select class="comp-form-select" name="estado" id="reg-estado-nuevo">
                                <option value="pendiente">Pendiente</option>
                                <option value="en_camino">En camino</option>
                                <option value="recibida">Recibida</option>
                                <option value="cancelada">Cancelada</option>
                            </select>
                        </div>
                        <div class="comp-form-field span-full">
                            <label class="comp-form-label">Descripción *</label>
                            <textarea class="comp-form-textarea" name="descripcion" required
                                      placeholder="Productos comprados, cantidades, condiciones..."></textarea>
                        </div>
                    </div>

                    <!-- Productos comprados (para actualizar stock) -->
                    <div style="margin-top:14px;">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                            <label class="comp-form-label" style="margin:0;">
                                Productos comprados
                                <small style="font-weight:400;opacity:.6;">(opcional — usado para actualizar stock al recibir)</small>
                            </label>
                            <button type="button" class="comp-toggle-btn" style="padding:4px 12px;font-size:12px;"
                                    onclick="agregarFilaProducto()">+ Agregar producto</button>
                        </div>
                        <table id="tabla-prods-compra" style="width:100%;border-collapse:collapse;font-size:13px;display:none;">
                            <thead>
                                <tr>
                                    <th style="text-align:left;padding:4px 8px;border-bottom:1px solid var(--border-color,#e4e7ec);color:#667085;">Producto</th>
                                    <th style="text-align:center;padding:4px 8px;border-bottom:1px solid var(--border-color,#e4e7ec);color:#667085;width:100px;">Cantidad</th>
                                    <th style="width:36px;"></th>
                                </tr>
                            </thead>
                            <tbody id="tbody-prods-compra"></tbody>
                        </table>
                        <p id="hint-prods-compra" style="font-size:12px;color:#9ca3af;margin:4px 0 0;">
                            Agregá productos para que el stock se actualice automáticamente al marcar la compra como <em>Recibida</em>.
                        </p>
                    </div>

                    <button class="comp-submit-btn" type="submit" style="margin-top:16px;">Guardar</button>
                </form>
            </div>

            <script>
            /* ── Productos disponibles para el selector ─────────────── */
            const PRODUCTOS_COMPRA = <?= json_encode(
                array_map(fn($p) => [
                    'id' => (int)$p['id'],
                    'nombre' => $p['nombre'],
                    'proveedor' => trim($p['proveedor'] ?? ''),
                ], $productos_all),
                JSON_HEX_TAG | JSON_UNESCAPED_UNICODE
            ) ?>;
            const COMPRA_PROVEEDOR_SELECT = document.getElementById('compra-proveedor-select');

            function normalizarProveedorCompra(valor) {
                return String(valor || '').trim().toLowerCase();
            }

            function escHtmlCompra(valor) {
                return String(valor ?? '').replace(/[&<>"']/g, ch => ({
                    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
                }[ch]));
            }

            function proveedorCompraActual() {
                return COMPRA_PROVEEDOR_SELECT?.selectedOptions?.[0]?.dataset?.nombre || '';
            }

            function productosFiltradosCompra() {
                const proveedor = normalizarProveedorCompra(proveedorCompraActual());
                if (!proveedor) return PRODUCTOS_COMPRA;
                return PRODUCTOS_COMPRA.filter(p => normalizarProveedorCompra(p.proveedor) === proveedor);
            }

            function renderOpcionesProductosCompra() {
                const productos = productosFiltradosCompra();
                if (!productos.length) {
                    return '<option value="" disabled>-- Sin productos de este proveedor --</option>';
                }
                return productos.map(p =>
                    `<option value="${p.id}">${escHtmlCompra(p.nombre)}</option>`
                ).join('');
            }

            function refrescarProductosCompra() {
                const disponibles = new Set(productosFiltradosCompra().map(p => String(p.id)));
                document.querySelectorAll('#tbody-prods-compra select[name="prod_id[]"]').forEach(sel => {
                    const anterior = sel.value;
                    sel.innerHTML = '<option value="">-- Seleccionar --</option>' + renderOpcionesProductosCompra();
                    sel.value = disponibles.has(anterior) ? anterior : '';
                });
            }

            COMPRA_PROVEEDOR_SELECT?.addEventListener('change', refrescarProductosCompra);

            function agregarFilaProducto() {
                const tbody = document.getElementById('tbody-prods-compra');
                const tabla = document.getElementById('tabla-prods-compra');
                const hint  = document.getElementById('hint-prods-compra');
                tabla.style.display = '';
                hint.style.display  = 'none';

                const idx = tbody.rows.length;
                const tr  = document.createElement('tr');
                tr.innerHTML = `
                    <td style="padding:4px 8px;">
                        <select name="prod_id[]" class="comp-form-select" style="width:100%;font-size:13px;" required>
                            <option value="">— Seleccionar —</option>
                            ${renderOpcionesProductosCompra()}
                        </select>
                    </td>
                    <td style="padding:4px 8px;text-align:center;">
                        <input type="number" name="prod_qty[]" value="1" min="1"
                               class="comp-form-input" style="width:80px;text-align:center;font-size:13px;">
                    </td>
                    <td style="padding:4px 8px;text-align:center;">
                        <button type="button" onclick="this.closest('tr').remove();
                            if(!document.getElementById('tbody-prods-compra').rows.length){
                                document.getElementById('tabla-prods-compra').style.display='none';
                                document.getElementById('hint-prods-compra').style.display='';
                            }"
                            style="background:none;border:none;color:#dc2626;font-size:16px;cursor:pointer;font-weight:700;"></button>
                    </td>`;
                tbody.appendChild(tr);
            }
            </script>

            <!-- Lista -->
            <?php if (empty($registros)): ?>
                <p class="reg-empty">Sin compras registradas.</p>
            <?php else: ?>
            <table class="reg-table">
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>Proveedor</th>
                        <th>Descripción</th>
                        <th style="text-align:right;">Total</th>
                        <th>Estado</th>
                        <th>Tipo</th>
                        <th>Paquete</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($registros as $reg): ?>
                    <tr>
                        <td style="white-space:nowrap;opacity:.65;font-size:12px;">
                            <?= date('d/m/Y', strtotime($reg['fecha'])) ?>
                        </td>
                        <td><?= htmlspecialchars($reg['proveedor_nombre'] ?: '—') ?></td>
                        <td class="reg-desc-cell">
                            <?php
                                $desc_full  = $reg['descripcion'] ?? '';
                                $desc_short = mb_strimwidth($desc_full, 0, 100, '…');
                                $needs_toggle = mb_strlen($desc_full) > 100;
                            ?>
                            <span class="reg-desc-short"><?= nl2br(htmlspecialchars($desc_short)) ?></span>
                            <?php if ($needs_toggle): ?>
                            <span class="reg-desc-full" style="display:none;"><?= nl2br(htmlspecialchars($desc_full)) ?></span>
                            <button type="button" class="reg-desc-toggle"
                                    onclick="toggleDesc(this)">▾ Ver más</button>
                            <?php endif; ?>
                        </td>
                        <td style="text-align:right;font-weight:600;white-space:nowrap;">
                            <?= $reg['total'] !== null ? fp2((float)$reg['total']) : '—' ?>
                        </td>
                        <td>
                            <!-- Cambio de estado inline -->
                            <form method="POST" action="compras.php">
                                <input type="hidden" name="accion"    value="update_estado">
                                <input type="hidden" name="redir_tab" value="registro">
                                <input type="hidden" name="id"        value="<?= (int)$reg['id'] ?>">
                                <span class="estado-badge estado-badge--<?= $reg['estado'] ?>">
                                    <?= match($reg['estado']) {
                                        'pendiente'  => 'Pendiente',
                                        'en_camino'  => 'En camino',
                                        'recibida'   => 'Recibida',
                                        'cancelada'  => 'Cancelada',
                                        default      => $reg['estado']
                                    } ?>
                                </span>
                                <select class="reg-estado-select" name="estado"
                                        onchange="this.form.submit()" style="margin-left:4px;font-size:10px;opacity:.5;">
                                    <option value="pendiente"  <?= $reg['estado']==='pendiente' ?'selected':'' ?>>Pendiente</option>
                                    <option value="en_camino"  <?= $reg['estado']==='en_camino' ?'selected':'' ?>>En camino</option>
                                    <option value="recibida"   <?= $reg['estado']==='recibida'  ?'selected':'' ?>>Recibida</option>
                                    <option value="cancelada"  <?= $reg['estado']==='cancelada' ?'selected':'' ?>>Cancelada</option>
                                </select>
                            </form>
                        </td>
                        <td><span class="tipo-badge tipo-badge--<?= $reg['tipo'] ?>"><?= $reg['tipo'] ?></span></td>
                        <?php
                            $ep   = $reg['estado_paquete']    ?? 'pendiente_revision';
                            $fd   = $reg['falla_descripcion'] ?? null;
                            $rid  = (int)$reg['id'];
                            $foto = $reg['recibo_foto'] ?? null;
                            $paq_json = htmlspecialchars(json_encode([
                                'id'        => $rid,
                                'prov'      => $reg['proveedor_nombre'] ?: 'Sin proveedor',
                                'fecha'     => $reg['fecha'] ? date('d/m/Y', strtotime($reg['fecha'])) : '—',
                                'total'     => $reg['total'] !== null
                                               ? '$' . number_format((float)$reg['total'], 2, ',', '.') : '—',
                                'productos' => $detalle_recibida_map[$rid] ?? [],
                            ], JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_QUOT));
                        ?>
                        <td class="paq-cell">
                            <?php if ($reg['estado'] !== 'recibida'): ?>
                                <span class="paq-na">—</span>
                            <?php elseif (empty($foto)): ?>
                                <!-- Solicitar foto del recibo antes de revisar -->
                                <div class="paq-foto-upload" id="paq-foto-<?= $rid ?>">
                                    <div class="paq-foto-label">Foto del recibo</div>
                                    <input type="file" accept="image/*"
                                           id="paq-file-<?= $rid ?>" style="display:none"
                                           onchange="subirFotoRecibo(<?= $rid ?>, this)">
                                    <button type="button" class="paq-foto-pick-btn"
                                            onclick="document.getElementById('paq-file-<?= $rid ?>').click()">
                                        Elegir foto
                                    </button>
                                    <div class="paq-foto-hint">Requerida para revisar el paquete</div>
                                </div>
                            <?php else: ?>
                                <!-- Foto subida — mostrar link y controles de paquete -->
                                <a class="paq-recibo-link"
                                   href="<?= htmlspecialchars(str_starts_with($foto, 'http') ? $foto : '../' . $foto) ?>" target="_blank">
                                    Ver recibo
                                </a>
                                <div style="margin-top:5px;">
                                <?php if ($ep === 'revisado' || $ep === 'corregida'): ?>
                                    <span class="paq-badge paq-badge--revisado">Revisado</span>
                                <?php elseif ($ep === 'falla'): ?>
                                    <span class="paq-badge paq-badge--falla">Falla</span>
                                    <?php if ($fd): ?>
                                    <div class="paq-falla-text" title="<?= htmlspecialchars($fd) ?>">
                                        <?= htmlspecialchars(mb_strimwidth($fd, 0, 70, '…')) ?>
                                    </div>
                                    <?php endif; ?>
                                <?php else: ?>
                                    <span class="paq-badge paq-badge--pendiente">⏳ Pendiente</span>
                                    <div style="margin-top:5px;">
                                        <select class="paq-action-select"
                                                onchange="onPaqAction(this,<?= $paq_json ?>)">
                                            <option value="">── Cambiar ──</option>
                                            <option value="revisado">Revisado</option>
                                            <option value="falla">Se encontró falla</option>
                                        </select>
                                    </div>
                                <?php endif; ?>
                                </div>
                            <?php endif; ?>
                        </td>
                        <td style="white-space:nowrap;">
                            <?php
                            $reg_ct = $reg['id_proveedor'] ? ($prov_contact_map[(int)$reg['id_proveedor']] ?? null) : null;
                            ?>
                            <?php if ($reg['estado'] === 'recibida' && !empty($detalle_recibida_map[(int)$reg['id']]) && in_array($rango, ['Jefe','Jefe1','Admin'], true)): ?>
                            <button type="button" title="Emitir solicitud de devolución al proveedor"
                                    onclick="abrirDevolModal(<?= (int)$reg['id'] ?>)"
                                    style="font-size:11px;font-weight:700;color:#dc2626;background:none;cursor:pointer;padding:2px 8px;border:1px solid rgba(220,38,38,.35);border-radius:6px;font-family:inherit;">Devolución</button>
                            <?php endif; ?>
                            <button type="button" class="reg-action-btn" title="Copiar mensaje para el proveedor"
                                    onclick="copiarMsgReg(<?= (int)$reg['id'] ?>)"></button>
                            <?php if ($reg_ct && !empty($reg_ct['telefono'])): ?>
                            <button type="button" class="reg-action-btn" title="WhatsApp"
                                    onclick="abrirWAReg(<?= (int)$reg['id'] ?>)"></button>
                            <?php endif; ?>
                            <?php if ($reg_ct && !empty($reg_ct['email'])): ?>
                            <a class="reg-action-btn"
                               href="https://mail.google.com/mail/?view=cm&to=<?= rawurlencode($reg_ct['email']) ?>&su=Orden+de+compra+STARLIM"
                               target="_blank" title="Gmail"></a>
                            <?php endif; ?>
                            <form method="POST" action="compras.php" style="display:inline;"
                                  onsubmit="return confirm('¿Eliminar esta compra?')">
                                <input type="hidden" name="accion"    value="del_registro">
                                <input type="hidden" name="redir_tab" value="registro">
                                <input type="hidden" name="id"        value="<?= (int)$reg['id'] ?>">
                                <button class="comp-del-btn" type="submit"></button>
                            </form>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
            <?php endif; ?>

            <?php if (!empty($registros)): ?>
            <script>
            const REG_ACCIONES = {
                <?php foreach ($registros as $reg):
                    $rd_prods = $detalle_reg_map[(int)$reg['id']] ?? [];
                    $rd_ct    = $reg['id_proveedor'] ? ($prov_contact_map[(int)$reg['id_proveedor']] ?? null) : null;
                ?>
                <?= (int)$reg['id'] ?>: {
                    prov:      <?= json_encode($reg['proveedor_nombre'] ?: 'Proveedor', JSON_HEX_TAG | JSON_UNESCAPED_UNICODE) ?>,
                    contacto:  <?= json_encode($rd_ct['contacto'] ?? null, JSON_HEX_TAG | JSON_UNESCAPED_UNICODE) ?>,
                    productos: <?= json_encode(
                        array_map(fn($p) => ['nombre' => $p['prod_nombre'], 'cantidad' => (int)$p['cantidad']], $rd_prods),
                        JSON_UNESCAPED_UNICODE | JSON_HEX_TAG
                    ) ?>,
                    tel:   <?= json_encode($rd_ct['telefono'] ?? null, JSON_HEX_TAG) ?>,
                    email: <?= json_encode($rd_ct['email']    ?? null, JSON_HEX_TAG) ?>
                },
                <?php endforeach; ?>
            };

            function buildMsgReg(d) {
                const saludo = d.contacto || d.prov;
                let msg = `Hola ${saludo}!\nLe hacemos llegar la siguiente orden de compra desde STARLIM.\n\n`;
                if (d.productos.length) {
                    msg += 'Productos:\n';
                    d.productos.forEach(p => msg += `- ${p.nombre}: ${p.cantidad} ud${p.cantidad !== 1 ? 's' : ''}.\n`);
                }
                msg += '\nSaludos, STARLIM';
                return msg;
            }

            function copiarMsgReg(id) {
                const d = REG_ACCIONES[id];
                if (!d) return;
                navigator.clipboard.writeText(buildMsgReg(d)).then(() => mostrarToast('Mensaje copiado '));
            }

            function abrirWAReg(id) {
                const d = REG_ACCIONES[id];
                if (!d || !d.tel) return;
                const tel = d.tel.replace(/[^0-9]/g, '');
                window.open(`whatsapp://send?phone=${tel}&text=${encodeURIComponent(buildMsgReg(d))}`);
            }
            </script>
            <?php endif; ?>

            <!-- ── Modal: Reportar falla en paquete ─────────────── -->
            <div class="paq-overlay" id="paq-falla-overlay">
                <div class="paq-modal">
                    <p class="paq-modal-title">Reportar falla en paquete</p>
                    <div class="paq-modal-info" id="paq-falla-info"></div>
                    <div class="comp-form-field">
                        <label class="comp-form-label">Descripción de la falla <span style="color:#dc2626">*</span></label>
                        <textarea class="comp-form-textarea" id="paq-falla-desc" rows="3"
                                  placeholder="Ej: Faltan 10 cloros en líquido de 10L y 4 en pastillas..."></textarea>
                    </div>
                    <div id="paq-prod-container"></div>
                    <div class="paq-modal-footer">
                        <button class="prov-cancel-btn" onclick="cerrarPaqFallaModal()">Cancelar</button>
                        <div class="paq-acciones">
                            <?php if (in_array($rango, ['Jefe','Jefe1','Admin'], true)): ?>
                            <button class="paq-btn paq-btn--silent"
                                    onclick="accionFalla('confirmar_falla','¿Guardar la falla sin notificar a nadie?','Se guardará la falla internamente.')">
                                Confirmar
                            </button>
                            <button class="paq-btn paq-btn--tarea"
                                    onclick="abrirTareaModal()">
                                Confirmar y agregar a tareas
                            </button>
                            <?php endif; ?>
                            <button class="paq-btn paq-btn--avisar"
                                    onclick="accionFalla('reportar_falla','¿Confirmar y notificar a los jefes?','Se enviará un mensaje interno a todos los jefes.')">
                                Confirmar y avisar
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ── Modal: Crear tarea desde falla ───────────────── -->
            <div class="paq-overlay" id="paq-tarea-overlay">
                <div class="paq-modal paq-tarea-modal">
                    <p class="paq-modal-title">Crear tarea desde falla</p>
                    <div class="paq-modal-info" id="paq-tarea-info"></div>
                    <div class="paq-tarea-grid">
                        <div class="comp-form-field span2">
                            <label class="comp-form-label">Título <span style="color:#dc2626">*</span></label>
                            <input class="comp-form-input" type="text" id="tarea-titulo">
                        </div>
                        <div class="comp-form-field">
                            <label class="comp-form-label">Prioridad</label>
                            <select class="comp-form-select" id="tarea-prioridad">
                                <option value="normal">Normal</option>
                                <option value="alta">Alta</option>
                                <option value="urgente">Urgente</option>
                            </select>
                        </div>
                        <div class="comp-form-field">
                            <label class="comp-form-label">Fecha límite</label>
                            <input class="comp-form-input" type="date" id="tarea-fecha-limite">
                        </div>
                        <div class="comp-form-field span2">
                            <label class="comp-form-label">Descripción (editable)</label>
                            <textarea class="comp-form-textarea" id="tarea-descripcion" rows="4"></textarea>
                        </div>
                    </div>
                    <div class="comp-form-label" style="margin-bottom:8px;">Asignar a:</div>
                    <div class="paq-asignar-row">
                        <label class="paq-radio-label">
                            <input type="radio" name="paq-asignar" id="asignar-yo" value="yo" checked>
                            A mí mismo
                        </label>
                        <label class="paq-radio-label">
                            <input type="radio" name="paq-asignar" id="asignar-otro" value="otro">
                            Otro jefe / Jefe1
                        </label>
                    </div>
                    <div id="paq-buscar-wrap" style="display:none;">
                        <input class="paq-empleado-search" type="text" id="paq-empleado-input"
                               placeholder="Escribí para buscar jefe..." autocomplete="off"
                               list="paq-jefes-datalist">
                        <datalist id="paq-jefes-datalist">
                            <?php foreach ($jefes_lista ?? [] as $j): ?>
                            <option value="<?= htmlspecialchars($j) ?>">
                            <?php endforeach; ?>
                        </datalist>
                    </div>
                    <label class="paq-check-label">
                        <input type="checkbox" id="tarea-notificar" checked>
                        También notificar a los jefes sobre la falla por mensaje interno
                    </label>
                    <div class="paq-modal-footer" style="margin-top:20px;">
                        <button class="prov-cancel-btn" onclick="cerrarTareaModal()">Cancelar</button>
                        <button class="paq-btn paq-btn--avisar" onclick="confirmarCrearTarea()">Crear tarea →</button>
                    </div>
                </div>
            </div>

            <!-- ── Confirm dialog genérico ───────────────────────── -->
            <div class="paq-confirm-overlay" id="paq-confirm-overlay">
                <div class="paq-confirm-box">
                    <p class="paq-confirm-title" id="paq-confirm-title">¿Confirmar acción?</p>
                    <p class="paq-confirm-msg"   id="paq-confirm-msg"></p>
                    <div class="paq-confirm-btns">
                        <button class="paq-confirm-cancel" onclick="cerrarConfirm()">Cancelar</button>
                        <button class="paq-confirm-ok"     id="paq-confirm-ok-btn">Continuar</button>
                    </div>
                </div>
            </div>

            <!-- ── Modal: Solicitud de devolución al proveedor ─────── -->
            <?php
                $devol_map = [];
                foreach ($registros as $reg_d) {
                    if (($reg_d['estado'] ?? '') !== 'recibida') continue;
                    $prods_d = $detalle_recibida_map[(int)$reg_d['id']] ?? [];
                    if (empty($prods_d)) continue;
                    $devol_map[(int)$reg_d['id']] = [
                        'prov'      => $reg_d['proveedor_nombre'] ?: 'Sin proveedor',
                        'fecha'     => $reg_d['fecha'] ? date('d/m/Y', strtotime($reg_d['fecha'])) : '—',
                        'productos' => array_map(fn($p) => [
                            'id' => (int)$p['id'], 'nombre' => $p['nombre'], 'cantidad' => (int)$p['cantidad'],
                        ], $prods_d),
                    ];
                }
            ?>
            <div class="paq-overlay" id="devol-overlay">
                <div class="paq-modal">
                    <p class="paq-modal-title">Solicitud de devolución</p>
                    <div class="paq-modal-info" id="devol-info"></div>
                    <p style="font-size:12px;opacity:.6;margin:-6px 0 12px;">
                        Tildá los productos a devolver, ajustá cantidad y motivo. El PDF lista solo lo seleccionado.
                    </p>
                    <form id="devol-form" method="POST" action="../php/generar_pdf_solicitud_devolucion.php"
                          target="_blank" onsubmit="return prepararDevol()">
                        <input type="hidden" name="id_compra" id="devol-id-compra">
                        <table class="paq-prod-table" id="devol-tabla">
                            <thead><tr>
                                <th style="width:34px;"></th><th>Producto</th>
                                <th style="width:80px;">Cantidad</th><th>Motivo</th>
                            </tr></thead>
                            <tbody id="devol-tbody"></tbody>
                        </table>
                        <div class="comp-form-field" style="margin-top:12px;">
                            <label class="comp-form-label">Motivo general (opcional)</label>
                            <textarea class="comp-form-textarea" name="motivo_general" rows="2"
                                      placeholder="Ej: mercadería fallada / no solicitada / acordada con el proveedor..."></textarea>
                        </div>
                        <div class="paq-modal-footer">
                            <button type="button" class="prov-cancel-btn" onclick="cerrarDevolModal()">Cancelar</button>
                            <button type="submit" class="paq-btn paq-btn--avisar">Generar PDF →</button>
                        </div>
                    </form>
                </div>
            </div>

            <script>
            const DEVOL_DATA = <?= json_encode($devol_map, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_QUOT | JSON_HEX_APOS) ?>;

            function abrirDevolModal(id) {
                const d = DEVOL_DATA[id];
                if (!d) return;
                document.getElementById('devol-id-compra').value = id;
                document.getElementById('devol-info').textContent = d.prov + ' — Compra del ' + d.fecha;
                document.getElementById('devol-tbody').innerHTML = d.productos.map(p => `
                    <tr style="opacity:.55;">
                        <td style="text-align:center;"><input type="checkbox" class="devol-check" onchange="toggleDevolRow(this)"></td>
                        <td>${escHtml(p.nombre)}<input type="hidden" name="prod_id[]" value="${p.id}" disabled></td>
                        <td style="text-align:center;"><input type="number" name="prod_cant[]" value="${p.cantidad}" min="1" max="${p.cantidad}" disabled style="width:64px;text-align:center;"></td>
                        <td><input type="text" name="motivo[]" placeholder="opcional" disabled style="width:100%;box-sizing:border-box;"></td>
                    </tr>`).join('');
                const tg = document.querySelector('#devol-form textarea[name="motivo_general"]');
                if (tg) tg.value = '';
                document.getElementById('devol-overlay').classList.add('open');
            }

            function toggleDevolRow(cb) {
                const tr = cb.closest('tr');
                const on = cb.checked;
                tr.querySelectorAll('input[name="prod_id[]"],input[name="prod_cant[]"],input[name="motivo[]"]')
                  .forEach(el => el.disabled = !on);
                tr.style.opacity = on ? '1' : '.55';
            }

            function cerrarDevolModal() {
                document.getElementById('devol-overlay').classList.remove('open');
            }

            function prepararDevol() {
                if (!document.querySelectorAll('#devol-tbody .devol-check:checked').length) {
                    mostrarToast('Seleccioná al menos un producto para devolver', true);
                    return false;
                }
                cerrarDevolModal();
                return true;
            }

            document.getElementById('devol-overlay')?.addEventListener('click', e => {
                if (e.target === document.getElementById('devol-overlay')) cerrarDevolModal();
            });
            document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarDevolModal(); });
            </script>

        </section>

        <!-- ══════════════════════════════════════════════════════════
             TAB 5: COMPRAS AUTOMÁTICAS A PROVEEDOR (agrupadas)
        ═══════════════════════════════════════════════════════════ -->
        <?php elseif ($tab === 'automaticas'): ?>
        <section class="bd-panel">
            <div class="comp-panel-header">
                <div>
                    <h2>Compras Automáticas</h2>
                    <p class="comp-panel-sub">
                        <?= $reponer_mode === 'sales'
                            ? 'Productos a reponer · agrupados por proveedor · promedio mensual × 2 (últimos 6 meses)'
                            : 'Sin historial de ventas — productos con stock en cero, agrupados por proveedor' ?>
                        <?php if ($reponer_total > count($reponer)): ?>
                            · mostrando los primeros <?= count($reponer) ?> de <?= number_format($reponer_total, 0, ',', '.') ?>
                        <?php endif; ?>
                    </p>
                </div>
            </div>

            <?php if (empty($reponer_auto_grouped)): ?>
                <p class="auto-no-reponer">
                    <?= $tiene_detalle
                        ? 'No hay productos que necesiten reposición en este momento.'
                        : 'Sin historial de ventas para calcular reposición automática.' ?>
                </p>
            <?php else: ?>

            <?php foreach ($reponer_auto_grouped as $prov_key => $prods):
                $is_sin_prov = ($prov_key === '__sin_proveedor__');
                $prov_label  = $is_sin_prov ? 'Sin proveedor asignado' : $prov_key;
                $prov_info   = !$is_sin_prov ? ($prov_info_by_name[$prov_key] ?? null) : null;
                $prov_id     = (int)($prov_info['id'] ?? 0);
                $prov_tel    = $prov_info['telefono'] ?? '';
                $prov_email  = $prov_info['email'] ?? '';
                $form_id     = 'auto-form-' . md5($prov_key);
            ?>
            <div class="auto-supplier-block <?= $is_sin_prov ? 'auto-supplier-no-prov' : '' ?>">
                <div class="auto-supplier-hdr">
                    <div>
                        <span class="auto-supplier-name"><?= htmlspecialchars($prov_label) ?></span>
                        <span class="auto-supplier-badge"><?= count($prods) ?> producto<?= count($prods) !== 1 ? 's' : '' ?></span>
                    </div>
                    <?php if (!$is_sin_prov && ($prov_tel || $prov_email)): ?>
                    <div class="auto-supplier-contact">
                        <?php if ($prov_tel): ?>
                        <a class="auto-contact-btn auto-contact-btn--wa"
                           href="whatsapp://send?phone=<?= preg_replace('/[^0-9]/', '', $prov_tel) ?>">WhatsApp</a>
                        <?php endif; ?>
                        <?php if ($prov_email): ?>
                        <a class="auto-contact-btn auto-contact-btn--mail"
                           href="https://mail.google.com/mail/?view=cm&to=<?= rawurlencode($prov_email) ?>&su=Orden+de+compra+STARLIM"
                           target="_blank">Gmail</a>
                        <?php endif; ?>
                    </div>
                    <?php endif; ?>
                </div>

                <div class="auto-supplier-body">
                <form method="POST" action="compras.php" class="auto-supplier-form" id="<?= $form_id ?>">
                    <input type="hidden" name="accion"    value="generar_orden">
                    <input type="hidden" name="redir_tab" value="registro">
                    <?php if ($prov_id > 0): ?>
                    <input type="hidden" name="id_proveedor" value="<?= $prov_id ?>">
                    <?php endif; ?>

                    <div class="auto-config-row" style="grid-template-columns:160px 1fr;padding-top:14px;">
                        <div class="comp-form-field">
                            <label class="comp-form-label">Fecha</label>
                            <input class="comp-form-input" type="date" name="fecha" value="<?= date('Y-m-d') ?>">
                        </div>
                        <div class="comp-form-field">
                            <label class="comp-form-label">Notas</label>
                            <input class="comp-form-input" type="text" name="notas" placeholder="Notas opcionales...">
                        </div>
                    </div>

                    <table class="auto-table">
                        <thead>
                            <tr>
                                <th style="width:32px;">
                                    <input type="checkbox" class="check-all-prov" data-form="<?= $form_id ?>"
                                           title="Seleccionar todos" checked>
                                </th>
                                <th>Producto</th>
                                <th style="text-align:center;">Stock</th>
                                <th style="text-align:center;">Recomendado</th>
                                <th style="text-align:center;">Cantidad a pedir</th>
                                <th style="text-align:right;">Costo unit.</th>
                                <th style="text-align:right;">Subtotal</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($prods as $p):
                                $deficit = max(1, (int)($p['cnt_recomendada'] ?? 1) - (int)$p['stock_actual']);
                            ?>
                            <tr>
                                <td>
                                    <input type="checkbox" name="prod_ids[]"
                                           value="<?= (int)$p['id'] ?>"
                                           class="prod-check" checked>
                                </td>
                                <td><strong><?= htmlspecialchars($p['nombre']) ?></strong></td>
                                <td style="text-align:center;"><?= (int)$p['stock_actual'] ?></td>
                                <td style="text-align:center;"><?= $p['cnt_recomendada'] !== null ? (int)$p['cnt_recomendada'] : '—' ?></td>
                                <td style="text-align:center;">
                                    <input type="number" class="auto-qty-input"
                                           name="prod_qty[<?= (int)$p['id'] ?>]"
                                           value="<?= $deficit ?>"
                                           min="1"
                                           data-costo="<?= (float)$p['costo'] ?>">
                                </td>
                                <td style="text-align:right;"><?= fp2((float)$p['costo']) ?></td>
                                <td style="text-align:right;font-weight:600;" class="subtotal-cell">
                                    <?= fp2($deficit * (float)$p['costo']) ?>
                                </td>
                            </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>

                    <div class="auto-footer">
                        <div>
                            <div class="auto-total-label">Total estimado</div>
                            <div class="auto-total-val">calculando...</div>
                        </div>
                        <button class="auto-submit-btn" type="submit"
                                onclick="return confirm('¿Generar orden de compra para <?= htmlspecialchars(str_replace("'", "\\'", $prov_label)) ?>?')">
                            Generar Orden →
                        </button>
                    </div>
                </form>
                </div>
            </div>
            <?php endforeach; ?>

            <?php endif; ?>
        </section>

        <?php endif; ?>

    </main>

    <script src="../js/global.js"></script>
    <script>
        /* ── Toggle form ── */
        function toggleForm(formId, btn, openLabel, closeLabel) {
            const form = document.getElementById(formId);
            if (!form) return;
            form.classList.toggle('open');
            btn.textContent = form.classList.contains('open') ? closeLabel : openLabel;
        }

        <?php if ($abrir_nueva_compra): ?>
        document.addEventListener('DOMContentLoaded', function () {
            const form = document.getElementById('reg-form');
            const btn  = document.getElementById('toggle-reg-form');
            if (form) form.classList.add('open');
            if (btn) btn.textContent = '− Cerrar';
        });
        <?php endif; ?>

        /* ── Urgencia accordion ── */
        function toggleUrgente(id) {
            const t = document.getElementById('detail-' + id);
            if (!t) return;
            const wasOpen = t.classList.contains('open');
            document.querySelectorAll('.urgente-detail.open').forEach(el => el.classList.remove('open'));
            if (!wasOpen) t.classList.add('open');
        }

        /* ── Automáticas: total dinámico por formulario ── */
        function fmtARS(v) {
            return '$' + v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        function recalcForm(form) {
            let total = 0;
            form.querySelectorAll('tbody tr').forEach(row => {
                const chk = row.querySelector('.prod-check');
                const qty = row.querySelector('.auto-qty-input');
                const sub = row.querySelector('.subtotal-cell');
                if (!chk || !qty || !sub) return;
                if (chk.checked) {
                    const amount = (parseInt(qty.value) || 0) * (parseFloat(qty.dataset.costo) || 0);
                    sub.textContent = fmtARS(amount);
                    total += amount;
                } else {
                    sub.textContent = '—';
                }
            });
            const tv = form.querySelector('.auto-total-val');
            if (tv) tv.textContent = fmtARS(total);
        }

        document.querySelectorAll('.auto-supplier-form').forEach(form => {
            form.querySelectorAll('.prod-check, .auto-qty-input').forEach(el => {
                el.addEventListener('change', () => recalcForm(form));
                el.addEventListener('input',  () => recalcForm(form));
            });
            recalcForm(form);
        });

        document.querySelectorAll('.check-all-prov').forEach(chkAll => {
            chkAll.addEventListener('change', () => {
                const form = document.getElementById(chkAll.dataset.form);
                if (!form) return;
                form.querySelectorAll('.prod-check').forEach(c => c.checked = chkAll.checked);
                recalcForm(form);
            });
        });

        /* ── Toast ── */
        function mostrarToast(msg, esError = false) {
            const t = document.createElement('div');
            t.className = 'comp-toast' + (esError ? ' comp-toast--error' : '');
            t.textContent = msg;
            document.body.appendChild(t);
            setTimeout(() => t.remove(), 2400);
        }

        /* ── Modal editar proveedor ── */
        function abrirEditProv(data) {
            document.getElementById('edit-prov-id').value        = data.id        || '';
            document.getElementById('edit-prov-nombre').value    = data.nombre    || '';
            document.getElementById('edit-prov-contacto').value  = data.contacto  || '';
            document.getElementById('edit-prov-telefono').value  = data.telefono  || '';
            document.getElementById('edit-prov-email').value     = data.email     || '';
            document.getElementById('edit-prov-direccion').value = data.direccion || '';
            document.getElementById('edit-prov-notas').value     = data.notas     || '';
            const verLink = document.getElementById('prov-ver-productos-link');
            if (verLink && data.nombre)
                verLink.href = 'edit_stock.php?proveedor=' + encodeURIComponent(data.nombre);
            document.getElementById('prov-edit-overlay').classList.add('open');
        }
        function cerrarEditProv(e) {
            if (e && e.target !== document.getElementById('prov-edit-overlay')) return;
            document.getElementById('prov-edit-overlay').classList.remove('open');
        }
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') document.getElementById('prov-edit-overlay')?.classList.remove('open');
        });

        /* ══════════════════════════════════════════════════════════
           PAQUETE — flujo completo
        ══════════════════════════════════════════════════════════ */
        const PAQ_RANGO     = <?= json_encode($rango) ?>;
        const PAQ_JEFES     = <?= json_encode($jefes_lista ?? [], JSON_UNESCAPED_UNICODE) ?>;
        const PAQ_ES_JEFE   = ['Jefe','Jefe1','Admin'].includes(PAQ_RANGO);

        let paqDatos        = null;   // datos de la compra activa en modal
        let paqSelectEl     = null;   // el <select> que disparó la acción
        let confirmCallback = null;   // función a ejecutar si el usuario confirma
        let paqLlegoData    = [];     // valores de "llegó" capturados del modal de falla

        /* ── Abrir modal de falla ─────────────────────────────── */
        function onPaqAction(sel, datos) {
            const val = sel.value;
            if (!val) return;
            paqDatos    = datos;
            paqSelectEl = sel;

            if (val === 'revisado') {
                mostrarConfirm(
                    '¿Marcar como Revisado?',
                    `El paquete del proveedor "${datos.prov}" quedará marcado como revisado y se actualizará el stock.`,
                    () => ejecutarPaqAjax('marcar_revisado', {
                        productos: JSON.stringify((datos.productos || []).map(p => ({ id: p.id, cantidad: p.cantidad })))
                    }, sel)
                );
                sel.value = '';
                return;
            }

            if (val === 'falla') {
                document.getElementById('paq-falla-desc').value = '';
                document.getElementById('paq-falla-info').textContent =
                    `Compra #${datos.id} · Proveedor: ${datos.prov} · ${datos.fecha} · ${datos.total}`;
                const container = document.getElementById('paq-prod-container');
                if (container) {
                    container.innerHTML = buildProductTable(datos.productos || []);
                    container.querySelectorAll('.paq-llego-input').forEach(inp =>
                        inp.addEventListener('input', recalcTotalesFalla)
                    );
                    container.querySelectorAll('.paq-step-btn').forEach(btn =>
                        btn.addEventListener('click', () => {
                            const inp = btn.closest('.paq-stepper').querySelector('.paq-llego-input');
                            inp.value = Math.max(0, (parseInt(inp.value) || 0) + parseInt(btn.dataset.dir));
                            recalcTotalesFalla();
                        })
                    );
                    recalcTotalesFalla();
                }
                document.getElementById('paq-falla-overlay').classList.add('open');
                sel.value = '';
            }
        }

        function cerrarPaqFallaModal() {
            document.getElementById('paq-falla-overlay').classList.remove('open');
            const container = document.getElementById('paq-prod-container');
            if (container) container.innerHTML = '';
            if (paqSelectEl) paqSelectEl.value = '';
        }

        /* ── Tabla de detalle del pedido con stepper ─────────────── */
        function buildProductTable(productos) {
            if (!productos || !productos.length) return '';
            const rows = productos.map(p =>
                `<tr>
                    <td>${escHtml(p.nombre)}</td>
                    <td>$${p.costo.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                    <td style="text-align:center;">${p.cantidad}</td>
                    <td style="text-align:center;">
                        <div class="paq-stepper">
                            <button type="button" class="paq-step-btn" data-dir="-1">−</button>
                            <input class="paq-llego-input" type="number" min="0" value=""
                                   data-costo="${p.costo}" data-solicitado="${p.cantidad}" data-id="${p.id || 0}">
                            <button type="button" class="paq-step-btn" data-dir="1">+</button>
                        </div>
                    </td>
                </tr>`
            ).join('');
            return `<div class="comp-form-label" style="margin:10px 0 6px;">Detalle del pedido <span style="opacity:.5;font-weight:400;">(opcional)</span></div>
                <div style="overflow-x:auto;">
                    <table class="paq-prod-table">
                        <thead><tr>
                            <th>Producto</th><th>Costo</th>
                            <th style="text-align:center;">Solicitado</th>
                            <th style="text-align:center;">Llegó</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                <div class="paq-totales">
                    <div class="paq-total-row"><span>Total del pedido:</span><span id="paq-total-pedido">—</span></div>
                    <div class="paq-total-row"><span>Total del paquete:</span><span id="paq-total-paquete">—</span></div>
                    <div class="paq-total-row paq-total-perdido"><span>Total de la falla:</span><span id="paq-total-perd">—</span></div>
                </div>`;
        }

        function recalcFallaRow(inp) {
            const solic = parseInt(inp.dataset.solicitado) || 0;
            const span  = inp.closest('tr')?.querySelector('.paq-margen-val');
            if (!span) return;
            if (inp.value === '' || inp.value === null) {
                span.textContent = '—'; span.className = 'paq-margen-val'; return;
            }
            const llego = parseInt(inp.value) || 0;
            if (!solic) { span.textContent = '—'; span.className = 'paq-margen-val'; return; }
            const pct = Math.round((llego - solic) / solic * 100);
            span.textContent = (pct >= 0 ? '+' : '') + pct + '%';
            span.className   = 'paq-margen-val ' + (pct > 0 ? 'paq-margen--pos' : pct < 0 ? 'paq-margen--neg' : '');
        }

        function recalcTotalesFalla() {
            let totalPedido = 0, totalPaquete = 0;
            document.querySelectorAll('#paq-prod-container .paq-llego-input').forEach(inp => {
                const costo  = parseFloat(inp.dataset.costo)     || 0;
                const solic  = parseInt(inp.dataset.solicitado)  || 0;
                const llego  = parseInt(inp.value) || 0;
                totalPedido  += costo * solic;
                totalPaquete += costo * llego;
            });
            const fmt = v => '$' + v.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
            const el = id => document.getElementById(id);
            if (el('paq-total-pedido'))  el('paq-total-pedido').textContent  = fmt(totalPedido);
            if (el('paq-total-paquete')) el('paq-total-paquete').textContent = fmt(totalPaquete);
            if (el('paq-total-perd'))    el('paq-total-perd').textContent    = fmt(totalPedido - totalPaquete);
        }

        function buildFallaCompleta(descripcion) {
            const inputs = document.querySelectorAll('#paq-prod-container .paq-llego-input');
            if (!inputs.length) return descripcion;
            let lineas = [], totalPedido = 0, totalPaquete = 0;
            inputs.forEach(inp => {
                const costo  = parseFloat(inp.dataset.costo)    || 0;
                const solic  = parseInt(inp.dataset.solicitado) || 0;
                const llego  = parseInt(inp.value) || 0;
                const nombre = inp.closest('tr')?.querySelector('td')?.textContent?.trim() || '?';
                totalPedido  += costo * solic;
                totalPaquete += costo * llego;
                const pct = solic > 0 ? Math.round((llego - solic) / solic * 100) : 0;
                lineas.push(`- ${nombre}: Solicitado ${solic}, Llegó ${llego} (Margen: ${pct >= 0 ? '+' : ''}${pct}%, Costo $${costo.toFixed(2)})`);
            });
            const fmt = v => '$' + v.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
            let texto = descripcion;
            if (lineas.length)
                texto += '\n\nDetalle del pedido:\n' + lineas.join('\n');
            texto += `\n\nTotal del pedido: ${fmt(totalPedido)}\nTotal del paquete: ${fmt(totalPaquete)}\nTotal de la falla: ${fmt(totalPedido - totalPaquete)}`;
            return texto;
        }

        /* ── Capturar datos de "llegó" del modal de falla ──────── */
        function getLlegoData() {
            const result = [];
            document.querySelectorAll('#paq-prod-container .paq-llego-input').forEach(inp => {
                const id    = parseInt(inp.dataset.id) || 0;
                const llego = parseInt(inp.value) || 0;
                if (id) result.push({ id, llego });
            });
            return result;
        }

        /* ── Acciones desde el modal de falla ────────────────── */
        function accionFalla(accion, titulo, msg) {
            const falla = document.getElementById('paq-falla-desc').value.trim();
            if (!falla) {
                alert('Por favor describí la falla antes de continuar.');
                return;
            }
            const fallaCompleta = buildFallaCompleta(falla);
            paqLlegoData = getLlegoData();   // capturar antes de cerrar el modal
            mostrarConfirm(titulo, msg || '', () => {
                cerrarPaqFallaModal();
                ejecutarPaqAjax(accion, {
                    falla: fallaCompleta,
                    productos_llego: JSON.stringify(paqLlegoData)
                }, paqSelectEl);
            });
        }

        /* ── Abrir modal de tarea ─────────────────────────────── */
        function abrirTareaModal() {
            const falla = document.getElementById('paq-falla-desc').value.trim();
            if (!falla) {
                alert('Por favor describí la falla antes de continuar.');
                return;
            }
            const fallaCompleta = buildFallaCompleta(falla);
            paqLlegoData = getLlegoData();   // capturar antes de que cerrarPaqFallaModal() limpie el DOM
            mostrarConfirm(
                '¿Crear tarea a partir de esta falla?',
                'Se abrirá el formulario para completar los datos de la tarea.',
                () => {
                    document.getElementById('tarea-titulo').value       = `Falla en paquete — ${paqDatos.prov}`;
                    document.getElementById('tarea-descripcion').value  = fallaCompleta;
                    document.getElementById('tarea-fecha-limite').value = '';
                    document.getElementById('tarea-prioridad').value    = 'normal';
                    document.getElementById('tarea-notificar').checked  = true;
                    document.getElementById('asignar-yo').checked       = true;
                    document.getElementById('paq-buscar-wrap').style.display = 'none';
                    document.getElementById('paq-empleado-input').value = '';
                    document.getElementById('paq-tarea-info').textContent =
                        `Compra #${paqDatos.id} · ${paqDatos.prov} · ${paqDatos.fecha}`;
                    cerrarPaqFallaModal();
                    document.getElementById('paq-tarea-overlay').classList.add('open');
                }
            );
        }

        function cerrarTareaModal() {
            document.getElementById('paq-tarea-overlay').classList.remove('open');
        }

        /* ── Toggle buscador de empleado ─────────────────────── */
        document.getElementById('asignar-yo')?.addEventListener('change', () => {
            document.getElementById('paq-buscar-wrap').style.display = 'none';
        });
        document.getElementById('asignar-otro')?.addEventListener('change', () => {
            document.getElementById('paq-buscar-wrap').style.display = '';
            document.getElementById('paq-empleado-input').focus();
        });

        /* ── Confirmar creación de tarea ─────────────────────── */
        function confirmarCrearTarea() {
            const titulo    = document.getElementById('tarea-titulo').value.trim();
            const prioridad = document.getElementById('tarea-prioridad').value;
            const fechaLim  = document.getElementById('tarea-fecha-limite').value;
            const desc      = document.getElementById('tarea-descripcion').value.trim();
            const notificar = document.getElementById('tarea-notificar').checked;
            const asignar   = document.querySelector('input[name="paq-asignar"]:checked')?.value;
            const empleado  = document.getElementById('paq-empleado-input').value.trim();

            if (!titulo) { alert('Por favor completá el título de la tarea.'); return; }
            if (!desc)   { alert('Por favor completá la descripción.'); return; }
            if (asignar === 'otro' && !empleado) {
                alert('Por favor seleccioná el empleado al que asignar la tarea.');
                return;
            }
            if (asignar === 'otro' && !PAQ_JEFES.includes(empleado)) {
                alert('El empleado ingresado no es válido. Elegí uno de la lista.');
                return;
            }

            mostrarConfirm(
                '¿Crear esta tarea?',
                `Título: "${titulo}" · Prioridad: ${prioridad}${asignar === 'otro' ? ` · Asignada a ${empleado}` : ''}`,
                () => {
                    cerrarTareaModal();
                    ejecutarPaqAjax('crear_tarea_falla', {
                        falla: desc, titulo, prioridad,
                        fecha_limite: fechaLim,
                        asignado_a:   asignar === 'otro' ? empleado : '',
                        notificar:    notificar ? '1' : '',
                        productos_llego: JSON.stringify(paqLlegoData),
                    }, paqSelectEl);
                }
            );
        }

        /* ── Subir foto del recibo ───────────────────────────── */
        async function subirFotoRecibo(id, input) {
            const file = input.files[0];
            if (!file) return;
            const container = document.getElementById('paq-foto-' + id);
            const btn = container?.querySelector('.paq-foto-pick-btn');
            const resetBtn = () => { if (btn) btn.textContent = 'Elegir foto'; input.value = ''; };
            if (btn) btn.textContent = 'Subiendo…';
            const fd = new FormData();
            fd.append('id', id);
            fd.append('foto', file);
            try {
                const res  = await fetch('../php/compras_foto_recibo.php', {method:'POST', body:fd});
                const raw  = await res.text();
                let data;
                try {
                    data = JSON.parse(raw);
                } catch(_) {
                    console.error('Respuesta no-JSON del servidor:', raw);
                    mostrarToast('Error del servidor (ver consola para detalles)', true);
                    resetBtn(); return;
                }
                if (data.ok) {
                    mostrarToast('Foto del recibo subida');
                    setTimeout(() => location.reload(), 700);
                } else {
                    mostrarToast('Error: ' + (data.msg || 'desconocido'), true);
                    resetBtn();
                }
            } catch(e) {
                mostrarToast('Error de red al subir la foto', true);
                resetBtn();
            }
        }

        /* ── AJAX genérico ───────────────────────────────────── */
        async function ejecutarPaqAjax(accion, extra, selectRef) {
            const id = paqDatos?.id;
            if (!id) return;

            const fd = new FormData();
            fd.append('accion', accion);
            fd.append('id', id);
            Object.entries(extra).forEach(([k, v]) => fd.append(k, v));

            try {
                const res  = await fetch('../php/compras_paquete_ajax.php', { method: 'POST', body: fd });
                const data = await res.json();
                if (data.ok) {
                    mostrarToast('Guardado correctamente');
                    /* Actualizar celda en la tabla sin recargar */
                    actualizarCeldaPaquete(id, accion, extra.falla || '');
                } else {
                    mostrarToast('Error: ' + (data.msg || 'desconocido'), true);
                }
            } catch (e) {
                mostrarToast('Error de conexión', true);
            }
        }

        /* ── Actualizar la celda de Paquete en la tabla ──────── */
        function actualizarCeldaPaquete(compraId, accion, fallaTxt) {
            const celda = paqSelectEl?.closest('.paq-cell');
            if (!celda) return;
            if (accion === 'marcar_revisado') {
                celda.innerHTML = '<span class="paq-badge paq-badge--revisado">Revisado</span>';
            } else {
                const short = fallaTxt.length > 70 ? fallaTxt.slice(0, 70) + '…' : fallaTxt;
                celda.innerHTML =
                    '<span class="paq-badge paq-badge--falla">Falla</span>' +
                    (fallaTxt ? `<div class="paq-falla-text">${escHtml(short)}</div>` : '');
            }
        }

        function escHtml(s) {
            return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        }

        /* ── Confirm dialog personalizado ────────────────────── */
        function mostrarConfirm(titulo, msg, onOk) {
            document.getElementById('paq-confirm-title').textContent = titulo;
            document.getElementById('paq-confirm-msg').textContent   = msg;
            confirmCallback = onOk;
            document.getElementById('paq-confirm-overlay').classList.add('open');
        }

        function cerrarConfirm() {
            document.getElementById('paq-confirm-overlay').classList.remove('open');
            confirmCallback = null;
        }

        document.getElementById('paq-confirm-ok-btn')?.addEventListener('click', () => {
            const cb = confirmCallback;   // guardar antes de que cerrarConfirm() lo limpie
            cerrarConfirm();
            if (cb) cb();
        });

        /* ── Toggle descripción expandible ──────────────────── */
        function toggleDesc(btn) {
            const cell  = btn.closest('.reg-desc-cell');
            const short = cell.querySelector('.reg-desc-short');
            const full  = cell.querySelector('.reg-desc-full');
            const expanded = full.style.display !== 'none';
            full.style.display  = expanded ? 'none' : '';
            short.style.display = expanded ? ''     : 'none';
            btn.textContent     = expanded ? '▾ Ver más' : '▴ Ver menos';
        }

        /* Cerrar modales con Escape */
        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape') return;
            cerrarPaqFallaModal();
            cerrarTareaModal();
            cerrarConfirm();
        });

        /* Cerrar modales al clickear overlay */
        document.getElementById('paq-falla-overlay')?.addEventListener('click', e => {
            if (e.target === document.getElementById('paq-falla-overlay')) cerrarPaqFallaModal();
        });
        document.getElementById('paq-tarea-overlay')?.addEventListener('click', e => {
            if (e.target === document.getElementById('paq-tarea-overlay')) cerrarTareaModal();
        });

        /* ── Rubro chips: mostrar cantidad al hacer click ── */
        document.querySelectorAll('.prov-rubro-chip').forEach(chip => {
            chip.addEventListener('click', function(e) {
                e.stopPropagation();
                const alreadyOpen = !!this.querySelector('.rubro-popover');
                document.querySelectorAll('.rubro-popover').forEach(p => p.remove());
                if (alreadyOpen) return;
                const pop = document.createElement('span');
                pop.className = 'rubro-popover';
                const n = parseInt(this.dataset.count, 10);
                pop.textContent = n + ' producto' + (n !== 1 ? 's' : '') + ' de este rubro';
                this.appendChild(pop);
                setTimeout(() => document.addEventListener('click', () => pop.remove(), { once: true }), 0);
            });
        });
    </script>
</body>
</html>
