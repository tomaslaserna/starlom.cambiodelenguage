# CRM: Clientes (base de datos) + pestaña Cobros

Fecha: 2026-08-14

## Problema

En el "segundo mundo" del CRM (para vendedores) la pestaña **Clientes** hoy muestra
la misma tira de perfil que **Perfil** (6 StatCards) más un tablero de estados
(Activos / A recontactar / En riesgo / Perdidos). No hay una vista de "base de
datos" de los clientes del vendedor, ni forma de que el vendedor vea/gestione la
deuda de sus clientes.

## Objetivo

1. **Clientes** pasa a ser, además del tablero de estados, una tabla base de datos
   de los clientes del vendedor logueado (imitando `/customers` pero filtrada al
   vendedor). Se elimina la tira de perfil duplicada.
2. Nueva pestaña **Cobros**: registro de lo que deben los clientes del vendedor
   (imitando `/collections` filtrado al vendedor), con posibilidad de registrar
   cobros de sus propios clientes.

**Perfil no se toca.**

## Contexto existente (a reusar)

- Vínculo vendedor↔cliente por texto: `clients.seller_name` (propio) y
  `clients.assigned_seller` (a cargo). `sellerCandidates(session)` en `crm.ts`
  devuelve los nombres candidatos en MAYÚSCULAS para el match tolerante.
- Nav CRM en `navigation.ts` (`active === "crm"`): Perfil, Clientes, Leads,
  Presupuestos, Listas. Gateadas por `CRM_READ_PERMISSION` (`crm.ver`).
- `listCustomers` (`catalog.ts`) — tabla de `/customers` (búsqueda + paginación,
  sin filtro de vendedor, no expone `assigned_seller`).
- `listSalesToCollect(companyId)` (`collections.ts`) — ventas entregadas con saldo
  pendiente. `RegisterCollectionDialog` (`app/collections/register-collection-dialog`)
  + `registerCollection(session, saleId, input)` + `collectionRegistrationFromBody`.
- `registerCollectionAction` gatea por `COLLECTIONS_CREATE_PERMISSION`
  (`cobranzas.crear`) y luego llama `registerCollection` (que confía en el caller).

## Alcance

Incluye:
- `getVendorCustomers`, `getVendorCollections`, `assertVendorOwnsSale` en `crm.ts`.
- Rediseño de `/crm/clientes` (saca tira de perfil, agrega tabla DB, mantiene tablero).
- Nueva página `/crm/cobros` + entrada en la nav CRM.
- Acción CRM `registerCrmCollectionAction` con guard de propiedad.
- Tests de las libs nuevas + wiring.

No incluye:
- Editar/crear clientes desde el CRM (las acciones viven en la ficha `/customers/[id]`).
- Cambiar el rol `vendedor` ni la nav de "Cobros y pagos" de Administración.
- Aprobación de cobros (sigue en Administración; el registro del vendedor entra al
  flujo de aprobación existente).
- Tocar Perfil, Leads, Presupuestos o Listas del CRM.

## Diseño técnico

### `apps/web/src/lib/crm.ts`

**`getVendorCustomers(session, { query, page, pageSize })`** — espeja `listCustomers`
pero:
- Filtra a los clientes del vendedor: `UPPER(BTRIM(COALESCE(seller_name,''))) =
  ANY($names) OR UPPER(BTRIM(COALESCE(assigned_seller,''))) = ANY($names)`.
- Selecciona también `assigned_seller` para derivar `relation` (`"propio"` si el
  `seller_name` matchea; si no, `"a cargo"`).
- Búsqueda igual que `listCustomers` (display_name/legal_name/tax_id/phone ILIKE).
- Paginación (page/pageSize por defecto 25) con COUNT + LIMIT/OFFSET; devuelve
  `{ data: VendorCustomer[], meta: { query, page, pageSize, total, totalPages } }`.
- `VendorCustomer`: `{ id, name, businessName, taxId, phone, city, province,
  priceList, status, relation }`.

**`getVendorCollections(session)`** — espeja el `SELECT` de `listSalesToCollect`
(mismo cálculo de saldo, vencimiento, atraso, `desired_document`, etc.) agregando al
`WHERE` el filtro por cliente del vendedor sobre el join `clients cli`:
`(UPPER(BTRIM(COALESCE(cli.seller_name,''))) = ANY($names) OR
UPPER(BTRIM(COALESCE(cli.assigned_seller,''))) = ANY($names))`. Devuelve la misma
forma de fila que `listSalesToCollect` (id, date, receiptNumber, customerName,
customerTaxId, phone, outstandingAmount, dueDate, overdue, overdueDays,
desiredDocument, collectionStatus, registeredAmount, hasFiscalPdf,
deliveryDocumentId). Nota de reuso: si es viable sin complejizar, extraer el cuerpo
del SELECT de `listSalesToCollect` a un helper con cláusula WHERE parametrizable para
no duplicar el SQL; si complica, duplicar el SELECT con el filtro extra y dejarlo
documentado.

**`assertVendorOwnsSale(session, saleId)`** — lanza `ApiError(403, ...)` si la venta
no pertenece a un cliente del vendedor:
```sql
SELECT 1 FROM sales v
  JOIN clients c ON c.id = v.client_id AND c.empresa_id = v.empresa_id
 WHERE v.id = $1::uuid AND v.empresa_id = $2
   AND (UPPER(BTRIM(COALESCE(c.seller_name,''))) = ANY($3::text[])
        OR UPPER(BTRIM(COALESCE(c.assigned_seller,''))) = ANY($3::text[]))
 LIMIT 1
```
Si no hay fila → 403 ("No podés registrar cobros de una venta que no es de tus clientes.").

