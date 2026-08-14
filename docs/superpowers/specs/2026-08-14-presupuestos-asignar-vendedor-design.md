# Asignar presupuestos a un vendedor + visibilidad "Todos"

Fecha: 2026-08-14

## Problema

Cuando el admin (o cualquiera) crea un presupuesto, `seller_id` queda fijado en
quien lo crea. En el CRM, cada vendedor solo ve los presupuestos cuyo `seller_id`
matchea su nombre (`getVendorQuotes`), así que un presupuesto que el admin arma para
un vendedor no le aparece a ese vendedor. Falta poder **asignar** el presupuesto a un
vendedor, y también poder marcarlo **visible para todos** los vendedores.

## Objetivo

- Al crear o editar un presupuesto, elegir a qué vendedor se asigna (para que solo
  ese vendedor lo vea en su CRM) **o** dejarlo visible para todos los vendedores.
- El selector aparece para cualquiera que cargue el presupuesto (no solo admin/jefe).
- Default cuando no se toca el selector: **Todos los vendedores**.

## Contexto existente (a reusar)

- `quotes.seller_id` (uuid → `profiles`) = dueño del presupuesto. `acceptQuote` ya usa
  `quote.seller_id ?? session.userId`, así que el flujo tolera cambios de seller.
- `createQuote(session, input)` inserta `seller_id = session.userId`.
  `updateQuote(session, id, input)` hoy **no** toca `seller_id`.
- `quoteInputFromBody(body)` arma `QuoteInput`. `QuoteEntryFields` es el form client
  (crear y editar). El alta pasa por `createQuoteAction`, la edición por
  `updateQuoteAction`; ambos usan `quoteInputFromBody`.
- `getVendorQuotes(session)` (`crm.ts`): `LEFT JOIN profiles p ON p.id = q.seller_id
  WHERE q.empresa_id=$1 AND UPPER(BTRIM(COALESCE(p.username,p.full_name,''))) = ANY($2)`.
- `listVendors(companyId)` → `{ id, name }[]` (profiles con rol vendedor de la empresa).
- Migraciones en `migrations/` (raíz), nombre `YYYYMMDDHHMMSS_desc.sql`. Se aplican a
  prod (Supabase) fuera del deploy de código.

## Alcance

Incluye:
- Migración: columna `quotes.visible_to_all boolean not null default false`.
- Selector "Asignar a" en `QuoteEntryFields` (crear + editar), con opción "Todos".
- `assignedSellerId` en `quoteInputFromBody`; lógica de `seller_id`/`visible_to_all`
  en `createQuote` y `updateQuote`, con validación del vendedor.
- Filtro OR en `getVendorQuotes` (`... OR q.visible_to_all = true`).
- Mostrar la asignación en la lista `/quotes`.
- Tests de las tres piezas.

No incluye:
- Cambiar el contador "Presupuestos vigentes" del Perfil (queda estrictamente en los
  asignados al vendedor, para no inflarlo con los "Todos").
- Reasignación masiva ni histórico de reasignaciones.
- Tocar el flujo de aceptación/conversión a venta.

## Diseño técnico

### Migración — `migrations/<ts>_quotes_visible_to_all.sql`

```sql
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS visible_to_all boolean NOT NULL DEFAULT false;
```
Aditiva. Los presupuestos existentes quedan `false` → siguen viéndose solo para su
`seller_id` (comportamiento actual intacto). **Debe aplicarse a prod** además del
deploy; es un paso aparte del plan, con confirmación del usuario antes de correrla.

### Input — `apps/web/src/lib/quotes.ts` (`quoteInputFromBody`, `QuoteInput`)

- `QuoteInput` gana `assignedSellerId: string` ("" = Todos; si no, uuid del vendedor).
- `quoteInputFromBody` lee `assignedSellerId` con `textField`; si viene un uuid válido
  lo normaliza con `uuidParam`, si no queda "".

### Resolución de asignación (helper compartido)

