<?php
/**
 * pedido_stock.php — Descuento de stock al ENTREGAR un pedido.
 *
 * Hasta que se entrega, el pedido solo "reserva" stock (vista_stock_disponible);
 * el físico (productos.stock) se descuenta una única vez acá. El claim del flag
 * stock_descontado es atómico (UPDATE condicional) para que dos requests
 * simultáneos no dupliquen el descuento.
 */

function starlim_descontar_stock_venta($conexion, int $id_venta): bool
{
    // Claim atómico del flag: si otro request ya lo tomó, no hacemos nada.
    $claim = $conexion->prepare(
        "UPDATE ventas SET stock_descontado = 1
         WHERE id = ? AND COALESCE(stock_descontado, 0) = 0"
    );
    $claim->bind_param('i', $id_venta);
    $claim->execute();
    $gano = $claim->affected_rows > 0;
    $claim->close();

    if (!$gano) return false;

    $det = $conexion->prepare("SELECT id_producto, cantidad FROM detalle_ventas WHERE id_venta = ?");
    $det->bind_param('i', $id_venta);
    $det->execute();
    $det_res = $det->get_result();
    while ($d = $det_res->fetch_assoc()) {
        $upd = $conexion->prepare("UPDATE productos SET stock = stock - ? WHERE id = ?");
        $upd->bind_param('ii', $d['cantidad'], $d['id_producto']);
        $upd->execute();
        $upd->close();
    }
    $det->close();

    return true;
}
