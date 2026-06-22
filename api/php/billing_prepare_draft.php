<?php
require_once __DIR__ . '/session_bootstrap.php';
starlim_session_start();
header('Content-Type: application/json; charset=utf-8');

if (!isset($_SESSION['usuario'], $_SESSION['rango'])) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Sesion vencida.']);
    exit;
}

require_once __DIR__ . '/conexion_starlim_be.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/billing_lib.php';

$rango = starlim_normalizar_rango((string)$_SESSION['rango']);
if (!starlim_es_staff($rango)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Sin permiso para solicitar comprobantes fiscales.']);
    exit;
}

$empresaId = starlim_bootstrap_tenant_context($conexion);
starlim_set_empresa_context(billing_pdo($conexion), $empresaId);

$saleId = (int)($_POST['id_venta'] ?? 0);
$result = billing_create_draft_from_sale($conexion, $saleId, (string)$_SESSION['usuario']);

if (!$result['ok']) {
    http_response_code(400);
}

echo json_encode($result, JSON_UNESCAPED_UNICODE);
