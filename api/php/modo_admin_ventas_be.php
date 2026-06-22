<?php
require_once __DIR__ . '/session_bootstrap.php';
/**
 * modo_admin_ventas_be.php — Backend del Modo Administrador de ventas_registradas.php.
 *
 * Solo Jefe1/Admin. La activación requiere además la contraseña del modo
 * (config_sistema → 'password_modo_admin_ventas'; se siembra con '0000' la
 * primera vez). El estado activo vive en la sesión, y toda edición queda
 * asentada en ventas_modificaciones con los valores antes/después.
 *
 * Edición de ventas con auditoría (solo Jefe1/Admin). La edición está habilitada
 * directamente para esos rangos (sin contraseña); cada cambio se asienta en
 * ventas_modificaciones con los valores antes/después.
 *
 * Acciones (POST 'accion'):
 *   obtener_venta   → datos crudos de una venta para el formulario de edición
 *   editar_venta    → aplica cambios a una venta y los registra
 *   listar_registro → últimas entradas del registro de actividad
 */
ob_start();
ini_set('display_errors', '0');

register_shutdown_function(function () {
    $err = error_get_last();
    if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        ob_end_clean();
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Error PHP: ' . $err['message'] . ' — línea ' . $err['line']], JSON_UNESCAPED_UNICODE);
    }
});

starlim_session_start();
include 'conexion_starlim_be.php';
require_once 'auth.php';
$empresaId = starlim_bootstrap_tenant_context($conexion);

header('Content-Type: application/json; charset=utf-8');

$usuario = $_SESSION['usuario'] ?? '';
$rango   = starlim_normalizar_rango($_SESSION['rango'] ?? '');
if ($usuario === '' || !in_array($rango, ['Jefe1', 'Admin'], true)) {
    ob_end_clean(); echo json_encode(['error' => 'Sin permisos.']); exit();
}

/* Campos editables: campo BD → [label, tipo] */
const VAM_CAMPOS = [
    'nro_comprobante' => ['Nro. comprobante',   'int'],
    'tipo_cbte'       => ['Tipo de comprobante','tipo_cbte'],
    'nombre_cliente'  => ['Cliente',            'str_req'],
    'dni_cliente'     => ['CUIT/DNI',           'str'],
    'fecha'           => ['Fecha',              'date'],
    'monto'           => ['Monto',              'decimal'],
    'condicion_pago'  => ['Condición de pago',  'str'],
    'estado_pedido'   => ['Estado de pedido',   'enum_pedido'],
    'seguimiento'     => ['Seguimiento',        'enum_seguimiento'],
    'vendedor'        => ['Vendedor',           'str'],
];
const VAM_ENUMS = [
    'enum_pedido'      => ['recibido', 'en_proceso', 'pendiente_entrega', 'entregado'],
    'enum_seguimiento' => ['facturada', 'no_facturada'],
    'tipo_cbte'        => ['1', '2', '3', '6', '7', '8'],
];

function vam_responder(array $data): void {
    ob_end_clean();
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit();
}

function vam_log($conexion, string $usuario, int $venta_id, string $label, string $accion, array $cambios): void {
    $empresaId = function_exists('starlim_current_empresa_id') ? starlim_current_empresa_id($conexion, false) : 1;
    $json = json_encode($cambios, JSON_UNESCAPED_UNICODE);
    $s = $conexion->prepare(
        "INSERT INTO ventas_modificaciones (empleado, venta_id, venta_label, accion, cambios, empresa_id)
         VALUES (?, ?, ?, ?, ?, ?)"
    );
    $s->bind_param('sisssi', $usuario, $venta_id, $label, $accion, $json, $empresaId);
    $s->execute(); $s->close();
}

