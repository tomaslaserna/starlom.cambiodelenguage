# Editar Pedidos Confirmados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir modificar pedidos en estado `confirmado` (hoy solo `cargado`); al guardar, el pedido vuelve a `cargado` para reconfirmarse.

**Architecture:** Relajar un candado de estado en `updateBasicOrder` (la función ya revierte a `cargado` y libera la reserva computada), y habilitar la UI del editor y del registro para `confirmado`. Los tres cambios están acoplados (sin el backend, el guardado falla), así que van en una sola tarea.

**Tech Stack:** Next.js 16 (server components + server actions), TypeScript, Postgres (pg). Sin nuevas dependencias.

## Global Constraints

- Solo `cargado` y `confirmado` son editables; `entregado` y `cancelado` siguen bloqueados (UI y backend).
- Editar un `confirmado` lo revierte a `cargado` (comportamiento ya presente en el `UPDATE` de `updateBasicOrder`); no se mantiene el estado `confirmado`.
- Sin cambios de permisos (sigue `pedidos.editar`), de stock (la reserva es computada y se reajusta sola), ni del redirect post-guardado (`/orders?status=cargado`).
- Reusar componentes/estilos existentes (`@/components/ui`, CSS vars como `var(--border)`, `var(--panel-subtle)`, `var(--muted)`).
- No hay harness de tests unitarios para lógica que toca la base; la verificación es lint + compilación + flujo real autenticado.

---

### Task 1: Habilitar edición de pedidos confirmados (backend + UI)

**Files:**
- Modify: `apps/web/src/lib/orders.ts` (candado en `updateBasicOrder`, ~línea 883)
- Modify: `apps/web/src/app/orders/[id]/edit/page.tsx` (condición de bloqueo + aviso + texto del cartel)
- Modify: `apps/web/src/app/orders/page.tsx` (condición del botón "Modificar", ~línea 336)

**Interfaces:**
- Consumes: `updateBasicOrder(session, id, input)` y `updateLoadedOrderAction` (ya existentes, sin cambio de firma).
- Produces: ningún símbolo nuevo. Solo cambia el comportamiento (qué estados se aceptan/renderizan).

- [ ] **Step 1: Relajar el candado en `updateBasicOrder`**

En `apps/web/src/lib/orders.ts`, reemplazar exactamente:

```ts
    if (normalizeOrderStatus(current.estado_pedido) !== "cargado") {
      throw new ApiError(400, "Solo se pueden modificar pedidos cargados antes de confirmarlos.");
    }
```

por:

```ts
    const estadoActual = normalizeOrderStatus(current.estado_pedido);
    if (estadoActual !== "cargado" && estadoActual !== "confirmado") {
      throw new ApiError(400, "Solo se pueden modificar pedidos cargados o confirmados.");
    }
```

(No tocar el resto de la función: el `UPDATE` que sigue ya setea `order_status='cargado'`, `status='cargado'`, `stock_discounted=false` y `collection_status='no_aplica'`.)

- [ ] **Step 2: Editor — mostrar formulario para confirmado + aviso + arreglar cartel**

En `apps/web/src/app/orders/[id]/edit/page.tsx`:

**2a.** Cambiar la condición de bloqueo (línea ~58). Reemplazar:

```tsx
        {order.orderStatus !== "cargado" ? (
```

por:

```tsx
        {order.orderStatus !== "cargado" && order.orderStatus !== "confirmado" ? (
```

**2b.** Actualizar el texto del cartel de bloqueo (queda para `entregado`/`cancelado`). Reemplazar:

```tsx
              <p className="text-sm text-[color:var(--muted)]">
                Solo se modifican pedidos cargados. Si ya fue confirmado, el cambio tiene que hacerse desde una
                anulacion o ajuste controlado.
              </p>
```

por:

```tsx
              <p className="text-sm text-[color:var(--muted)]">
                Solo se pueden modificar pedidos cargados o confirmados. Un pedido entregado o cancelado no se edita.
              </p>
```

**2c.** Agregar el aviso para confirmados dentro de la rama del formulario, justo después de `<input name="id" type="hidden" value={order.id} />` y antes de `<OrderEntryFields ... />`. Insertar:

```tsx
            {order.orderStatus === "confirmado" ? (
              <p className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel-subtle)] p-3 text-sm text-[color:var(--foreground)]">
                <strong>Atención:</strong> este pedido está confirmado. Al guardar, volverá a <strong>cargado</strong> y tenés que confirmarlo nuevamente (se libera la reserva de stock hasta reconfirmar).
              </p>
            ) : null}
```

- [ ] **Step 3: Registro — botón "Modificar" también para confirmado**

En `apps/web/src/app/orders/page.tsx`, reemplazar (línea ~336):

```tsx
                            {order.orderStatus === "cargado" ? (
                              <ButtonLink
                                aria-label={`Modificar pedido ${order.id}`}
                                className="shrink-0"
                                href={`/orders/${order.id}/edit`}
                                size="sm"
                                variant="secondary"
                              >
                                Modificar
                              </ButtonLink>
                            ) : null}
```

por (solo cambia la condición de la primera línea):

```tsx
                            {order.orderStatus === "cargado" || order.orderStatus === "confirmado" ? (
                              <ButtonLink
                                aria-label={`Modificar pedido ${order.id}`}
                                className="shrink-0"
                                href={`/orders/${order.id}/edit`}
                                size="sm"
                                variant="secondary"
                              >
                                Modificar
                              </ButtonLink>
                            ) : null}
```

- [ ] **Step 4: Lint**

Run (desde `apps/web`): `npm run lint`
Expected: exit 0, sin errores. Corregir lo que eslint indique (orden de imports, etc.) y re-correr.

- [ ] **Step 5: Verificar compilación de las rutas**

Con el dev server corriendo en `http://localhost:3000`:
Run: `curl -s -o /dev/null -w "orders %{http_code}\n" http://localhost:3000/orders`
Expected: `307` (redirige a login) o `200`.
Luego revisar el log del dev server (`tail -20` del archivo de salida del proceso `npm run dev`) y confirmar que NO hay líneas `⨯` para `orders/page` ni `orders/[id]/edit/page`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/orders.ts apps/web/src/app/orders/[id]/edit/page.tsx apps/web/src/app/orders/page.tsx
git commit -m "feat(comercial): permitir editar pedidos confirmados (revierte a cargado)"
```

---

## Verificación funcional (la hace el controlador/usuario, no bloquea el commit)

Flujo real autenticado (login `ftrdistribuciones@gmail.com`):
1. En **Comercial › Pedidos › Registro de pedidos**, un pedido `confirmado` ahora muestra el botón **Modificar**.
2. Abrir el editor de ese pedido → aparece el formulario con el **aviso** de que volverá a cargado.
3. Cambiar una cantidad y **Guardar** → el pedido queda en `cargado` con el cambio aplicado; el `disponible` del producto sube (se liberó la reserva).
4. Un pedido `entregado` NO muestra "Modificar"; si se entra por URL directa a `/orders/<id>/edit`, aparece el cartel de bloqueo con el texto nuevo.

Chequeo automatizable por el controlador (sin navegador): obtener el id de un pedido `confirmado` de la base y hacer `GET /orders/<id>/edit` con la cookie de sesión; el HTML debe contener el aviso ("Al guardar, volverá a") y el `<form>` de edición.
