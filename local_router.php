<?php
// Local-only router for PHP's built-in server. It mirrors the Vercel PHP routes
// while letting static assets be served directly from the project root.

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$path = '/' . ltrim((string) $path, '/');
$root = __DIR__;

$static = realpath($root . $path);
if ($static !== false && is_file($static) && !str_ends_with($static, '.php')) {
    return false;
}

require $root . '/api/index.php';
