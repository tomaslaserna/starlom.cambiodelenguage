<?php
require_once __DIR__ . '/admin_permissions.php';

function admin_report_bootstrap(mixed $conexion, string $resource, bool $sensitive = false): array
{
    $empresaId = starlim_bootstrap_tenant_context($conexion);
    if ($sensitive) {
        starlim_admin_require_sensitive($conexion, $resource, 'ver');
    } else {
        starlim_admin_require($conexion, $resource, 'ver');
    }
    return [$conexion->getPDO(), $empresaId];
}

function ar_h($value): string
{
    return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
}

function ar_date_param(string $key, string $fallback): string
{
    $value = (string)($_GET[$key] ?? '');
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) ? $value : $fallback;
}

function ar_month_param(string $key, string $fallback): string
{
    $value = (string)($_GET[$key] ?? '');
    return preg_match('/^\d{4}-\d{2}$/', $value) ? $value : $fallback;
}

function ar_decimal($value, int $decimals = 2): string
{
    $raw = trim((string)($value ?? '0'));
    if ($raw === '' || !is_numeric($raw)) $raw = '0';
    $negative = str_starts_with($raw, '-');
    $raw = ltrim($raw, '+-');
    [$whole, $fraction] = array_pad(explode('.', $raw, 2), 2, '');
    $whole = ltrim($whole === '' ? '0' : $whole, '0');
    $whole = $whole === '' ? '0' : $whole;
    $fraction = substr(str_pad($fraction, $decimals, '0'), 0, $decimals);
    return ($negative ? '-' : '') . number_format((int)$whole, 0, ',', '.') . ',' . $fraction;
}

function ar_money($value): string
{
    return '$ ' . ar_decimal($value, 2);
}

function ar_int($value): string
{
    return number_format((int)($value ?? 0), 0, ',', '.');
}

function ar_date($value): string
{
    if (!$value) return '-';
    $ts = strtotime((string)$value);
    return $ts ? date('d/m/Y', $ts) : '-';
}

function ar_query_one(PDO $pdo, string $sql, array $params = []): array
{
    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
    } catch (Throwable $e) {
        error_log('[Starlim Admin Reports] ' . $e->getMessage());
        return ['__error' => $e->getMessage()];
    }
}

function ar_query_all(PDO $pdo, string $sql, array $params = []): array
{
    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        error_log('[Starlim Admin Reports] ' . $e->getMessage());
        return [];
    }
}

function ar_can_edit(mixed $conexion, string $resource, bool $sensitive = false): bool
{
    return $sensitive
        ? starlim_admin_can_sensitive($conexion, $resource, 'editar')
        : starlim_admin_can($conexion, $resource, 'editar');
}

function ar_period_bounds(string $month): array
{
    $start = $month . '-01';
    $end = date('Y-m-d', strtotime($start . ' +1 month'));
    return [$start, $end];
}

function ar_csrf_token(): string
{
    if (session_status() === PHP_SESSION_ACTIVE && empty($_SESSION['csrf_admin'])) {
        $_SESSION['csrf_admin'] = bin2hex(random_bytes(16));
    }
    return (string)($_SESSION['csrf_admin'] ?? '');
}

function ar_check_csrf(): void
{
    $sent = (string)($_POST['csrf_admin'] ?? '');
    $expected = (string)($_SESSION['csrf_admin'] ?? '');
    if ($expected === '' || !hash_equals($expected, $sent)) {
        http_response_code(400);
        echo 'Solicitud invalida.';
        exit;
    }
}

function ar_decimal_input(string $key, string $fallback = '0'): string
{
    $value = trim((string)($_POST[$key] ?? $fallback));
    if (str_contains($value, ',')) {
        $value = str_replace('.', '', $value);
        $value = str_replace(',', '.', $value);
    }
    return preg_match('/^-?\d+(\.\d{1,2})?$/', $value) ? $value : $fallback;
}
