<?php
require_once __DIR__ . '/session_bootstrap.php';
ob_start();
ini_set('display_errors', '0');

register_shutdown_function(function () {
    $err = error_get_last();
    if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        ob_end_clean();
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Error PHP: ' . $err['message'] . ' — línea ' . $err['line']], JSON_UNESCAPED_UNICODE);
    }
});

starlim_session_start();
include 'conexion_starlim_be.php';
$empresaId = starlim_bootstrap_tenant_context($conexion);

header('Content-Type: application/json; charset=utf-8');

$rango = $_SESSION['rango'] ?? '';
if (!in_array($rango, ['Jefe', 'Jefe1', 'Admin'], true)) {
    ob_end_clean(); echo json_encode(['error' => 'Sin permisos.']); exit();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function archivoAUTF8_cm($ruta) {
    $c = file_get_contents($ruta);
    if (substr($c, 0, 3) === "\xEF\xBB\xBF") return substr($c, 3);
    if (substr($c, 0, 2) === "\xFF\xFE")      return mb_convert_encoding(substr($c, 2), 'UTF-8', 'UTF-16LE');
    if (substr($c, 0, 2) === "\xFE\xFF")      return mb_convert_encoding(substr($c, 2), 'UTF-8', 'UTF-16BE');
    if (preg_match('//u', $c))                return $c;
    return mb_convert_encoding($c, 'UTF-8', 'Windows-1252');
}

function limpiar_cm($conn, $val) {
    return trim((string)($val ?? ''));
}

// Formato argentino: punto = miles, coma = decimal
function toDecimal_cm($val) {
    $v = trim(str_replace(['$', ' '], '', (string)($val ?? '')));
    if ($v === '') return 0.0;
    if (strpos($v, ',') !== false) {
        $v = str_replace('.', '', $v);
        $v = str_replace(',', '.', $v);
    } else {
        $v = str_replace('.', '', $v);
    }
    return is_numeric($v) ? (float)$v : 0.0;
}

// Determina el rubro principal según el prefijo del código
function codigoARubro($codigo) {
    $letra = strtoupper(preg_replace('/[^A-Za-z]/', '', $codigo));
    $map = [
        'A' => 'Limpieza',
        'B' => 'Papel',
        'C' => 'Bolsas',
        'D' => 'Descartables',
        'E' => 'Dispensadores',
        'G' => 'Nidal Modular',
    ];
    return $map[$letra] ?? 'General';
}

try {
    // ── Verificar contraseña ──────────────────────────────────────────────────
    $passIngresada = $_POST['password'] ?? '';
    if ($passIngresada === '') {
        ob_end_clean(); echo json_encode(['error' => 'Contraseña requerida.']); exit();
    }

    $resPass = $conexion->query("SELECT valor FROM config_sistema WHERE empresa_id = $empresaId AND clave = 'password_carga_masiva' LIMIT 1");
    if (!$resPass || $resPass->num_rows === 0) {
        ob_end_clean(); echo json_encode(['error' => 'Contraseña no configurada en el sistema.']); exit();
    }
    $hashGuardado = $resPass->fetch_assoc()['valor'];

    if (!password_verify($passIngresada, $hashGuardado)) {
        ob_end_clean(); echo json_encode(['error' => 'Contraseña incorrecta.']); exit();
    }

    // ── Validar archivo ───────────────────────────────────────────────────────
    if (!isset($_FILES['csv_file']) || $_FILES['csv_file']['error'] !== UPLOAD_ERR_OK) {
        ob_end_clean(); echo json_encode(['error' => 'No se recibió el archivo correctamente.']); exit();
    }
    $file = $_FILES['csv_file'];
    if (strtolower(pathinfo($file['name'], PATHINFO_EXTENSION)) !== 'csv') {
        ob_end_clean(); echo json_encode(['error' => 'Solo se aceptan archivos .csv']); exit();
    }

    // ── Convertir a UTF-8 ─────────────────────────────────────────────────────
    $handle = fopen('php://temp', 'r+');
    fwrite($handle, archivoAUTF8_cm($file['tmp_name']));
    rewind($handle);

    // Detectar delimitador
    $primera = fgets($handle);
    rewind($handle);
    $sep = (substr_count($primera, ';') >= substr_count($primera, ',')) ? ';' : ',';

    // Leer encabezados
    $headers = fgetcsv($handle, 0, $sep);

    // ── VACIAR la tabla de productos ──────────────────────────────────────────
    $conexion->query("DELETE FROM productos WHERE empresa_id = $empresaId");

    // ── Precargar categorías desde margenes ───────────────────────────────────
    $categorias = [];
    $resCat = $conexion->query("SELECT codigo, nombre FROM margenes WHERE empresa_id = $empresaId");
    while ($cat = $resCat->fetch_assoc()) {
        $categorias[strtoupper($cat['codigo'])] = $cat['nombre'];
    }

    /*
     * Columnas del CSV (por posición):
     *  0  codigo       → codigo del margen (A1, D25, etc.)
     *  1  PROVEEDOR    → proveedor
     *  2  DESCRIPCION  → nombre del producto
     *  3  COSTO        → costo en formato argentino
     */

    // Contador por código para id_producto incremental por grupo
    $contadorPorCodigo = [];

    $insertados = 0;
    $errores    = [];
    $filaNum    = 1;

    while (($fila = fgetcsv($handle, 0, $sep)) !== false) {
        $filaNum++;

        // Saltar filas vacías
        $hayDatos = false;
        foreach ($fila as $c) { if (trim($c) !== '') { $hayDatos = true; break; } }
        if (!$hayDatos) continue;

        while (count($fila) < 4) $fila[] = '';

        $codigo    = strtoupper(limpiar_cm($conexion, $fila[0]));
        $proveedor = limpiar_cm($conexion, $fila[1]);
        $nombre    = limpiar_cm($conexion, $fila[2]);
        $costo     = toDecimal_cm($fila[3]);

        if ($nombre === '') {
            $errores[] = "Fila $filaNum: sin nombre de producto — omitida.";
            continue;
        }

        // id_producto incremental por código de categoría
        if (!isset($contadorPorCodigo[$codigo])) {
            $contadorPorCodigo[$codigo] = 0;
        }
        $contadorPorCodigo[$codigo]++;
        $idProducto = $contadorPorCodigo[$codigo];

        $stmtIns = $conexion->prepare(
            "INSERT INTO productos (id_producto, codigo, proveedor, nombre, costo, stock, descripcion, empresa_id)
             VALUES (?, ?, ?, ?, ?, 0, '', ?)"
        );
        $stmtIns->bind_param("isssdi", $idProducto, $codigo, $proveedor, $nombre, $costo, $empresaId);
        if ($stmtIns->execute()) {
            $insertados++;
        } else {
            $errores[] = "Fila $filaNum ('$nombre'): " . $conexion->error;
        }
        $stmtIns->close();
    }

    fclose($handle);

    ob_end_clean();
    echo json_encode([
        'insertados'       => $insertados,
        'errores'          => $errores,
        'total_procesadas' => $filaNum - 1,
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    ob_end_clean();
    echo json_encode(['error' => 'Excepción: ' . $e->getMessage() . ' (línea ' . $e->getLine() . ')'], JSON_UNESCAPED_UNICODE);
}