### Server action — `apps/web/src/app/crm/cobros/actions.ts` (nuevo)

```ts
export async function registerCrmCollectionAction(formData: FormData) {
  const session = await requireApiSession([CRM_READ_PERMISSION]);
  const id = uuidParam(String(formData.get("id") ?? ""), "Venta");
  await assertVendorOwnsSale(session, id);
  await registerCollection(session, id, collectionRegistrationFromBody(Object.fromEntries(formData.entries())));
  revalidatePath("/crm/cobros");
  revalidatePath("/admin/approvals");
  revalidatePath("/treasury/current-accounts");
  revalidatePath("/metrics");
}
```
Gatea por `CRM_READ_PERMISSION` (no por `cobranzas.crear`) + guard de propiedad. El
registro reusa `registerCollection` y entra al flujo de aprobación existente.

### UI

**`/crm/clientes` (`page.tsx`)** — server component:
- Sesión + `sessionCanUseCrm` (redirect `/` si no).
- Carga `getVendorCustomers(session, { query, page })` y `getVendorClients(session)`
  (para el tablero) en paralelo. **Se elimina** `getVendorProfile` y la tira de 6
  StatCards.
- Encabezado: saludo `Hola, {session.displayName || session.username}` + resumen
  corto de riesgo/recontacto desde los counts del tablero.
- Sección tabla DB: `Toolbar` con form GET (`action="/crm/clientes"`, campo `q`),
  `DataTable` con columnas Cliente (Link a `/customers/${id}`), CUIT, Contacto,
  Ubicación, Lista, Relación (`StatusBadge`/texto propio·a cargo), Estado
  (`StatusBadge`), y `PaginationLinks basePath="/crm/clientes"`.
- Debajo: el `ClientesDashboard` actual, sin cambios.
- `searchParams`: `{ q?: string; page?: string }`.

**`/crm/cobros` (`page.tsx`)** — server component, nuevo:
- Sesión + `sessionCanUseCrm` (redirect `/` si no).
- Carga `getVendorCollections(session)`; filtra por `q` en memoria (como
  `/collections`): cliente / CUIT / nro comprobante.
- StatCards: saldo total a cobrar, monto vencido (+ nº vencidas), ventas visibles.
- `DataTable` imitando `/collections`: Fecha, Comprobante, Cliente, CUIT, Monto a
  cobrar, Vencimiento (rojo + badge "Vencida" si corresponde), Documento (PDF),
  Acción. La celda Acción replica `/collections`: `RegisterCollectionDialog` con
  `registerCrmCollectionAction`, el link de PDF del comprobante, y el link "Emitir
  orden de cobro" por WhatsApp reusando `collectionOrderHref` /
  `buildCollectionOrderMessage`. Las ventas en aprobación muestran el badge "En
  aprobación" como en `/collections`.
- `searchParams`: `{ q?: string }`.

**Nav — `navigation.ts`**: agregar tras la entrada de Clientes CRM:
```ts
{ href: "/crm/cobros", label: "Cobros", active: "crm", permission: CRM_READ_PERMISSION },
```

### Estados / permisos

| Vista | Ruta | Permiso | Filtro |
|---|---|---|---|
| Clientes CRM | `/crm/clientes` | `crm.ver` | clientes del vendedor (propio ∪ a cargo) |
| Cobros CRM | `/crm/cobros` | `crm.ver` | ventas de clientes del vendedor |
| Registrar cobro CRM | acción | `crm.ver` + `assertVendorOwnsSale` | venta de un cliente del vendedor |

## Manejo de errores

- Vendedor sin `crm.ver`: redirect `/` (páginas) / `ApiError(403)` (acción, vía
  `requireApiSession`).
- Registrar cobro de una venta ajena (request manipulado): `assertVendorOwnsSale`
  → 403 antes de tocar nada.
- Monto de cobro > saldo, método inválido, etc.: los valida `registerCollection`
  existente (sin cambios).

## Testing

`apps/web/scripts/` (patrón `*.test.mjs`, transpile TS en memoria, mock `@/lib/*`,
asserts sobre SQL + `ApiError`):
- `getVendorCustomers`: el SQL incluye el filtro `seller_name`/`assigned_seller`,
  la búsqueda y el LIMIT/OFFSET; mapea `relation` propio vs a cargo correctamente.
- `getVendorCollections`: el SQL incluye el filtro por cliente del vendedor y el
  mismo cálculo de saldo/vencimiento que `listSalesToCollect`.
- `assertVendorOwnsSale`: 403 cuando no hay fila; pasa cuando la venta es del
  vendedor.
- Wiring: `navigation.ts` tiene `/crm/cobros` con `active:"crm"` y
  `CRM_READ_PERMISSION`; `/crm/cobros/page.tsx` usa `getVendorCollections` y
  `registerCrmCollectionAction`; `/crm/clientes/page.tsx` usa `getVendorCustomers`,
  linkea a `/customers/`, ya no llama `getVendorProfile`, y mantiene
  `ClientesDashboard`.

## Riesgos

- Reuso vs duplicación del SELECT de `listSalesToCollect`: preferible extraer un
  helper con WHERE parametrizable; si el refactor toca el path crítico de cobros de
  Administración, hacerlo con cuidado y con los tests de collections existentes en
  verde. Si complica, duplicar el SELECT (documentado) es aceptable.
- El match vendedor↔cliente es por texto (igual que el resto del CRM): hereda sus
  limitaciones (nombres que no matchean quedan fuera). Consistente con lo existente.
