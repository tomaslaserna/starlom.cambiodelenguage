<?php
// procesar_pago.php
include 'conexion_starlim_be.php';
include '../facturacion/generar_factura.php';

if (!isset($_POST['dni_cliente'], $_POST['monto'], $_POST['id_producto'])) {
    die("Error: Faltan datos del formulario.");
}

$dni         = trim($_POST['dni_cliente']);
$monto       = trim($_POST['monto']);
$id_producto = trim($_POST['id_producto']);

if (!is_numeric($dni) || !is_numeric($monto) || !is_numeric($id_producto)) {
    die("Error: Los datos recibidos no son válidos.");
}

$resultado = emitirFacturaARCA($dni, $monto);

if ($resultado['success']) {
    $cae         = $resultado['CAE'];
    $vencimiento = $resultado['vencimiento'];
    $comprobante = $resultado['comprobante'];

    // Venta de mostrador/web ya facturada y retirada: nace 'entregado' con
    // stock_descontado=1 para no entrar al circuito de Pedidos (este flujo
    // no genera detalle_ventas, así que no puede reservar ni descontar stock).
    $stmt = $conexion->prepare(
        "INSERT INTO ventas (id_producto, dni_cliente, monto, cae, vencimiento_cae, nro_comprobante, fecha, estado_pedido, stock_descontado)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), 'entregado', 1)"
    );
    $stmt->bind_param("issssi", $id_producto, $dni, $monto, $cae, $vencimiento, $comprobante);

    if ($stmt->execute()) {
        echo "Venta registrada y facturada con éxito.<br>";
        echo "CAE: " . htmlspecialchars($cae) . "<br>";
        echo "Vencimiento: " . htmlspecialchars($vencimiento) . "<br>";
        echo "Comprobante Nro: " . htmlspecialchars($comprobante);
    } else {
        echo "Error al guardar en la base de datos.";
    }
    $stmt->close();

} else {
    echo "Error con ARCA: " . htmlspecialchars($resultado['error']);
}