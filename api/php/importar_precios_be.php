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
$conexion->query("SET NAMES 'utf8mb4'");

header('Content-Type: application/json; charset=utf-8');

if (!isset($_SESSION['rango']) || $_SESSION['rango'] !== 'Admin') {
    ob_end_clean();
    echo json_encode(['error' => 'Sin permisos para realizar esta acción.']);
    exit();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function archivoAUTF8_p($ruta) {
    $c = file_get_contents($ruta);
    if (substr($c, 0, 3) === "\xEF\xBB\xBF") return substr($c, 3);
    if (substr($c, 0, 2) === "\xFF\xFE")      return mb_convert_encoding(substr($c, 2), 'UTF-8', 'UTF-16LE');
    if (substr($c, 0, 2) === "\xFE\xFF")      return mb_convert_encoding(substr($c, 2), 'UTF-8', 'UTF-16BE');
    if (preg_match('//u', $c))                return $c;
    return mb_convert_encoding($c, 'UTF-8', 'Windows-1252');
}

function limpiar_p($conn, $val) {
    return trim((string)($val ?? ''));
}

// Convierte precios en formato argentino a decimal.
// Regla: el punto SIEMPRE es separador de miles, la coma es el decimal (si existe).
//   $8.625     → 8625.00   (ocho mil seiscientos veinticinco)
//   $1.234,56  → 1234.56
//   $10.753    → 10753.00
//   1500       → 1500.00
function toDecimal($val) {
    $v = trim((string)($val ?? ''));
    if ($v === '') return 0.0;

    // Quitar símbolo $ y espacios
    $v = str_replace(['$', ' '], '', $v);
    if ($v === '') return 0.0;

    if (strpos($v, ',') !== false) {
        // Hay coma → es el separador decimal; los puntos son de miles
        $v = str_replace('.', '', $v);   // quitar separadores de miles
        $v = str_replace(',', '.', $v);  // coma → punto decimal
    } else {
        // Sin coma → el punto es separador de miles solamente
        $v = str_replace('.', '', $v);
    }

    return is_numeric($v) ? (float)$v : 0.0;
}

// ── Proceso principal ─────────────────────────────────────────────────────────
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

    // Convertir todo el archivo a UTF-8
    $handle = fopen('php://temp', 'r+');
    fwrite($handle, archivoAUTF8_p($file['tmp_name']));
    rewind($handle);

    // Detectar delimitador
    $primera = fgets($handle);
    rewind($handle);
    $sep = (substr_count($primera, ';') >= substr_count($primera, ',')) ? ';' : ',';

    // ── Mapeo por nombre de columna (robusto ante columnas extra o distinto orden) ──
    $headers = fgetcsv($handle, 0, $sep);
    if (empty($headers)) {
        ob_end_clean(); echo json_encode(['error' => 'El archivo no tiene encabezados.']); exit();
    }

    // Normalizar: minúsculas, sin espacios extra, espacios → guion bajo
    $colMap = [];
    foreach ($headers as $i => $h) {
        $normalizado = strtolower(trim(preg_replace('/\s+/', '_', $h)));
        $colMap[$normalizado] = $i;
    }

    // Verificar que exista la columna clave
    if (!isset($colMap['nombre_producto'])) {
        ob_end_clean();
        echo json_encode(['error' => 'No se encontró la columna "nombre_producto" en el CSV. Encabezados detectados: ' . implode(', ', array_keys($colMap))]);
        exit();
    }

    // Helper: obtener valor de una columna por nombre, o '' si no existe
    $col = function($fila, $campo) use ($colMap) {
        return (isset($colMap[$campo]) && isset($fila[$colMap[$campo]])) ? $fila[$colMap[$campo]] : '';
    };

    // Errores de fórmula de Excel que pueden aparecer como texto en el CSV
    $erroresExcel = ['#¡ref!','#ref!','#n/a','#¡n/a!','#value!','#¡valor!',
                     '#div/0!','#¡div/0!','#name?','#¿nombre?','#null!',
                     '#¡nulo!','#num!','#¡núm!'];

    $insertados = 0;
    $omitidos   = 0;
    $errores    = [];
    $filaNum    = 1;

    while (($fila = fgetcsv($handle, 0, $sep)) !== false) {
        $filaNum++;

        $hayDatos = false;
        foreach ($fila as $c) { if (trim($c) !== '') { $hayDatos = true; break; } }
        if (!$hayDatos) continue;

        $nombre   = limpiar_p($conexion, $col($fila, 'nombre_producto'));
        $precio_1 = toDecimal($col($fila, 'precio_1'));
        $precio_2 = toDecimal($col($fila, 'precio_2'));
        $precio_3 = toDecimal($col($fila, 'precio_3'));
        $precio_4 = toDecimal($col($fila, 'precio_4'));
        $precio_0 = toDecimal($col($fila, 'precio_0'));
        $p_min    = toDecimal($col($fila, 'precio_minorista'));
        $p_min_r  = toDecimal($col($fila, 'precio_minorista_r'));

        if ($nombre === '') {
            $errores[] = "Fila $filaNum: sin nombre de producto — omitida.";
            $omitidos++;
            continue;
        }

        // Filtrar errores de fórmula de Excel (#¡REF!, #N/A, etc.)
        if (in_array(strtolower($nombre), $erroresExcel)) {
            $errores[] = "Fila $filaNum: error de fórmula Excel ('$nombre') — omitida.";
            $omitidos++;
            continue;
        }

        // Duplicado: mismo nombre Y mismos precios (mismo nombre con precios distintos se permite)
        $chk = $conexion->query("SELECT id FROM listas_precios
            WHERE nombre_producto = '$nombre'
              AND precio_1 = $precio_1 AND precio_2 = $precio_2
              AND precio_3 = $precio_3 AND precio_4 = $precio_4
              AND precio_0 = $precio_0
              AND precio_minorista = $p_min AND precio_minorista_r = $p_min_r
            LIMIT 1");
        if ($chk->num_rows > 0) {
            $errores[] = "Fila $filaNum: '$nombre' con esos precios ya existe — omitido.";
            $omitidos++;
            continue;
        }

        $query = "INSERT INTO listas_precios
                    (nombre_producto, precio_1, precio_2, precio_3, precio_4, precio_0, precio_minorista, precio_minorista_r)
                  VALUES
                    ('$nombre', $precio_1, $precio_2, $precio_3, $precio_4, $precio_0, $p_min, $p_min_r)";

        if ($conexion->query($query)) {
            $insertados++;
        } else {
            $errores[] = "Fila $filaNum ('$nombre'): " . $conexion->error;
        }
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
