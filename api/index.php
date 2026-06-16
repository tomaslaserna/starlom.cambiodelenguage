<?php
/**
 * Front controller — single Vercel lambda.
 * Routes every PHP request to the right handler under api/frontend/, api/php/,
 * or api/facturacion/ using PHP's native include mechanism.
 *
 * Why a front controller instead of 313 separate lambdas:
 * Vercel Hobby plan rejects deployments with more than ~12 serverless functions.
 */

$base = __DIR__; // absolute path to /api

// ── Resolve requested URI to a physical PHP file ──────────────────────────────
$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$uri = '/' . ltrim((string) $uri, '/');

$file = null;
if (str_contains($uri, '/partials/')) {
    // Los parciales (guard.php, nav.php) solo se incluyen desde páginas
    http_response_code(404);
    exit('404 Not Found');
}
if ($uri === '/' || $uri === '') {
    $file = $base . '/frontend/index.php';
} elseif (preg_match('#^/(frontend|php|facturacion|integracion)/([a-zA-Z0-9_./-]+\.php)$#', $uri, $m)) {
    $file = $base . '/' . $m[1] . '/' . $m[2];
} elseif (preg_match('#^/([a-zA-Z0-9_.-]+\.php)$#', $uri, $m)) {
    // Links relativos desde la home ("sign.php") caen en la raíz del sitio;
    // los archivos de páginas viven en frontend/.
    $file = $base . '/frontend/' . $m[1];
}

// Security: block path traversal
if ($file !== null) {
    $real    = realpath($file);
    $realBase = realpath($base);
    if ($real === false || $realBase === false || !str_starts_with($real, $realBase . DIRECTORY_SEPARATOR)) {
        http_response_code(403);
        exit('403 Forbidden');
    }
    $file = $real;
}

if ($file === null || !is_file($file)) {
    http_response_code(404);
    exit('404 Not Found: ' . htmlspecialchars($uri, ENT_QUOTES));
}

// ── Include path ──────────────────────────────────────────────────────────────
// Prepend the target file's own directory plus all common dirs so that bare
// `include 'conexion_starlim_be.php'` calls resolve correctly regardless of
// which subdirectory the included file lives in.
set_include_path(
    dirname($file)          . PATH_SEPARATOR .
    $base . '/php'          . PATH_SEPARATOR .
    $base . '/frontend'     . PATH_SEPARATOR .
    $base . '/facturacion'  . PATH_SEPARATOR .
    get_include_path()
);

// ── Server variable overrides ─────────────────────────────────────────────────
$_SERVER['SCRIPT_FILENAME'] = $file;
$_SERVER['SCRIPT_NAME']     = $uri;
$_SERVER['PHP_SELF']        = $uri;

// ── Working directory ─────────────────────────────────────────────────────────
// Relative paths like `include '../php/foo.php'` resolve against the target
// file's own directory, matching how the file would behave when executed directly.
chdir(dirname($file));

// ── Bootstrap DB + sesiones ───────────────────────────────────────────────────
// En Vercel debe cargarse ANTES que la página: instala el handler de sesiones
// en DB, y las páginas llaman a session_start() en sus primeras líneas.
// En localhost evitamos ese bootstrap global: acelera páginas públicas y deja
// que cada página abra la DB solo cuando realmente la necesita.
$isLocalServer = PHP_SAPI === 'cli-server';
if (!$isLocalServer || str_starts_with($uri, '/integracion/')) {
    require_once $base . '/php/conexion_starlim_be.php';
}

// ── Execute ───────────────────────────────────────────────────────────────────
include $file;
