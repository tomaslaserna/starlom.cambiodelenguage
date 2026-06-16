<?php
// ══════════════════════════════════════════════════════════════════════════════
//  SIEMPRE responde JSON, aunque PHP tenga un error fatal.
// ══════════════════════════════════════════════════════════════════════════════
ob_start();
ini_set('display_errors', '0');

// 1) Atrapar errores fatales (E_ERROR, E_PARSE, etc.) y devolverlos como JSON
register_shutdown_function(function () {
    $err = error_get_last();
    if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR])) {
        ob_end_clean();
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'error' => 'Error PHP: ' . $err['message']
                     . ' — línea ' . $err['line']
                     . ' en ' . basename($err['file'])
        ], JSON_UNESCAPED_UNICODE);
    }
});

// 2) Convertir warnings/notices en excepciones para poder capturarlos
set_error_handler(function ($errno, $errstr, $errfile, $errline) {
    if ($errno === E_WARNING || $errno === E_USER_WARNING) {
        throw new ErrorException($errstr, 0, $errno, $errfile, $errline);
    }
    return true; // ignorar notices, deprecations, etc.
});

// ══════════════════════════════════════════════════════════════════════════════

session_start();
include 'conexion_starlim_be.php';

// Forzar charset UTF-8 también con SET NAMES (doble seguro)
$conexion->query("SET NAMES 'utf8mb4'");

header('Content-Type: application/json; charset=utf-8');

