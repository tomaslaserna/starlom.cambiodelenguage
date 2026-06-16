<?php
/**
 * _auth.php — Autenticación por API key para la API de integración.
 *
 * Pensada para consumidores externos (Make, n8n, scripts): NO usa sesiones.
 * La key se configura en la variable de entorno STARLIM_API_KEY
 * (Vercel → Project Settings → Environment Variables).
 *
 * El cliente debe enviar uno de estos headers:
 *   X-Api-Key: <key>
 *   Authorization: Bearer <key>
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
    integracion_responder(503, ['ok' => false, 'error' => 'API de integración no habilitada: falta configurar STARLIM_API_KEY en el servidor.']);
}

if (!hash_equals($_key_cfg, integracion_key_recibida())) {
    integracion_responder(401, ['ok' => false, 'error' => 'API key inválida o ausente. Enviá el header X-Api-Key.']);
}
