<?php
/**
 * Conexión a Supabase (PostgreSQL) mediante PDO.
 * Incluye la capa de compatibilidad mysqli y el handler de sesiones en DB,
 * ambos necesarios para funcionar en Vercel (entorno serverless/stateless).
 */

// Guarda de inclusión: las páginas incluyen este archivo con `include` simple
// (no _once) y algunas lo hacen más de una vez. Importante: las funciones van
// DENTRO de bloques if — una declaración top-level incondicional se compila
// antes de que el `return` de la guarda pueda ejecutarse, y fatal-ea igual.
if (defined('STARLIM_DB_BOOTSTRAPPED')) return;
define('STARLIM_DB_BOOTSTRAPPED', true);

require_once __DIR__ . '/db_compat.php';

// ── Variables de entorno ──────────────────────────────────────────────────────
// En Vercel: Project Settings → Environment Variables
// En local:  archivo .env en la raíz del proyecto (nunca commitear)
if (!function_exists('_env')) {
    // Limpia BOM (UTF-8/UTF-16) y espacios invisibles que se cuelan al
    // copiar/pegar valores en el dashboard de Vercel.
    function _env_clean(string $val): string {
        $val = str_replace(["\xEF\xBB\xBF", "\u{200B}", "\u{200E}", "\u{200F}"], '', $val);
        return trim($val);
    }

    function _env(string $key, string $default = ''): string {
        $val = getenv($key);
        if ($val !== false) return _env_clean($val);

        // Fallback: leer .env manual si no está en el entorno
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

// Host del pooler de Supabase (Supavisor). El host directo db.*.supabase.co
// es solo IPv6 y Vercel no tiene salida IPv6, por eso el pooler es obligatorio.
$db_host = _env('SUPABASE_DB_HOST', 'aws-1-us-east-2.pooler.supabase.com');
$db_port = _env('SUPABASE_DB_PORT', '6543');
$db_name = _env('SUPABASE_DB_NAME', 'postgres');
$db_user = _env('SUPABASE_DB_USER', 'postgres.fholnxqkkuqvqlkzvqmb');
$db_pass = _env('SUPABASE_DB_PASS', '');

// ── Conexión PDO ──────────────────────────────────────────────────────────────
$dsn = "pgsql:host={$db_host};port={$db_port};dbname={$db_name};sslmode=require";

try {
    $pdo_options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];

    // En el servidor local de PHP se reutiliza el mismo proceso entre requests:
    // mantener la conexion evita repetir el handshake remoto con Supabase.
    if (PHP_SAPI === 'cli-server') {
        $pdo_options[PDO::ATTR_PERSISTENT] = true;
    }

    $pdo = new PDO($dsn, $db_user, $db_pass, $pdo_options);
} catch (PDOException $e) {
    error_log('[StarLim] PDO error: ' . $e->getMessage());
    http_response_code(500);
    die(json_encode(['error' => 'Error de conexión a la base de datos.', 'detail' => $e->getMessage()]));
}

// $conexion imita la interfaz mysqli para que el código existente no cambie
$conexion = new PDOMysqliWrapper($pdo);

// ── Sesiones en base de datos ─────────────────────────────────────────────────
// Vercel es stateless: las sesiones en archivos no persisten entre requests.
// Guardamos la sesión en la tabla "php_sessions" de Supabase.
if (PHP_SAPI !== 'cli-server' && session_status() === PHP_SESSION_NONE) session_set_save_handler(
    // open
    function (string $path, string $name): bool { return true; },

    // close
    function (): bool { return true; },

    // read
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

    // write
    function (string $id, string $data) use ($pdo): bool {
        try {
            $stmt = $pdo->prepare(
                "INSERT INTO php_sessions (session_id, session_data, expires_at)
                 VALUES (?, ?, NOW() + INTERVAL '2 hours')
                 ON CONFLICT (session_id) DO UPDATE
                 SET session_data = EXCLUDED.session_data,
                     expires_at   = EXCLUDED.expires_at"
            );
            return $stmt->execute([$id, $data]);
        } catch (PDOException $e) {
            return false;
        }
    },

    // destroy
    function (string $id) use ($pdo): bool {
        try {
            $stmt = $pdo->prepare("DELETE FROM php_sessions WHERE session_id = ?");
            return $stmt->execute([$id]);
        } catch (PDOException $e) {
            return false;
        }
    },

    // gc (limpieza de sesiones expiradas)
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
