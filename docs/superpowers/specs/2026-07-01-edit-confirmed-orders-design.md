# Editar pedidos confirmados — Diseño

Fecha: 2026-07-01
Módulo: Comercial › Pedidos › Registro de pedidos (`/orders`) y editor (`/orders/[id]/edit`)

## Objetivo

Permitir modificar un pedido en estado `confirmado` (hoy solo se pueden editar
los `cargado`). Al guardar, el pedido vuelve a `cargado` para que se lo vuelva a
confirmar. Cubre el flujo "una vez aprobado por el cliente, si corresponde,
modificamos la solicitud".

## Contexto técnico (ya existente)

- Estados: `cargado → confirmado → entregado` (+ `cancelado`).
- El "reservado" de stock se **calcula en vivo** sumando los `sale_items` de los
  pedidos en estado `confirmado` no descontados (`disponible = real − reservado`).
  No hay ledger de reservas: revertir un pedido a `cargado` libera su reserva
  automáticamente.
- Confirmar **no** valida disponibilidad (la reserva puede sobre-comprometerse);
  el stock real recién se descuenta y valida al **entregar**. Por lo tanto editar
  un confirmado no agrega riesgo nuevo de stock.
- `updateBasicOrder` (`src/lib/orders.ts`) ya, en su `UPDATE`, setea
  `order_status='cargado'`, `status='cargado'`, `stock_discounted=false` y
  `collection_status='no_aplica'`. La lógica de "volver a cargado" ya está escrita;
  el único obstáculo es un candado de estado previo.

## Alcance (v1)

- Backend: relajar el candado para aceptar `cargado` **o** `confirmado`.
- UI del editor: renderizar el formulario también para `confirmado`, con un aviso.
- UI del registro: mostrar el botón "Modificar" también para `confirmado`.

Fuera de alcance: editar `entregado`/`cancelado` (siguen bloqueados); editar
manteniendo el estado `confirmado` sin reconfirmar; anulaciones fiscales.

## Cambios

### 1. Backend — `src/lib/orders.ts`, función `updateBasicOrder`

Candado actual (línea ~883):
```ts
if (normalizeOrderStatus(current.estado_pedido) !== "cargado") {
  throw new ApiError(400, "Solo se pueden modificar pedidos cargados antes de confirmarlos.");
}
```
Reemplazar por:
```ts
const estadoActual = normalizeOrderStatus(current.estado_pedido);
if (estadoActual !== "cargado" && estadoActual !== "confirmado") {
  throw new ApiError(400, "Solo se pueden modificar pedidos cargados o confirmados.");
}
```
El resto de la función queda igual: el `UPDATE` ya revierte a `cargado`, libera la
reserva (computada) y limpia `stock_discounted`/`collection_status`.

### 2. Editor — `src/app/orders/[id]/edit/page.tsx`

Condición actual (línea ~58): `order.orderStatus !== "cargado"` decide entre
mostrar el cartel de bloqueo o el formulario.

Cambiar la condición a: mostrar el **cartel de bloqueo** solo cuando el estado NO
sea editable, es decir `order.orderStatus !== "cargado" && order.orderStatus !== "confirmado"`.
Así `entregado`/`cancelado` siguen bloqueados y `cargado`/`confirmado` renderizan
el formulario.

Dentro de la rama del formulario, cuando `order.orderStatus === "confirmado"`,
mostrar un aviso ANTES del `<OrderEntryFields>`:
> "Este pedido está confirmado. Al guardar, volverá a **cargado** y tenés que
> confirmarlo nuevamente (se libera la reserva de stock hasta reconfirmar)."

Usar un panel de aviso con los componentes/estilos existentes (`Card`/`CardContent`
o un `div` con clases de la app; tono de advertencia).

Además, actualizar el texto del **cartel de bloqueo** (rama `entregado`/`cancelado`),
porque hoy menciona "Si ya fue confirmado..." y eso quedó obsoleto (confirmado ya
es editable). Nuevo texto sugerido: *"Solo se pueden modificar pedidos cargados o
confirmados. Un pedido entregado o cancelado no se edita."*

### 3. Registro — `src/app/orders/page.tsx`

Botón "Modificar" (línea ~336): hoy se renderiza con
`order.orderStatus === "cargado"`. Cambiar la condición a incluir también
`confirmado`:
```tsx
{order.orderStatus === "cargado" || order.orderStatus === "confirmado" ? (
  <ButtonLink ... href={`/orders/${order.id}/edit`} ...>Modificar</ButtonLink>
) : null}
```
(El resto de las acciones de la fila no cambia.)

## Sin cambios

- Permisos: sigue `pedidos.editar` (el rol `vendedor` no lo tiene; sí
  jefe/admin/deposito/logistica).
- Stock: la reserva se reajusta sola por ser computada.
- Redirect post-guardado: `updateLoadedOrderAction` ya redirige a
  `/orders?status=cargado`, que es correcto porque el pedido quedó en `cargado`.
- La acción `updateLoadedOrderAction` y `basicOrderInputFromBody` no cambian.

## Manejo de errores / bordes

- Editar `entregado` o `cancelado`: la UI no muestra el botón "Modificar" y, si se
  entra por URL directa a `/orders/[id]/edit`, se muestra el cartel de bloqueo. El
  backend además rechaza con 400 (candado relajado solo a cargado/confirmado).
- Pedido inexistente: `updateBasicOrder` ya lanza 404.
- Concurrencia: el `SELECT ... FOR UPDATE OF s` existente serializa la edición.

## Testing / verificación

No hay harness de tests unitarios para la lógica que toca la base en este
proyecto (tests actuales son estáticos + smoke). Verificación por flujo real
autenticado:

1. En el registro, un pedido `confirmado` ahora muestra "Modificar".
2. Abrir el editor de un `confirmado` → aparece el formulario con el aviso.
3. Cambiar una cantidad y guardar → el pedido queda en `cargado` con el cambio, y
   la reserva de stock se libera (el `disponible` del producto sube).
4. Un pedido `entregado` sigue sin botón "Modificar" y, por URL directa, muestra el
   cartel de bloqueo.

Adicional: revisión cuidadosa del cambio del candado (que siga bloqueando
`entregado`/`cancelado`).

## Archivos afectados

- Editar: `src/lib/orders.ts` (candado en `updateBasicOrder`)
- Editar: `src/app/orders/[id]/edit/page.tsx` (condición + aviso)
- Editar: `src/app/orders/page.tsx` (condición del botón "Modificar")
