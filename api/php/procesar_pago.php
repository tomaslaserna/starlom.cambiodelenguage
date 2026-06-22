<?php
header('Content-Type: application/json; charset=utf-8');
http_response_code(410);

echo json_encode([
    'ok' => false,
    'error' => 'La facturacion fiscal online esta deshabilitada. Registra pagos desde Cobros y Pagos.',
]);
