<?php
/**
 * /integracion/clientes.php — Clientes del ERP.
 *
 * GET  — buscar/listar (para deduplicación de leads):
 *   telefono   búsqueda por teléfono (match parcial, ignora espacios/guiones)
 *   nro_id     CUIT/DNI exacto
 *   q          texto libre sobre nombre comercial / razón social
 *   limite     default 100, tope 500
 *
 * POST — crear cliente (lead convertido). JSON o form-data:
 *   nombre_cliente (requerido), telefono, razon_social, tipo_id, nro_id,
 *   cond_iva, domicilio, ciudad, provincia, observacion, lista_precios, vendedor_cl
 *   Si ya existe un cliente con el mismo teléfono o nro_id → 409 con el id existente.
 */

require __DIR__ . '/_auth.php';

$pdo = $conexion->getPDO();

/* ════════ GET: búsqueda ════════ */
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $telefono = preg_replace('/[^0-9+]/', '', $_GET['telefono'] ?? '');
    $nro_id   = trim($_GET['nro_id'] ?? '');
    $q        = trim($_GET['q'] ?? '');
    $limite   = max(1, min(500, (int) ($_GET['limite'] ?? 100)));

    $where  = [];
    $params = [];
    if ($telefono !== '') {
        // comparar sin separadores: el campo puede tener "351-555 1234"
        $where[]  = "REPLACE(REPLACE(REPLACE(telefono, '-', ''), ' ', ''), '.', '') LIKE ?";
        $params[] = '%' . $telefono . '%';
    }
    if ($nro_id !== '') { $where[] = 'nro_id = ?'; $params[] = $nro_id; }
    if ($q !== '') {
        $where[]  = '(nombre_cliente ILIKE ? OR razon_social ILIKE ?)';
        $params[] = '%' . $q . '%';
        $params[] = '%' . $q . '%';
    }
    $where_sql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

    $stmt = $pdo->prepare(
        "SELECT id, codigo_cliente, nombre_cliente, razon_social, tipo_id, nro_id,
                cond_iva, telefono, estado, domicilio, ciudad, provincia,
                lista_precios, vendedor_cl, ultima_compra, activo
         FROM clientes $where_sql ORDER BY id DESC LIMIT $limite"
    );
    $stmt->execute($params);
    $filas = $stmt->fetchAll();
    integracion_responder(200, ['ok' => true, 'cantidad' => count($filas), 'clientes' => $filas]);
}

/* ════════ POST: alta ════════ */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = $_POST;
    if (empty($body)) {
        $raw  = file_get_contents('php://input');
        $body = json_decode($raw ?: '[]', true);
        if (!is_array($body)) {
            integracion_responder(400, ['ok' => false, 'error' => 'Body inválido: enviá JSON o form-data.']);
        }
    }

    $nombre = trim($body['nombre_cliente'] ?? '');
    if ($nombre === '') {
        integracion_responder(400, ['ok' => false, 'error' => 'nombre_cliente es requerido.']);
    }

    $telefono = trim($body['telefono'] ?? '');
    $nro_id   = trim($body['nro_id'] ?? '');

    // ── Deduplicación ──
    if ($telefono !== '') {
        $tel_limpio = preg_replace('/[^0-9+]/', '', $telefono);
        $dup = $pdo->prepare(
            "SELECT id, nombre_cliente FROM clientes
             WHERE REPLACE(REPLACE(REPLACE(telefono, '-', ''), ' ', ''), '.', '') LIKE ? LIMIT 1"
        );
        $dup->execute(['%' . $tel_limpio . '%']);
        if ($row = $dup->fetch()) {
            integracion_responder(409, ['ok' => false, 'error' => 'Ya existe un cliente con ese teléfono.',
                                        'cliente_existente' => $row]);
        }
    }
    if ($nro_id !== '') {
        $dup = $pdo->prepare("SELECT id, nombre_cliente FROM clientes WHERE nro_id = ? LIMIT 1");
        $dup->execute([$nro_id]);
        if ($row = $dup->fetch()) {
            integracion_responder(409, ['ok' => false, 'error' => 'Ya existe un cliente con ese CUIT/DNI.',
                                        'cliente_existente' => $row]);
        }
    }

    $campos = [
        'nombre_cliente' => $nombre,
        'razon_social'   => trim($body['razon_social'] ?? ''),
        'tipo_id'        => trim($body['tipo_id'] ?? ''),
        'nro_id'         => $nro_id,
        'cond_iva'       => trim($body['cond_iva'] ?? ''),
        'telefono'       => $telefono,
        'domicilio'      => trim($body['domicilio'] ?? ''),
        'ciudad'         => trim($body['ciudad'] ?? ''),
        'provincia'      => trim($body['provincia'] ?? ''),
        'observacion'    => trim($body['observacion'] ?? ''),
        'lista_precios'  => trim($body['lista_precios'] ?? ''),
        'vendedor_cl'    => trim($body['vendedor_cl'] ?? ''),
        'estado'         => 'activo',
        'activo'         => 'true',
    ];

    $cols  = implode(', ', array_keys($campos));
    $marks = implode(', ', array_fill(0, count($campos), '?'));
    $stmt  = $pdo->prepare("INSERT INTO clientes ($cols) VALUES ($marks) RETURNING id");
    $stmt->execute(array_values($campos));
    $nuevo_id = (int) $stmt->fetchColumn();

    require_once __DIR__ . '/../php/integracion_eventos.php';
    starlim_evento_registrar($conexion, 'cliente.creado', [
        'id' => $nuevo_id, 'nombre_cliente' => $nombre, 'origen' => 'api_integracion',
    ]);

    integracion_responder(201, ['ok' => true, 'id' => $nuevo_id]);
}

integracion_responder(405, ['ok' => false, 'error' => 'Método no soportado. Usá GET o POST.']);
