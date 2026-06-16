<?php
/**
 * Capa de compatibilidad mysqli → PDO (PostgreSQL vía Supabase).
 * Permite que el código existente use $conexion->prepare(), bind_param(), etc.
 * sin modificaciones sobre una conexión PDO.
 */

// Guard: evita errores "Cannot redeclare" si el archivo se incluye más de una vez
// o si la extensión mysqli ya está cargada en el runtime de Vercel.
if (defined('DB_COMPAT_LOADED')) return;
define('DB_COMPAT_LOADED', true);

// ──────────────────────────────────────────────────────────────────────────────
// Clase principal: reemplaza el objeto $conexion (mysqli)
// ──────────────────────────────────────────────────────────────────────────────
class PDOMysqliWrapper {
    private PDO $pdo;
    public string $error        = '';
    public int    $affected_rows = 0;

    public function __construct(PDO $pdo) {
        $this->pdo = $pdo;
    }

    public function prepare(string $sql): PDOMysqliStatement {
        try {
            return new PDOMysqliStatement($this->pdo->prepare($sql), $this);
        } catch (PDOException $e) {
            $this->error = $e->getMessage();
            throw $e;
        }
    }

    /**
     * Traduce sintaxis exclusiva de MySQL a su equivalente PostgreSQL.
     * Hoy solo cubre "SHOW TABLES LIKE '...'", usado por varias páginas
     * para detectar tablas opcionales.
     */
    private static function translateSql(string $sql): string {
        if (preg_match("/^\s*SET\s+NAMES\s+'?utf8mb4'?\s*;?\s*$/i", $sql)) {
            return "SET client_encoding TO 'UTF8'";
        }

        if (preg_match("/^\s*SHOW\s+TABLES\s+LIKE\s+'([^']+)'\s*;?\s*$/i", $sql, $m)) {
            $tableLike = str_replace("'", "''", $m[1]);
            return "SELECT table_name FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name LIKE '{$tableLike}'";
        }
        return $sql;
    }

    public function query(string $sql): PDOMysqliResult {
        try {
            $stmt = $this->pdo->query(self::translateSql($sql));
            $this->error        = '';
            $this->affected_rows = $stmt->rowCount();
            return new PDOMysqliResult($stmt);
        } catch (PDOException $e) {
            $this->error        = $e->getMessage();
            $this->affected_rows = 0;
            return new PDOMysqliResult(null);
        }
    }

    public function __get(string $name): mixed {
        if ($name === 'insert_id') {
            return (int) $this->pdo->lastInsertId();
        }
        return null;
    }

    public function getPDO(): PDO {
        return $this->pdo;
    }

