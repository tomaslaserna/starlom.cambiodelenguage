<?php
/**
 * integracion_eventos.php — Registro de eventos para integraciones externas.
 *
 * Cada cambio de estado relevante (pedido, cobro, remito nuevo, etc.) se
 * registra en la tabla eventos_integracion. Los consumidores externos (Make,
 * n8n) tienen dos formas de enterarse:
 *
 *   1. Polling:  GET /integracion/eventos.php?desde_id=N  (con API key)
 *   2. Webhook:  si la env STARLIM_WEBHOOK_URL está configurada, se hace un
 *      POST inmediato con el evento (fire-and-forget, timeout 3s, no bloquea
 *      la operación principal si el destino está caído).
 */

if (defined('STARLIM_INTEGRACION_EVENTOS')) return;
define('STARLIM_INTEGRACION_EVENTOS', true);

/**
 * @param PDOMysqliWrapper $conexion
 * @param string $tipo   ej: "pedido.estado_cambiado", "venta.creada", "remito.creado"
 * @param array  $datos  payload del evento (se guarda como JSON)
 */
function starlim_evento_registrar($conexion, string $tipo, array $datos): void {
    try {
        $json = json_encode($datos, JSON_UNESCAPED_UNICODE);
        $stmt = $conexion->prepare(
            "INSERT INTO eventos_integracion (tipo, datos) VALUES (?, ?)"
        );
        $stmt->bind_param('ss', $tipo, $json);
        $stmt->execute();
    } catch (Throwable $e) {
        error_log('[StarLim] No se pudo registrar evento de integración: ' . $e->getMessage());
        return; // nunca romper la operación principal por un evento
    }

    // ── Webhook saliente (opcional) ──
    $url = function_exists('_env') ? _env('STARLIM_WEBHOOK_URL') : (string) getenv('STARLIM_WEBHOOK_URL');
    if ($url === '' || !function_exists('curl_init')) return;

    try {
        $payload = json_encode([
            'tipo'  => $tipo,
            'datos' => $datos,
            'fecha' => date('c'),
        ], JSON_UNESCAPED_UNICODE);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 3,
            CURLOPT_CONNECTTIMEOUT => 2,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        ]);
        curl_exec($ch);
        curl_close($ch);
    } catch (Throwable $e) {
        error_log('[StarLim] Webhook saliente falló: ' . $e->getMessage());
    }
}
