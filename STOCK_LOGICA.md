# Logica actual de stock

## Archivos revisados

- `api/frontend/factura_manual.php`
- `api/php/emitir_factura_manual.php`
- `api/php/actualizar_estado_pedido.php`
- `api/php/actualizar_campo_venta.php`
- `api/php/pedido_stock.php`
- `api/frontend/compras.php`
- `api/php/compras_paquete_ajax.php`
- `api/php/crear_nota_venta.php`
- `api/php/actualizar_producto_ajax.php`
- `api/php/aplicar_reconteo.php`
- `api/php/stock_upload_be.php`
- `db_fixes.sql`

## Tablas y vistas principales

- `productos.stock`: stock fisico actual.
- `ventas.estado_pedido`: ciclo del pedido (`recibido`, `en_proceso`, `pendiente_entrega`, `entregado`).
- `ventas.stock_descontado`: flag que evita descontar dos veces un pedido entregado.
- `detalle_ventas`: productos y cantidades comprometidas por pedido.
- `remitos` y `detalle_remitos`: copia operativa del pedido para deposito/logistica.
- `vista_stock_disponible`: stock real menos reservado por pedidos vivos no entregados.
- `compras_registro` y `detalle_compras_registro`: compras a proveedores y productos comprados.
- `stock_modificaciones`: auditoria parcial de ediciones manuales de productos.
- `comprobantes_venta`: notas de credito/debito que ajustan stock.

## Flujo actual

1. Carga de pedido:
   - `factura_manual.php` trae productos desde `vista_stock_disponible`.
   - `emitir_factura_manual.php` valida disponibilidad, pero permite continuar con advertencia.
   - La carga crea una fila en `ventas` con `estado_pedido = 'recibido'` y `stock_descontado = 0`.
   - Tambien crea `detalle_ventas`, `remitos` y `detalle_remitos`.
   - No descuenta stock fisico al crear el pedido.

2. Reserva de stock:
   - La reserva es calculada por `vista_stock_disponible`.
   - La vista descuenta de `productos.stock` las cantidades de pedidos en `recibido`, `en_proceso` o `pendiente_entrega` con `stock_descontado = 0`.
   - No hay tabla de movimientos de reserva; es una vista calculada.

3. Entrega de pedido:
   - `actualizar_estado_pedido.php` avanza solo hacia adelante.
   - Al pasar a `entregado`, llama a `starlim_descontar_stock_venta()`.
   - `pedido_stock.php` hace un claim atomico: cambia `stock_descontado` de 0 a 1.
   - Si gana el claim, resta `detalle_ventas.cantidad` a `productos.stock`.

4. Edicion de estado desde ventas:
   - `actualizar_campo_venta.php` tambien puede cambiar `estado_pedido`.
   - Si el nuevo estado es `entregado`, llama al mismo descuento atomico.
   - Este endpoint no aplica la misma regla estricta de avance hacia adelante.

5. Compras:
   - Crear o editar un registro en `compras.php` no suma stock.
   - Cambiar una compra a `recibida` tampoco suma stock por si solo.
   - El stock se suma en `compras_paquete_ajax.php` cuando se marca paquete revisado o se confirma una falla con cantidades recibidas.
   - `compras_registro.stock_actualizado` existe en schema, pero no se usa como guardia en ese flujo.

6. Ajustes manuales:
   - `actualizar_producto_ajax.php` puede sobrescribir `productos.stock` y deja auditoria en `stock_modificaciones`.
   - `aplicar_reconteo.php` fija stock exacto o aplica delta, pero no registra detalle en `stock_modificaciones`.
   - `stock_upload_be.php` crea productos nuevos con stock inicial.

7. Notas de credito/debito:
   - `crear_nota_venta.php` ajusta stock sobre ventas entregadas o remitos legacy.
   - Nota de credito suma stock.
   - Nota de debito descuenta stock con `GREATEST(0, stock + delta)`, por lo que no permite negativo.

## Riesgos detectados

- Posible doble suma de stock en compras si se repite la accion de revisar paquete o confirmar falla, porque no se usa `stock_actualizado` como guardia atomica.
- Si una compra se elimina o cambia de estado despues de haber sumado stock, no se ve una reversa automatica.
- `actualizar_campo_venta.php` permite cambios directos de estado sin validar avance secuencial; podria mover un pedido entregado a otro estado sin devolver stock.
- No hay flujo formal de cancelacion de pedidos con devolucion de reservas o stock fisico segun estado.
- No hay ledger unico de movimientos de stock; hay stock fisico, vista de disponible y auditorias parciales.
- `aplicar_reconteo.php` modifica stock sin dejar una auditoria comparable a `actualizar_producto_ajax.php`.
- Las notas de debito no permiten stock negativo, pero pueden ocultar faltantes reales al clavar el valor en cero.

## Recomendaciones

- Centralizar todo cambio de stock en un servicio unico con transacciones.
- Usar `compras_registro.stock_actualizado` como flag atomico antes de sumar stock recibido.
- Crear una tabla `stock_movimientos` para ventas, compras, ajustes, reconteos, notas y reversas.
- Agregar flujo explicito de cancelacion de pedido con reglas distintas antes y despues de entrega.
- Restringir `actualizar_campo_venta.php` para que use las mismas transiciones que `actualizar_estado_pedido.php`.
- Registrar auditoria en `aplicar_reconteo.php`.
- Revisar reportes para distinguir stock fisico, reservado, disponible y faltante.
