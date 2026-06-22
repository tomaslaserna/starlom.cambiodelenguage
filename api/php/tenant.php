<?php
/**
 * tenant.php - Contexto multiempresa centralizado.
 *
 * La app actual usa usuario/correo globales. empresa_id vive en sesion y se
 * propaga a Postgres en cada request con app.current_empresa_id.
 */

if (defined('STARLIM_TENANT_LOADED')) return;
define('STARLIM_TENANT_LOADED', true);

function starlim_pdo_from(mixed $db = null): ?PDO {
    if ($db instanceof PDO) return $db;
    if (is_object($db) && method_exists($db, 'getPDO')) return $db->getPDO();
    return null;
}

function starlim_current_empresa_id(mixed $db = null, bool $validate = false): int {
    $empresaId = 1;
    if (session_status() === PHP_SESSION_ACTIVE && isset($_SESSION['empresa_id']) && ctype_digit((string)$_SESSION['empresa_id'])) {
        $empresaId = max(1, (int)$_SESSION['empresa_id']);
    }

    if (!$validate) return $empresaId;

    $pdo = starlim_pdo_from($db);
    if (!$pdo || session_status() !== PHP_SESSION_ACTIVE || empty($_SESSION['id_usuario'])) {
        return $empresaId;
    }

    try {
        $stmt = $pdo->prepare("
            SELECT e.id, e.nombre, ue.rango
            FROM usuario_empresa ue
            JOIN empresas e ON e.id = ue.empresa_id
            WHERE ue.id_usuario = ?
              AND ue.empresa_id = ?
              AND ue.activo = TRUE
              AND e.activa = TRUE
            LIMIT 1
        ");
        $stmt->execute([(int)$_SESSION['id_usuario'], $empresaId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            $_SESSION['empresa_id'] = (int)$row['id'];
            $_SESSION['empresa_nombre'] = (string)$row['nombre'];
            if (!empty($row['rango'])) $_SESSION['rango'] = (string)$row['rango'];
            return (int)$row['id'];
        }
    } catch (Throwable $e) {
        error_log('[Starlim] Tenant validation failed: ' . $e->getMessage());
    }

    return 1;
}

function starlim_set_empresa_context(PDO $pdo, int $empresaId): void {
    $empresaId = max(1, $empresaId);
    try {
        $stmt = $pdo->prepare("SELECT set_config('app.current_empresa_id', ?, false)");
        $stmt->execute([(string)$empresaId]);
    } catch (Throwable $e) {
        error_log('[Starlim] Could not set tenant context: ' . $e->getMessage());
    }
}

function starlim_usuario_empresas(PDO $pdo, int $idUsuario): array {
    try {
        $stmt = $pdo->prepare("
            SELECT e.id, e.nombre, e.slug, ue.rango
            FROM usuario_empresa ue
            JOIN empresas e ON e.id = ue.empresa_id
            WHERE ue.id_usuario = ?
              AND ue.activo = TRUE
              AND e.activa = TRUE
            ORDER BY e.id
        ");
        $stmt->execute([$idUsuario]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        error_log('[Starlim] Could not load tenant memberships: ' . $e->getMessage());
        return [];
    }
}

function starlim_bootstrap_tenant_context(mixed $db = null): int {
    $pdo = starlim_pdo_from($db);
    $empresaId = starlim_current_empresa_id($db, true);

    if ($pdo && session_status() === PHP_SESSION_ACTIVE && !empty($_SESSION['id_usuario'])) {
        $empresas = starlim_usuario_empresas($pdo, (int)$_SESSION['id_usuario']);
        if ($empresas) {
            $ids = array_map(fn($e) => (int)$e['id'], $empresas);
            if (!in_array($empresaId, $ids, true)) {
                $empresaId = (int)$empresas[0]['id'];
            }
            foreach ($empresas as $empresa) {
                if ((int)$empresa['id'] === $empresaId) {
                    $_SESSION['empresa_id'] = $empresaId;
                    $_SESSION['empresa_nombre'] = (string)$empresa['nombre'];
                    $_SESSION['empresas_disponibles'] = $empresas;
                    if (!empty($empresa['rango'])) $_SESSION['rango'] = (string)$empresa['rango'];
                    break;
                }
            }
        } else {
            $_SESSION['empresa_id'] = 1;
            $_SESSION['empresa_nombre'] = 'Starlim';
            $_SESSION['empresas_disponibles'] = [[
                'id' => 1,
                'nombre' => 'Starlim',
                'slug' => 'starlim',
                'rango' => $_SESSION['rango'] ?? 'Minorista',
            ]];
            $empresaId = 1;
        }
    } elseif (session_status() === PHP_SESSION_ACTIVE && empty($_SESSION['empresa_id'])) {
        $_SESSION['empresa_id'] = 1;
        $_SESSION['empresa_nombre'] = 'Starlim';
    }

    if ($pdo) starlim_set_empresa_context($pdo, $empresaId);
    return $empresaId;
}

function starlim_next_sequence(mixed $db, string $tipo, ?int $empresaId = null): int {
    $pdo = starlim_pdo_from($db);
    if (!$pdo) throw new RuntimeException('No hay conexion PDO para secuencia.');

    $empresaId = $empresaId ?? starlim_current_empresa_id($db, false);
    $stmt = $pdo->prepare("SELECT app_private.next_sequence(?, ?) AS valor");
    $stmt->execute([$empresaId, $tipo]);
    return (int)$stmt->fetchColumn();
}