Un helper `resolveQuoteAssignment(client, session, assignedSellerId)` que devuelve
`{ sellerId: string; visibleToAll: boolean }`:
- Si `assignedSellerId` es un uuid y corresponde a un **vendedor de la empresa**
  (validar contra `usuario_empresa`+`profiles` con rol vendedor, o reusar
  `listVendors`): `{ sellerId: assignedSellerId, visibleToAll: false }`.
- Si es "" o no valida: `{ sellerId: session.userId, visibleToAll: true }` (Todos, y
  se conserva quién lo creó como seller).

### `createQuote`

Tras `buildQuoteDraft`, resolver la asignación y usar `sellerId`/`visibleToAll` en el
`INSERT` (hoy inserta `session.userId` en `seller_id`; se agrega `visible_to_all` a la
lista de columnas/values).

### `updateQuote`

Agregar `seller_id = $N`, `visible_to_all = $N` al `UPDATE` (hoy no los toca), usando
la misma resolución. Sigue sin cambiar `quote_number`, `created_at`, `status`.

### `getVendorQuotes` — `apps/web/src/lib/crm.ts`

Cambiar el `WHERE` a:
```sql
WHERE q.empresa_id = $1
  AND (UPPER(BTRIM(COALESCE(p.username, p.full_name, ''))) = ANY($2::text[])
       OR q.visible_to_all = true)
```
Agregar `q.visible_to_all` al `SELECT` si se quiere mostrar un chip "compartido" en la
UI del CRM (opcional; mínimo: solo el filtro).

### UI — form `QuoteEntryFields`

- Nueva prop `vendors: { id: string; name: string }[]` (de `listVendors`), pasada por
  la página de alta (`/quotes/page.tsx`) y la de edición (`/quotes/[id]/edit/page.tsx`).
- Estado `assignedSellerId` (default `""`). Un `Select` "Asignar a" con
  `<option value="">Todos los vendedores</option>` + un option por vendedor. Hidden
  input `name="assignedSellerId"`.
- En modo edición, precargar con el `seller_id` actual del presupuesto **si**
  `visible_to_all` es false; si es true, seleccionar "Todos". Requiere exponer
  `sellerId`/`visibleToAll` en `getQuote`/`mapQuote` y pasarlos como `initialValues`.

### UI — lista `/quotes/page.tsx`

Bajo el número/creador de cada fila, mostrar "Asignado a: {nombre}" o "Todos". Requiere
que `listQuotes`/`mapQuote` expongan `sellerName` (ya hay `creado_por` via
`p.username`) y `visibleToAll`. Se puede reusar `creado_por` como nombre del vendedor
asignado (seller_id → profiles) y mostrar "Todos" cuando `visible_to_all`.

## Manejo de errores

- `assignedSellerId` con un id que no es vendedor de la empresa → se trata como "Todos"
  (no rompe; el usuario puede corregir). No se lanza error para no bloquear el alta.
- Edición de un presupuesto no pendiente: sigue bloqueada por el guard existente de
  `updateQuote` (409).

## Testing

`apps/web/scripts/` (patrón `*.test.mjs`, transpile TS en memoria, mock `@/lib/*`):
- `quoteInputFromBody`: lee `assignedSellerId` (uuid válido vs "").
- `resolveQuoteAssignment` (o create/update vía mock client): vendedor válido →
  `{seller_id: vendedor, visible_to_all: false}`; "" o inválido → `{seller_id:
  creador, visible_to_all: true}`.
- `getVendorQuotes`: el SQL incluye `OR q.visible_to_all = true`.
- Wiring: `QuoteEntryFields` tiene el select "Asignar a" con `name="assignedSellerId"`;
  las páginas de alta/edición pasan `vendors`.

## Riesgos

- El helper de validación de vendedor agrega una query por alta/edición; aceptable.
- `updateQuote` ahora toca `seller_id` (antes lo preservaba): al editar sin tocar el
  selector, el default "Todos" reasignaría `visible_to_all=true` y `seller_id=editor`.
  Mitigación: en edición, precargar el selector con el estado real del presupuesto para
  que "no tocar" mantenga la asignación existente.
