<?php
/**
 * admin_permissions.php - Permisos granulares para la seccion Administracion.
 *
 * Regla aprobada:
 * - Admin ve todo.
 * - Cualquier otro usuario requiere permiso explicito/rol asignado por recurso.
 * - Recursos sensibles exigen permiso normal y permiso *_sensible.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/tenant.php';

function starlim_admin_pdo(mixed $db): PDO
{
    if ($db instanceof PDO) return $db;
    if (is_object($db) && method_exists($db, 'getPDO')) return $db->getPDO();
    throw new RuntimeException('No hay conexion PDO disponible para permisos admin.');
}

function starlim_admin_empresa_id(mixed $db = null): int
{
    if (function_exists('starlim_current_empresa_id')) {
        return starlim_current_empresa_id($db, false);
    }
    return isset($_SESSION['empresa_id']) && ctype_digit((string)$_SESSION['empresa_id'])
        ? max(1, (int)$_SESSION['empresa_id'])
        : 1;
}

function starlim_admin_user_id(): int
{
    return isset($_SESSION['id_usuario']) && ctype_digit((string)$_SESSION['id_usuario'])
        ? (int)$_SESSION['id_usuario']
        : 0;
}

function starlim_admin_is_admin(): bool
{
    return starlim_normalizar_rango((string)($_SESSION['rango'] ?? '')) === 'Admin';
}

function starlim_admin_perm_key(string $recurso, string $accion): string
{
    return trim($recurso) . '.' . trim($accion);
}

function starlim_admin_can(mixed $db, string $recurso, string $accion = 'ver'): bool
{
    if (starlim_admin_is_admin()) return true;
    if (session_status() !== PHP_SESSION_ACTIVE || starlim_admin_user_id() <= 0) return false;

    $pdo = starlim_admin_pdo($db);
    $empresaId = starlim_admin_empresa_id($db);
    $clave = starlim_admin_perm_key($recurso, $accion);

    try {
        $stmt = $pdo->prepare("
            SELECT 1
            FROM app_usuario_permisos up
            JOIN app_permisos p ON p.id = up.id_permiso
            WHERE up.id_usuario = ?
              AND up.empresa_id = ?
              AND p.clave = ?
            UNION
            SELECT 1
            FROM app_usuario_roles ur
            JOIN app_rol_permisos rp ON rp.id_rol = ur.id_rol
            JOIN app_permisos p ON p.id = rp.id_permiso
            WHERE ur.id_usuario = ?
              AND ur.empresa_id = ?
              AND p.clave = ?
            LIMIT 1
        ");
        $stmt->execute([starlim_admin_user_id(), $empresaId, $clave, starlim_admin_user_id(), $empresaId, $clave]);
        return (bool)$stmt->fetchColumn();
    } catch (Throwable $e) {
        error_log('[Starlim Admin] Permission check failed: ' . $e->getMessage());
        return false;
    }
}

function starlim_admin_can_sensitive(mixed $db, string $recurso, string $accion = 'ver'): bool
{
    if (starlim_admin_is_admin()) return true;
    return starlim_admin_can($db, $recurso, $accion)
        && starlim_admin_can($db, $recurso, $accion . '_sensible');
}

function starlim_admin_require(mixed $db, string $recurso, string $accion = 'ver'): void
{
    if (starlim_admin_can($db, $recurso, $accion)) return;
    http_response_code(403);
    echo 'Acceso denegado.';
    exit;
}

function starlim_admin_require_sensitive(mixed $db, string $recurso, string $accion = 'ver'): void
{
    if (starlim_admin_can_sensitive($db, $recurso, $accion)) return;
    http_response_code(403);
    echo 'Acceso denegado.';
    exit;
}

function starlim_admin_audit(
    mixed $db,
    string $recurso,
    string $accion,
    string $objetoTipo = '',
    string|int $objetoId = '',
    array $detalle = []
): void {
    try {
        $pdo = starlim_admin_pdo($db);
        $ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? null;
        if (is_string($ip) && str_contains($ip, ',')) $ip = trim(explode(',', $ip)[0]);
        if (!is_string($ip) || !filter_var($ip, FILTER_VALIDATE_IP)) $ip = null;

        $stmt = $pdo->prepare("
            INSERT INTO admin_audit_log
                (empresa_id, id_usuario, usuario, recurso, accion, objeto_tipo, objeto_id, detalle_json, ip, user_agent)
            VALUES
                (?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), CAST(? AS inet), ?)
        ");
        $stmt->execute([
            starlim_admin_empresa_id($db),
            starlim_admin_user_id() > 0 ? starlim_admin_user_id() : null,
            (string)($_SESSION['usuario'] ?? ''),
            $recurso,
            $accion,
            $objetoTipo,
            (string)$objetoId,
            json_encode($detalle, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{}',
            $ip,
            (string)($_SERVER['HTTP_USER_AGENT'] ?? ''),
        ]);
    } catch (Throwable $e) {
        error_log('[Starlim Admin] Audit failed: ' . $e->getMessage());
    }
}

function starlim_admin_resources(mixed $db): array
{
    $pdo = starlim_admin_pdo($db);
    try {
        $stmt = $pdo->query("
            SELECT clave, nombre, descripcion, ruta, orden, sensible, fuente
            FROM admin_resources
            WHERE activo = TRUE
            ORDER BY orden, nombre
        ");
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        error_log('[Starlim Admin] Could not load resources: ' . $e->getMessage());
        return [];
    }
}

function starlim_admin_accessible_resources(mixed $db): array
{
    $items = [];
    foreach (starlim_admin_resources($db) as $resource) {
        $clave = (string)($resource['clave'] ?? '');
        $sensible = filter_var($resource['sensible'] ?? false, FILTER_VALIDATE_BOOL);
        $allowed = $sensible
            ? starlim_admin_can_sensitive($db, $clave, 'ver')
            : starlim_admin_can($db, $clave, 'ver');
        if ($allowed) $items[] = $resource;
    }
    return $items;
}

function starlim_admin_default_staff_href(mixed $db = null): string
{
    if ($db !== null && starlim_admin_can($db, 'admin.panel', 'ver')) {
        return 'panel_empleados.php';
    }
    return 'pedidos.php';
}
