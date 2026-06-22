<?php
/**
 * Circuito de aprobacion de cobros.
 *
 * Etapa 1: el operador registra datos de pago y la venta queda
 * pendiente_aprobacion.
 * Etapa 2: administracion aprueba o rechaza. Solo al aprobar se impactan
 * cuentas_corrientes y pagos_registro.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/tenant.php';

function starlim_cobros_estados_aprobacion(): array {
    return ['pendiente_aprobacion', 'en_proceso']; // en_proceso queda como legacy.
}

function starlim_cobros_estado_en_aprobacion(string $estado): bool {
    return in_array($estado, starlim_cobros_estados_aprobacion(), true);
}

function starlim_cobros_puede_aprobar($conexion, ?string $rango = null, ?string $usuario = null): bool {
    $rango = starlim_normalizar_rango($rango ?? ($_SESSION['rango'] ?? ''));
    $usuario = $usuario ?? ($_SESSION['usuario'] ?? '');
    $empresaId = starlim_current_empresa_id($conexion, false);

    if (in_array($rango, ['Jefe1', 'Admin'], true)) return true;
    if ($usuario === '') return false;

    try {
        $stmt = $conexion->prepare("
            SELECT 1
            FROM usuarios u
            LEFT JOIN app_usuario_permisos up ON up.id_usuario = u.id AND up.empresa_id = ?
            LEFT JOIN app_permisos p ON p.id = up.id_permiso
            LEFT JOIN app_usuario_roles ur ON ur.id_usuario = u.id AND ur.empresa_id = ?
            LEFT JOIN app_rol_permisos rp ON rp.id_rol = ur.id_rol
            LEFT JOIN app_permisos pr ON pr.id = rp.id_permiso
            WHERE u.usuario = ?
              AND (p.clave = 'cobranzas.aprobar' OR pr.clave = 'cobranzas.aprobar')
            LIMIT 1
        ");
        $stmt->bind_param('iis', $empresaId, $empresaId, $usuario);
        $stmt->execute();
        $ok = $stmt->get_result()->num_rows > 0;
        $stmt->close();
        return $ok;
    } catch (Throwable $e) {
        return false;
    }
}

function starlim_cobros_doc_remito(array $venta): string {
    $nro = (int)($venta['nro_remito'] ?? $venta['nro_comprobante'] ?? $venta['id'] ?? 0);
    return '#' . str_pad((string)$nro, 4, '0', STR_PAD_LEFT);
}

function starlim_cobros_asegurar_debe_venta($conexion, int $id_venta, array $venta, string $doc_remito): void {
    $empresaId = starlim_current_empresa_id($conexion, false);
    $chk = $conexion->prepare("SELECT id FROM cuentas_corrientes WHERE empresa_id = ? AND id_origen = ? AND tipo_origen = 'venta' AND debe > 0 LIMIT 1");
    $chk->bind_param('ii', $empresaId, $id_venta);
    $chk->execute();
    $existe = $chk->get_result()->num_rows > 0;
    $chk->close();
    if ($existe || (float)($venta['monto'] ?? 0) <= 0) return;

    $nombre = $venta['nombre_cliente'] ?? '';
    $desc = "Saldo pendiente - Remito {$doc_remito}";
    $debe = (float)$venta['monto'];
    $haber = 0.0;
    $fecha = date('Y-m-d');
    $stmt = $conexion->prepare("INSERT INTO cuentas_corrientes (tipo,entidad_nombre,descripcion,debe,haber,fecha,id_origen,tipo_origen,empresa_id) VALUES ('cliente',?,?,?,?,?,?,'venta',?)");
    $stmt->bind_param('ssddsii', $nombre, $desc, $debe, $haber, $fecha, $id_venta, $empresaId);
    $stmt->execute();
    $stmt->close();
}

function starlim_cobros_aprobar($conexion, int $id_venta, string $usuario): array {
    if ($id_venta <= 0) return ['ok' => false, 'error' => 'Venta invalida.'];
    $empresaId = starlim_current_empresa_id($conexion, false);

    $stmt = $conexion->prepare(
        "SELECT v.id, v.nombre_cliente, v.monto, v.nro_comprobante,
                COALESCE(v.estado_cobro,'pendiente') AS estado_cobro,
                COALESCE(v.cobro_monto_registrado,0) AS cobro_monto_registrado,
                COALESCE(v.cobro_fecha, CURRENT_DATE) AS cobro_fecha,
                COALESCE(v.cobro_metodo,'') AS cobro_metodo,
                COALESCE(v.cobro_destino,'') AS cobro_destino,
                COALESCE(v.cobro_operacion,'') AS cobro_operacion,
                COALESCE(v.cobro_notas,'') AS cobro_notas,
                COALESCE((SELECT r.nro_remito FROM remitos r WHERE r.id_venta = v.id AND r.empresa_id = v.empresa_id ORDER BY r.id LIMIT 1), v.nro_comprobante) AS nro_remito
         FROM ventas v
         WHERE v.id = ? AND v.empresa_id = ?"
    );
    $stmt->bind_param('ii', $id_venta, $empresaId);
    $stmt->execute();
    $venta = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$venta) return ['ok' => false, 'error' => 'Venta no encontrada.'];
    if (!starlim_cobros_estado_en_aprobacion($venta['estado_cobro'])) {
        return ['ok' => false, 'error' => 'El cobro no esta pendiente de aprobacion.'];
    }

    $monto_cobrado = (float)$venta['cobro_monto_registrado'];
    if ($monto_cobrado <= 0) return ['ok' => false, 'error' => 'El monto registrado es invalido.'];

    $doc_remito = starlim_cobros_doc_remito($venta);
    starlim_cobros_asegurar_debe_venta($conexion, $id_venta, $venta, $doc_remito);

    $nombre = $venta['nombre_cliente'];
    $fecha = $venta['cobro_fecha'] ?: date('Y-m-d');
    $desc = "Cobro aprobado - Remito {$doc_remito}";
    $debe_cero = 0.0;
    $haber = $monto_cobrado;

    $mov = $conexion->prepare("INSERT INTO cuentas_corrientes (tipo,entidad_nombre,descripcion,debe,haber,fecha,id_origen,tipo_origen,empresa_id) VALUES ('cliente',?,?,?,?,?,?,'venta',?)");
    $mov->bind_param('ssddsii', $nombre, $desc, $debe_cero, $haber, $fecha, $id_venta, $empresaId);
    $mov->execute();
    $mov->close();

    $detalle = trim("Metodo: {$venta['cobro_metodo']} | Cuenta destino/entrega: {$venta['cobro_destino']} | Operacion: {$venta['cobro_operacion']} | {$venta['cobro_notas']}");
    $origen = 'venta';
    $reg = $conexion->prepare("INSERT INTO pagos_registro (tipo,entidad_nombre,concepto,monto,fecha,notas,id_origen,tipo_origen,empresa_id) VALUES ('cobro',?,?,?,?,?,?,?,?)");
    $reg->bind_param('ssdssisi', $nombre, $desc, $monto_cobrado, $fecha, $detalle, $id_venta, $origen, $empresaId);
    $reg->execute();
    $reg->close();

    $tot = $conexion->prepare("SELECT SUM(haber) AS total_haber FROM cuentas_corrientes WHERE empresa_id = ? AND id_origen = ? AND tipo_origen = 'venta'");
    $tot->bind_param('ii', $empresaId, $id_venta);
    $tot->execute();
    $total_haber = (float)($tot->get_result()->fetch_assoc()['total_haber'] ?? 0);
    $tot->close();

    $nuevo_estado = $total_haber + 0.0001 >= (float)$venta['monto'] ? 'recibido' : 'pendiente';
    $upd = $conexion->prepare(
        "UPDATE ventas
         SET estado_cobro = ?,
             cobro_aprobado_por = ?,
             cobro_aprobado_at = NOW()
         WHERE id = ? AND empresa_id = ?"
    );
    $upd->bind_param('ssii', $nuevo_estado, $usuario, $id_venta, $empresaId);
    $upd->execute();
    $upd->close();

    return ['ok' => true, 'estado' => $nuevo_estado, 'monto' => $monto_cobrado];
}

function starlim_cobros_rechazar($conexion, int $id_venta, string $usuario, string $motivo = ''): array {
    if ($id_venta <= 0) return ['ok' => false, 'error' => 'Venta invalida.'];
    $empresaId = starlim_current_empresa_id($conexion, false);

    $stmt = $conexion->prepare("SELECT COALESCE(estado_cobro,'pendiente') AS estado_cobro FROM ventas WHERE id = ? AND empresa_id = ?");
    $stmt->bind_param('ii', $id_venta, $empresaId);
    $stmt->execute();
    $venta = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$venta) return ['ok' => false, 'error' => 'Venta no encontrada.'];
    if (!starlim_cobros_estado_en_aprobacion($venta['estado_cobro'])) {
        return ['ok' => false, 'error' => 'El cobro no esta pendiente de aprobacion.'];
    }

    $nota = trim($motivo) !== ''
        ? 'Cobro rechazado por ' . $usuario . ': ' . trim($motivo)
        : 'Cobro rechazado por ' . $usuario;

    $monto = 0.0;
    $vacio = '';
    $estado = 'pendiente';
    $upd = $conexion->prepare(
        "UPDATE ventas
         SET estado_cobro = ?,
             cobro_metodo = ?,
             cobro_monto_registrado = ?,
             cobro_fecha = NULL,
             cobro_destino = ?,
             cobro_operacion = ?,
             cobro_notas = ?,
             cobro_registrado_por = ?,
             cobro_registrado_at = NULL,
             cobro_aprobado_por = ?,
             cobro_aprobado_at = NULL,
             cobro_justificacion_proceso = ?,
             cobro_intento_proceso_at = NOW()
         WHERE id = ? AND empresa_id = ?"
    );
    $upd->bind_param('ssdssssssii', $estado, $vacio, $monto, $vacio, $vacio, $vacio, $vacio, $vacio, $nota, $id_venta, $empresaId);
    $upd->execute();
    $upd->close();

    return ['ok' => true, 'estado' => $estado];
}
