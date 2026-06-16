<?php
/**
 * guard.php — Guardia de sesión compartida de las páginas del panel.
 *
 * Uso (primeras líneas de cada página):
 *
 *   $PERMITIDOS = ['Empleado_2', 'Jefe', 'Jefe1', 'Admin'];   // opcional
 *   require __DIR__ . '/partials/guard.php';
 *
 * Si no se define $PERMITIDOS, permite a todo el staff.
 *
 * Deja definidos para la página y la nav:
 *   $usuario, $rango (normalizado),
 *   $canVentas, $canBD, $canStock, $canEmpleados, $canRangos
 *
 * Comportamiento ante falta de acceso:
 *   - sin sesión        → sign.php
 *   - staff sin permiso → panel_empleados.php (sin cerrar la sesión)
 *   - cliente (tienda)  → index.php (sin cerrar la sesión)
 */

require_once __DIR__ . '/../../php/auth.php';

if (session_status() === PHP_SESSION_NONE) session_start();

if (!isset($_SESSION['usuario'], $_SESSION['rango'])) {
    session_destroy();
    header('Location: sign.php?expired=1');
    exit;
}

$usuario = $_SESSION['usuario'];
$rango   = starlim_normalizar_rango($_SESSION['rango']);

if (!starlim_es_staff($rango)) {
    header('Location: index.php?no_access=1');
    exit;
}

$PERMITIDOS = $PERMITIDOS ?? STARLIM_RANGOS_STAFF;
if (!in_array($rango, $PERMITIDOS, true)) {
    header('Location: panel_empleados.php?no_access=1');
    exit;
}

$canVentas    = in_array($rango, ['Empleado_2', 'Jefe', 'Jefe1', 'Admin'], true);
$canBD        = in_array($rango, ['Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'], true);
$canStock     = in_array($rango, ['Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'], true);
$canEmpleados = in_array($rango, ['Jefe', 'Jefe1', 'Admin'], true);
$canRangos    = in_array($rango, ['Jefe1', 'Admin'], true);
