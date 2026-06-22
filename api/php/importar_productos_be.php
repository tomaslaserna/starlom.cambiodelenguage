<?php
require_once __DIR__ . '/session_bootstrap.php';
ob_start();
ini_set('display_errors', '0');

register_shutdown_function(function () {
    $err = error_get_last();
    if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR])) {
        ob_end_clean();
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Error PHP: ' . $err['message'] . ' — línea ' . $err['line']], JSON_UNESCAPED_UNICODE);
    }
});

set_error_handler(function ($errno, $errstr, $errfile, $errline) {
    if ($errno === E_WARNING || $errno === E_USER_WARNING) {
        throw new ErrorException($errstr, 0, $errno, $errfile, $errline);
    }
    return true;
});

starlim_session_start();
include 'conexion_starlim_be.php';
require_once __DIR__ . '/tenant.php';
$empresa_id = starlim_bootstrap_tenant_context($conexion);

header('Content-Type: application/json; charset=utf-8');

if (!isset($_SESSION['rango']) || $_SESSION['rango'] !== 'Admin') {
    ob_end_clean();
    echo json_encode(['error' => 'Sin permisos para realizar esta acción.']);
    exit();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Convierte el archivo completo a UTF-8 (BOM, UTF-16, Windows-1252)
function archivoAUTF8($ruta) {
    $c = file_get_contents($ruta);
    if (substr($c, 0, 3) === "\xEF\xBB\xBF") return substr($c, 3);           // UTF-8 BOM
    if (substr($c, 0, 2) === "\xFF\xFE")      return mb_convert_encoding(substr($c, 2), 'UTF-8', 'UTF-16LE');
    if (substr($c, 0, 2) === "\xFE\xFF")      return mb_convert_encoding(substr($c, 2), 'UTF-8', 'UTF-16BE');
    if (preg_match('//u', $c))                return $c;                       // UTF-8 sin BOM
    return mb_convert_encoding($c, 'UTF-8', 'Windows-1252');                  // Fallback W-1252
}

function limpiar($conn, $val) {
    return trim((string)($val ?? ''));
}

// Formato argentino: punto = separador de miles, coma = decimal
// $4.320,66 → 4320.66 | $4.320 → 4320.00 | 1500 → 1500.00
function toDecimal($val) {
    $v = trim((string)($val ?? ''));
    if ($v === '') return 0.0;

    $v = str_replace(['$', ' '], '', $v);
    if ($v === '') return 0.0;

    if (strpos($v, ',') !== false) {
        // Coma = decimal, puntos = miles
        $v = str_replace('.', '', $v);
        $v = str_replace(',', '.', $v);
    } else {
        // Sin coma = solo separadores de miles
        $v = str_replace('.', '', $v);
    }

    return is_numeric($v) ? (float)$v : 0.0;
}

// ── Try/catch principal ───────────────────────────────────────────────────────
try {

    if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !isset($_FILES['csv_file'])) {
        ob_end_clean(); echo json_encode(['error' => 'No se recibió ningún archivo.']); exit();
    }

    $file = $_FILES['csv_file'];

    if ($file['error'] !== UPLOAD_ERR_OK) {
        ob_end_clean(); echo json_encode(['error' => 'Error al subir el archivo. Código: ' . $file['error']]); exit();
    }

    if (strtolower(pathinfo($file['name'], PATHINFO_EXTENSION)) !== 'csv') {
        ob_end_clean(); echo json_encode(['error' => 'Solo se aceptan archivos .csv']); exit();
    }

    // Convertir archivo entero a UTF-8 y cargar en memoria
    $handle = fopen('php://temp', 'r+');
    fwrite($handle, archivoAUTF8($file['tmp_name']));
    rewind($handle);

    // Detectar delimitador
    $primera = fgets($handle);
    rewind($handle);
    $sep = (substr_count($primera, ';') >= substr_count($primera, ',')) ? ';' : ',';

    // Saltar encabezados
    fgetcsv($handle, 0, $sep);

    /*
     * Orden de columnas del CSV:
     *  0  id_producto  → se ignora (auto-increment en BD)
     *  1  rubro
     *  2  codigo       → clave para detectar duplicados
     *  3  categoria
     *  4  proveedor
     *  5  nombre
     *  6  costo
     *  7  stock
     */
    $insertados = 0;
    $omitidos   = 0;
    $errores    = [];
    $filaNum    = 1;

    while (($fila = fgetcsv($handle, 0, $sep)) !== false) {
        $filaNum++;

        // Saltar filas vacías
        $hayDatos = false;
        foreach ($fila as $c) { if (trim($c) !== '') { $hayDatos = true; break; } }
        if (!$hayDatos) continue;

        while (count($fila) < 8) $fila[] = '';

        // Mapeo
        // $fila[0] = id_producto → ignorado
        $rubro     = limpiar($conexion, $fila[1]);
        $codigo    = limpiar($conexion, $fila[2]);
        $categoria = limpiar($conexion, $fila[3]);
        $proveedor = limpiar($conexion, $fila[4]);
        $nombre    = limpiar($conexion, $fila[5]);
        $costo     = toDecimal($fila[6]);
        $stock     = trim($fila[7]) !== '' ? (int)$fila[7] : 0;

        // Validar que tenga al menos nombre
        if ($nombre === '') {
            $errores[] = "Fila $filaNum: sin nombre — omitida.";
            $omitidos++;
            continue;
        }

        // Evitar filas 100% idénticas (mismo nombre + codigo + costo)
        $chkStmt = $conexion->prepare("SELECT id FROM productos WHERE empresa_id = ? AND codigo = ? AND nombre = ? AND costo = ? LIMIT 1");
        $chkStmt->bind_param("issd", $empresa_id, $codigo, $nombre, $costo);
        $chkStmt->execute();
        if ($chkStmt->get_result()->num_rows > 0) {
            $chkStmt->close();
            $errores[] = "Fila $filaNum: '$nombre' con costo $costo ya existe en código '$codigo' — omitido.";
            $omitidos++;
            continue;
        }
        $chkStmt->close();

        // Calcular el próximo id_producto para este codigo (auto-increment por categoría)
        $maxStmt = $conexion->prepare("SELECT COALESCE(MAX(id_producto), 0) AS max_id FROM productos WHERE empresa_id = ? AND codigo = ?");
        $maxStmt->bind_param("is", $empresa_id, $codigo);
        $maxStmt->execute();
        $maxRow     = $maxStmt->get_result()->fetch_assoc();
        $idProducto = (int)$maxRow['max_id'] + 1;
        $maxStmt->close();

        $insStmt = $conexion->prepare(
            "INSERT INTO productos (id_producto, rubro, codigo, categoria, proveedor, nombre, costo, stock, descripcion, empresa_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?)"
        );
        $insStmt->bind_param("isssssdii", $idProducto, $rubro, $codigo, $categoria, $proveedor, $nombre, $costo, $stock, $empresa_id);
        if ($insStmt->execute()) {
            $insertados++;
        } else {
            $errores[] = "Fila $filaNum ('$nombre'): " . $conexion->error;
        }
        $insStmt->close();
    }

    fclose($handle);

    ob_end_clean();
    echo json_encode([
        'insertados'       => $insertados,
        'omitidos'         => $omitidos,
        'errores'          => $errores,
        'total_procesadas' => $filaNum - 1,
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    ob_end_clean();
    echo json_encode(['error' => 'Excepcion: ' . $e->getMessage() . ' (línea ' . $e->getLine() . ')'], JSON_UNESCAPED_UNICODE);
}
