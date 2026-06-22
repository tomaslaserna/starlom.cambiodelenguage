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
$conexion->query("SET NAMES 'utf8mb4'");

header('Content-Type: application/json; charset=utf-8');

if (!isset($_SESSION['rango']) || $_SESSION['rango'] !== 'Admin') {
    ob_end_clean();
    echo json_encode(['error' => 'Sin permisos.']);
    exit();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function archivoAUTF8_c($ruta) {
    $c = file_get_contents($ruta);
    if (substr($c, 0, 3) === "\xEF\xBB\xBF") return substr($c, 3);
    if (substr($c, 0, 2) === "\xFF\xFE")      return mb_convert_encoding(substr($c, 2), 'UTF-8', 'UTF-16LE');
    if (substr($c, 0, 2) === "\xFE\xFF")      return mb_convert_encoding(substr($c, 2), 'UTF-8', 'UTF-16BE');
    if (preg_match('//u', $c))                return $c;
    return mb_convert_encoding($c, 'UTF-8', 'Windows-1252');
}

function limpiar_c($conn, $val) {
    return $conn->real_escape_string(trim((string)($val ?? '')));
}

// Formato argentino: punto = miles, coma = decimal
function toDecimal_c($val) {
    $v = trim(str_replace(['$', ' '], '', (string)($val ?? '')));
    if ($v === '') return null;
    if (strpos($v, ',') !== false) {
        $v = str_replace('.', '', $v);
        $v = str_replace(',', '.', $v);
    } else {
        $v = str_replace('.', '', $v);
    }
    return is_numeric($v) ? (float)$v : null;
}

// ── Proceso ───────────────────────────────────────────────────────────────────
try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !isset($_FILES['csv_file'])) {
        ob_end_clean(); echo json_encode(['error' => 'No se recibió archivo.']); exit();
    }
    $file = $_FILES['csv_file'];
    if ($file['error'] !== UPLOAD_ERR_OK) {
        ob_end_clean(); echo json_encode(['error' => 'Error al subir. Código: ' . $file['error']]); exit();
    }
    if (strtolower(pathinfo($file['name'], PATHINFO_EXTENSION)) !== 'csv') {
        ob_end_clean(); echo json_encode(['error' => 'Solo archivos .csv']); exit();
    }

    // Convertir a UTF-8 y cargar en memoria
    $handle = fopen('php://temp', 'r+');
    fwrite($handle, archivoAUTF8_c($file['tmp_name']));
    rewind($handle);

    // Detectar delimitador
    $primera = fgets($handle);
    rewind($handle);
    $sep = (substr_count($primera, ';') >= substr_count($primera, ',')) ? ';' : ',';

    // Leer encabezados (y descartarlos)
    fgetcsv($handle, 0, $sep);

    /*
     * Columnas del CSV:
     *  0  codigo   → nuevo código (A14, D25, etc.)
     *  1  NOMBRES  → nombre del producto (para buscar en BD)
     *  2  COSTO    → costo en formato argentino (para diferenciar duplicados)
     */
    $actualizados   = 0;
    $noEncontrados  = [];
    $errores        = [];
    $filaNum        = 1;

    while (($fila = fgetcsv($handle, 0, $sep)) !== false) {
        $filaNum++;

        // Saltar filas vacías
        $hayDatos = false;
        foreach ($fila as $c) { if (trim($c) !== '') { $hayDatos = true; break; } }
        if (!$hayDatos) continue;

        while (count($fila) < 3) $fila[] = '';

        $codigo_nuevo = strtoupper(limpiar_c($conexion, $fila[0]));
        $nombre       = limpiar_c($conexion, $fila[1]);
        $costo        = toDecimal_c($fila[2]);

        if ($codigo_nuevo === '' || $nombre === '') {
            $errores[] = "Fila $filaNum: código o nombre vacío — omitida.";
            continue;
        }

        // Buscar el producto por nombre + costo
        $where = "empresa_id = $empresaId AND nombre = '$nombre'";
        if ($costo !== null) {
            $where .= " AND costo = $costo";
        }

        $chk = $conexion->query("SELECT id FROM productos WHERE $where LIMIT 10");

        if ($chk->num_rows === 0) {
            $noEncontrados[] = "Fila $filaNum: \"$nombre\"" . ($costo !== null ? " (costo: $$costo)" : '') . " — no encontrado en BD.";
            continue;
        }

        // Actualizar todos los que coincidan
        $upd = $conexion->query("UPDATE productos SET codigo = '$codigo_nuevo' WHERE $where");
        if ($upd) {
            $actualizados += $conexion->affected_rows;
        } else {
            $errores[] = "Fila $filaNum (\"$nombre\"): " . $conexion->error;
        }
    }

    fclose($handle);

    ob_end_clean();
    echo json_encode([
        'actualizados'    => $actualizados,
        'no_encontrados'  => $noEncontrados,
        'errores'         => $errores,
        'total_procesadas'=> $filaNum - 1,
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    ob_end_clean();
    echo json_encode(['error' => 'Excepción: ' . $e->getMessage() . ' (línea ' . $e->getLine() . ')'], JSON_UNESCAPED_UNICODE);
}
