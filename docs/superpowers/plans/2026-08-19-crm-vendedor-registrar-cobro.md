# Reactivar registro de cobro del vendedor (nivel cuenta) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reactivar el botón "Registrar cobro" en `/crm/cobros` sobre el modelo a nivel cuenta: el vendedor registra un pago para un cliente propio/a cargo, que queda `pendiente_aprobacion` y se resuelve en `/admin/approvals`; y limpiar el dead code del flujo factura-céntrico del vendedor.

**Architecture:** Un guard nuevo `assertVendorOwnsClient` (por `clientId`) en `crm.ts`; una acción CRM `registerCrmCustomerPaymentAction` gateada por `CRM_READ_PERMISSION` que reusa `registerCustomerPayment` (el flujo híbrido ya deja el pago pendiente cuando quien lo carga no aprueba); y el `RegisterPaymentDialog` existente reusado por fila del CRM con `defaultCustomerId`. Se borra el rastro viejo (`registerCrmCollectionAction`, `assertVendorOwnsSale`, `getVendorCollections`).

**Tech Stack:** Next.js (App Router, server components + actions), TypeScript, PostgreSQL (`pg`), `node --test` con transpile TS en memoria.

## Global Constraints

- Depende del código de la rama `feat/cobros-cuenta-corriente` (`customer-accounts.ts` con `registerCustomerPayment`/`customerPaymentFromBody`, `RegisterPaymentDialog`, `/crm/cobros` ya repuntado a `getVendorOpenAccounts`). Trabajar sobre esa rama.
- Next.js de este repo tiene breaking changes: ante dudas leer `node_modules/next/dist/docs/` y espejar archivos existentes (`apps/web/AGENTS.md`). Todo el trabajo en `apps/web`; tests desde `apps/web`.
- Multi-tenant: toda query filtra por `empresa_id`; parámetros `$n`, nunca interpolar input de usuario.
- Vínculo vendedor↔cliente por texto: `clients.seller_name` (propio) y `clients.assigned_seller` (a cargo). Usar `sellerCandidates(session)` (ya existe en `crm.ts`) — nombres en MAYÚSCULAS.
- El vendedor NO tiene permiso global de cobranzas: la acción se gatea por `CRM_READ_PERMISSION` (`crm.ver`) + guard de propiedad. El pago SIEMPRE queda `pendiente_aprobacion` (el vendedor no tiene `cobranzas.aprobar`; `registerCustomerPayment` lo resuelve solo).
- Reusar `customerPaymentFromBody` (valida monto/método/destino/operación) — no duplicar validación.
- Los tests nuevos se agregan a archivos ya registrados en `apps/web/package.json` (`crm-vendor.test.mjs`, `crm-vendor-wiring.test.mjs`) — sin cambios en package.json.
- La suite tiene ~11 fallas PRE-EXISTENTES en `static.test.mjs`/`wsfe-vat.test.mjs`, sin relación — no tocarlas; confirmar que no se agregan fallas nuevas.

---

## File Structure

- `apps/web/src/lib/crm.ts` — MODIFICAR: agregar `assertVendorOwnsClient`; (Task 4) borrar `assertVendorOwnsSale` y `getVendorCollections` + imports que queden sin uso.
- `apps/web/src/app/crm/cobros/actions.ts` — REESCRIBIR: `registerCrmCustomerPaymentAction` (reemplaza `registerCrmCollectionAction`).
- `apps/web/src/app/crm/cobros/page.tsx` — MODIFICAR: botón "Registrar cobro" por fila con `RegisterPaymentDialog`.
- `apps/web/scripts/crm-vendor.test.mjs` — MODIFICAR: agregar tests de `assertVendorOwnsClient`; (Task 4) borrar los tests de `assertVendorOwnsSale` y `getVendorCollections`.
- `apps/web/scripts/crm-vendor-wiring.test.mjs` — MODIFICAR: asserts de wiring de la acción y de la página.

---

## Task 1: Guard `assertVendorOwnsClient`

**Files:**
- Modify: `apps/web/src/lib/crm.ts`
- Test: `apps/web/scripts/crm-vendor.test.mjs`

