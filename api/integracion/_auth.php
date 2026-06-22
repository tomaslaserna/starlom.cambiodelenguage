<?php
/**
 * _auth.php - Autenticacion por API key para la API de integracion.
 *
 * No usa sesiones. Por defecto opera sobre empresa_id=1. Para integraciones
 * multiempresa futuras se puede habilitar STARLIM_API_ALLOW_EMPRESA_HEADER=1
 * y enviar X-Empresa-Id, manteniendo la API key del servidor.
 */

header('Content-Type: application/json; charset=utf-8');

function integracion_key_recibida(): string {
    $h = $_SERVER['HTTP_X_API_KEY'] ?? '';
    if ($h !== '') return trim($h);
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if (stripos($auth, 'Bearer ') === 0) return trim(substr($auth, 7));
    return '';
}

function integracion_responder(int $codigo, array $datos): void {
    http_response_code($codigo);
    echo json_encode($datos, JSON_UNESCAPED_UNICODE);
    exit;
}

$_key_cfg = function_exists('_env') ? _env('STARLIM_API_KEY') : (string) getenv('STARLIM_API_KEY');

if ($_key_cfg === '') {
    integracion_responder(503, ['ok' => false, 'error' => 'API de integracion no habilitada: falta configurar STARLIM_API_KEY en el servidor.']);
}

if (!hash_equals($_key_cfg, integracion_key_recibida())) {
    integracion_responder(401, ['ok' => false, 'error' => 'API key invalida o ausente. Envia el header X-Api-Key.']);
}

if (!isset($conexion)) {
    require_once __DIR__ . '/../php/conexion_starlim_be.php';
}
require_once __DIR__ . '/../php/tenant.php';

function integracion_empresa_id(): int {
    $empresaId = function_exists('_env')
        ? _env('STARLIM_API_EMPRESA_ID', '1')
        : ((string)getenv('STARLIM_API_EMPRESA_ID') ?: '1');
    $allowHeader = function_exists('_env')
        ? _env('STARLIM_API_ALLOW_EMPRESA_HEADER', '0')
        : ((string)getenv('STARLIM_API_ALLOW_EMPRESA_HEADER') ?: '0');

    if ($allowHeader === '1') {
        $headerEmpresa = $_SERVER['HTTP_X_EMPRESA_ID'] ?? '';
        if (ctype_digit((string)$headerEmpresa)) $empresaId = (string)$headerEmpresa;
    }

    return ctype_digit((string)$empresaId) ? max(1, (int)$empresaId) : 1;
}

$_empresa_integracion = integracion_empresa_id();
try {
    $pdo = $conexion->getPDO();
    $stmt = $pdo->prepare("SELECT id, nombre FROM empresas WHERE id = ? AND activa = TRUE LIMIT 1");
    $stmt->execute([$_empresa_integracion]);
    $empresa = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$empresa) {
        integracion_responder(403, ['ok' => false, 'error' => 'Empresa de integracion invalida o inactiva.']);
    }
    starlim_set_empresa_context($pdo, $_empresa_integracion);
    $GLOBALS['STARLIM_EMPRESA_ID'] = $_empresa_integracion;
    $GLOBALS['STARLIM_EMPRESA_NOMBRE'] = (string)$empresa['nombre'];
} catch (Throwable $e) {
    error_log('[Starlim] Error resolviendo empresa de integracion: ' . $e->getMessage());
    integracion_responder(500, ['ok' => false, 'error' => 'No se pudo resolver la empresa de integracion.']);
}