try {
    $accion = $_POST['accion'] ?? '';

    /* ── Obtener venta para el formulario ────────────────────────────────── */
    if ($accion === 'obtener_venta') {
        $id = (int)($_POST['id_venta'] ?? 0);
        if ($id <= 0) vam_responder(['error' => 'ID inválido.']);

        $s = $conexion->prepare(
            "SELECT id, nro_comprobante, tipo_cbte, nombre_cliente, dni_cliente,
                    fecha, monto, condicion_pago,
                    COALESCE(estado_cobro,'pendiente')        AS estado_cobro,
                    COALESCE(estado_pedido,'entregado') AS estado_pedido,
                    COALESCE(seguimiento,'no_facturada')       AS seguimiento,
                    vendedor
             FROM ventas WHERE id = ? AND empresa_id = ?"
        );
        $s->bind_param('ii', $id, $empresaId);
        $s->execute();
        $venta = $s->get_result()->fetch_assoc();
        $s->close();
        if (!$venta) vam_responder(['error' => 'Venta no encontrada.']);
        vam_responder(['ok' => true, 'venta' => $venta]);
    }

    /* ── Editar venta ────────────────────────────────────────────────────── */
    if ($accion === 'editar_venta') {
        $id = (int)($_POST['id_venta'] ?? 0);
        if (array_key_exists('estado_cobro', $_POST)) {
            vam_responder(['error' => 'El estado de cobro se gestiona desde Cobros y Pagos y se aprueba en Administracion.']);
        }
        if ($id <= 0) vam_responder(['error' => 'ID inválido.']);

        $s = $conexion->prepare("SELECT * FROM ventas WHERE id = ? AND empresa_id = ?");
        $s->bind_param('ii', $id, $empresaId);
        $s->execute();
        $actual = $s->get_result()->fetch_assoc();
        $s->close();
        if (!$actual) vam_responder(['error' => 'Venta no encontrada.']);

        $sets    = [];
        $valores = [];
        $tipos   = '';
        $cambios = [];

        foreach (VAM_CAMPOS as $campo => [$label, $tipo]) {
            if (!array_key_exists($campo, $_POST)) continue;
            $raw = trim((string)$_POST[$campo]);

            // Normalizar y validar el valor nuevo según el tipo
            switch ($tipo) {
                case 'int':
                    if (!preg_match('/^\d+$/', $raw)) vam_responder(['error' => "$label: debe ser un número entero."]);
                    $nuevo = (string)(int)$raw;
                    $viejo = (string)(int)$actual[$campo];
                    $bind  = 'i'; $val = (int)$raw;
                    break;
                case 'decimal':
                    $raw = str_replace(',', '.', $raw);
                    if (!is_numeric($raw) || (float)$raw < 0) vam_responder(['error' => "$label: monto inválido."]);
                    $nuevo = number_format((float)$raw, 2, '.', '');
                    $viejo = number_format((float)$actual[$campo], 2, '.', '');
                    $bind  = 'd'; $val = (float)$raw;
                    break;
                case 'date':
                    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw)) vam_responder(['error' => "$label: fecha inválida."]);
                    $nuevo = $raw;
                    $viejo = (string)$actual[$campo];
                    $bind  = 's'; $val = $raw;
                    break;
                case 'str_req':
                    if ($raw === '') vam_responder(['error' => "$label: no puede quedar vacío."]);
                    // fall through
                case 'str':
                    if (mb_strlen($raw) > 255) vam_responder(['error' => "$label: demasiado largo."]);
                    $nuevo = $raw;
                    $viejo = (string)($actual[$campo] ?? '');
                    $bind  = 's'; $val = $raw;
                    break;
                default: // enums y tipo_cbte
                    if (!in_array($raw, VAM_ENUMS[$tipo], true)) vam_responder(['error' => "$label: valor no permitido."]);
                    $nuevo = $raw;
                    $viejo = (string)($actual[$campo] ?? '');
                    $bind  = ($tipo === 'tipo_cbte') ? 'i' : 's';
                    $val   = ($tipo === 'tipo_cbte') ? (int)$raw : $raw;
                    if ($tipo === 'tipo_cbte') $viejo = (string)(int)$viejo;
                    break;
            }

            if ($nuevo === $viejo) continue;

            $sets[]    = "$campo = ?";   // $campo sale de la whitelist VAM_CAMPOS
            $valores[] = $val;
            $tipos    .= $bind;
            $cambios[] = ['label' => $label, 'antes' => $viejo, 'despues' => $nuevo];
        }

        if (empty($sets)) vam_responder(['ok' => true, 'sin_cambios' => true]);

        $valores[] = $id;
        $valores[] = $empresaId;
        $tipos    .= 'ii';
        $s = $conexion->prepare("UPDATE ventas SET " . implode(', ', $sets) . " WHERE id = ? AND empresa_id = ?");
        $s->bind_param($tipos, ...$valores);
        if (!$s->execute()) {
            $s->close();
            vam_responder(['error' => 'No se pudo actualizar: ' . $conexion->error]);
        }
        $s->close();

        $label_venta = 'Venta #' . str_pad((int)$actual['nro_comprobante'], 8, '0', STR_PAD_LEFT)
                     . ' — ' . ($actual['nombre_cliente'] ?: 'sin cliente');
        vam_log($conexion, $usuario, $id, $label_venta, 'edicion', $cambios);

        vam_responder(['ok' => true, 'cambios' => count($cambios)]);
    }

    /* ── Registro de actividad ───────────────────────────────────────────── */
    if ($accion === 'listar_registro') {
        $r = $conexion->query(
            "SELECT id, empleado, venta_id, venta_label, accion, cambios, fecha
             FROM ventas_modificaciones
             WHERE empresa_id = $empresaId
             ORDER BY fecha DESC, id DESC
             LIMIT 200"
        );
        $registros = [];
        if ($r) while ($row = $r->fetch_assoc()) {
            $row['cambios'] = json_decode($row['cambios'], true) ?: [];
            $registros[] = $row;
        }
        vam_responder(['ok' => true, 'registros' => $registros]);
    }

    vam_responder(['error' => 'Acción desconocida.']);

} catch (Exception $e) {
    ob_end_clean();
    echo json_encode(['error' => 'Excepción: ' . $e->getMessage() . ' (línea ' . $e->getLine() . ')'], JSON_UNESCAPED_UNICODE);
}
