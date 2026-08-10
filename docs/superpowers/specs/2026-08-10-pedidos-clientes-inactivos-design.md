# Permitir pedidos y presupuestos a clientes inactivos

**Fecha:** 2026-08-10
**Estado:** Aprobado, pendiente de implementación

## Problema

El sistema no deja cargar un pedido a un cliente que está en la base pero marcado
como inactivo (`clients.active = false`). El caso disparador fue el cliente
**APADRO** (`id 069aeca6-cf91-4605-b813-a8d5f906d736`, `empresa_id = 1`), que
existía con 11 ventas históricas pero estaba inactivo, por lo que:

- No aparecía en el buscador de cliente del formulario de pedido.
- Si se forzaba, la validación al crear devolvía `Cliente no encontrado` (HTTP 404).

No es un problema de datos puntual de APADRO: la regla de negocio deseada es que
**cualquier** cliente inactivo pueda usarse para operar.

## Causa

Cuatro filtros `active = true` en el flujo comercial:

| # | Ubicación | Rol |
|---|-----------|-----|
| 1 | `getOrderFormData` — `apps/web/src/lib/orders.ts:676` | Buscador de cliente (compartido por Pedidos, Presupuestos y edición de pedido) |
| 2 | `getOrderCustomer` — `apps/web/src/lib/orders.ts:495` | Validación de cliente al crear/editar un pedido |
| 3 | Validación de cliente en presupuestos — `apps/web/src/lib/quotes.ts:491` | Validación al crear un presupuesto |
| 4 | Búsqueda por CUIT en conversión presupuesto→venta — `apps/web/src/lib/quotes.ts:753` | Enlace a cliente existente al convertir |

## Regla de negocio resultante

- **Cargar un pedido** a un cliente inactivo (directo o por conversión de
  presupuesto) → se permite **y reactiva** al cliente (`active = true`).
- **Crear un presupuesto** para un cliente inactivo → se permite, **no** reactiva
  (un presupuesto es no vinculante; el cliente sigue inactivo hasta que se le
  cargue un pedido real).
- El cliente inactivo aparece en el buscador **igual** que uno activo, sin
  etiqueta ni distinción visual.

## Cambios

### 1. Buscador de cliente (compartido)
`getOrderFormData` — `apps/web/src/lib/orders.ts:676`. Quitar `AND active = true`
de la consulta de `clients`. Efecto: los inactivos aparecen en el buscador de
Pedidos (`/orders/new`), Presupuestos (`/quotes`) y edición de pedido
(`/orders/[id]/edit`). No se agrega el campo `active` al tipo `OrderFormClient`
(no hay señal visual, así que no hace falta en el cliente).

Nota: `getOrderFormData` también lo consumen `/prices/offers`, `/pricing/offers`
y `/quotes`; el cambio en la lista de clientes es inocuo para las pantallas de
ofertas (usan principalmente productos/ofertas) e intencional para presupuestos.

### 2. Validación al crear/editar pedido + auto-reactivación
`getOrderCustomer` — `apps/web/src/lib/orders.ts:495`:
- Quitar `AND active = true` de la consulta.
- Agregar `active` al `SELECT`.
- Si el cliente estaba inactivo, dentro de la **misma transacción** (el
  `PoolClient` que ya recibe la función), ejecutar
  `UPDATE clients SET active = true, updated_at = now() WHERE id = $1 AND empresa_id = $2 AND active = false`.

`getOrderCustomer` hoy solo lo usa `createBasicOrder` (`orders.ts:523`), por lo
que la reactivación se aplica al crear el pedido.

### 3. Validación al crear presupuesto
Validación de cliente en presupuestos — `apps/web/src/lib/quotes.ts:491`. Quitar
`AND active = true`. Permite presupuestar a inactivos, **sin** reactivar.

### 4. Conversión presupuesto → venta
`apps/web/src/lib/quotes.ts:753` (búsqueda de cliente por CUIT dentro de la
conversión). Quitar `AND active = true` para que enganche al cliente inactivo
existente en vez de crear un duplicado. Como la conversión genera una venta
(pedido en estado `cargado`), reactivar el cliente resultante si estaba inactivo,
dentro de la misma transacción, consistente con el punto 2. Cubrir tanto el caso
en que el presupuesto ya referencia al cliente por `client_id` como el matcheado
por CUIT: tras resolver el `clientId` final, ejecutar
`UPDATE clients SET active = true, updated_at = now() WHERE id = <clientId> AND empresa_id = <companyId> AND active = false`.

## Fuera de alcance (YAGNI)

- Filtro `active = true` de **productos** (`orders.ts:742`, `orders.ts:559`,
  `quotes.ts:427`) — sin cambios.
- El concepto de activo/inactivo en el CRM y demás listados — sin cambios.
- No se agrega botón de reactivar manual en la UI (la reactivación queda cubierta
  por el flujo de pedido).
- Sin señal visual de "inactivo" en el buscador (decisión explícita del usuario).

## Verificación

1. **Reproducción previa** (con un cliente inactivo cualquiera): no aparece en el
   buscador de `/orders/new`; forzar la creación devuelve `Cliente no encontrado`.
2. **Después del cambio:**
   - El cliente inactivo aparece en el buscador de `/orders/new` y `/quotes`.
   - Se puede crear un pedido a su nombre sin error.
   - Tras crear el pedido, el cliente queda `active = true` en la base.
   - Crear un presupuesto a un inactivo funciona y lo deja `active = false`.
   - Convertir un presupuesto de un cliente inactivo (o con CUIT que matchea uno
     inactivo) reutiliza ese cliente (no crea duplicado) y lo deja `active = true`.
3. Tests automatizados alrededor de `getOrderCustomer` (permite inactivo +
   reactiva) y de la conversión de presupuestos, siguiendo el patrón de tests
   existente del repo.

## Acción operativa ya realizada

APADRO (`id 069aeca6-cf91-4605-b813-a8d5f906d736`, `empresa_id = 1`) fue
reactivado manualmente en producción el 2026-08-10
(`active: false → true`), para desbloquear al usuario de inmediato. El cambio de
código de este spec evita que el problema se repita con otros clientes.
