<?php
require_once __DIR__ . '/session_bootstrap.php';
/**
 * clientes_be.php — Alta y edición de clientes desde la base de datos.
 * Acciones (POST): crear | editar. Solo staff con acceso a BD.
 */
starlim_session_start();
if (!isset($_SESSION['usuario'])) { http_response_code(403); die(); }

include 'conexion_starlim_be.php';
require_once 'auth.php';
require_once __DIR__ . '/tenant.php';
header('Content-Type: application/json; charset=utf-8');
$empresa_id = starlim_bootstrap_tenant_context($conexion);

$rango = starlim_normalizar_rango($_SESSION['rango'] ?? '');
if (!in_array($rango, ['Empleado_1', 'Empleado_2', 'Jefe', 'Jefe1', 'Admin'], true)) {
    echo json_encode(['ok' => false, 'error' => 'Sin permiso']); exit;
}

// Campos editables (columnas reales de clientes)
$campos = ['nombre_cliente', 'razon_social', 'tipo_id', 'nro_id', 'cond_iva', 'telefono',
           'domicilio', 'ciudad', 'provincia', 'lista_precios', 'estado', 'vendedor_cl', 'observacion'];

// plazo_pago_dias es una columna nueva: la incluimos solo si ya existe (tolerante a que
// la migración de db_fixes.sql todavía no se haya aplicado en la base).
$tiene_plazo = false;
try { $tiene_plazo = (bool) $conexion->query("SELECT plazo_pago_dias FROM clientes LIMIT 1"); }
catch (Throwable $e) { $tiene_plazo = false; }
if ($tiene_plazo) $campos[] = 'plazo_pago_dias';

$accion = trim($_POST['accion'] ?? '');
$datos  = [];
foreach ($campos as $c) $datos[$c] = trim($_POST[$c] ?? '');
// plazo_pago_dias es INT: forzar numérico (cadena '' rompe el bind en columna integer)
if ($tiene_plazo) $datos['plazo_pago_dias'] = (string) max(0, (int) ($_POST['plazo_pago_dias'] ?? 0));

if ($datos['nombre_cliente'] === '') { echo json_encode(['ok' => false, 'error' => 'El nombre es obligatorio']); exit; }
$nro_norm = preg_replace('/[^0-9]/', '', $datos['nro_id']);

if ($accion === 'crear') {
    // Dedup por nro_id (si se cargó)
    if ($nro_norm !== '') {
        $ck = $conexion->prepare("SELECT id FROM clientes WHERE empresa_id = ? AND REPLACE(REPLACE(nro_id,'-',''),' ','') = ? LIMIT 1");
        $ck->bind_param('is', $empresa_id, $nro_norm); $ck->execute();
        if ($ck->get_result()->fetch_assoc()) { echo json_encode(['ok' => false, 'error' => 'Ya existe un cliente con ese CUIT/DNI']); exit; }
        $ck->close();
    }
    $camposInsert = array_merge($campos, ['empresa_id']);
    $datosInsert = array_merge(array_values($datos), [(string)$empresa_id]);
    $sql = "INSERT INTO clientes (" . implode(',', $camposInsert) . ") VALUES (" . implode(',', array_fill(0, count($camposInsert), '?')) . ") RETURNING id";
    $st = $conexion->prepare($sql);
    $st->bind_param(str_repeat('s', count($camposInsert)), ...$datosInsert);
    $st->execute();
    $id = (int)$st->get_result()->fetch_assoc()['id'];
    $st->close();
    echo json_encode(['ok' => true, 'id' => $id]);
    exit;
}

if ($accion === 'editar') {
    $id = (int)($_POST['id'] ?? 0);
    if ($id <= 0) { echo json_encode(['ok' => false, 'error' => 'ID inválido']); exit; }
    $sets = implode(', ', array_map(fn($c) => "$c = ?", $campos));
    $valores = array_values($datos);
    $valores[] = $id;
    $valores[] = $empresa_id;
    $st = $conexion->prepare("UPDATE clientes SET $sets WHERE id = ? AND empresa_id = ?");
    $st->bind_param(str_repeat('s', count($campos)) . 'ii', ...$valores);
    $st->execute();
    $st->close();
    echo json_encode(['ok' => true]);
    exit;
}

echo json_encode(['ok' => false, 'error' => 'Acción desconocida']);
