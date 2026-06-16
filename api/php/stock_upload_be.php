<?php
session_start();
include 'conexion_starlim_be.php';

$rango = $_SESSION['rango'] ?? '';
if (!in_array($rango, ['Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'])) {
    header('Location: ../frontend/panel_empleados.php');
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: ../frontend/new_stock.php');
    exit();
}

function redir_error($msg) {
    header('Location: ../frontend/new_stock.php?status=error&msg=' . urlencode($msg));
    exit();
}

// ── Campos del formulario ─────────────────────────────────
$nombre      = trim($_POST['nombre']      ?? '');
$codigo      = strtoupper(trim($_POST['codigo'] ?? ''));
$costo       = floatval($_POST['costo']   ?? 0);
$stock_qty   = max(0, intval($_POST['stock']    ?? 0));
$proveedor   = trim($_POST['proveedor']   ?? '');
$descripcion = trim($_POST['descripcion'] ?? '');

// ── Validaciones ──────────────────────────────────────────
if ($nombre  === '') redir_error('El nombre del producto es requerido.');
if ($codigo  === '') redir_error('Debes seleccionar una categoría de precio.');
if ($costo  <= 0)   redir_error('El costo debe ser mayor a 0.');

// Verificar que el codigo existe en margenes
$chk = $conexion->prepare("SELECT nombre FROM margenes WHERE codigo = ? LIMIT 1");
$chk->bind_param('s', $codigo);
$chk->execute();
$chk_row = $chk->get_result()->fetch_assoc();
$chk->close();

if (!$chk_row) redir_error("El código de categoría '$codigo' no existe en la tabla de márgenes.");

// Obtener categoria y rubro desde el codigo
$categoria = $chk_row['nombre'];
$rubro     = rtrim($codigo, '0123456789');   // 'A' de 'A11', 'AB' de 'AB3', etc.

// El id_producto por código se calcula de forma atómica en el INSERT
// (evita duplicados si dos altas del mismo código corren en simultáneo)

// ── Imagen (opcional) ─────────────────────────────────────
$imagen = '';
if (isset($_FILES['foto']) && $_FILES['foto']['error'] === UPLOAD_ERR_OK) {
    $foto        = $_FILES['foto'];
    $ext         = strtolower(pathinfo($foto['name'], PATHINFO_EXTENSION));
    $allowed_ext = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

    if (!in_array($ext, $allowed_ext)) {
        redir_error('Tipo de imagen no permitido. Use JPG, PNG, GIF o WEBP.');
    }

    require_once __DIR__ . '/storage_supabase.php';

    $mime_map   = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png',
                   'gif' => 'image/gif', 'webp' => 'image/webp'];
    $nombre_img = time() . '_' . preg_replace('/[^a-zA-Z0-9._-]/', '_', $foto['name']);

    $up = starlim_storage_upload(
        'uploads', "productos/{$nombre_img}", $foto['tmp_name'], $mime_map[$ext],
        __DIR__ . '/../../imagenesStock', 'imagenesStock/' . $nombre_img
    );
    if (!$up['ok']) {
        redir_error('Error al guardar la imagen: ' . $up['msg']);
    }
    $imagen = $up['url'];
} elseif (isset($_FILES['foto']) && $_FILES['foto']['error'] !== UPLOAD_ERR_NO_FILE) {
    redir_error('Error al subir la imagen. Código: ' . $_FILES['foto']['error']);
}

// ── INSERT productos (id_producto = MAX+1 del código, atómico) ────
$stmt = $conexion->prepare(
    "INSERT INTO productos
        (id_producto, rubro, codigo, categoria, proveedor, nombre, costo, stock, descripcion, imagen)
     SELECT COALESCE(MAX(id_producto), 0) + 1, ?, ?, ?, ?, ?, ?, ?, ?, ?
     FROM productos WHERE codigo = ?"
);
if (!$stmt) redir_error('Error interno al preparar la inserción.');

$stmt->bind_param('sssssdisss',
    $rubro, $codigo, $categoria, $proveedor,
    $nombre, $costo, $stock_qty, $descripcion, $imagen, $codigo
);

if (!$stmt->execute()) {
    redir_error('Error al guardar el producto: ' . $stmt->error);
}
$stmt->close();

header('Location: ../frontend/new_stock.php?status=ok&nombre=' . urlencode($nombre));
exit();
