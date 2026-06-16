<?php
/**
 * storage_supabase.php — Subida de archivos a Supabase Storage.
 *
 * En Vercel el disco es efímero: todo archivo guardado localmente se pierde
 * en el próximo deploy (o antes). Este helper sube a un bucket público de
 * Supabase Storage y devuelve la URL pública para guardar en la base.
 *
 * Variables de entorno requeridas:
 *   SUPABASE_URL          https://<proyecto>.supabase.co  (o NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_KEY  service_role key (Dashboard → Settings → API)
 *
 * Si falta la service key (entorno de desarrollo local), cae al disco local
 * para no bloquear el trabajo, devolviendo la ruta relativa como antes.
 */

if (defined('STARLIM_STORAGE_LOADED')) return;
define('STARLIM_STORAGE_LOADED', true);

function starlim_storage_config(): array {
    $env = function (string $k): string {
        if (function_exists('_env')) return _env($k);
        $v = getenv($k);
        return $v !== false ? trim($v) : '';
    };
    $url = $env('SUPABASE_URL');
    if ($url === '') $url = $env('NEXT_PUBLIC_SUPABASE_URL');
    return ['url' => rtrim($url, '/'), 'key' => $env('SUPABASE_SERVICE_KEY')];
}

/**
 * Sube un archivo al bucket indicado.
 *
 * @param string $bucket   Nombre del bucket (debe existir y ser público)
 * @param string $path     Ruta dentro del bucket, ej. "recibos/recibo_12.jpg"
 * @param string $tmpFile  Archivo local de origen ($_FILES[...]['tmp_name'])
 * @param string $mime     Content-Type, ej. "image/jpeg"
 * @param string $fallbackDir  Carpeta local si no hay service key (modo dev)
 * @param string $fallbackRel  Ruta relativa que se devuelve en modo dev
 * @return array ['ok' => bool, 'url' => string, 'msg' => string]
 */
function starlim_storage_upload(string $bucket, string $path, string $tmpFile, string $mime,
                                string $fallbackDir = '', string $fallbackRel = ''): array {
    $cfg = starlim_storage_config();

    // ── Modo dev: sin credenciales de Storage, guardar a disco como antes ──
    if ($cfg['url'] === '' || $cfg['key'] === '') {
        if ($fallbackDir === '') {
            return ['ok' => false, 'url' => '', 'msg' => 'Falta configurar SUPABASE_SERVICE_KEY para subir archivos.'];
        }
        if (!is_dir($fallbackDir) && !@mkdir($fallbackDir, 0755, true)) {
            return ['ok' => false, 'url' => '', 'msg' => 'No se pudo crear la carpeta local de uploads.'];
        }
        $dest = rtrim($fallbackDir, '/') . '/' . basename($path);
        $moved = is_uploaded_file($tmpFile) ? move_uploaded_file($tmpFile, $dest) : @copy($tmpFile, $dest);
        if (!$moved) {
            return ['ok' => false, 'url' => '', 'msg' => 'No se pudo guardar el archivo localmente.'];
        }
        return ['ok' => true, 'url' => $fallbackRel !== '' ? $fallbackRel : $dest, 'msg' => ''];
    }

    // ── Subida a Supabase Storage (upsert) ──
    $endpoint = "{$cfg['url']}/storage/v1/object/{$bucket}/" . ltrim($path, '/');
    $body     = file_get_contents($tmpFile);
    if ($body === false) {
        return ['ok' => false, 'url' => '', 'msg' => 'No se pudo leer el archivo temporal.'];
    }

    $ch = curl_init($endpoint);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => 'POST',
        CURLOPT_POSTFIELDS     => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_HTTPHEADER     => [
            'Authorization: Bearer ' . $cfg['key'],
            'apikey: ' . $cfg['key'],
            'Content-Type: ' . $mime,
            'x-upsert: true',
        ],
    ]);
    $res  = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);

    if ($res === false) {
        return ['ok' => false, 'url' => '', 'msg' => 'Error de red subiendo a Storage: ' . $err];
    }
    if ($code < 200 || $code >= 300) {
        $detail = json_decode((string) $res, true)['message'] ?? substr((string) $res, 0, 200);
        return ['ok' => false, 'url' => '', 'msg' => "Storage respondió {$code}: {$detail}"];
    }

    $publicUrl = "{$cfg['url']}/storage/v1/object/public/{$bucket}/" . ltrim($path, '/');
    return ['ok' => true, 'url' => $publicUrl, 'msg' => ''];
}

/**
 * Resuelve el src de una imagen guardada en la base: las nuevas son URLs
 * absolutas de Storage; las viejas son rutas relativas tipo "imagenesStock/x.png"
 * que se sirven desde la raíz del sitio.
 */
function starlim_img_src(string $imagen): string {
    if ($imagen === '') return '';
    if (str_starts_with($imagen, 'http://') || str_starts_with($imagen, 'https://')) return $imagen;
    return '../' . ltrim($imagen, '/');
}
