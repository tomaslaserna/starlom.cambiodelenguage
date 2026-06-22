<?php
require_once __DIR__ . '/session_bootstrap.php';
starlim_session_start();
header('Content-Type: application/json; charset=utf-8');

$rango   = $_SESSION['rango']   ?? '';
$usuario = $_SESSION['usuario'] ?? '';

if (!$usuario) {
    echo json_encode(['ok' => false, 'msg' => 'No autenticado']); exit;
}
$allowed = ['Empleado', 'Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'];
if (!in_array($rango, $allowed, true)) {
    echo json_encode(['ok' => false, 'msg' => 'Sin permisos']); exit;
}

include 'conexion_starlim_be.php';
$empresaId = starlim_bootstrap_tenant_context($conexion);

$accion = trim($_POST['accion'] ?? '');
$id     = (int)($_POST['id']    ?? 0);

if (!$id) { echo json_encode(['ok' => false, 'msg' => 'ID inválido']); exit; }

/* ── Cargar datos de la compra ─────────────────────────────────── */
$stmt = $conexion->prepare(
    "SELECT cr.*, COALESCE(pv.nombre,'') AS prov_nombre
     FROM compras_registro cr
     LEFT JOIN proveedores pv ON pv.id = cr.id_proveedor AND pv.empresa_id = cr.empresa_id
     WHERE cr.id = ? AND cr.empresa_id = ?"
);
$stmt->bind_param('ii', $id, $empresaId);
$stmt->execute();
$cr = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$cr) { echo json_encode(['ok' => false, 'msg' => 'Compra no encontrada']); exit; }
if ($cr['estado'] !== 'recibida') {
    echo json_encode(['ok' => false, 'msg' => 'La compra debe estar en estado recibida']); exit;
}

/* ── Helpers ───────────────────────────────────────────────────── */
function enviarMensaje($cx, $de, $para, $asunto, $cuerpo, $tipo = 'normal') {
    $empresaId = function_exists('starlim_current_empresa_id') ? starlim_current_empresa_id($cx, false) : 1;
    $s = $cx->prepare("INSERT INTO mensajes (de, para, asunto, cuerpo, tipo, empresa_id) VALUES (?,?,?,?,?,?)");
    $s->bind_param('sssssi', $de, $para, $asunto, $cuerpo, $tipo, $empresaId);
    $s->execute(); $s->close();
}

