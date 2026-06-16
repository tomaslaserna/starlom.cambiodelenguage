<?php
/**
 * auth.php — Única fuente de verdad para rangos y contraseñas.
 *
 * Rangos canónicos (los que asigna gestion_empleados.php y chequean las páginas):
 *   Clientes: Minorista, Mayorista
 *   Staff:    Empleado, Empleado_1, Empleado_2, Jefe, Jefe1, Admin
 */

if (defined('STARLIM_AUTH_LOADED')) return;
define('STARLIM_AUTH_LOADED', true);

const STARLIM_RANGOS_CLIENTES = ['Minorista', 'Mayorista'];
const STARLIM_RANGOS_STAFF    = ['Empleado', 'Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'];

/**
 * Mapea valores legacy que quedaron en la tabla usuarios a su forma canónica.
 * ('Empleado1' sin guión y 'Jefe0' existieron en versiones anteriores y no
 * pasan ningún chequeo de permisos actual.)
 */
function starlim_normalizar_rango(string $rango): string {
    return [
        'Empleado1' => 'Empleado_1',
        'Empleado2' => 'Empleado_2',
        'Jefe0'     => 'Jefe',
    ][$rango] ?? $rango;
}

function starlim_rango_valido(string $rango): bool {
    return in_array($rango, array_merge(STARLIM_RANGOS_CLIENTES, STARLIM_RANGOS_STAFF), true);
}

function starlim_es_staff(string $rango): bool {
    return in_array($rango, STARLIM_RANGOS_STAFF, true);
}

/**
 * Pepper de contraseñas. Configurable vía env STARLIM_PEPPER; el fallback es el
 * valor histórico — NO cambiarlo sin re-hashear todas las contraseñas, porque
 * los hashes existentes quedaron generados con él.
 */
function starlim_pepper(): string {
    $p = function_exists('_env') ? _env('STARLIM_PEPPER') : (string) getenv('STARLIM_PEPPER');
    return $p !== '' ? $p : '57@r_L1m:---(2026)';
}

function starlim_hash_password(string $plain): string {
    return password_hash(hash_hmac('sha256', $plain, starlim_pepper()), PASSWORD_DEFAULT);
}

function starlim_verificar_password(string $plain, string $hash): bool {
    return password_verify(hash_hmac('sha256', $plain, starlim_pepper()), $hash);
}
