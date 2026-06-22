<?php
/**
 * Conexion a Supabase/PostgreSQL mediante PDO.
 * Incluye compatibilidad mysqli, contexto tenant y sesiones persistidas en DB
 * para Vercel/serverless.
 */

if (defined('STARLIM_DB_BOOTSTRAPPED')) return;
define('STARLIM_DB_BOOTSTRAPPED', true);

require_once __DIR__ . '/db_compat.php';
require_once __DIR__ . '/auth.php';

// Browser session cookie: the browser cookie is session-scoped, while the DB
// row lives longer so Vercel/serverless instances share the same session state.
if (session_status() === PHP_SESSION_NONE) {
    $session_ttl = 7 * 24 * 60 * 60;
    ini_set('session.gc_maxlifetime', (string)$session_ttl);
    starlim_configure_session_security();
}

if (!function_exists('_env')) {
    function _env_clean(string $val): string {
        $val = str_replace(["\xEF\xBB\xBF", "\u{200B}", "\u{200E}", "\u{200F}"], '', $val);
        return trim($val);
    }

    function _env(string $key, string $default = ''): string {
        $val = getenv($key);
        if ($val !== false) return _env_clean($val);

        static $dotenv = null;
        if ($dotenv === null) {
            $dotenv = [];
            $path = __DIR__ . '/../../.env';
            if (file_exists($path)) {
                foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                    if (str_starts_with(trim($line), '#') || !str_contains($line, '=')) continue;
                    [$k, $v] = explode('=', $line, 2);
                    $dotenv[_env_clean($k)] = _env_clean($v);
                }
            }
        }
        return $dotenv[$key] ?? $default;
    }
}

$db_host = _env('SUPABASE_DB_HOST', 'aws-1-us-east-2.pooler.supabase.com');
$db_port = _env('SUPABASE_DB_PORT', '6543');
$db_name = _env('SUPABASE_DB_NAME', 'postgres');
$db_user = _env('SUPABASE_DB_USER', 'postgres.fholnxqkkuqvqlkzvqmb');
$db_pass = _env('SUPABASE_DB_PASS', '');

$dsn = "pgsql:host={$db_host};port={$db_port};dbname={$db_name};sslmode=require";

try {
    $pdo_options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        // Supabase transaction pooler (:6543) does not support server-side
        // prepared statements. PDO emulation keeps placeholders safe without
        // creating prepared statements on the pooled Postgres connection.
        PDO::ATTR_EMULATE_PREPARES   => true,
    ];

    if (PHP_SAPI === 'cli-server') {
        $pdo_options[PDO::ATTR_PERSISTENT] = true;
    }

    $pdo = new PDO($dsn, $db_user, $db_pass, $pdo_options);
} catch (PDOException $e) {
    error_log('[Starlim] PDO error: ' . $e->getMessage());
    http_response_code(500);
    die(json_encode(['error' => 'Error de conexion a la base de datos.']));
}

$conexion = new PDOMysqliWrapper($pdo);

require_once __DIR__ . '/tenant.php';
starlim_set_empresa_context($pdo, starlim_current_empresa_id(null, false));

if (PHP_SAPI !== 'cli-server' && session_status() === PHP_SESSION_NONE) session_set_save_handler(
    function (string $path, string $name): bool { return true; },
    function (): bool { return true; },
    function (string $id) use ($pdo): string {
        try {
            $stmt = $pdo->prepare(
                "SELECT session_data FROM php_sessions WHERE session_id = ? AND expires_at > NOW()"
            );
            $stmt->execute([$id]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            return $row ? $row['session_data'] : '';
        } catch (PDOException $e) {
            return '';
        }
    },
    function (string $id, string $data) use ($pdo): bool {
        try {
            $stmt = $pdo->prepare(
                "INSERT INTO php_sessions (session_id, session_data, expires_at)
                 VALUES (?, ?, NOW() + INTERVAL '7 days')
                 ON CONFLICT (session_id) DO UPDATE
                 SET session_data = EXCLUDED.session_data,
                     expires_at   = EXCLUDED.expires_at"
            );
            return $stmt->execute([$id, $data]);
        } catch (PDOException $e) {
            return false;
        }
    },
    function (string $id) use ($pdo): bool {
        try {
            $stmt = $pdo->prepare("DELETE FROM php_sessions WHERE session_id = ?");
            return $stmt->execute([$id]);
        } catch (PDOException $e) {
            return false;
        }
    },
    function (int $maxlifetime) use ($pdo): int|false {
        try {
            $stmt = $pdo->prepare("DELETE FROM php_sessions WHERE expires_at < NOW()");
            $stmt->execute();
            return $stmt->rowCount();
        } catch (PDOException $e) {
            return false;
        }
    }
);

register_shutdown_function('session_write_close');
