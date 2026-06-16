<?php
/**
 * GET /integracion/stock.php — Consulta de disponibilidad de productos.
 *
 * Parámetros:
 *   q        texto a buscar en nombre o código (ej: "guantes")
 *   codigo   código de categoría exacto (ej: "A11")
 *   limite   default 50, tope 200
 *
 * No expone costos. Devuelve nombre, código, categoría, rubro y stock:
 *   stock      = disponible (real menos reservado por pedidos sin entregar)
 *   stock_real = físico en las instalaciones
 *   reservado  = comprometido por pedidos en armado/sin entregar
 */

require __DIR__ . '/_auth.php';

$q      = trim($_GET['q'] ?? '');
$codigo = strtoupper(trim($_GET['codigo'] ?? ''));
$limite = max(1, min(200, (int) ($_GET['limite'] ?? 50)));

$pdo = $conexion->getPDO();

$where  = [];
$params = [];
if ($q !== '') {
    $where[]  = '(nombre ILIKE ? OR descripcion ILIKE ?)';
    $params[] = '%' . $q . '%';
    $params[] = '%' . $q . '%';
}
if ($codigo !== '') { $where[] = 'codigo = ?'; $params[] = $codigo; }
$where_sql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

// 'stock' = disponible para no romper el bot que ya consume esta clave.
$stmt = $pdo->prepare(
    "SELECT id, id_producto, codigo, rubro, categoria, nombre,
            disponible AS stock, stock_real, reservado
     FROM vista_stock_disponible $where_sql ORDER BY nombre ASC LIMIT $limite"
);
$stmt->execute($params);
$filas = $stmt->fetchAll();

integracion_responder(200, ['ok' => true, 'cantidad' => count($filas), 'productos' => $filas]);
