# Pedidos: prueba integral y política de stock

Fecha: 2026-07-20
Alcance: `/orders/new`, `/orders`, `/orders/[id]/edit` y `/sales`.

## Recorrido verificado

Se ejecutó un flujo autenticado y reversible contra la aplicación publicada:

1. Selección de cliente, comprobante y lista de precios.
2. Búsqueda de producto, visualización de precio, cantidad, descuento, agregado con botón y Enter, edición y eliminación de renglón.
3. Fecha, observación, vista previa de WhatsApp, opción de mostrar precios, IVA y copia al portapapeles.
4. Creación, búsqueda, filtros, limpieza, modificación y PDFs operativos.
5. Cancelación y borrado de un pedido de prueba.
6. Entrega, aparición en Ventas, PDF de solicitud y borrado de una venta de prueba.
7. Verificación directa de estados, eventos, movimientos y stock en PostgreSQL.

No se envió ningún mensaje de WhatsApp; sólo se validaron la vista previa y la URL generada.

## Fallos encontrados

- Pedidos permitía `cargado -> entregado`, aunque la lógica administrativa y la documentación exigían `cargado -> confirmado -> entregado`.
- La falta de stock lanzaba un error de dominio 409 dentro de una Server Action sin manejo visible y Next.js mostraba la pantalla genérica de error.
- Confirmar no impedía sobre-reservar stock, por lo que el faltante podía descubrirse demasiado tarde, durante la entrega.
- “Limpiar” quitaba el filtro de la URL y de los datos, pero el selector de estado podía seguir mostrando el valor anterior por conservar un `defaultValue` montado.
- El editor habilitaba ofertas aunque la carga inicial las bloqueara por no alcanzar el punto de equilibrio.
- Los errores esperables al borrar pedidos o ventas podían propagarse como error de servidor.

## Política vigente tras el ajuste solicitado

- El menú de un pedido abierto muestra únicamente `Entregado`, `Cancelar`, `Modificar` y `Ver PDF`.
- Flujo visible: `cargado -> entregado`; no requiere una confirmación intermedia.
- Se permite cancelar desde `cargado` o `confirmado`.
- Mientras no exista un inventario inicial confiable, la entrega no exige saldo disponible. Dentro de la misma transacción registra `salida_venta`, marca `stock_discounted` y abre el cobro, aunque el saldo calculado pueda quedar temporalmente negativo.
- Los pedidos `confirmado` existentes siguen admitiendo entrega, cancelación y modificación por compatibilidad; editar uno lo devuelve a `cargado`.
- Los demás errores esperables vuelven al módulo con un mensaje visible, sin derribar la página.

## Limpieza de la prueba

Los dos registros de prueba se borraron desde los botones de la aplicación. La verificación final confirmó cero ventas, ítems y movimientos operativos asociados; el producto usado volvió exactamente de `22.997` a `23.000`, con el mismo conteo de movimientos previo a la prueba. Se conservó una entrada `sale.deleted` por cada borrado, como exige la auditoría.
