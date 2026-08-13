# Editar y eliminar presupuestos existentes

Fecha: 2026-08-13

## Problema

En `/quotes` el menú "Acciones" de cada presupuesto solo ofrece PDF, WhatsApp y
Aprobar. No se puede corregir un presupuesto mal cargado ni descartar uno, lo que
obliga a crear uno nuevo y deja basura en la lista.

## Objetivo

Agregar dos acciones al módulo de presupuestos:

- **Editar** un presupuesto **pendiente**: cambiar cliente, productos, cantidades,
  bonificaciones y vigencia, recalculando totales e IVA.
- **Eliminar** un presupuesto **pendiente o rechazado**.

Los presupuestos **aceptados** quedan bloqueados para ambas acciones: ya se
convirtieron en venta/pedido (`converted_order_id`) y tocarlos corrompería la
venta vinculada.

## Alcance

Incluye:
- Backend `updateQuote` + guard reforzado en `deleteQuote`.
- Helper compartido `buildQuoteDraft` para que crear y editar calculen idéntico.
- Página `/quotes/[id]/edit` que reutiliza `QuoteEntryFields` precargado.
- Botones Editar y Eliminar en el menú Acciones de la lista, con confirmación al
  eliminar.
- Ajuste de permisos: sumar `presupuestos.cancelar` al rol `jefe`.
- Tests de `updateQuote` y del guard de `deleteQuote`.

No incluye:
- Editar/eliminar presupuestos aceptados.
- Historial de cambios / auditoría de ediciones (más allá de `updated_at`).
- Cambios en el flujo de aprobación ni en la conversión a venta.

## Estados y permisos

| Acción   | Estados permitidos        | Permiso                 | Roles hoy            |
|----------|---------------------------|-------------------------|----------------------|
| Editar   | `pendiente`               | `presupuestos.editar`   | administrador, jefe  |
| Eliminar | `pendiente`, `rechazada`  | `presupuestos.cancelar` | administrador, **jefe (nuevo)** |

- `presupuestos.cancelar` hoy solo lo tiene `administrador` (via `*`). Se agrega a
  la lista `LEGACY_ROLE_PERMISSIONS.jefe` en `route-auth.ts`. Los administradores
  pueden además otorgarlo por la config de permisos de base de datos.
- Un `vendedor` (solo `crear`/`ver`) no ve ninguno de los dos botones. Sin cambios
  para ese rol.

## Diseño técnico

### Backend — `apps/web/src/lib/quotes.ts`

**Helper compartido `buildQuoteDraft`** (refactor incidental, sin cambiar
comportamiento): extraer de `createQuote` la resolución que hoy vive inline y
dejarla como función que, dado `(client, session, input)`, devuelve:

- snapshot del cliente (`display_name`, `legal_name`, `tax_id`,
  `fiscal_condition`, `phone`, `address`, `id`),
- `desiredDocument` y `vatRate` derivados del `receipt_type` del cliente
  (valida que sea Remito / Factura A / Factura B),
- `priceListName` y `priceListKey` resueltos,
- `detail` (líneas resueltas contra catálogo con `resolveQuoteProductsFromCatalog`
  o desde el input si no hay ids, igual que hoy),
- montos `netAmount`, `discountAmount`, `subtotal`, `vatAmount`, `total`.

`createQuote` pasa a: `buildQuoteDraft` → generar número (secuencia
`pg_advisory_xact_lock`) → `INSERT quotes` + `INSERT quote_items`. Comportamiento
idéntico al actual.

**Nuevo `updateQuote(session, id, input)`**:

1. `withCompanyContext`. `SELECT ... FOR UPDATE` del quote por `id`+`empresa_id`.
2. Si no existe → 404. Si `status !== 'pendiente'` → 409
   ("Solo se pueden editar presupuestos pendientes").
3. `buildQuoteDraft(client, session, input)` (mismo cálculo que crear; permite
   cambiar de cliente y re-derivar comprobante/IVA).
4. `UPDATE quotes SET` con totales recalculados, `validity_days`, `active_price_list`,
   `price_list_name`, `discount_percent`, `include_vat`, `vat_rate`,
   `desired_document`, y el snapshot del cliente (`client_id`, `client_name`,
   `client_legal_name`, `client_document`, `client_fiscal_condition`,
   `client_phone`, `client_address`), `updated_at = NOW()`.
   **No** cambia `quote_number`, `created_at`, `seller_id` ni `status`.
5. `DELETE FROM quote_items WHERE quote_id = $id` y re-`INSERT` de las líneas nuevas.
6. `clearReadQueryCache()`; devolver `getQuote(...)`.

