<?php
require_once __DIR__ . '/session_bootstrap.php';
starlim_session_start();
header('Content-Type: application/json; charset=utf-8');
http_response_code(410);

echo json_encode([
    'ok' => false,
    'error' => 'La facturacion fiscal online esta deshabilitada. Gestiona la factura fuera de la app y adjuntala como comprobante externo.',
]);
