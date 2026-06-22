<?php
/**
 * Security headers for authenticated/server-side PHP routes.
 * CSP is Report-Only to avoid breaking existing inline scripts/styles before a
 * full frontend compatibility pass.
 */

if (defined('STARLIM_SECURITY_HEADERS_LOADED')) return;
define('STARLIM_SECURITY_HEADERS_LOADED', true);

function starlim_apply_security_headers(bool $sensitive = true): void {
    if (headers_sent()) return;

    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()');
    header("Content-Security-Policy-Report-Only: default-src 'self'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'; object-src 'none'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co https://star-lim-phi.vercel.app");

    if ($sensitive) {
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Pragma: no-cache');
        header('Expires: 0');
    }
}