**Interfaces:**
- Consumes: `sellerCandidates(session)` y `queryWithCompanyContext` (ya en `crm.ts`), `ApiError`.
- Produces:
  ```ts
  export async function assertVendorOwnsClient(session: AuthSession, clientId: string): Promise<void>;
  ```
  Lanza `ApiError(403, ...)` si el cliente no es propio ni a cargo del vendedor.

- [ ] **Step 1: Escribir los tests que fallan**

En `apps/web/scripts/crm-vendor.test.mjs`, agregar (usan el helper `makeCrm` y `session` ya definidos en el archivo):

```js
test("assertVendorOwnsClient lanza 403 si el cliente no es del vendedor", async () => {
  const crm = makeCrm(() => ({ rows: [] }));
  await assert.rejects(
    () => crm.assertVendorOwnsClient(session, "22222222-2222-2222-2222-222222222222"),
    (e) => e.status === 403,
  );
});

test("assertVendorOwnsClient pasa y consulta clients por seller_name/assigned_seller", async () => {
  const crm = makeCrm(() => ({ rows: [{ ok: 1 }] }));
  await crm.assertVendorOwnsClient(session, "22222222-2222-2222-2222-222222222222");
  const call = dbCalls.find((c) => /FROM clients c/i.test(c.sql));
  assert.match(call.sql, /seller_name/i);
  assert.match(call.sql, /assigned_seller/i);
  assert.ok(call.params[2].includes("JUAN"));
});
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `node --test apps/web/scripts/crm-vendor.test.mjs`
Expected: FAIL con "crm.assertVendorOwnsClient is not a function".

- [ ] **Step 3: Implementar**

En `apps/web/src/lib/crm.ts`, agregar (cerca de `assertVendorOwnsSale`):

```ts
// Guard: el cliente debe ser propio o a cargo del vendedor, si no 403.
export async function assertVendorOwnsClient(session: AuthSession, clientId: string): Promise<void> {
  const names = sellerCandidates(session);
  const result = await queryWithCompanyContext<{ ok: number }>(
    session.companyId,
    `
      SELECT 1 AS ok
        FROM clients c
       WHERE c.id = $1::uuid AND c.empresa_id = $2
         AND (UPPER(BTRIM(COALESCE(c.seller_name,''))) = ANY($3::text[])
              OR UPPER(BTRIM(COALESCE(c.assigned_seller,''))) = ANY($3::text[]))
       LIMIT 1
    `,
    [clientId, session.companyId, names],
  );
  if (!result.rows[0]) {
    throw new ApiError(403, "No podés registrar cobros de un cliente que no es tuyo.");
  }
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `node --test apps/web/scripts/crm-vendor.test.mjs`
Expected: los 2 tests nuevos en PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/crm.ts apps/web/scripts/crm-vendor.test.mjs
git commit -m "feat(crm): guard assertVendorOwnsClient por cliente"
```

---

## Task 2: Acción `registerCrmCustomerPaymentAction`

**Files:**
- Modify (reescribir): `apps/web/src/app/crm/cobros/actions.ts`
- Test: `apps/web/scripts/crm-vendor-wiring.test.mjs`

**Interfaces:**
- Consumes: `assertVendorOwnsClient` (Task 1); `customerPaymentFromBody`, `registerCustomerPayment` (de `@/lib/customer-accounts`); `uuidParam`; `CRM_READ_PERMISSION`, `requireApiSession`.
- Produces:
  ```ts
  export async function registerCrmCustomerPaymentAction(formData: FormData): Promise<void>;
  ```
  Reemplaza a `registerCrmCollectionAction` (se borra en este task).

- [ ] **Step 1: Escribir el test de wiring que falla**

En `apps/web/scripts/crm-vendor-wiring.test.mjs`, agregar (seguir el patrón de `readFileSync`/`assert.match` del archivo; si no hay uno para este source, crearlo):

```js
const crmCobrosActions = readFileSync(new URL("../src/app/crm/cobros/actions.ts", import.meta.url), "utf8");
test("registerCrmCustomerPaymentAction: gate crm.ver + guard de propiedad + registerCustomerPayment", () => {
  assert.match(crmCobrosActions, /registerCrmCustomerPaymentAction/);
  assert.match(crmCobrosActions, /requireApiSession\(\[CRM_READ_PERMISSION\]\)/);
  assert.match(crmCobrosActions, /assertVendorOwnsClient/);
  assert.match(crmCobrosActions, /registerCustomerPayment/);
  assert.match(crmCobrosActions, /revalidatePath\("\/crm\/cobros"\)/);
  assert.match(crmCobrosActions, /revalidatePath\("\/admin\/approvals"\)/);
  // el flujo viejo por saleId queda retirado
  assert.doesNotMatch(crmCobrosActions, /registerCollection\b/);
  assert.doesNotMatch(crmCobrosActions, /assertVendorOwnsSale/);
});
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `node --test apps/web/scripts/crm-vendor-wiring.test.mjs`
Expected: FAIL — patrones ausentes / patrones viejos aún presentes.

- [ ] **Step 3: Reescribir el archivo**

Reemplazar TODO el contenido de `apps/web/src/app/crm/cobros/actions.ts` por:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { assertVendorOwnsClient } from "@/lib/crm";
import { customerPaymentFromBody, registerCustomerPayment } from "@/lib/customer-accounts";
import { uuidParam } from "@/lib/request-body";
import { CRM_READ_PERMISSION, requireApiSession } from "@/lib/route-auth";

export async function registerCrmCustomerPaymentAction(formData: FormData) {
  const session = await requireApiSession([CRM_READ_PERMISSION]);
  const clientId = uuidParam(String(formData.get("clientId") ?? ""), "Cliente");
  await assertVendorOwnsClient(session, clientId);
  const input = customerPaymentFromBody(Object.fromEntries(formData.entries()));
  await registerCustomerPayment(session, { ...input, clientId });
  revalidatePath("/crm/cobros");
  revalidatePath("/admin/approvals");
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `node --test apps/web/scripts/crm-vendor-wiring.test.mjs`
Expected: el test nuevo en PASS.
Correr también `tsc --noEmit` desde `apps/web` para confirmar que no quedan imports rotos por el reemplazo.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/crm/cobros/actions.ts apps/web/scripts/crm-vendor-wiring.test.mjs
git commit -m "feat(crm): accion registerCrmCustomerPaymentAction a nivel cuenta"
```

---

## Task 3: Botón "Registrar cobro" en `/crm/cobros`

**Files:**
- Modify: `apps/web/src/app/crm/cobros/page.tsx`
- Test: `apps/web/scripts/crm-vendor-wiring.test.mjs`

**Interfaces:**
- Consumes: `registerCrmCustomerPaymentAction` (Task 2); `RegisterPaymentDialog` de `@/app/payments/register-payment-dialog` (props: `action`, `customers: {id,name}[]` [requerido], `defaultCustomerId?`, `today`, `triggerLabel?`, `triggerClassName?`; cuando hay `defaultCustomerId` oculta el selector y emite `<input hidden name="clientId">`); `localDateIso` de `@/lib/timezone`.

- [ ] **Step 1: Escribir el test de wiring que falla**

En `apps/web/scripts/crm-vendor-wiring.test.mjs`, agregar:

```js
const crmCobrosPage = readFileSync(new URL("../src/app/crm/cobros/page.tsx", import.meta.url), "utf8");
test("crm/cobros muestra el boton Registrar cobro con el cliente pre-cargado", () => {
  assert.match(crmCobrosPage, /RegisterPaymentDialog/);
  assert.match(crmCobrosPage, /registerCrmCustomerPaymentAction/);
  assert.match(crmCobrosPage, /defaultCustomerId=\{[^}]*clientId[^}]*\}/);
});
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `node --test apps/web/scripts/crm-vendor-wiring.test.mjs`
Expected: FAIL — patrones ausentes.

