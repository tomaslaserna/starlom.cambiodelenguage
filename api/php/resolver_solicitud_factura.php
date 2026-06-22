<?php
require_once __DIR__ . '/session_bootstrap.php';
starlim_session_start();
header('Content-Type: application/json; charset=utf-8');
http_response_code(410);

if (!function_exists('starlim_resolver_solicitud')) {
    function starlim_resolver_solicitud($conexion, int $id_sol, string $accion, string $usuario, string $motivo): array {
        return [
            'ok' => false,
            'error' => 'La facturacion fiscal online esta deshabilitada.',
        ];
    }
}

echo json_encode([
    'ok' => false,
    'error' => 'La facturacion fiscal online esta deshabilitada. No se emiten ni aprueban facturas desde la app.',
]);
