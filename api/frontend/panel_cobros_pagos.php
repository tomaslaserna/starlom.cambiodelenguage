<?php
    require __DIR__ . '/partials/guard.php';

    include '../php/conexion_starlim_be.php';

    /* Esquema gestionado en supabase_migration.sql + db_fixes.sql */

    /* Carpeta legacy de comprobantes: solo fallback de desarrollo sin Storage.
       No crear acá — el disco de Vercel es read-only y el mkdir rompía los
       headers; starlim_storage_upload() la crea si realmente hace falta. */
    $upload_dir = __DIR__ . '/../uploads/comprobantes/';

    /* ── Handle POST ────────────────────────────────────────────────── */
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $accion    = $_POST['accion']    ?? '';
        $redir_tab = $_POST['redir_tab'] ?? 'cobros';

        if ($accion === 'update_cobro') {
            $id        = (int)($_POST['id'] ?? 0);
            $estados_v = ['pendiente','en_proceso','recibido','vencido','cancelado'];
            $estado    = in_array($_POST['estado'] ?? '', $estados_v) ? $_POST['estado'] : 'pendiente';
            $just      = trim($_POST['justificacion'] ?? '');
            if ($id > 0) {
                if ($estado === 'en_proceso' && $just === '') {
                    $s = $conexion->prepare("UPDATE ventas SET cobro_intento_proceso_at = NOW() WHERE id = ?");
                    $s->bind_param('i', $id); $s->execute(); $s->close();
                } elseif ($estado === 'en_proceso') {
                    $s = $conexion->prepare("UPDATE ventas SET estado_cobro = ?, cobro_justificacion_proceso = ?, cobro_intento_proceso_at = NULL WHERE id = ?");
                    $s->bind_param('ssi', $estado, $just, $id); $s->execute(); $s->close();

                    /* Auto-abrir cuenta corriente para el cliente */
                    $sv = $conexion->prepare("SELECT nombre_cliente, monto, nro_comprobante FROM ventas WHERE id = ?");
                    $sv->bind_param('i', $id); $sv->execute();
                    $vr = $sv->get_result()->fetch_assoc(); $sv->close();
                    if ($vr && (float)$vr['monto'] > 0) {
                        $chkcc = $conexion->prepare("SELECT id FROM cuentas_corrientes WHERE id_origen = ? AND tipo_origen = 'venta' AND debe > 0 LIMIT 1");
                        $chkcc->bind_param('i', $id); $chkcc->execute();
                        $cc_existe = $chkcc->get_result()->num_rows > 0; $chkcc->close();
                        if (!$cc_existe) {
                            $nf  = str_pad((int)$vr['nro_comprobante'], 8, '0', STR_PAD_LEFT);
                            $dcc = "Saldo pendiente — Factura #{$nf}";
                            $nc  = $vr['nombre_cliente'];
                            $mc  = (float)$vr['monto'];
                            $fc  = date('Y-m-d');
                            $hz  = 0.0;
                            $sc  = $conexion->prepare("INSERT INTO cuentas_corrientes (tipo,entidad_nombre,descripcion,debe,haber,fecha,id_origen,tipo_origen) VALUES ('cliente',?,?,?,?,?,?,'venta')");
                            $sc->bind_param('ssddsi', $nc, $dcc, $mc, $hz, $fc, $id);
                            $sc->execute(); $sc->close();
                        }
                    }
                } else {
                    $s = $conexion->prepare("UPDATE ventas SET estado_cobro = ?, cobro_justificacion_proceso = NULL, cobro_intento_proceso_at = NULL WHERE id = ?");
                    $s->bind_param('si', $estado, $id); $s->execute(); $s->close();
                }
            }
        }

        /* Registrar cobro parcial o completo de cliente (desde cta cte) */
        if ($accion === 'registrar_cobro_parcial') {
            $id_venta      = (int)($_POST['id_venta'] ?? 0);
            $monto_cobrado = max(0.01, (float)str_replace(',', '.', $_POST['monto'] ?? '0'));
            $fecha_cobro   = !empty($_POST['fecha']) ? $_POST['fecha'] : date('Y-m-d');
            $notas_cobro   = trim($_POST['notas'] ?? '');
            if ($id_venta > 0 && $monto_cobrado > 0) {
                $sv = $conexion->prepare("SELECT nombre_cliente, monto, nro_comprobante FROM ventas WHERE id = ?");
                $sv->bind_param('i', $id_venta); $sv->execute();
                $vr = $sv->get_result()->fetch_assoc(); $sv->close();
                if ($vr) {
                    $nc = $vr['nombre_cliente'];
                    $mt = (float)$vr['monto'];
                    $nf = str_pad((int)$vr['nro_comprobante'], 8, '0', STR_PAD_LEFT);

                    /* Asegurar que existe la entrada de debe */
                    $chkcc = $conexion->prepare("SELECT id FROM cuentas_corrientes WHERE id_origen = ? AND tipo_origen = 'venta' AND debe > 0 LIMIT 1");
                    $chkcc->bind_param('i', $id_venta); $chkcc->execute();
                    if ($chkcc->get_result()->num_rows === 0) {
                        $dcc = "Saldo pendiente — Factura #{$nf}"; $hz = 0.0; $fc = date('Y-m-d');
                        $sci = $conexion->prepare("INSERT INTO cuentas_corrientes (tipo,entidad_nombre,descripcion,debe,haber,fecha,id_origen,tipo_origen) VALUES ('cliente',?,?,?,?,?,?,'venta')");
                        $sci->bind_param('ssddsi', $nc, $dcc, $mt, $hz, $fc, $id_venta);
                        $sci->execute(); $sci->close();
                    }
                    $chkcc->close();

                    /* Insertar haber (cobro recibido) */
                    $dp = "Cobro — Factura #{$nf}"; $dz = 0.0;
                    $sh = $conexion->prepare("INSERT INTO cuentas_corrientes (tipo,entidad_nombre,descripcion,debe,haber,fecha,id_origen,tipo_origen) VALUES ('cliente',?,?,?,?,?,?,'venta')");
                    $sh->bind_param('ssddsi', $nc, $dp, $dz, $monto_cobrado, $fecha_cobro, $id_venta);
                    $sh->execute(); $sh->close();

                    /* Registrar en pagos_registro */
                    $cp  = "Cobro — Factura #{$nf}"; $tor = 'venta';
                    $spr = $conexion->prepare("INSERT INTO pagos_registro (tipo,entidad_nombre,concepto,monto,fecha,notas,id_origen,tipo_origen) VALUES ('cobro',?,?,?,?,?,?,?)");
                    $spr->bind_param('ssdssis', $nc, $cp, $monto_cobrado, $fecha_cobro, $notas_cobro, $id_venta, $tor);
                    $spr->execute(); $spr->close();

                    /* Si el total cobrado cubre el monto, marcar recibido */
                    $stot = $conexion->prepare("SELECT SUM(haber) AS th FROM cuentas_corrientes WHERE id_origen = ? AND tipo_origen = 'venta'");
                    $stot->bind_param('i', $id_venta); $stot->execute();
                    $th = (float)($stot->get_result()->fetch_assoc()['th'] ?? 0); $stot->close();
                    if ($th >= $mt) {
                        $sup = $conexion->prepare("UPDATE ventas SET estado_cobro = 'recibido' WHERE id = ?");
                        $sup->bind_param('i', $id_venta); $sup->execute(); $sup->close();
                    }
                }
            }
            $redir_tab = 'cobros';
        }

        /* Registrar pago a proveedor (completo o parcial) */
        if ($accion === 'registrar_pago_proveedor') {
            $id_compra   = (int)($_POST['id'] ?? 0);
            $monto_pagar = max(0.01, (float)str_replace(',', '.', $_POST['monto'] ?? '0'));
            $fecha_pago  = !empty($_POST['fecha']) ? $_POST['fecha'] : date('Y-m-d');
            $notas_pago  = trim($_POST['notas'] ?? '');
            if ($id_compra > 0 && $monto_pagar > 0) {
                $sc = $conexion->prepare(
                    "SELECT cr.total, COALESCE(cr.monto_pagado,0) AS monto_pagado,
                            COALESCE(pv.nombre, '') AS nombre_prov
                     FROM compras_registro cr LEFT JOIN proveedores pv ON pv.id = cr.id_proveedor
                     WHERE cr.id = ?"
                );
                $sc->bind_param('i', $id_compra); $sc->execute();
                $cr_row = $sc->get_result()->fetch_assoc(); $sc->close();
                if ($cr_row) {
                    $total_c    = (float)$cr_row['total'];
                    $ya_pagado  = (float)$cr_row['monto_pagado'];
                    $np         = $cr_row['nombre_prov'] ?: "Compra #{$id_compra}";
                    $restante   = max(0, $total_c - $ya_pagado);
                    $monto_pagar = min($monto_pagar, $restante);

                    if ($monto_pagar > 0) {
                        /* Crear entrada de debe en cta cte si no existe */
                        $gcc = $conexion->prepare("SELECT id FROM cuentas_corrientes WHERE id_origen = ? AND tipo_origen = 'compra' AND debe > 0 LIMIT 1");
                        $gcc->bind_param('i', $id_compra); $gcc->execute();
                        if ($gcc->get_result()->num_rows === 0 && $total_c > 0) {
                            $dcc = "Factura proveedor #{$id_compra}"; $hz = 0.0;
                            $scc = $conexion->prepare("INSERT INTO cuentas_corrientes (tipo,entidad_nombre,descripcion,debe,haber,fecha,id_origen,tipo_origen) VALUES ('proveedor',?,?,?,?,?,?,'compra')");
                            $scc->bind_param('ssddsi', $np, $dcc, $total_c, $hz, $fecha_pago, $id_compra);
                            $scc->execute(); $scc->close();
                        }
                        $gcc->close();

                        /* Insertar haber (pago realizado) */
                        $dp = "Pago — Compra #{$id_compra}"; $dz = 0.0;
                        $sh = $conexion->prepare("INSERT INTO cuentas_corrientes (tipo,entidad_nombre,descripcion,debe,haber,fecha,id_origen,tipo_origen) VALUES ('proveedor',?,?,?,?,?,?,'compra')");
                        $sh->bind_param('ssddsi', $np, $dp, $dz, $monto_pagar, $fecha_pago, $id_compra);
                        $sh->execute(); $sh->close();

                        /* Actualizar monto_pagado */
                        $nuevo = $ya_pagado + $monto_pagar;
                        $sup   = $conexion->prepare("UPDATE compras_registro SET monto_pagado = ? WHERE id = ?");
                        $sup->bind_param('di', $nuevo, $id_compra); $sup->execute(); $sup->close();

                        /* Si quedó saldado, marcar pagado = 1 */
                        if ($nuevo >= $total_c) {
                            $sf = $conexion->prepare("UPDATE compras_registro SET pagado = 1 WHERE id = ?");
                            $sf->bind_param('i', $id_compra); $sf->execute(); $sf->close();
                        }

                        /* Registrar en pagos_registro */
                        $cp  = "Pago proveedor — Compra #{$id_compra}"; $tor = 'compra';
                        $spr = $conexion->prepare("INSERT INTO pagos_registro (tipo,entidad_nombre,concepto,monto,fecha,notas,id_origen,tipo_origen) VALUES ('pago',?,?,?,?,?,?,?)");
                        $spr->bind_param('sssdsis', $np, $cp, $monto_pagar, $fecha_pago, $notas_pago, $id_compra, $tor);
                        $spr->execute(); $spr->close();
                    }
                }
            }
            $redir_tab = 'pagos';
        }

        if ($accion === 'add_cuenta') {
            $tipo   = in_array($_POST['tipo'] ?? '', ['cliente','proveedor']) ? $_POST['tipo'] : 'cliente';
            $nombre = trim($_POST['entidad_nombre'] ?? '');
            $desc   = trim($_POST['descripcion'] ?? '');
            $debe   = (float)str_replace(',', '.', $_POST['debe']  ?? '0');
            $haber  = (float)str_replace(',', '.', $_POST['haber'] ?? '0');
            $fecha  = !empty($_POST['fecha']) ? $_POST['fecha'] : date('Y-m-d');
            if ($nombre !== '') {
                $s = $conexion->prepare(
                    "INSERT INTO cuentas_corrientes (tipo,entidad_nombre,descripcion,debe,haber,fecha)
                     VALUES (?,?,?,?,?,?)"
                );
                $s->bind_param('sssdds', $tipo, $nombre, $desc, $debe, $haber, $fecha);
                $s->execute(); $s->close();
            }
        }

        if ($accion === 'del_cuenta') {
            $id = (int)($_POST['id'] ?? 0);
            if ($id > 0) {
                $s = $conexion->prepare("DELETE FROM cuentas_corrientes WHERE id = ?");
                $s->bind_param('i', $id); $s->execute(); $s->close();
            }
        }

        if ($accion === 'add_pago_registro') {
            $tipo    = in_array($_POST['tipo'] ?? '', ['cobro','pago']) ? $_POST['tipo'] : 'cobro';
            $entidad = trim($_POST['entidad_nombre'] ?? '');
            $concept = trim($_POST['concepto'] ?? '');
            $monto   = (float)str_replace(',', '.', $_POST['monto'] ?? '0');
            $fecha   = !empty($_POST['fecha']) ? $_POST['fecha'] : date('Y-m-d');
            $notas   = trim($_POST['notas'] ?? '');
            $comp_nombre = ''; // la columna es NOT NULL: vacío = sin comprobante

            if (!empty($_FILES['comprobante']['name']) && $_FILES['comprobante']['error'] === 0) {
                $ext_ok = ['jpg','jpeg','png','pdf','webp'];
                $ext    = strtolower(pathinfo($_FILES['comprobante']['name'], PATHINFO_EXTENSION));
                if (in_array($ext, $ext_ok)) {
                    require_once __DIR__ . '/../php/storage_supabase.php';
                    $mimes = ['jpg'=>'image/jpeg','jpeg'=>'image/jpeg','png'=>'image/png',
                              'pdf'=>'application/pdf','webp'=>'image/webp'];
                    $archivo = uniqid('comp_', true) . '.' . $ext;
                    $up = starlim_storage_upload(
                        'uploads', "comprobantes/{$archivo}", $_FILES['comprobante']['tmp_name'],
                        $mimes[$ext], $upload_dir, $archivo
                    );
                    if ($up['ok']) { $comp_nombre = $up['url']; }
                }
            }

            if ($monto > 0) {
                $s = $conexion->prepare(
                    "INSERT INTO pagos_registro (tipo,entidad_nombre,concepto,monto,fecha,comprobante_nombre,notas)
                     VALUES (?,?,?,?,?,?,?)"
                );
                $s->bind_param('sssdsss', $tipo, $entidad, $concept, $monto, $fecha, $comp_nombre, $notas);
                $s->execute(); $s->close();
            }
        }

        if ($accion === 'del_pago_registro') {
            $id = (int)($_POST['id'] ?? 0);
            if ($id > 0) {
                $r = $conexion->prepare("SELECT comprobante_nombre FROM pagos_registro WHERE id = ?");
                $r->bind_param('i', $id); $r->execute();
                $res = $r->get_result();
                $fname = null;
                if ($row = $res->fetch_assoc()) { $fname = $row['comprobante_nombre']; }
                $r->close();
                // Solo los comprobantes legacy viven en disco; los nuevos son URLs de Storage
                if ($fname && !str_starts_with($fname, 'http') && file_exists($upload_dir . $fname)) { unlink($upload_dir . $fname); }
                $s = $conexion->prepare("DELETE FROM pagos_registro WHERE id = ?");
                $s->bind_param('i', $id); $s->execute(); $s->close();
            }
        }

        header('Location: panel_cobros_pagos.php?tab=' . urlencode($redir_tab));
        exit;
    }

    /* ── Tab selection ──────────────────────────────────────────────── */
    $tab = $_GET['tab'] ?? 'cobros';
    if (!in_array($tab, ['cobros','pagos','cuentas','registro'], true)) $tab = 'cobros';

    function fmtP(float $v): string { return '$' . number_format($v, 2, ',', '.'); }

    $ventas_ok  = $conexion->query("SHOW TABLES LIKE 'ventas'")->num_rows > 0;
    $compras_ok = $conexion->query("SHOW TABLES LIKE 'compras_registro'")->num_rows > 0;

    /* ── Tab: cobros ────────────────────────────────────────────────── */
    $cobros_stats = ['pendiente' => 0.0, 'en_proceso' => 0.0, 'vencido' => 0.0];
    $cobros_list  = [];
    $buscar_c     = '';
    if ($tab === 'cobros' && $ventas_ok) {
        $r = $conexion->query("
            SELECT
                SUM(CASE WHEN COALESCE(estado_cobro,'pendiente') = 'pendiente'  THEN monto ELSE 0 END) AS pend,
                SUM(CASE WHEN COALESCE(estado_cobro,'pendiente') = 'en_proceso' THEN monto ELSE 0 END) AS proc,
                SUM(CASE WHEN COALESCE(estado_cobro,'pendiente') = 'vencido'    THEN monto ELSE 0 END) AS venc
            FROM ventas
            WHERE COALESCE(estado_cobro,'pendiente') NOT IN ('recibido','cancelado')
              AND COALESCE(estado_pedido,'entregado') = 'entregado'
        ");
        if ($r) {
            $row = $r->fetch_assoc();
            $cobros_stats = ['pendiente'=>(float)$row['pend'],'en_proceso'=>(float)$row['proc'],'vencido'=>(float)$row['venc']];
        }

        $buscar_c = trim($_GET['buscar'] ?? '');
        $tipo_labels_c = [1=>'A',2=>'ND',3=>'NC',6=>'B',7=>'ND',8=>'NC'];

        if ($buscar_c !== '') {
            $like = '%' . $buscar_c . '%';
            $s = $conexion->prepare("
                SELECT id, nro_comprobante, tipo_cbte, fecha, monto, nombre_cliente, dni_cliente,
                       COALESCE(estado_cobro,'pendiente') AS estado_cobro,
                       cobro_justificacion_proceso, cobro_intento_proceso_at
                FROM ventas
                WHERE COALESCE(estado_cobro,'pendiente') NOT IN ('recibido','cancelado')
                  AND COALESCE(estado_pedido,'entregado') = 'entregado'
                  AND nombre_cliente LIKE ?
                ORDER BY fecha DESC, id DESC
            ");
            $s->bind_param('s', $like); $s->execute();
            $res2 = $s->get_result();
            while ($row = $res2->fetch_assoc()) { $cobros_list[] = $row; }
            $s->close();
        } else {
            $r2 = $conexion->query("
                SELECT id, nro_comprobante, tipo_cbte, fecha, monto, nombre_cliente, dni_cliente,
                       COALESCE(estado_cobro,'pendiente') AS estado_cobro,
                       cobro_justificacion_proceso, cobro_intento_proceso_at
                FROM ventas
                WHERE COALESCE(estado_cobro,'pendiente') NOT IN ('recibido','cancelado')
                  AND COALESCE(estado_pedido,'entregado') = 'entregado'
                ORDER BY fecha DESC, id DESC
            ");
            if ($r2) { while ($row = $r2->fetch_assoc()) { $cobros_list[] = $row; } }
        }
        foreach ($cobros_list as &$v) {
            $v['tipo_label'] = $tipo_labels_c[(int)$v['tipo_cbte']] ?? '?';
            $v['nro_fmt']    = str_pad((int)$v['nro_comprobante'], 8, '0', STR_PAD_LEFT);
            $v['fecha_fmt']  = $v['fecha'] ? date('d/m/Y', strtotime($v['fecha'])) : '—';
        }
        unset($v);

        /* Cuánto se cobró ya en cta cte por cada venta */
        $cc_cobrado_map = [];
        if (!empty($cobros_list)) {
            $ids_v = implode(',', array_map('intval', array_column($cobros_list, 'id')));
            $rcc = $conexion->query("SELECT id_origen, SUM(haber) AS th FROM cuentas_corrientes WHERE tipo_origen='venta' AND id_origen IN ($ids_v) GROUP BY id_origen");
            if ($rcc) while ($rw = $rcc->fetch_assoc()) $cc_cobrado_map[(int)$rw['id_origen']] = (float)$rw['th'];
        }
    }

    /* ── Tab: pagos ─────────────────────────────────────────────────── */
    $pagos_total = 0.0;
    $pagos_list  = [];
    if ($tab === 'pagos' && $compras_ok) {
        $r = $conexion->query("SELECT SUM(GREATEST(COALESCE(total,0) - COALESCE(monto_pagado,0), 0)) AS t FROM compras_registro WHERE COALESCE(pagado,0) = 0 AND estado != 'cancelada'");
        if ($r) { $pagos_total = (float)($r->fetch_assoc()['t'] ?? 0); }

        $r2 = $conexion->query("
            SELECT cr.id, cr.descripcion, cr.total, cr.fecha, cr.estado,
                   COALESCE(cr.monto_pagado,0) AS monto_pagado,
                   p.nombre AS nombre_proveedor
            FROM compras_registro cr
            LEFT JOIN proveedores p ON p.id = cr.id_proveedor
            WHERE COALESCE(cr.pagado,0) = 0 AND cr.estado != 'cancelada'
            ORDER BY cr.fecha DESC, cr.id DESC
        ");
        if ($r2) { while ($row = $r2->fetch_assoc()) { $pagos_list[] = $row; } }
    }

    /* ── Tab: cuentas ───────────────────────────────────────────────── */
    $cuentas_tipo_req = $_GET['cc_tipo'] ?? ($_GET['ctipo'] ?? '');
    $cuentas_tipo   = in_array($cuentas_tipo_req, ['cliente','proveedor']) ? $cuentas_tipo_req : '';
    $cuentas_nombre = trim($_GET['cc_nombre'] ?? '');
    $cuentas_desde  = trim($_GET['desde'] ?? '');
    $cuentas_hasta  = trim($_GET['hasta'] ?? '');
    $cuentas_entidades = [];
    $cuentas_saldos = [];
    if ($tab === 'cuentas') {
        $re = $conexion->query("
            SELECT DISTINCT tipo, entidad_nombre
            FROM cuentas_corrientes
            WHERE COALESCE(entidad_nombre,'') <> ''
            ORDER BY tipo, entidad_nombre
        ");
        if ($re) while ($row = $re->fetch_assoc()) $cuentas_entidades[] = $row;

        if ($cuentas_nombre !== '') {
            $where_parts = ["entidad_nombre = '" . $conexion->real_escape_string($cuentas_nombre) . "'"];
            if ($cuentas_tipo !== '') $where_parts[] = "tipo = '" . $conexion->real_escape_string($cuentas_tipo) . "'";
            if ($cuentas_desde !== '') $where_parts[] = "fecha >= '" . $conexion->real_escape_string($cuentas_desde) . "'";
            if ($cuentas_hasta !== '') $where_parts[] = "fecha <= '" . $conexion->real_escape_string($cuentas_hasta) . "'";
            $where_c = 'WHERE ' . implode(' AND ', $where_parts);

            $r = $conexion->query("
            SELECT id, tipo, entidad_nombre, descripcion, debe, haber, fecha
            FROM cuentas_corrientes $where_c
            ORDER BY entidad_nombre ASC, fecha ASC, id ASC
            ");
            if ($r) {
                while ($row = $r->fetch_assoc()) {
                    $key = $row['tipo'] . '|' . $row['entidad_nombre'];
                    if (!isset($cuentas_saldos[$key])) {
                        $cuentas_saldos[$key] = ['tipo'=>$row['tipo'],'nombre'=>$row['entidad_nombre'],'debe'=>0.0,'haber'=>0.0,'movimientos'=>[]];
                    }
                    $cuentas_saldos[$key]['debe']  += (float)$row['debe'];
                    $cuentas_saldos[$key]['haber'] += (float)$row['haber'];
                    $saldo_run = $cuentas_saldos[$key]['haber'] - $cuentas_saldos[$key]['debe'];
                    $mov = $row;
                    $mov['saldo']     = $saldo_run;
                    $mov['fecha_fmt'] = date('d/m/Y', strtotime($row['fecha']));
                    $cuentas_saldos[$key]['movimientos'][] = $mov;
                }
            }
        }
    }

    /* ── Tab: registro ──────────────────────────────────────────────── */
    $reg_tipo_filter = in_array($_GET['rtipo'] ?? '', ['cobro','pago']) ? $_GET['rtipo'] : '';
    $registro_list   = [];
    if ($tab === 'registro') {
        $where_r = $reg_tipo_filter
            ? "WHERE tipo = '" . $conexion->real_escape_string($reg_tipo_filter) . "'"
            : '';
        $r = $conexion->query("
            SELECT id, tipo, entidad_nombre, concepto, monto, fecha, comprobante_nombre, notas
            FROM pagos_registro $where_r
            ORDER BY fecha DESC, id DESC
        ");
        if ($r) { while ($row = $r->fetch_assoc()) { $registro_list[] = $row; } }
    }
?>
<!DOCTYPE html>
<html class="cambio-pagina" lang="es">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cobros y Pagos — Star Lim</title>
    <link rel="stylesheet" href="../css/global.css">
    <link rel="stylesheet" href="../css/styleEmpleado.css">
    <link rel="stylesheet" href="../css/panel_ventas.css">
    <style>
        /* ── Tab nav ─────────────────────────────────────────────────── */
        .tab-nav { display:flex; gap:8px; margin-bottom:24px; flex-wrap:wrap; }
        .tab-btn { padding:8px 20px; border-radius:8px; border:1.5px solid #d1d5db; background:#fff; font-size:14px; font-weight:600; cursor:pointer; color:#374151; transition:all .15s; text-decoration:none; }
        .tab-btn.active,.tab-btn:hover { background:#2563eb; color:#fff; border-color:#2563eb; }
        .dark-mode .tab-btn { background:#101828; border-color:rgba(255,255,255,0.12); color:#e4e7ec; }
        .dark-mode .tab-btn.active,.dark-mode .tab-btn:hover { background:#1d4ed8; border-color:#1d4ed8; color:#fff; }

        /* ── Summary cards ───────────────────────────────────────────── */
        .summ-row { display:flex; gap:16px; margin-bottom:24px; flex-wrap:wrap; }
        .summ-card { flex:1; min-width:150px; background:#fff; border-radius:12px; padding:18px 20px; border:1px solid #e4e7ec; box-shadow:0 1px 6px rgba(0,0,0,.05); }
        .dark-mode .summ-card { background:#101828; border-color:rgba(255,255,255,0.1); }
        .summ-label { font-size:12px; color:#667085; font-weight:500; text-transform:uppercase; letter-spacing:.5px; }
        .summ-val { font-size:22px; font-weight:700; margin-top:4px; }
        .c-pend { color:#d97706; } .c-proc { color:#2563eb; } .c-venc { color:#dc2626; } .c-ok { color:#16a34a; }

        /* ── Search bar ──────────────────────────────────────────────── */
        .search-bar { display:flex; gap:8px; margin-bottom:16px; }
        .search-bar input { flex:1; padding:9px 14px; border:1.5px solid #d1d5db; border-radius:8px; font-size:14px; background:#fff; color:var(--text-color); }
        .dark-mode .search-bar input { background:#101828; border-color:rgba(255,255,255,0.12); }
        .search-bar button { padding:9px 18px; background:#2563eb; color:#fff; border:none; border-radius:8px; cursor:pointer; font-size:14px; font-weight:600; }

        /* ── Tables ──────────────────────────────────────────────────── */
        .cp-table { width:100%; border-collapse:collapse; font-size:14px; }
        .cp-table th { text-align:left; padding:10px 12px; border-bottom:2px solid #e4e7ec; font-size:12px; color:#667085; text-transform:uppercase; letter-spacing:.5px; }
        .cp-table td { padding:10px 12px; border-bottom:1px solid #f3f4f6; vertical-align:middle; }
        .cp-table tr:hover td { background:#f9fafb; }
        .dark-mode .cp-table th { border-color:rgba(255,255,255,0.1); color:#667085; }
        .dark-mode .cp-table td { border-color:rgba(255,255,255,0.1); }
        .dark-mode .cp-table tr:hover td { background:#182230; }

        /* ── Badges ──────────────────────────────────────────────────── */
        .badge { display:inline-block; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.4px; }
        .badge--pend  { background:#fef3c7; color:#92400e; }
        .badge--proc  { background:#dbeafe; color:#1e40af; }
        .badge--rec   { background:#dcfce7; color:#14532d; }
        .badge--venc  { background:#fee2e2; color:#991b1b; }
        .badge--canc  { background:#f3f4f6; color:#667085; }
        .badge--cobro { background:#dcfce7; color:#14532d; }
        .badge--pago  { background:#fef3c7; color:#92400e; }
        .dark-mode .badge--pend  { background:#451a03; color:#fbbf24; }
        .dark-mode .badge--proc  { background:#1e3a8a; color:#93c5fd; }
        .dark-mode .badge--rec   { background:#14532d; color:#86efac; }
        .dark-mode .badge--venc  { background:#7f1d1d; color:#fca5a5; }
        .dark-mode .badge--canc  { background:#1f2937; color:#9ca3af; }
        .dark-mode .badge--cobro { background:#14532d; color:#86efac; }
        .dark-mode .badge--pago  { background:#451a03; color:#fbbf24; }

        /* ── Estado select ───────────────────────────────────────────── */
        .estado-sel { padding:4px 8px; border-radius:6px; border:1.5px solid #d1d5db; font-size:13px; background:#fff; color:var(--text-color); cursor:pointer; }
        .dark-mode .estado-sel { background:#101828; border-color:rgba(255,255,255,0.12); color:#e4e7ec; }

        /* ── Justificación en proceso ───────────────────────────────── */
        .just-area { margin-top:6px; display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
        .just-input { flex:1; min-width:160px; padding:5px 8px; border:1.5px solid #2563eb; border-radius:6px; font-size:13px; background:#fff; color:var(--text-color); font-family:inherit; }
        .dark-mode .just-input { background:#0c1322; border-color:#1d4ed8; color:#e4e7ec; }
        .just-btn-ok { padding:4px 12px; background:#2563eb; color:#fff; border:none; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer; white-space:nowrap; }
        .just-btn-ok:hover { background:#1d4ed8; }
        .just-btn-cancel { padding:4px 10px; background:none; border:1.5px solid #d1d5db; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer; color:#667085; white-space:nowrap; }
        .just-btn-cancel:hover { background:#f3f4f6; color:#374151; }
        .dark-mode .just-btn-cancel { border-color:rgba(255,255,255,0.16); color:#9ca3af; }
        .dark-mode .just-btn-cancel:hover { background:rgba(255,255,255,0.08); color:#e4e7ec; }
        .just-alert { margin-top:5px; font-size:12px; color:#92400e; background:#fef3c7; border:1px solid #fcd34d; border-radius:6px; padding:5px 8px; line-height:1.4; }
        .dark-mode .just-alert { background:#451a03; color:#fbbf24; border-color:#92400e; }
        .just-display { margin-top:4px; font-size:12px; color:#1d4ed8; font-style:italic; }
        .dark-mode .just-display { color:#93c5fd; }

        /* ── Toggle form ─────────────────────────────────────────────── */
        .toggle-form-btn { padding:9px 20px; background:#2563eb; color:#fff; border:none; border-radius:8px; cursor:pointer; font-size:14px; font-weight:600; margin-bottom:16px; }
        .dark-mode .toggle-form-btn { background:#1d4ed8; }
        .cp-form { background:#f9fafb; border:1.5px solid #e4e7ec; border-radius:12px; padding:20px; margin-bottom:20px; display:none; }
        .dark-mode .cp-form { background:#101828; border-color:rgba(255,255,255,0.1); }
        .cp-form.open { display:block; }
        .form-row { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:12px; }
        .form-group { display:flex; flex-direction:column; gap:4px; flex:1; min-width:140px; }
        .form-group label { font-size:12px; font-weight:600; color:#667085; text-transform:uppercase; }
        .form-group input,.form-group select,.form-group textarea { padding:8px 12px; border:1.5px solid #d1d5db; border-radius:8px; font-size:14px; background:#fff; color:var(--text-color); font-family:inherit; }
        .dark-mode .form-group input,.dark-mode .form-group select,.dark-mode .form-group textarea { background:#0c1322; border-color:rgba(255,255,255,0.12); color:#e4e7ec; }
        .form-group textarea { resize:vertical; min-height:60px; }
        .btn-submit { padding:9px 22px; background:#16a34a; color:#fff; border:none; border-radius:8px; cursor:pointer; font-size:14px; font-weight:600; }
        .btn-del { padding:4px 10px; background:none; border:none; color:#dc2626; cursor:pointer; font-size:16px; font-weight:700; }
        .btn-del:hover { color:#991b1b; }
        .btn-pago { padding:5px 14px; background:#16a34a; color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600; }
        .btn-pago:hover { background:#15803d; }

        /* ── Cuentas corrientes ──────────────────────────────────────── */
        .cuenta-group { border:1.5px solid #e4e7ec; border-radius:12px; overflow:hidden; margin-bottom:16px; }
        .dark-mode .cuenta-group { border-color:rgba(255,255,255,0.1); }
        .cuenta-header { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; background:#f9fafb; border-bottom:1px solid #e4e7ec; flex-wrap:wrap; gap:8px; }
        .dark-mode .cuenta-header { background:#182230; border-color:rgba(255,255,255,0.1); }
        .cuenta-nombre { font-weight:700; font-size:15px; }
        .cuenta-saldo { font-size:14px; font-weight:700; }
        .cuenta-saldo.positivo { color:#16a34a; } .cuenta-saldo.negativo { color:#dc2626; }
        .tipo-chip { font-size:11px; font-weight:600; padding:2px 8px; border-radius:10px; margin-left:8px; }
        .tipo-chip.cliente   { background:#dbeafe; color:#1e40af; }
        .tipo-chip.proveedor { background:#fef3c7; color:#92400e; }
        .dark-mode .tipo-chip.cliente   { background:#1e3a8a; color:#93c5fd; }
        .dark-mode .tipo-chip.proveedor { background:#451a03; color:#fbbf24; }

        /* ── Filter pills ────────────────────────────────────────────── */
        .filter-pills { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        .filter-pill { padding:5px 14px; border-radius:20px; border:1.5px solid #d1d5db; background:#fff; font-size:13px; font-weight:500; text-decoration:none; color:#374151; transition:all .15s; }
        .filter-pill.active,.filter-pill:hover { background:#2563eb; color:#fff; border-color:#2563eb; }
        .dark-mode .filter-pill { background:#101828; border-color:rgba(255,255,255,0.12); color:#e4e7ec; }
        .dark-mode .filter-pill.active,.dark-mode .filter-pill:hover { background:#1d4ed8; border-color:#1d4ed8; color:#fff; }

        /* ── Misc ────────────────────────────────────────────────────── */
        .comp-link { color:#2563eb; text-decoration:none; font-size:13px; }
        .comp-link:hover { text-decoration:underline; }
        .dark-mode .comp-link { color:#60a5fa; }
        .cp-empty { text-align:center; padding:36px; color:#9ca3af; font-style:italic; }

        /* ── Pago inline forms ──────────────────────────────────────── */
        .pago-inline { margin-top:7px; padding:10px 12px; background:rgba(0,85,204,.05); border:1px solid rgba(0,85,204,.15); border-radius:8px; display:none; }
        .dark-mode .pago-inline { background:rgba(0,85,204,.08); border-color:rgba(0,85,204,.25); }
        .pago-inline.open { display:block; }
        .pago-inline-row { display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-top:6px; }
        .pago-inline input[type=number],.pago-inline input[type=date],.pago-inline input[type=text] { padding:5px 8px; border:1.5px solid #d1d5db; border-radius:6px; font-size:13px; background:#fff; color:var(--text-color); font-family:inherit; }
        .dark-mode .pago-inline input { background:#0c1322; border-color:rgba(255,255,255,0.12); color:#e4e7ec; }
        .pago-inline input:focus { border-color:#2563eb; outline:none; }
        .pago-restante { font-size:12px; font-weight:600; color:#2563eb; }
        .dark-mode .pago-restante { color:#60a5fa; }
        .btn-pago-toggle { padding:4px 12px; background:rgba(0,85,204,.1); color:#2563eb; border:1px solid rgba(0,85,204,.25); border-radius:6px; cursor:pointer; font-size:12px; font-weight:600; font-family:inherit; white-space:nowrap; }
        .btn-pago-toggle:hover { background:rgba(0,85,204,.18); }
        .dark-mode .btn-pago-toggle { color:#60a5fa; border-color:rgba(77,159,255,.3); }
        .btn-pdf { padding:4px 10px; background:rgba(128,128,128,.08); color:inherit; border:1px solid rgba(128,128,128,.2); border-radius:6px; font-size:11px; font-weight:600; text-decoration:none; white-space:nowrap; }
        .btn-pdf:hover { background:rgba(128,128,128,.18); }
        .tab-toolbar { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; flex-wrap:wrap; gap:12px; }
    </style>
    <link rel="stylesheet" href="../css/theme.css">
</head>
<body>

    <?php $NAV_ACTIVA = 'cobros'; include __DIR__ . '/partials/nav.php'; ?>

    <main class="dash-main">

        <h1 class="dash-hello">Cobros y Pagos</h1>

        <!-- Tab navigation -->
        <nav class="tab-nav">
            <a href="?tab=cobros"   class="tab-btn <?= $tab==='cobros'   ? 'active' : '' ?>">Cobros Pendientes</a>
            <a href="?tab=pagos"    class="tab-btn <?= $tab==='pagos'    ? 'active' : '' ?>">Pagos a Proveedores</a>
            <a href="?tab=cuentas"  class="tab-btn <?= $tab==='cuentas'  ? 'active' : '' ?>">Cuentas Corrientes</a>
            <a href="?tab=registro" class="tab-btn <?= $tab==='registro' ? 'active' : '' ?>">Registro de Pagos</a>
        </nav>

        <?php /* ════════════════════════════════════════════════════════
               TAB 1 — COBROS PENDIENTES DE CLIENTES
               ════════════════════════════════════════════════════════ */ ?>
        <?php if ($tab === 'cobros'): ?>

            <div class="summ-row">
                <div class="summ-card">
                    <div class="summ-label">Pendiente</div>
                    <div class="summ-val c-pend"><?= fmtP($cobros_stats['pendiente']) ?></div>
                </div>
                <div class="summ-card">
                    <div class="summ-label">En proceso</div>
                    <div class="summ-val c-proc"><?= fmtP($cobros_stats['en_proceso']) ?></div>
                </div>
                <div class="summ-card">
                    <div class="summ-label">Vencido</div>
                    <div class="summ-val c-venc"><?= fmtP($cobros_stats['vencido']) ?></div>
                </div>
            </div>

            <form class="search-bar" method="GET">
                <input type="hidden" name="tab" value="cobros">
                <input type="text" name="buscar" placeholder="Buscar por cliente..." value="<?= htmlspecialchars($buscar_c) ?>">
                <button type="submit">Buscar</button>
                <?php if ($buscar_c !== ''): ?>
                    <a href="?tab=cobros" class="tab-btn">Limpiar</a>
                <?php endif; ?>
            </form>

            <?php if (!$ventas_ok): ?>
                <div class="cp-empty">La tabla de ventas no existe aún.</div>
            <?php elseif (empty($cobros_list)): ?>
                <div class="cp-empty">No hay cobros pendientes. ¡Todo al día!</div>
            <?php else: ?>
            <section class="dash-panel" style="overflow-x:auto;">
                <table class="cp-table">
                    <thead>
                        <tr>
                            <th>Factura</th>
                            <th>Cliente</th>
                            <th>DNI</th>
                            <th>Fecha</th>
                            <th>Monto</th>
                            <th>Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($cobros_list as $v): ?>
                        <tr>
                            <td><?= htmlspecialchars($v['tipo_label']) ?>-<?= htmlspecialchars($v['nro_fmt']) ?></td>
                            <td><?= htmlspecialchars($v['nombre_cliente'] ?? '—') ?></td>
                            <td><?= htmlspecialchars($v['dni_cliente'] ?? '—') ?></td>
                            <td><?= htmlspecialchars($v['fecha_fmt']) ?></td>
                            <td><strong><?= fmtP((float)$v['monto']) ?></strong></td>
                            <td>
                                <form method="POST" id="form-cobro-<?= (int)$v['id'] ?>">
                                    <input type="hidden" name="accion"        value="update_cobro">
                                    <input type="hidden" name="id"            value="<?= (int)$v['id'] ?>">
                                    <input type="hidden" name="redir_tab"     value="cobros">
                                    <input type="hidden" name="justificacion" id="just-val-<?= (int)$v['id'] ?>" value="">
                                    <select name="estado" class="estado-sel"
                                            data-id="<?= (int)$v['id'] ?>"
                                            data-prev="<?= htmlspecialchars($v['estado_cobro']) ?>"
                                            onchange="onEstadoChange(this)">
                                        <?php foreach (['pendiente'=>'Pendiente','en_proceso'=>'En proceso','recibido'=>'Recibido','vencido'=>'Vencido','cancelado'=>'Cancelado'] as $val=>$lbl): ?>
                                            <option value="<?= $val ?>" <?= $v['estado_cobro']===$val ? 'selected' : '' ?>><?= $lbl ?></option>
                                        <?php endforeach; ?>
                                    </select>
                                </form>
                                <div id="just-area-<?= (int)$v['id'] ?>" class="just-area" style="display:none;">
                                    <input type="text" id="just-input-<?= (int)$v['id'] ?>"
                                           class="just-input"
                                           placeholder="Razón por la que está en proceso..."
                                           onkeydown="if(event.key==='Enter'){event.preventDefault();confirmEnProceso(<?= (int)$v['id'] ?>)}">
                                    <button onclick="confirmEnProceso(<?= (int)$v['id'] ?>)" class="just-btn-ok">Confirmar</button>
                                    <button onclick="cancelEnProceso(<?= (int)$v['id'] ?>)"  class="just-btn-cancel">Cancelar</button>
                                </div>
                                <?php if (!empty($v['cobro_intento_proceso_at'])): ?>
                                    <div class="just-alert">Se intentó el <?= date('d/m/Y \a \l\a\s H:i', strtotime($v['cobro_intento_proceso_at'])) ?> poner "En proceso" sin una justificación.</div>
                                <?php endif; ?>
                                <?php if ($v['estado_cobro'] === 'en_proceso' && !empty($v['cobro_justificacion_proceso'])): ?>
                                    <div class="just-display">Justif.: <?= htmlspecialchars($v['cobro_justificacion_proceso']) ?></div>
                                <?php endif; ?>
                                <?php if ($v['estado_cobro'] === 'en_proceso'):
                                    $cobrado  = $cc_cobrado_map[(int)$v['id']] ?? 0.0;
                                    $restante = max(0, (float)$v['monto'] - $cobrado);
                                ?>
                                    <div style="margin-top:5px; font-size:12px;">
                                        <span style="opacity:.6;">Cobrado:</span> <strong><?= fmtP($cobrado) ?></strong>
                                        &nbsp;·&nbsp;
                                        <span class="pago-restante">Restante: <?= fmtP($restante) ?></span>
                                    </div>
                                    <button type="button" class="btn-pago-toggle" style="margin-top:5px;"
                                            onclick="togglePagoForm('cobro-form-<?= (int)$v['id'] ?>', this)">
                                        Registrar cobro
                                    </button>
                                    <div class="pago-inline" id="cobro-form-<?= (int)$v['id'] ?>">
                                        <form method="POST">
                                            <input type="hidden" name="accion"    value="registrar_cobro_parcial">
                                            <input type="hidden" name="redir_tab" value="cobros">
                                            <input type="hidden" name="id_venta"  value="<?= (int)$v['id'] ?>">
                                            <div class="pago-inline-row">
                                                <input type="number" name="monto" min="0.01" step="0.01"
                                                       max="<?= $restante ?>" value="<?= $restante ?>"
                                                       placeholder="Monto" style="width:110px;" required>
                                                <input type="date" name="fecha" value="<?= date('Y-m-d') ?>" style="width:130px;" required>
                                                <input type="text"  name="notas" placeholder="Notas..." style="width:140px;">
                                                <button type="submit" class="just-btn-ok">Guardar</button>
                                            </div>
                                        </form>
                                    </div>
                                <?php endif; ?>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </section>
            <?php endif; ?>

        <?php /* ════════════════════════════════════════════════════════
               TAB 2 — PAGOS PENDIENTES A PROVEEDORES
               ════════════════════════════════════════════════════════ */ ?>
        <?php elseif ($tab === 'pagos'): ?>

            <div class="summ-row">
                <div class="summ-card">
                    <div class="summ-label">Total sin pagar</div>
                    <div class="summ-val c-venc"><?= fmtP($pagos_total) ?></div>
                </div>
                <div class="summ-card">
                    <div class="summ-label">Compras pendientes</div>
                    <div class="summ-val"><?= count($pagos_list) ?></div>
                </div>
            </div>

            <?php if (!$compras_ok): ?>
                <div class="cp-empty">La tabla de compras no existe aún.</div>
            <?php elseif (empty($pagos_list)): ?>
                <div class="cp-empty">No hay pagos pendientes a proveedores.</div>
            <?php else: ?>
            <section class="dash-panel" style="overflow-x:auto;">
                <table class="cp-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Proveedor</th>
                            <th>Descripción</th>
                            <th>Total</th>
                            <th>Pagado</th>
                            <th>Restante</th>
                            <th>Fecha</th>
                            <th>Estado entrega</th>
                            <th>Pago</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php
                        $est_badge = ['pendiente'=>'badge--pend','en_camino'=>'badge--proc','recibida'=>'badge--rec','cancelada'=>'badge--canc'];
                        $est_label = ['pendiente'=>'Pendiente','en_camino'=>'En camino','recibida'=>'Recibida','cancelada'=>'Cancelada'];
                        foreach ($pagos_list as $p):
                            $est = $p['estado'] ?? 'pendiente';
                        ?>
                        <?php
                            $total_p    = (float)($p['total'] ?? 0);
                            $pagado_p   = (float)($p['monto_pagado'] ?? 0);
                            $restante_p = max(0, $total_p - $pagado_p);
                        ?>
                        <tr>
                            <td>#<?= (int)$p['id'] ?></td>
                            <td><?= htmlspecialchars($p['nombre_proveedor'] ?? '—') ?></td>
                            <td style="max-width:180px;"><?= htmlspecialchars(mb_strimwidth($p['descripcion'] ?? '', 0, 70, '…')) ?></td>
                            <td><strong><?= $total_p > 0 ? fmtP($total_p) : '—' ?></strong></td>
                            <td><?= $pagado_p > 0 ? fmtP($pagado_p) : '—' ?></td>
                            <td><strong class="pago-restante"><?= $restante_p > 0 ? fmtP($restante_p) : '—' ?></strong></td>
                            <td><?= $p['fecha'] ? date('d/m/Y', strtotime($p['fecha'])) : '—' ?></td>
                            <td><span class="badge <?= $est_badge[$est] ?? 'badge--canc' ?>"><?= $est_label[$est] ?? $est ?></span></td>
                            <td>
                                <button type="button" class="btn-pago-toggle"
                                        onclick="togglePagoForm('pago-form-<?= (int)$p['id'] ?>', this)">
                                    Pagar
                                </button>
                                <div class="pago-inline" id="pago-form-<?= (int)$p['id'] ?>">
                                    <form method="POST">
                                        <input type="hidden" name="accion"    value="registrar_pago_proveedor">
                                        <input type="hidden" name="id"        value="<?= (int)$p['id'] ?>">
                                        <input type="hidden" name="redir_tab" value="pagos">
                                        <div class="pago-inline-row">
                                            <input type="number" name="monto" min="0.01" step="0.01"
                                                   max="<?= $restante_p ?>" value="<?= $restante_p ?>"
                                                   placeholder="Monto" style="width:110px;" required>
                                            <input type="date" name="fecha" value="<?= date('Y-m-d') ?>" style="width:130px;" required>
                                            <input type="text" name="notas" placeholder="Notas..." style="width:130px;">
                                            <button type="submit" class="btn-pago">Confirmar</button>
                                        </div>
                                    </form>
                                </div>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </section>
            <?php endif; ?>

        <?php /* ════════════════════════════════════════════════════════
               TAB 3 — CUENTAS CORRIENTES
               ════════════════════════════════════════════════════════ */ ?>
        <?php elseif ($tab === 'cuentas'): ?>

            <div class="tab-toolbar">
                <button class="toggle-form-btn" id="btn-add-cuenta">+ Nuevo movimiento</button>
            </div>

            <section class="dash-panel" style="margin-bottom:16px;">
                <h2 style="margin:0 0 12px;font-size:16px;">Solicitar cuenta corriente</h2>
                <form method="GET">
                    <input type="hidden" name="tab" value="cuentas">
                    <div class="form-row">
                        <div class="form-group">
                            <label>Tipo</label>
                            <select name="cc_tipo">
                                <option value="">Cliente o proveedor</option>
                                <option value="cliente" <?= $cuentas_tipo==='cliente' ? 'selected' : '' ?>>Cliente</option>
                                <option value="proveedor" <?= $cuentas_tipo==='proveedor' ? 'selected' : '' ?>>Proveedor</option>
                            </select>
                        </div>
                        <div class="form-group" style="flex:2;">
                            <label>Cliente / proveedor *</label>
                            <input type="text" name="cc_nombre" list="cc-entidades" value="<?= htmlspecialchars($cuentas_nombre) ?>" required placeholder="Escribí para buscar">
                            <datalist id="cc-entidades">
                                <?php foreach ($cuentas_entidades as $ent): ?>
                                    <option value="<?= htmlspecialchars($ent['entidad_nombre'], ENT_QUOTES) ?>"><?= htmlspecialchars($ent['tipo']) ?></option>
                                <?php endforeach; ?>
                            </datalist>
                        </div>
                        <div class="form-group">
                            <label>Desde</label>
                            <input type="date" name="desde" value="<?= htmlspecialchars($cuentas_desde) ?>">
                        </div>
                        <div class="form-group">
                            <label>Hasta</label>
                            <input type="date" name="hasta" value="<?= htmlspecialchars($cuentas_hasta) ?>">
                        </div>
                    </div>
                    <button type="submit" class="btn-submit">Generar cuenta</button>
                </form>
            </section>

            <div class="cp-form" id="form-add-cuenta">
                <form method="POST">
                    <input type="hidden" name="accion"    value="add_cuenta">
                    <input type="hidden" name="redir_tab" value="cuentas">
                    <div class="form-row">
                        <div class="form-group">
                            <label>Tipo *</label>
                            <select name="tipo" required>
                                <option value="cliente">Cliente</option>
                                <option value="proveedor">Proveedor</option>
                            </select>
                        </div>
                        <div class="form-group" style="flex:2;">
                            <label>Nombre entidad *</label>
                            <input type="text" name="entidad_nombre" required placeholder="Nombre del cliente o proveedor">
                        </div>
                        <div class="form-group">
                            <label>Fecha *</label>
                            <input type="date" name="fecha" required value="<?= date('Y-m-d') ?>">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group" style="flex:3;">
                            <label>Descripción</label>
                            <input type="text" name="descripcion" placeholder="Concepto del movimiento">
                        </div>
                        <div class="form-group">
                            <label>Debe ($)</label>
                            <input type="number" name="debe" min="0" step="0.01" value="0">
                        </div>
                        <div class="form-group">
                            <label>Haber ($)</label>
                            <input type="number" name="haber" min="0" step="0.01" value="0">
                        </div>
                    </div>
                    <button type="submit" class="btn-submit">Guardar movimiento</button>
                </form>
            </div>

            <?php if ($cuentas_nombre === ''): ?>
                <div class="cp-empty">Solicitá una cuenta corriente por cliente/proveedor y rango de fechas.</div>
            <?php elseif (empty($cuentas_saldos)): ?>
                <div class="cp-empty">No hay movimientos para esa solicitud.</div>
            <?php else: ?>
                <?php foreach ($cuentas_saldos as $gc):
                    $saldo_final = $gc['haber'] - $gc['debe'];
                    $saldo_clase = $saldo_final >= 0 ? 'positivo' : 'negativo';
                    $saldo_txt   = ($saldo_final >= 0 ? 'Saldo a favor: ' : 'Deuda: ') . fmtP(abs($saldo_final));
                    $cc_pdf_qs = http_build_query([
                        'nombre' => $gc['nombre'],
                        'tipo'   => $gc['tipo'],
                        'desde'  => $cuentas_desde,
                        'hasta'  => $cuentas_hasta,
                    ]);
                    $cc_msg = rawurlencode("Cuenta corriente Star Lim - {$gc['nombre']} - {$saldo_txt}");
                ?>
                <div class="cuenta-group">
                    <div class="cuenta-header">
                        <div>
                            <span class="cuenta-nombre"><?= htmlspecialchars($gc['nombre']) ?></span>
                            <span class="tipo-chip <?= $gc['tipo'] ?>"><?= ucfirst($gc['tipo']) ?></span>
                        </div>
                        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                            <span class="cuenta-saldo <?= $saldo_clase ?>"><?= $saldo_txt ?></span>
                            <a class="btn-pdf" href="../php/generar_pdf_cuenta_corriente.php?<?= htmlspecialchars($cc_pdf_qs) ?>" target="_blank">PDF</a>
                            <a class="btn-pdf" href="../php/generar_pdf_cuenta_corriente.php?<?= htmlspecialchars($cc_pdf_qs) ?>&download=1" target="_blank">Descargar</a>
                            <a class="btn-pdf" href="https://wa.me/?text=<?= $cc_msg ?>" target="_blank">WhatsApp</a>
                            <a class="btn-pdf" href="mailto:?subject=Cuenta corriente Star Lim&body=<?= $cc_msg ?>">Mail</a>
                        </div>
                    </div>
                    <div style="overflow-x:auto;">
                        <table class="cp-table">
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Descripción</th>
                                    <th>Debe</th>
                                    <th>Haber</th>
                                    <th>Saldo</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($gc['movimientos'] as $mov): ?>
                                <tr>
                                    <td><?= htmlspecialchars($mov['fecha_fmt']) ?></td>
                                    <td><?= htmlspecialchars($mov['descripcion'] ?? '—') ?></td>
                                    <td><?= (float)$mov['debe']  > 0 ? fmtP((float)$mov['debe'])  : '—' ?></td>
                                    <td><?= (float)$mov['haber'] > 0 ? fmtP((float)$mov['haber']) : '—' ?></td>
                                    <td style="font-weight:600;color:<?= $mov['saldo'] >= 0 ? '#16a34a' : '#dc2626' ?>"><?= fmtP($mov['saldo']) ?></td>
                                    <td>
                                        <form method="POST" style="display:inline;">
                                            <input type="hidden" name="accion"    value="del_cuenta">
                                            <input type="hidden" name="id"        value="<?= (int)$mov['id'] ?>">
                                            <input type="hidden" name="redir_tab" value="cuentas">
                                            <button type="submit" class="btn-del" onclick="return confirm('¿Eliminar este movimiento?')"></button>
                                        </form>
                                    </td>
                                </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    </div>
                </div>
                <?php endforeach; ?>
            <?php endif; ?>

        <?php /* ════════════════════════════════════════════════════════
               TAB 4 — REGISTRO DE PAGOS (CON COMPROBANTE)
               ════════════════════════════════════════════════════════ */ ?>
        <?php elseif ($tab === 'registro'): ?>

            <div class="tab-toolbar">
                <div class="filter-pills">
                    <span style="font-size:13px;color:#667085;">Filtrar:</span>
                    <a href="?tab=registro"              class="filter-pill <?= $reg_tipo_filter===''      ? 'active' : '' ?>">Todos</a>
                    <a href="?tab=registro&rtipo=cobro"  class="filter-pill <?= $reg_tipo_filter==='cobro' ? 'active' : '' ?>">Cobros</a>
                    <a href="?tab=registro&rtipo=pago"   class="filter-pill <?= $reg_tipo_filter==='pago'  ? 'active' : '' ?>">Pagos</a>
                </div>
                <button class="toggle-form-btn" id="btn-add-reg">+ Registrar pago / cobro</button>
            </div>

            <div class="cp-form" id="form-add-reg">
                <form method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="accion"    value="add_pago_registro">
                    <input type="hidden" name="redir_tab" value="registro">
                    <div class="form-row">
                        <div class="form-group">
                            <label>Tipo *</label>
                            <select name="tipo" required>
                                <option value="cobro">Cobro (de cliente)</option>
                                <option value="pago">Pago (a proveedor)</option>
                            </select>
                        </div>
                        <div class="form-group" style="flex:2;">
                            <label>Entidad</label>
                            <input type="text" name="entidad_nombre" placeholder="Cliente o proveedor">
                        </div>
                        <div class="form-group">
                            <label>Fecha *</label>
                            <input type="date" name="fecha" required value="<?= date('Y-m-d') ?>">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group" style="flex:2;">
                            <label>Concepto</label>
                            <input type="text" name="concepto" placeholder="Descripción del cobro/pago">
                        </div>
                        <div class="form-group">
                            <label>Monto ($) *</label>
                            <input type="number" name="monto" min="0.01" step="0.01" required placeholder="0.00">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group" style="flex:2;">
                            <label>Comprobante (JPG / PNG / PDF)</label>
                            <input type="file" name="comprobante" accept=".jpg,.jpeg,.png,.pdf,.webp">
                        </div>
                        <div class="form-group" style="flex:2;">
                            <label>Notas</label>
                            <textarea name="notas" placeholder="Observaciones adicionales"></textarea>
                        </div>
                    </div>
                    <button type="submit" class="btn-submit">Guardar</button>
                </form>
            </div>

            <?php if (empty($registro_list)): ?>
                <div class="cp-empty">No hay pagos registrados. Registrá el primero arriba.</div>
            <?php else: ?>
            <section class="dash-panel" style="overflow-x:auto;">
                <table class="cp-table">
                    <thead>
                        <tr>
                            <th>Tipo</th>
                            <th>Entidad</th>
                            <th>Concepto</th>
                            <th>Monto</th>
                            <th>Fecha</th>
                            <th>Comprobante</th>
                            <th>Notas</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($registro_list as $reg): ?>
                        <tr>
                            <td>
                                <span class="badge <?= $reg['tipo']==='cobro' ? 'badge--cobro' : 'badge--pago' ?>">
                                    <?= $reg['tipo']==='cobro' ? 'Cobro' : 'Pago' ?>
                                </span>
                            </td>
                            <td><?= htmlspecialchars($reg['entidad_nombre'] ?? '—') ?></td>
                            <td style="max-width:200px;"><?= htmlspecialchars(mb_strimwidth($reg['concepto'] ?? '', 0, 60, '…')) ?></td>
                            <td><strong><?= fmtP((float)$reg['monto']) ?></strong></td>
                            <td><?= $reg['fecha'] ? date('d/m/Y', strtotime($reg['fecha'])) : '—' ?></td>
                            <td>
                                <?php if (!empty($reg['comprobante_nombre'])): ?>
                                    <a href="<?= htmlspecialchars(str_starts_with($reg['comprobante_nombre'], 'http') ? $reg['comprobante_nombre'] : '../uploads/comprobantes/' . rawurlencode($reg['comprobante_nombre'])) ?>" target="_blank" class="comp-link">Ver comprobante</a>
                                <?php else: ?>
                                    <span style="color:#9ca3af;font-size:13px;">—</span>
                                <?php endif; ?>
                            </td>
                            <td style="max-width:160px;font-size:13px;color:#667085;"><?= htmlspecialchars(mb_strimwidth($reg['notas'] ?? '', 0, 40, '…')) ?></td>
                            <td style="white-space:nowrap;">
                                <a class="btn-pdf" style="margin-right:4px;"
                                   href="../php/generar_pdf_registro_pago.php?id=<?= (int)$reg['id'] ?>"
                                   target="_blank">PDF</a>
                                <form method="POST" style="display:inline;">
                                    <input type="hidden" name="accion"    value="del_pago_registro">
                                    <input type="hidden" name="id"        value="<?= (int)$reg['id'] ?>">
                                    <input type="hidden" name="redir_tab" value="registro">
                                    <button type="submit" class="btn-del" onclick="return confirm('¿Eliminar este registro y su comprobante?')"></button>
                                </form>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </section>
            <?php endif; ?>

        <?php endif; ?>

    </main>

    <script>
        function bindToggle(btnId, formId) {
            const btn  = document.getElementById(btnId);
            const form = document.getElementById(formId);
            if (btn && form) btn.addEventListener('click', () => form.classList.toggle('open'));
        }
        bindToggle('btn-add-cuenta', 'form-add-cuenta');
        bindToggle('btn-add-reg',    'form-add-reg');

        /* ── Toggle formulario inline de pago ───────────────────────── */
        function togglePagoForm(id, btn) {
            const el = document.getElementById(id);
            if (!el) return;
            const open = el.classList.toggle('open');
            btn.textContent = open ? 'Cerrar' : (btn.textContent.includes('cobro') ? 'Registrar cobro' : 'Pagar');
        }

        /* ── Cobros: justificación "En proceso" ─────────────────────── */
        function onEstadoChange(sel) {
            const id = sel.dataset.id;
            if (sel.value === 'en_proceso') {
                document.getElementById('just-area-' + id).style.display = 'flex';
                document.getElementById('just-input-' + id).focus();
            } else {
                sel.dataset.prev = sel.value;
                document.getElementById('just-val-'  + id).value = '';
                document.getElementById('just-area-' + id).style.display = 'none';
                document.getElementById('form-cobro-' + id).submit();
            }
        }

        function confirmEnProceso(id) {
            const input = document.getElementById('just-input-' + id);
            document.getElementById('just-val-'  + id).value = input.value.trim();
            document.getElementById('just-area-' + id).style.display = 'none';
            document.getElementById('form-cobro-' + id).submit();
        }

        function cancelEnProceso(id) {
            const sel = document.querySelector('[data-id="' + id + '"]');
            sel.value = sel.dataset.prev;
            document.getElementById('just-area-'  + id).style.display = 'none';
            document.getElementById('just-input-' + id).value = '';
        }
    </script>
    <script src="../js/global.js"></script>
</body>
</html>
