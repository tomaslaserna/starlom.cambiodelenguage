<?php
require_once __DIR__ . '/session_bootstrap.php';
starlim_session_start();
include 'conexion_starlim_be.php';
$empresaId = starlim_bootstrap_tenant_context($conexion);

header('Content-Type: application/json');

$rango   = $_SESSION['rango']   ?? '';
$usuario = $_SESSION['usuario'] ?? '';
$allowed = ['Empleado_1', 'Empleado_2', 'Jefe1', 'Admin'];

if (!in_array($rango, $allowed)) {
    echo json_encode(['ok' => false, 'msg' => 'No autorizado']);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['ok' => false, 'msg' => 'Método no permitido']);
    exit();
}

$id            = intval($_POST['id']            ?? 0);
$nombre        = trim($_POST['nombre']          ?? '');
$precio        = floatval($_POST['precio']      ?? 0);
$descripcion   = trim($_POST['descripcion']     ?? '');
$cantidad      = intval($_POST['cantidad']      ?? 0);
$codigo        = strtoupper(trim($_POST['codigo'] ?? ''));
$imagen        = trim($_POST['imagen']          ?? '');
$justificacion = trim($_POST['justificacion']   ?? '');

if ($id <= 0) {
    echo json_encode(['ok' => false, 'msg' => 'ID inválido']);
    exit();
}

if ($justificacion === '') {
    echo json_encode(['ok' => false, 'msg' => 'Debe ingresar una justificación para el cambio']);
    exit();
}

// Crear tabla de registro si no existe
$conexion->query("CREATE TABLE IF NOT EXISTS stock_modificaciones (
    id SERIAL PRIMARY KEY,
    empleado VARCHAR(100) NOT NULL,
    producto_id INT NOT NULL,
    producto_nombre VARCHAR(255) NOT NULL,
    cambios TEXT NOT NULL,
    justificacion TEXT NOT NULL,
    empresa_id BIGINT NOT NULL DEFAULT 1,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)");
$conexion->query("CREATE INDEX IF NOT EXISTS idx_stock_modificaciones_fecha ON stock_modificaciones (fecha)");
$conexion->query("CREATE INDEX IF NOT EXISTS idx_stock_modificaciones_prod ON stock_modificaciones (producto_id)");
$conexion->query("CREATE INDEX IF NOT EXISTS idx_stock_modificaciones_empresa ON stock_modificaciones (empresa_id)");

// Leer valores actuales antes de modificar
$r = $conexion->query("SELECT nombre, costo, descripcion, stock, codigo, imagen FROM productos WHERE id = " . intval($id) . " AND empresa_id = " . intval($empresaId) . " LIMIT 1");
if (!$r || !($old = $r->fetch_assoc())) {
    echo json_encode(['ok' => false, 'msg' => 'Producto no encontrado']);
    exit();
}

// Actualizar el producto
$stmt = $conexion->prepare(
    "UPDATE productos SET nombre=?, costo=?, descripcion=?, stock=?, codigo=?, imagen=? WHERE id=? AND empresa_id=?"
);
if (!$stmt) {
    echo json_encode(['ok' => false, 'msg' => 'Error interno del servidor']);
    exit();
}
$stmt->bind_param('sdsissii', $nombre, $precio, $descripcion, $cantidad, $codigo, $imagen, $id, $empresaId);
if (!$stmt->execute()) {
    echo json_encode(['ok' => false, 'msg' => 'Error al actualizar el producto']);
    $stmt->close();
    exit();
}
$stmt->close();

// Detectar campos que cambiaron y registrarlos
$field_labels = [
    'nombre'      => 'Nombre',
    'costo'       => 'Costo',
    'descripcion' => 'Descripción',
    'stock'       => 'Stock',
    'codigo'      => 'Categoría',
    'imagen'      => 'Imagen',
];
$new_vals = [
    'nombre'      => $nombre,
    'costo'       => (string)round((float)$precio, 2),
    'descripcion' => $descripcion,
    'stock'       => (string)$cantidad,
    'codigo'      => $codigo,
    'imagen'      => $imagen,
];

$cambios = [];
foreach ($new_vals as $campo => $nuevo) {
    $viejo = $campo === 'costo'
        ? (string)round((float)($old[$campo] ?? 0), 2)
        : (string)($old[$campo] ?? '');
    if ($viejo !== $nuevo) {
        $cambios[] = [
            'label'   => $field_labels[$campo],
            'antes'   => $viejo,
            'despues' => $nuevo,
        ];
    }
}

if (!empty($cambios)) {
    $nombre_prod  = $old['nombre'];
    $cambios_json = json_encode($cambios, JSON_UNESCAPED_UNICODE);
    $stmt2 = $conexion->prepare(
        "INSERT INTO stock_modificaciones (empleado, producto_id, producto_nombre, cambios, justificacion, empresa_id)
         VALUES (?, ?, ?, ?, ?, ?)"
    );
    if ($stmt2) {
        $stmt2->bind_param('sisssi', $usuario, $id, $nombre_prod, $cambios_json, $justificacion, $empresaId);
        $stmt2->execute();
        $stmt2->close();
    }
}

echo json_encode(['ok' => true]);
