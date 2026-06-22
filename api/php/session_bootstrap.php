<?php
/**
 * Central session bootstrap for PHP entrypoints.
 * Loads the DB-backed session handler before session_start() and applies
 * cookie hardening consistently across frontend and API routes.
 */

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/security_headers.php';

if (!function_exists('starlim_session_start')) {
    function starlim_session_start(): void {
        global $conexion;

        starlim_apply_security_headers(true);
        starlim_configure_session_security();
        require_once __DIR__ . '/conexion_starlim_be.php';
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
        if (function_exists('starlim_bootstrap_tenant_context')) {
            starlim_bootstrap_tenant_context($conexion ?? null);
        }
    }
}
