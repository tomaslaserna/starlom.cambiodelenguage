<?php
/**
 * auth.php â€” Ãšnica fuente de verdad para rangos y contraseÃ±as.
 *
 * Rangos canÃ³nicos (los que asigna gestion_empleados.php y chequean las pÃ¡ginas):
 *   Clientes: Minorista, Mayorista
 *   Staff:    Empleado, Empleado_1, Empleado_2, Jefe, Jefe1, Admin
 */

if (defined('STARLIM_AUTH_LOADED')) return;
define('STARLIM_AUTH_LOADED', true);

const STARLIM_RANGOS_CLIENTES = ['Minorista', 'Mayorista'];
const STARLIM_RANGOS_STAFF    = ['Empleado', 'Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'];

/**
 * Mapea valores legacy que quedaron en la tabla usuarios a su forma canÃ³nica.
 * ('Empleado1' sin guiÃ³n y 'Jefe0' existieron en versiones anteriores y no
 * pasan ningÃºn chequeo de permisos actual.)
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
 * Pepper de contraseÃ±as. Configurable vÃ­a env STARLIM_PEPPER; el fallback es el
 * valor histÃ³rico â€” NO cambiarlo sin re-hashear todas las contraseÃ±as, porque
 * los hashes existentes quedaron generados con Ã©l.
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

function starlim_is_https_request(): bool {
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') return true;
    $forwardedProto = strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
    if ($forwardedProto === 'https') return true;
    $forwardedSsl = strtolower((string)($_SERVER['HTTP_X_FORWARDED_SSL'] ?? ''));
    if ($forwardedSsl === 'on') return true;
    return false;
}

function starlim_is_local_request(): bool {
    $host = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
    return PHP_SAPI === 'cli-server'
        || str_starts_with($host, 'localhost')
        || str_starts_with($host, '127.0.0.1')
        || str_starts_with($host, '[::1]');
}

function starlim_configure_session_security(): void {
    if (session_status() !== PHP_SESSION_NONE) return;

    $secure = starlim_is_https_request() || !starlim_is_local_request();
    ini_set('session.use_only_cookies', '1');
    ini_set('session.use_strict_mode', '1');
    ini_set('session.cookie_secure', $secure ? '1' : '0');
    ini_set('session.cookie_httponly', '1');
    ini_set('session.cookie_samesite', 'Lax');

    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}
