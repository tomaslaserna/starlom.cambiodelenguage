# Stock, catalogo y sesiones operativas

## Decision de arquitectura

El catalogo y el inventario son responsabilidades separadas:

- `/pricing` crea productos, costos, categorias y listas de precio.
- `/products` informa existencias, costos, precios por lista y margen de ganancia.
- `/stock` permite elegir un producto y, desde su menú de opciones, modificar cantidades o ver su detalle.
- Ninguna edicion de catalogo reemplaza stock de forma directa.

`stock_movements` funciona como libro mayor append-only. Cada ajuste manual guarda
producto, tipo, cantidad positiva, motivo, usuario y una clave de idempotencia.
Las salidas bloquean el producto y vuelven a calcular la existencia dentro de la
misma transaccion para impedir stock negativo y carreras con pedidos.

## Ventanas de stock

La ventana **Modificación de producto** tiene un selector de producto y un menú con
dos opciones:

- **Modificar stock**: registra una entrada, una salida o un recuento exacto.
- **Ver detalle**: muestra los códigos, categoría, proveedor, costo, existencia y descripción.

La ventana **Información de stock** presenta el inventario paginado con cantidad y
costo. Cada producto incluye un desplegable con el precio de cada lista activa, la
ganancia en dinero y el porcentaje calculado sobre el costo.

## Carga masiva

La pantalla `/stock?mode=bulk` admite CSV y JSON. Siempre tiene dos etapas:

1. Validar y previsualizar, sin escribir en la base.
2. Aplicar todo el lote en una transaccion.

Columnas admitidas:

| Campo | Uso |
| --- | --- |
| `id_producto` | UUID del producto; recomendado |
| `codigo` | SKU unico, como alternativa al UUID |
| `tipo` | `entrada`, `salida` o `exacto` |
| `cantidad` | Cantidad positiva; `exacto` admite cero |
| `motivo` | Justificacion auditable |

JSON acepta tanto un array directo como `{ "items": [...] }`. El formato anterior
con `{ "id": "...", "stock": 10 }` se interpreta como recuento exacto y ya no
puede modificar nombre o costo por accidente.

Cada lote tiene un UUID y cada fila usa una clave `<lote>:<fila>`. Reintentar la
misma carga no duplica movimientos.

## Sesion

La sesion usa:

- vencimiento por inactividad de 2 horas;
- limite absoluto de 12 horas;
- revalidacion del usuario, empresa y rol cada 5 minutos;
- renovacion desde las pantallas operativas cada 4 minutos y al volver a la pestana.

Si la sesion vence, la pagina conserva la carga abierta y muestra acceso para
iniciar sesion en otra pestana. El destino de retorno se limita a rutas locales.

## Orden de publicacion

1. Aplicar `supabase/migrations/20260714213352_stock_movement_integrity.sql`.
2. Publicar la aplicacion.
3. Verificar una entrada, una salida, un recuento sin cambio y el reintento del
   mismo lote.

La migracion es aditiva y fue probada contra el esquema remoto dentro de una
transaccion con `ROLLBACK`.