- [ ] **Step 3: Implementar**

En `apps/web/src/app/crm/cobros/page.tsx` (LEER primero cómo mapea las filas de `accounts` y su guard `sessionCanUseCrm`):
- Agregar imports:
  ```ts
  import { RegisterPaymentDialog } from "@/app/payments/register-payment-dialog";
  import { registerCrmCustomerPaymentAction } from "@/app/crm/cobros/actions";
  import { localDateIso } from "@/lib/timezone";
  ```
- Antes del `return`, calcular `const today = localDateIso();`.
- Agregar una columna/acción "Cobro" en la tabla; en cada fila renderizar:
  ```tsx
  <RegisterPaymentDialog
    action={registerCrmCustomerPaymentAction}
    customers={[]}
    defaultCustomerId={account.clientId}
    today={today}
    triggerLabel="Registrar cobro"
  />
  ```
  (Ajustar el `<DataTableHead>`/`colSpan` del empty state para la columna nueva, siguiendo el patrón de la tabla existente.)

- [ ] **Step 4: Correr y verificar que pasan**

Run: `node --test apps/web/scripts/crm-vendor-wiring.test.mjs`
Expected: el test nuevo en PASS. `tsc --noEmit` (desde `apps/web`) y eslint limpios sobre el archivo.

- [ ] **Step 5: Verificar en el navegador (si hay entorno con DB)**

