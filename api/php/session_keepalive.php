<?php
require_once __DIR__ . '/session_bootstrap.php';
starlim_session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

if (!isset($_SESSION['usuario'], $_SESSION['rango'])) {
    http_response_code(401);
    echo json_encode(['ok' => false]);
    exit;
}

$_SESSION['last_seen_at'] = time();
echo json_encode(['ok' => true]);
