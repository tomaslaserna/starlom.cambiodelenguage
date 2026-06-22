<?php
require_once __DIR__ . '/../../php/session_bootstrap.php';
require_once __DIR__ . '/../../php/auth.php';
require_once __DIR__ . '/../../php/admin_permissions.php';

/**
 * Shared session and authorization guard for staff panel pages.
 *
 * Optional page contract:
 *   $PERMITIDOS = ['Empleado_2', 'Jefe', 'Jefe1', 'Admin'];
 *
 * If $PERMITIDOS is not defined, every staff role can enter.
 */

starlim_session_start();

if (!isset($_SESSION['usuario'], $_SESSION['rango'])) {
    session_destroy();
    header('Location: sign.php?expired=1');
    exit;
}

$usuario = $_SESSION['usuario'];
$rango = starlim_normalizar_rango($_SESSION['rango']);
$empresaId = isset($_SESSION['empresa_id']) && ctype_digit((string)$_SESSION['empresa_id'])
    ? (int)$_SESSION['empresa_id']
    : 1;
$empresaNombre = (string)($_SESSION['empresa_nombre'] ?? 'Starlim');

if (!starlim_es_staff($rango)) {
    header('Location: index.php?no_access=1');
    exit;
}

$PERMITIDOS = $PERMITIDOS ?? STARLIM_RANGOS_STAFF;
if (!in_array($rango, $PERMITIDOS, true)) {
    header('Location: pedidos.php?no_access=1');
    exit;
}

$canVentas = in_array($rango, ['Empleado_2', 'Jefe', 'Jefe1', 'Admin'], true);
$canBD = in_array($rango, ['Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'], true);
$canStock = in_array($rango, ['Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'], true);
$canEmpleados = in_array($rango, ['Jefe', 'Jefe1', 'Admin'], true);
$canRangos = in_array($rango, ['Jefe1', 'Admin'], true);