**Guard en `deleteQuote(companyId, id)`**: reemplazar el `DELETE` incondicional por
un borrado que solo procede si el estado es `pendiente` o `rechazada` y
`converted_order_id IS NULL`. Si la fila existe pero no cumple → 409
("No se puede eliminar un presupuesto aceptado"). Si no existe → 404. Los
`quote_items` se eliminan por la FK (verificar `ON DELETE CASCADE`; si no existe,
borrar items explícitamente en la misma transacción antes del quote).

### Server actions — `apps/web/src/app/quotes/actions.ts`

- `updateQuoteAction(prev, formData)`: reutiliza el shape `CreateQuoteState` para
  mostrar errores inline. Permiso `presupuestos.editar`. Lee `quoteId` +
  `quoteInputFromBody`. En éxito: `revalidatePath('/quotes')` y
  `redirect('/quotes?updated=1')`. En error: devuelve `{ ok:false, error }`.
- `deleteQuoteAction(formData)`: permiso `presupuestos.cancelar`. Llama
  `deleteQuote`, `revalidatePath('/quotes')`, `redirect('/quotes?deleted=1')`. Si
  `deleteQuote` lanza, redirige a `/quotes?error=<mensaje>`.

### UI

**Página `/quotes/[id]/edit`** (`apps/web/src/app/quotes/[id]/edit/page.tsx`):
server component. Exige sesión + `presupuestos.editar`. Carga `getQuote` y
`getOrderFormData`. Si el quote no está `pendiente`, redirige a `/quotes` con
aviso. Renderiza `QuoteEntryForm` (action = `updateQuoteAction`) con
`QuoteEntryFields` en modo edición.

**`QuoteEntryFields`** (`quote-entry-fields.tsx`): agregar props opcionales
`initialValues?` (`{ customerId, validityDays, priceListOverride, lines: {productId,
quantity, discount}[] }`), `mode?: 'create' | 'edit'` y `quoteId?`. Los `useState`
arrancan de `initialValues` cuando existen. En modo `edit`: renderiza
`<input name="quoteId" hidden>`, el botón principal dice "Guardar cambios" y se
agrega "Cancelar" (link a `/quotes`); se ocultan las acciones de WhatsApp rápido
(pertenecen al alta). En modo `create` todo queda igual que hoy. Nota: las líneas
precargadas se mapean por `productId`; si un producto quedó inactivo, la línea no
resuelve precio y el editor lo marca (comportamiento actual para productos sin
precio).

**Lista `/quotes` (`page.tsx`)**: en el menú Acciones,
- `Editar`: `ButtonLink` a `/quotes/${id}/edit`, visible si `status==='pendiente'`
  y el usuario tiene `presupuestos.editar` (`canEditQuotes`).
- `Eliminar`: visible si `status` es `pendiente` o `rechazada` y el usuario tiene
  `presupuestos.cancelar` (`canDeleteQuotes`). Usa un pequeño client component
  `QuoteDeleteButton` que abre un overlay de confirmación (patrón `Overlay` de
  `customer-row-actions.tsx`) antes de hacer submit a `deleteQuoteAction`.
- La página calcula `canEditQuotes`/`canDeleteQuotes` con `sessionAllows` y los pasa
  a la fila. Banner de éxito para `?updated=1` / `?deleted=1` junto al de `?error`.

### Permisos — `apps/web/src/lib/route-auth.ts`

Agregar `"presupuestos.cancelar"` a `LEGACY_ROLE_PERMISSIONS.jefe`. Opcional:
constante `QUOTES_DELETE_PERMISSION`/`QUOTES_EDIT_PERMISSION` para no repetir
literales.

## Manejo de errores

- Editar un no-pendiente (carrera): `updateQuote` → 409, se muestra inline en el
  form o via `?error` al cargar la página de edición.
- Eliminar un aceptado (carrera): `deleteQuote` → 409 → `/quotes?error=`.
- Producto inactivo/sin precio al editar: mismo mensaje que en alta
  ("Uno o mas productos ... no existen o estan inactivos" / "no tiene precio").
- Cliente sin comprobante configurado: mismo 400 que en alta.

## Testing

`apps/web/scripts/` (patrón `*.test.mjs` existente):
- `updateQuote`: edición de un pendiente recalcula totales/IVA e ítems; cambiar
  cantidades/lista cambia el total; editar un `aceptada` lanza 409; número y
  `created_at` no cambian.
- `deleteQuote`: borra un `pendiente` y un `rechazada`; rechaza un `aceptada`
  (409) y un inexistente (404).

## Riesgos

- El refactor `buildQuoteDraft` toca el camino de creación (crítico). Mitigación:
  extracción sin cambios de comportamiento + tests de alta existentes deben seguir
  verdes.
- FK de `quote_items`: confirmar `ON DELETE CASCADE`; si no, borrar ítems
  explícitamente.