// Seguridad
if (!isset($_SESSION['rango']) || $_SESSION['rango'] !== 'Admin') {
    ob_end_clean();
    echo json_encode(['error' => 'Sin permisos para realizar esta acción.']);
    exit();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Detecta el encoding del archivo COMPLETO y lo convierte a UTF-8 una sola vez.
// Cubre: UTF-8 con BOM (Excel moderno), UTF-16 LE/BE, Windows-1252 (Excel viejo).
function archivoAUTF8($rutaArchivo) {
    $contenido = file_get_contents($rutaArchivo);

    // ── Detectar y quitar BOM ─────────────────────────────────────────────────
    if (substr($contenido, 0, 3) === "\xEF\xBB\xBF") {
        // UTF-8 con BOM → solo quitar el BOM
        return substr($contenido, 3);
    }
    if (substr($contenido, 0, 2) === "\xFF\xFE") {
        // UTF-16 Little Endian
        return mb_convert_encoding(substr($contenido, 2), 'UTF-8', 'UTF-16LE');
    }
    if (substr($contenido, 0, 2) === "\xFE\xFF") {
        // UTF-16 Big Endian
        return mb_convert_encoding(substr($contenido, 2), 'UTF-8', 'UTF-16BE');
    }

    // ── Sin BOM: verificar si ya es UTF-8 válido ──────────────────────────────
    if (preg_match('//u', $contenido)) {
        return $contenido; // Ya es UTF-8 limpio
    }

    // ── No es UTF-8: asumir Windows-1252 (exportación Excel en Windows) ───────
    return mb_convert_encoding($contenido, 'UTF-8', 'Windows-1252');
}

function limpiar($conn, $val) {
    return trim((string)($val ?? ''));
}

function parsearFecha($val) {
    $val = trim((string)($val ?? ''));
    if ($val === '' || $val === '0' || strtolower($val) === 'null' || $val === '-') return 'NULL';

    $formatos = ['d/m/Y', 'd/m/Y H:i:s', 'Y-m-d', 'Y-m-d H:i:s', 'd-m-Y', 'm/d/Y', 'd/m/y'];
    foreach ($formatos as $fmt) {
        $d = DateTime::createFromFormat($fmt, $val);
        if ($d !== false) return "'" . $d->format('Y-m-d H:i:s') . "'";
    }
    $ts = @strtotime($val);
    if ($ts && $ts > 0) return "'" . date('Y-m-d H:i:s', $ts) . "'";

    return 'NULL';
}

function parsearEstado($val) {
    $map = [
        'activo'    => 'Activo',
        'en riesgo' => 'En Riesgo',
        'riesgo'    => 'En Riesgo',
        'perdido'   => 'Perdido',
    ];
    return $map[strtolower(trim((string)($val ?? '')))] ?? 'Activo';
}

function parsearComprobante($val) {
    $map = [
        'factura b' => 'Factura B',
        'factura a' => 'Factura A',
        'remito'    => 'Remito',
        'b'         => 'Factura B',
        'a'         => 'Factura A',
    ];
    return $map[strtolower(trim((string)($val ?? '')))] ?? null;
}

// ── Todo el proceso dentro de try/catch ──────────────────────────────────────
try {

    if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !isset($_FILES['csv_file'])) {
        ob_end_clean();
        echo json_encode(['error' => 'No se recibió ningún archivo.']);
        exit();
    }

    $file = $_FILES['csv_file'];

    if ($file['error'] !== UPLOAD_ERR_OK) {
        ob_end_clean();
        echo json_encode(['error' => 'Error al subir el archivo. Código: ' . $file['error']]);
        exit();
    }

    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if ($ext !== 'csv') {
        ob_end_clean();
        echo json_encode(['error' => 'Solo se aceptan archivos .csv — Exportá el Excel como CSV primero.']);
        exit();
    }

    // Convertir TODO el archivo a UTF-8 de una sola vez (más confiable que campo a campo)
    $contenidoUTF8 = archivoAUTF8($file['tmp_name']);

    // Abrir stream en memoria con el contenido ya convertido
    $handle = fopen('php://temp', 'r+');
    if (!$handle) {
        ob_end_clean();
        echo json_encode(['error' => 'No se pudo crear el buffer en memoria.']);
        exit();
    }
    fwrite($handle, $contenidoUTF8);
    rewind($handle);
    unset($contenidoUTF8); // liberar memoria

    // Detectar delimitador
    $primeraLinea = fgets($handle);
    rewind($handle);
    $delimitador = (substr_count($primeraLinea, ';') >= substr_count($primeraLinea, ',')) ? ';' : ',';

    // Saltar encabezados
    fgetcsv($handle, 0, $delimitador);

    $insertados = 0;
    $omitidos   = 0;
    $errores    = [];
    $filaNum    = 1;

    while (($fila = fgetcsv($handle, 0, $delimitador)) !== false) {
        $filaNum++;

        // Saltar filas vacías
        $hayDatos = false;
        foreach ($fila as $celda) {
            if (trim($celda) !== '') { $hayDatos = true; break; }
        }
        if (!$hayDatos) continue;

        // Completar hasta 18 columnas
        while (count($fila) < 18) $fila[] = '';

        $codigo_cliente  = limpiar($conexion, $fila[0]);
        $nombre_cliente  = limpiar($conexion, $fila[1]);
        $razon_social    = limpiar($conexion, $fila[2]);
        $vendedor_cl     = limpiar($conexion, $fila[3]);
        $nro_id          = limpiar($conexion, preg_replace('/[^0-9]/', '', $fila[4]));
        $plazo_dias      = trim($fila[5]);
        $cond_iva        = limpiar($conexion, $fila[6]);
        $telefono        = (int) preg_replace('/\D/', '', $fila[7]);
        $estado          = parsearEstado($fila[8]);
        $domicilio       = limpiar($conexion, $fila[9]);
        $lista_precios   = limpiar($conexion, $fila[10]);
        $horarios        = limpiar($conexion, $fila[11]);
        $notas           = limpiar($conexion, $fila[12]);
        $comprobante_v   = parsearComprobante($fila[13]);
        $ultima_compra   = parsearFecha($fila[14]);
        $antiguedad_uc   = trim($fila[15]) !== '' ? (int)$fila[15] : null;
        $promedio_raw    = str_replace([',', ' ', '$'], ['.', '', ''], trim($fila[16]));
        $promedio_compra = is_numeric($promedio_raw) ? (float)$promedio_raw : null;
        $dia_recompra    = parsearFecha($fila[17]);

        $obs_partes = [];
        if ($notas !== '')                                  $obs_partes[] = $notas;
        if ($plazo_dias !== '' && is_numeric($plazo_dias))  $obs_partes[] = "Plazo de pago: {$plazo_dias} dias";
        $observacion = limpiar($conexion, implode(' | ', $obs_partes));

        if ($codigo_cliente === '' && $nombre_cliente === '') {
            $errores[] = "Fila $filaNum: sin codigo ni nombre — omitida.";
            $omitidos++;
            continue;
        }

        if ($codigo_cliente !== '') {
            $chk = $conexion->query("SELECT id FROM clientes WHERE codigo_cliente = '$codigo_cliente' LIMIT 1");
            if ($chk->num_rows > 0) {
                $errores[] = "Fila $filaNum: '$codigo_cliente' ya existe — omitido.";
                $omitidos++;
                continue;
            }
        }

        // Si el CSV no tiene comprobante válido, usar 'Factura B' como default
        // (la columna es NOT NULL, no acepta NULL)
        $comprobante_sql = "'" . ($comprobante_v ?? 'Factura B') . "'";
        $antiguedad_sql  = $antiguedad_uc !== null ? (int)$antiguedad_uc : 'NULL';
        $promedio_sql    = $promedio_compra !== null ? (float)$promedio_compra : 'NULL';

        $query = "INSERT INTO clientes (
            codigo_cliente, nombre_cliente, razon_social, vendedor_cl,
            tipo_id, nro_id, cond_iva, telefono, estado, domicilio,
            lista_precios, horarios, observacion, comprobante,
            ultima_compra, antiguedad_uc, promedio_compra, dia_recompra
        ) VALUES (
            '$codigo_cliente', '$nombre_cliente', '$razon_social', '$vendedor_cl',
            'CUIT', '$nro_id', '$cond_iva', $telefono, '$estado', '$domicilio',
            '$lista_precios', '$horarios', '$observacion', $comprobante_sql,
            $ultima_compra, $antiguedad_sql, $promedio_sql, $dia_recompra
        )";

        if ($conexion->query($query)) {
            $insertados++;
        } else {
            $errores[] = "Fila $filaNum ('$nombre_cliente'): " . $conexion->error;
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
    echo json_encode([
        'error' => 'Excepcion PHP: ' . $e->getMessage() . ' (linea ' . $e->getLine() . ')'
    ], JSON_UNESCAPED_UNICODE);
}
