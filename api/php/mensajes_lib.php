<?php
/**
 * Helpers compartidos para la mensajeria interna.
 *
 * Varios modulos insertan mensajes automaticos con columna `tipo`. Este helper
 * mantiene el esquema minimo compatible antes de leer/escribir para evitar que
 * un fallback viejo deje la bandeja rota.
 */

function starlim_mensajes_ensure_schema($conexion): void
{
    try {
        $conexion->query("
            CREATE TABLE IF NOT EXISTS mensajes (
                id SERIAL PRIMARY KEY,
                de VARCHAR(255) NOT NULL,
                para VARCHAR(255) NOT NULL,
                asunto VARCHAR(255) NOT NULL DEFAULT '',
                cuerpo TEXT NOT NULL,
                tipo VARCHAR(40) NOT NULL DEFAULT 'directo',
                empresa_id BIGINT NOT NULL DEFAULT 1,
                fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                leido SMALLINT NOT NULL DEFAULT 0
            )
        ");
        $conexion->query("ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS asunto VARCHAR(255) NOT NULL DEFAULT ''");
        $conexion->query("ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS cuerpo TEXT NOT NULL DEFAULT ''");
        $conexion->query("ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS tipo VARCHAR(40) NOT NULL DEFAULT 'directo'");
        $conexion->query("ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS empresa_id BIGINT NOT NULL DEFAULT 1");
        $conexion->query("ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP");
        $conexion->query("ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS leido SMALLINT NOT NULL DEFAULT 0");
        $conexion->query("CREATE INDEX IF NOT EXISTS idx_mensajes_empresa_para_fecha ON mensajes (empresa_id, para, fecha DESC)");
    } catch (Throwable $e) {
        error_log('[Starlim Mensajes] schema ensure failed: ' . $e->getMessage());
    }
}