function getJefes($cx) {
    $empresaId = function_exists('starlim_current_empresa_id') ? starlim_current_empresa_id($cx, false) : 1;
    $jefes = [];
    $r = $cx->query("
        SELECT u.usuario
        FROM usuarios u
        JOIN usuario_empresa ue ON ue.id_usuario = u.id
        WHERE ue.empresa_id = $empresaId
          AND ue.activo = TRUE
          AND COALESCE(ue.rango, u.rango) IN ('Jefe','Jefe1','Admin')
        ORDER BY u.usuario ASC
    ");
    if ($r) while ($row = $r->fetch_assoc()) $jefes[] = $row['usuario'];
    return $jefes;
}

function buildFallaCuerpo($empleado, $falla, $cr) {
    $prov  = $cr['prov_nombre'] ?: 'Sin proveedor';
    $fecha = $cr['fecha'] ? date('d/m/Y', strtotime($cr['fecha'])) : '—';
    $total = $cr['total'] !== null
             ? '$' . number_format((float)$cr['total'], 2, ',', '.')
             : 'Sin total';
    return "El empleado {$empleado} encontró una falla en un paquete.\n\n"
         . "Falla: {$falla}\n"
         . "Proveedor: {$prov}\n"
         . "Fecha del registro de compra: {$fecha}\n"
         . "Total: {$total}";
}

/* ── Acción: marcar revisado + actualizar stock completo ──────────── */
if ($accion === 'marcar_revisado') {
    $s = $conexion->prepare(
        "UPDATE compras_registro SET estado_paquete = 'revisado', falla_descripcion = NULL WHERE id = ? AND empresa_id = ?"
    );
    $s->bind_param('ii', $id, $empresaId); $s->execute(); $s->close();

    /* Sumar al stock la cantidad completa de cada producto del pedido */
    $prods = json_decode($_POST['productos'] ?? '[]', true);
    if (is_array($prods)) {
        foreach ($prods as $p) {
            $id_prod = (int)($p['id'] ?? 0);
            $cant    = max(0, (int)($p['cantidad'] ?? 0));
            if ($id_prod > 0 && $cant > 0)
                $conexion->query("UPDATE productos SET stock = stock + {$cant} WHERE id = {$id_prod} AND empresa_id = {$empresaId}");
        }
    }

    echo json_encode(['ok' => true]); exit;
}

/* ── Acción: reportar falla + actualizar stock parcial + avisar jefes ── */
if ($accion === 'reportar_falla') {
    $falla = trim($_POST['falla'] ?? '');
    if ($falla === '') { echo json_encode(['ok' => false, 'msg' => 'Debe describir la falla']); exit; }

    $s = $conexion->prepare(
        "UPDATE compras_registro SET estado_paquete = 'falla', falla_descripcion = ? WHERE id = ? AND empresa_id = ?"
    );
    $s->bind_param('sii', $falla, $id, $empresaId); $s->execute(); $s->close();

    /* Sumar al stock solo lo que llegó (cantidad ingresada en el stepper) */
    $prods_llego = json_decode($_POST['productos_llego'] ?? '[]', true);
    if (is_array($prods_llego)) {
        foreach ($prods_llego as $p) {
            $id_prod = (int)($p['id'] ?? 0);
            $llego   = max(0, (int)($p['llego'] ?? 0));
            if ($id_prod > 0 && $llego > 0)
                $conexion->query("UPDATE productos SET stock = stock + {$llego} WHERE id = {$id_prod} AND empresa_id = {$empresaId}");
        }
    }

    $cuerpo = buildFallaCuerpo($usuario, $falla, $cr);
    foreach (getJefes($conexion) as $jefe) {
        enviarMensaje($conexion, 'Sector de compras', $jefe, 'Falla en paquete detectada', $cuerpo);
    }

    echo json_encode(['ok' => true]); exit;
}

/* ── Acción: confirmar falla silenciosa + stock parcial (solo Jefe+) ── */
if ($accion === 'confirmar_falla') {
    if (!in_array($rango, ['Jefe', 'Jefe1', 'Admin'], true)) {
        echo json_encode(['ok' => false, 'msg' => 'Sin permisos']); exit;
    }
    $falla = trim($_POST['falla'] ?? '');
    if ($falla === '') { echo json_encode(['ok' => false, 'msg' => 'Debe describir la falla']); exit; }

    $s = $conexion->prepare(
        "UPDATE compras_registro SET estado_paquete = 'falla', falla_descripcion = ? WHERE id = ? AND empresa_id = ?"
    );
    $s->bind_param('sii', $falla, $id, $empresaId); $s->execute(); $s->close();

    /* Sumar al stock solo lo que llegó */
    $prods_llego = json_decode($_POST['productos_llego'] ?? '[]', true);
    if (is_array($prods_llego)) {
        foreach ($prods_llego as $p) {
            $id_prod = (int)($p['id'] ?? 0);
            $llego   = max(0, (int)($p['llego'] ?? 0));
            if ($id_prod > 0 && $llego > 0)
                $conexion->query("UPDATE productos SET stock = stock + {$llego} WHERE id = {$id_prod} AND empresa_id = {$empresaId}");
        }
    }

    echo json_encode(['ok' => true]); exit;
}

/* ── Acción: crear tarea desde falla (solo Jefe+) ─────────────── */
if ($accion === 'crear_tarea_falla') {
    if (!in_array($rango, ['Jefe', 'Jefe1', 'Admin'], true)) {
        echo json_encode(['ok' => false, 'msg' => 'Sin permisos']); exit;
    }

    $falla      = trim($_POST['falla']      ?? '');
    $titulo     = trim($_POST['titulo']     ?? '');
    $prioridad  = in_array($_POST['prioridad'] ?? '', ['urgente', 'alta', 'normal'])
                  ? $_POST['prioridad'] : 'normal';
    $fecha_lim  = !empty($_POST['fecha_limite']) ? $_POST['fecha_limite'] : null;
    $asignado_a = trim($_POST['asignado_a'] ?? $usuario);
    $notificar  = !empty($_POST['notificar']);

    if ($falla === '' || $titulo === '') {
        echo json_encode(['ok' => false, 'msg' => 'Faltan datos obligatorios']); exit;
    }

    $prov  = $cr['prov_nombre'] ?: 'Sin proveedor';
    $fecha = $cr['fecha'] ? date('d/m/Y', strtotime($cr['fecha'])) : '—';
    $desc  = $falla; // el cliente ya construyó el texto completo con pérdidas de productos

    /* Guardar falla en la compra */
    $s = $conexion->prepare(
        "UPDATE compras_registro SET estado_paquete = 'falla', falla_descripcion = ? WHERE id = ? AND empresa_id = ?"
    );
    $s->bind_param('sii', $falla, $id, $empresaId); $s->execute(); $s->close();

    /* Crear tarea */
    if ($asignado_a === $usuario) {
        /* Tarea personal */
        $st = $conexion->prepare(
            "INSERT INTO recordatorios (titulo, descripcion, prioridad, fecha_limite, usuario, empresa_id)
             VALUES (?,?,?,?,?,?)"
        );
        $st->bind_param('sssssi', $titulo, $desc, $prioridad, $fecha_lim, $usuario, $empresaId);
        $st->execute(); $st->close();
    } else {
        /* Tarea asignada a otro jefe */
        $st = $conexion->prepare(
            "INSERT INTO tareas_asignadas (titulo, descripcion, prioridad, fecha_limite, asignado_por, asignado_a, empresa_id)
             VALUES (?,?,?,?,?,?,?)"
        );
        $st->bind_param('ssssssi', $titulo, $desc, $prioridad, $fecha_lim, $usuario, $asignado_a, $empresaId);
        $st->execute(); $st->close();

        /* Notificar al asignado */
        $asunto_t = "Nueva tarea asignada: {$titulo}";
        $cuerpo_t = "Te asignaron una nueva tarea:\n\nTítulo: {$titulo}\nPrioridad: {$prioridad}\n\n{$desc}";
        enviarMensaje($conexion, $usuario, $asignado_a, $asunto_t, $cuerpo_t, 'tarea_asignada');
    }

    /* Sumar al stock solo lo que llegó */
    $prods_llego = json_decode($_POST['productos_llego'] ?? '[]', true);
    if (is_array($prods_llego)) {
        foreach ($prods_llego as $p) {
            $id_prod = (int)($p['id'] ?? 0);
            $llego   = max(0, (int)($p['llego'] ?? 0));
            if ($id_prod > 0 && $llego > 0)
                $conexion->query("UPDATE productos SET stock = stock + {$llego} WHERE id = {$id_prod} AND empresa_id = {$empresaId}");
        }
    }

    /* Opcionalmente notificar a todos los jefes sobre la falla */
    if ($notificar) {
        $cuerpo_f = buildFallaCuerpo($usuario, $falla, $cr);
        foreach (getJefes($conexion) as $jefe) {
            enviarMensaje($conexion, 'Sector de compras', $jefe, 'Falla en paquete detectada', $cuerpo_f);
        }
    }

    echo json_encode(['ok' => true]); exit;
}

echo json_encode(['ok' => false, 'msg' => 'Acción no reconocida']);
