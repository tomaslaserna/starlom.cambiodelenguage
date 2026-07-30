# Borrado de registros operativos

## Politica de permiso

Las ventas y compras solo se pueden borrar con el permiso sensible
`registros.borrar`. La autorizacion se resuelve por `profile_permissions`,
`app_permissions` y una membresia activa en `usuario_empresa`; no existe una
lista de nombres de usuario autorizados en el codigo.

La UI, las acciones de servidor y los endpoints deben delegar la decision final
en `requireOperationalRecordDeletePermission()`. No se debe agregar un permiso
de cancelacion previo que bloquee a un usuario que ya tiene `registros.borrar`.

## Atomicidad y protecciones

`deleteSale()` y `deletePurchase()` ejecutan toda la operacion dentro de
`withCompanyContext()`. Ese helper abre una transaccion, confirma al finalizar y
hace rollback ante cualquier error. Antes de borrar:

- La fila principal se bloquea con `FOR UPDATE`.
- Una venta fiscalizada no se puede borrar.
- Una venta o compra con pagos conciliados no se puede borrar.
- Se conserva una instantanea en `audit_log`.

Los eventos y auditorias se conservan como historia. `sales_admin_audit` pierde
la referencia directa por `ON DELETE SET NULL`, pero conserva la etiqueta y el
detalle del evento.

## Dependencias actuales

El orden explicito de borrado cubre las referencias que no pueden quedar vivas:

- Venta: movimientos de cuenta corriente, pagos, documentos de venta,
  movimientos de stock y pedidos.
- Compra: movimientos de cuenta corriente, pagos, movimientos de stock e
  items.

Las dependencias restantes se resuelven con las claves foraneas declaradas:
`sale_items`, documentos de entrega y documentos internos usan `CASCADE`;
`sales_admin_audit` usa `SET NULL`. Algunas referencias de compra en pagos y
cuentas corrientes todavia no tienen clave foranea, por eso su limpieza no se
puede delegar por completo al esquema.

## Lista de control para cambios de esquema

Cuando se agregue una tabla o columna que referencia ventas, compras, pagos u
ordenes:

1. Declarar una clave foranea y una estrategia `ON DELETE` explicita cuando sea
   compatible con el historial requerido.
2. Si la referencia debe borrarse manualmente, agregarla dentro de la misma
   transaccion y antes de la fila principal.
3. Mantener las protecciones de fiscalizacion y conciliacion.
4. Actualizar las pruebas de borrado y consultar referencias huerfanas antes de
   desplegar.
5. Verificar que un fallo intermedio produzca rollback completo.

En la revision del 23 de julio de 2026, la base activa no tenia referencias
huerfanas de compras en pagos, cuentas corrientes o stock, ni referencias
huerfanas de ventas en movimientos de stock.