Levantar el dev server y navegar a `/crm/cobros` con un usuario vendedor; confirmar que el botón abre el diálogo con el cliente pre-cargado y que al registrar el pago queda pendiente (aparece en `/admin/approvals`). Si no hay DB/entorno, omitir y dejar constancia.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/crm/cobros/page.tsx apps/web/scripts/crm-vendor-wiring.test.mjs
git commit -m "feat(crm): boton Registrar cobro del vendedor a nivel cuenta"
```

---

## Task 4: Limpieza del flujo viejo (dead code)

**Files:**
- Modify: `apps/web/src/lib/crm.ts`
- Modify: `apps/web/scripts/crm-vendor.test.mjs`

**Interfaces:**
- Elimina: `assertVendorOwnsSale` y `getVendorCollections` de `crm.ts` (sus únicos consumidores eran `registerCrmCollectionAction` —ya borrada en Task 2— y la vieja `/crm/cobros` —ya repuntada a `getVendorOpenAccounts`—).

- [ ] **Step 1: Borrar los tests del código viejo**

En `apps/web/scripts/crm-vendor.test.mjs`, ELIMINAR los tres tests:
- `"getVendorCollections delega en listSalesToCollectWhere con filtro de vendedor"`
- `"assertVendorOwnsSale lanza 403 si la venta no es de un cliente del vendedor"`
- `"assertVendorOwnsSale pasa cuando la venta es de un cliente del vendedor"`

(Dejar intactos los demás tests, incluidos los de `assertVendorOwnsClient` del Task 1.)

- [ ] **Step 2: Correr para confirmar que los tests borrados ya no corren**

Run: `node --test apps/web/scripts/crm-vendor.test.mjs`
Expected: PASS (sin los 3 tests eliminados; el resto sigue verde). Todavía existen las funciones en `crm.ts`, así que nada rompe aún.

- [ ] **Step 3: Borrar las funciones muertas**

En `apps/web/src/lib/crm.ts`, ELIMINAR las funciones `assertVendorOwnsSale` y `getVendorCollections` completas. Luego eliminar los imports que queden SIN USO como consecuencia (verificar con búsqueda dentro del archivo antes de borrar): p. ej. `listSalesToCollectWhere` (de `@/lib/collections`) si `getVendorCollections` era su único consumidor en `crm.ts`. NO borrar `sellerCandidates`, `listOpenCustomerAccounts`, `queryWithCompanyContext`, `ApiError` (siguen en uso).

- [ ] **Step 4: Verificar tipos, lint y suite**

Run (desde `apps/web`): `npx tsc --noEmit` → limpio (sin "declared but never used" ni imports rotos).
Run: `npm --prefix apps/web test`
Expected: sin fallas nuevas respecto de la base (~11 pre-existentes en `static.test.mjs`/`wsfe-vat.test.mjs`). El mock de `@/lib/collections` en `crm-vendor.test.mjs` puede quedar sin uso; es inofensivo (dejarlo o quitarlo, a criterio).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/crm.ts apps/web/scripts/crm-vendor.test.mjs
git commit -m "chore(crm): eliminar flujo de cobro por venta del vendedor (dead code)"
```

---

## Cierre

- [ ] **Suite completa** (`npm --prefix apps/web test`) sin fallas nuevas respecto de la base.
- [ ] **Verificación funcional** (si hay entorno con DB): vendedor registra cobro en `/crm/cobros` → queda pendiente → admin lo aprueba en `/admin/approvals` → impacta el saldo del cliente.
- [ ] Actualizar la memoria del proyecto (el gap de "vendedor no puede registrar cobro" queda cerrado) cuando se mergee.
