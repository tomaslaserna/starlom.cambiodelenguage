<?php
session_start();
header('Content-Type: application/json; charset=utf-8');

$usuario = $_SESSION['usuario'] ?? '';
$rango   = $_SESSION['rango']   ?? '';
if (!$usuario) {
    echo json_encode(['ok' => false, 'msg' => 'No autenticado']); exit;
}

include 'conexion_starlim_be.php';

/* ── ID de compra ───────────────────────────────────────────────── */
$id = (int)($_POST['id'] ?? 0);
if (!$id) { echo json_encode(['ok' => false, 'msg' => 'ID inválido']); exit; }

/* ── Verificar que la compra existe y está en estado recibida ────── */
$chk = $conexion->query("SELECT id FROM compras_registro WHERE id = {$id} AND estado = 'recibida' LIMIT 1");
if (!$chk || !$chk->fetch_assoc()) {
    echo json_encode(['ok' => false, 'msg' => 'Compra no encontrada o no está en estado recibida']); exit;
}

/* ── Validar archivo ────────────────────────────────────────────── */
$err = $_FILES['foto']['error'] ?? UPLOAD_ERR_NO_FILE;
if (empty($_FILES['foto']['name']) || $err !== UPLOAD_ERR_OK) {
    $msgs = [
        UPLOAD_ERR_INI_SIZE  => 'El archivo supera el tamaño máximo permitido por el servidor',
        UPLOAD_ERR_FORM_SIZE => 'El archivo supera el tamaño máximo del formulario',
        UPLOAD_ERR_PARTIAL   => 'El archivo se subió de forma incompleta',
        UPLOAD_ERR_NO_FILE   => 'No se seleccionó ningún archivo',
    ];
    echo json_encode(['ok' => false, 'msg' => $msgs[$err] ?? 'Error al recibir el archivo (código ' . $err . ')']); exit;
}

if ($_FILES['foto']['size'] > 8 * 1024 * 1024) {
    echo json_encode(['ok' => false, 'msg' => 'El archivo supera el límite de 8 MB']); exit;
}

/* ── Validar extensión ──────────────────────────────────────────── */
$orig_ext  = strtolower(pathinfo($_FILES['foto']['name'], PATHINFO_EXTENSION));
$ext_allow = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
if (!in_array($orig_ext, $ext_allow, true)) {
    echo json_encode(['ok' => false, 'msg' => 'Extensión no permitida. Usá JPG, PNG, WEBP o GIF']); exit;
}

/* ── Verificar que el contenido sea realmente una imagen ────────── */
$tmp      = $_FILES['foto']['tmp_name'];
$mime_ok  = false;
if (function_exists('finfo_open')) {
    $fi       = finfo_open(FILEINFO_MIME_TYPE);
    $real     = finfo_file($fi, $tmp);
    finfo_close($fi);
    $mime_ok  = in_array($real, ['image/jpeg','image/png','image/webp','image/gif'], true);
} elseif (function_exists('mime_content_type')) {
    $real     = mime_content_type($tmp);
    $mime_ok  = in_array($real, ['image/jpeg','image/png','image/webp','image/gif'], true);
} else {
    $bytes    = @file_get_contents($tmp, false, null, 0, 12);
    if ($bytes !== false) {
        $mime_ok = (
            substr($bytes, 0, 3) === "\xFF\xD8\xFF" ||
            substr($bytes, 0, 4) === "\x89PNG"       ||
            substr($bytes, 0, 4) === 'GIF8'           ||
            substr($bytes, 0, 4) === 'RIFF'
        );
    } else {
        $mime_ok = true; // no se pudo verificar, se confía en la extensión
    }
}
if (!$mime_ok) {
    echo json_encode(['ok' => false, 'msg' => 'El archivo no es una imagen válida']); exit;
}

/* ── Subir a Supabase Storage (disco local solo en dev) ─────────── */
require_once __DIR__ . '/storage_supabase.php';

$mime_map = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png',
             'webp' => 'image/webp', 'gif' => 'image/gif'];
$filename = "recibo_{$id}.{$orig_ext}";

$up = starlim_storage_upload(
    'uploads', "recibos/{$filename}", $tmp, $mime_map[$orig_ext],
    __DIR__ . '/../uploads/recibos', "uploads/recibos/{$filename}"
);

if (!$up['ok']) {
    echo json_encode(['ok' => false, 'msg' => $up['msg']]); exit;
}

/* ── Actualizar BD ──────────────────────────────────────────────── */
$stmt = $conexion->prepare("UPDATE compras_registro SET recibo_foto = ? WHERE id = ?");
$stmt->bind_param('si', $up['url'], $id);
$stmt->execute();

echo json_encode(['ok' => true, 'foto' => $up['url']]);