    public function real_escape_string(mixed $val): string {
        $v = (string)($val ?? '');
        return str_replace(["\\", "'", "\"", "\0", "\n", "\r"], ["\\\\", "\\'", "\\\"", "\\0", "\\n", "\\r"], $v);
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Statement: reemplaza el resultado de $conexion->prepare()
// ──────────────────────────────────────────────────────────────────────────────
class PDOMysqliStatement {
    private PDOStatement    $stmt;
    private PDOMysqliWrapper $wrapper;
    private array $bound_values  = [];
    public int    $affected_rows = 0;

    public function __construct(PDOStatement $stmt, PDOMysqliWrapper $wrapper) {
        $this->stmt    = $stmt;
        $this->wrapper = $wrapper;
    }

    /**
     * bind_param("ssi", $a, $b, $c) — los tipos se ignoran (PDO no los necesita).
     * Los valores se capturan por referencia para leerlos en execute().
     */
    public function bind_param(string $types, mixed &...$vars): bool {
        $this->bound_values = [];
        foreach ($vars as &$v) {
            $this->bound_values[] = &$v;
        }
        return true;
    }

    public function execute(): bool {
        try {
            $values = [];
            foreach ($this->bound_values as &$v) {
                $values[] = $v;
            }
            $ok = $this->stmt->execute($values ?: null);
            $this->affected_rows          = $this->stmt->rowCount();
            $this->wrapper->affected_rows = $this->affected_rows;
            $this->wrapper->error         = '';
            return $ok;
        } catch (PDOException $e) {
            $this->wrapper->error = $e->getMessage();
            return false;
        }
    }

    public function get_result(): PDOMysqliResult {
        return new PDOMysqliResult($this->stmt);
    }

    public function close(): void {}

    public function __get(string $name): mixed {
        if ($name === 'num_rows') {
            return $this->affected_rows;
        }
        if ($name === 'error') {
            return $this->wrapper->error;
        }
        return null;
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Result: reemplaza mysqli_result
// ──────────────────────────────────────────────────────────────────────────────
class PDOMysqliResult {
    private ?PDOStatement $stmt;
    private ?array $all_rows = null;
    private int    $position  = 0;

    public function __construct(?PDOStatement $stmt) {
        $this->stmt = $stmt;
    }

    public function fetch_assoc(): array|false|null {
        if ($this->stmt === null) return false;

        if ($this->all_rows !== null) {
            if ($this->position >= count($this->all_rows)) return null;
            return $this->all_rows[$this->position++];
        }

        $row = $this->stmt->fetch(PDO::FETCH_ASSOC);
        return $row === false ? null : $row;
    }

    public function fetch_all(int $mode = MYSQLI_ASSOC): array {
        if ($this->stmt === null) return [];
        if ($this->all_rows !== null) return $this->all_rows;
        return $this->stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function free(): void {}

    public function __get(string $name): mixed {
        if ($name === 'num_rows') {
            if ($this->stmt === null) return 0;
            if ($this->all_rows === null) {
                $this->all_rows = $this->stmt->fetchAll(PDO::FETCH_ASSOC);
                $this->position = 0;
            }
            return count($this->all_rows);
        }
        return null;
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Funciones procedurales con guard — no redeclaran si ya existen (p.ej. extensión
// mysqli cargada en el runtime de Vercel).
// ──────────────────────────────────────────────────────────────────────────────

if (!function_exists('mysqli_query')) {
    function mysqli_query(PDOMysqliWrapper $conn, string $sql): PDOMysqliResult {
        return $conn->query($sql);
    }
}

if (!function_exists('mysqli_fetch_assoc')) {
    function mysqli_fetch_assoc(PDOMysqliResult $result): array|false|null {
        return $result->fetch_assoc();
    }
}

if (!function_exists('mysqli_fetch_all')) {
    function mysqli_fetch_all(PDOMysqliResult $result, int $mode = MYSQLI_ASSOC): array {
        return $result->fetch_all($mode);
    }
}

if (!function_exists('mysqli_num_rows')) {
    function mysqli_num_rows(PDOMysqliResult $result): int {
        return (int) $result->num_rows;
    }
}

if (!function_exists('mysqli_affected_rows')) {
    function mysqli_affected_rows(PDOMysqliWrapper $conn): int {
        return $conn->affected_rows;
    }
}

if (!function_exists('mysqli_insert_id')) {
    function mysqli_insert_id(PDOMysqliWrapper $conn): int {
        return $conn->insert_id;
    }
}

if (!function_exists('mysqli_error')) {
    function mysqli_error(PDOMysqliWrapper $conn): string {
        return $conn->error;
    }
}

if (!function_exists('mysqli_real_escape_string')) {
    function mysqli_real_escape_string(PDOMysqliWrapper $conn, mixed $val): string {
        $v = (string)($val ?? '');
        return str_replace(["\\", "'", "\"", "\0", "\n", "\r"], ["\\\\", "\\'", "\\\"", "\\0", "\\n", "\\r"], $v);
    }
}

if (!function_exists('mysqli_close')) {
    function mysqli_close(PDOMysqliWrapper $conn): void {}
}

// Constante de compatibilidad
if (!defined('MYSQLI_ASSOC')) {
    define('MYSQLI_ASSOC', 1);
}
