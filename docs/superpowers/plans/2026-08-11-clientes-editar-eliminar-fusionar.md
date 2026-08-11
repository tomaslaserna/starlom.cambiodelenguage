# Editar / Eliminar / Fusionar clientes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir editar los datos de un cliente, eliminar clientes sin historial y fusionar duplicados (reasignando su historial) desde `/customers`.

**Architecture:** Módulo nuevo `customer-admin.ts` (borrado con guarda + fusión transaccional, testeable con mock client vía `withCompanyContext`). Editar reutiliza el backend existente (`updateCustomer`). Acciones por fila en `/customers` con permiso `clientes.eliminar` (admin+jefe) para borrar/fusionar.

**Tech Stack:** TypeScript, Next.js (breaking-changes fork — ver `apps/web/AGENTS.md`), PostgreSQL (Supabase) vía `pg`, tests `node --test` + `typescript`.

## Global Constraints

- Todas las consultas scopeadas por `empresa_id`. Las 6 tablas con FK a `clients` (`sales`, `orders`, `quotes`, `payments`, `current_account_movements`, `sale_documents`) tienen `client_id` + `empresa_id` (verificado).
- `withCompanyContext(companyId, cb)` es transaccional (BEGIN/COMMIT, ROLLBACK ante error): usarlo para borrar/fusionar.
- Permiso destructivo `clientes.eliminar`: **solo admin (full-access) y jefe**. Se resuelve por el mapa de código `LEGACY_ROLE_PERMISSIONS` (`route-auth.ts`) — no requiere migración. `requireApiSession([{ resource: "clientes", action: "eliminar" }])`.
- Editar usa `clientes.editar` (ya lo tienen jefe y vendedor).
- Tests: `node:test`, `npm run test` desde `apps/web`; registrar cada `.mjs` nuevo en el script `test` de `package.json`. Módulos con imports `@/lib/*` de valor se cargan con `loadTypeScriptModule(path, aliases)`.
- Comandos desde `apps/web/`.

---

## File Structure

- **Create** `apps/web/src/lib/customer-admin.ts` — `customerLinkTotal`, `deleteCustomer`, `mergeCustomers`.
- **Create** `apps/web/scripts/customer-admin.test.mjs` — unit tests (mock client).
- **Create** `apps/web/scripts/customers-admin-wiring.test.mjs` — regresión de fuente (permiso + acciones en la página).
- **Create** `apps/web/src/app/customers/customer-row-actions.tsx` — acciones por fila (editar/eliminar/fusionar).
- **Modify** `apps/web/src/lib/route-auth.ts` — `clientes.eliminar` en `LEGACY_ROLE_PERMISSIONS.jefe`.
- **Modify** `apps/web/src/lib/catalog.ts` — `listCustomers` incluye `address`, `observation`, `salesCount`.
- **Modify** `apps/web/src/app/customers/actions.ts` — `updateCustomerAction`, `deleteCustomerAction`, `mergeCustomersAction`.
- **Modify** `apps/web/src/app/customers/page.tsx` — columna "Acciones" + `canDelete` + `allClients`.
- **Modify** `apps/web/package.json` — registrar los dos test nuevos.

---

## Task 1: Backend `customer-admin.ts`

**Files:**
- Create: `apps/web/src/lib/customer-admin.ts`
- Create: `apps/web/scripts/customer-admin.test.mjs`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: `ApiError` (`@/lib/api-response`), `withCompanyContext` (`@/lib/db`), `PoolClient` (type, `pg`).
- Produces:
  - `CUSTOMER_LINKED_TABLES: readonly string[]` (las 6 tablas).
  - `customerLinkTotal(client, companyId, id): Promise<number>`.
  - `deleteCustomer(companyId: number, id: string): Promise<void>` — 409 si tiene historial.
  - `mergeCustomers(companyId: number, keepId: string, duplicateId: string): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/scripts/customer-admin.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadTypeScriptModule(relativePath, aliases = {}) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  const moduleRequire = (specifier) => aliases[specifier] ?? require(specifier);
  Function("require", "module", "exports", compiled)(moduleRequire, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function recordingClient(historyCount) {
  const writes = [];
  return {
    writes,
    async query(sql, params) {
      writes.push({ sql, params });
      if (/SELECT 1 FROM clients/.test(sql)) return { rows: [{ ok: 1 }] };
      if (/count\(\*\)/.test(sql)) return { rows: [{ n: String(historyCount) }] };
      return { rows: [] };
    },
  };
}

function loadWith(client) {
  return loadTypeScriptModule("../src/lib/customer-admin.ts", {
    "@/lib/api-response": { ApiError },
    "@/lib/db": { withCompanyContext: async (_companyId, cb) => cb(client) },
  });
}

test("deleteCustomer bloquea (409) cuando el cliente tiene historial y no borra", async () => {
  const client = recordingClient(3);
  const mod = loadWith(client);
  await assert.rejects(() => mod.deleteCustomer(1, "11111111-1111-1111-1111-111111111111"), (e) => e.status === 409);
  assert.ok(!client.writes.some((w) => /DELETE FROM clients/.test(w.sql)));
});

test("deleteCustomer borra cuando no hay historial", async () => {
  const client = recordingClient(0);
  const mod = loadWith(client);
  await mod.deleteCustomer(1, "11111111-1111-1111-1111-111111111111");
  assert.ok(client.writes.some((w) => /DELETE FROM clients WHERE id = \$1::uuid/.test(w.sql)));
});

test("mergeCustomers rechaza fusionar un cliente consigo mismo", async () => {
  const client = recordingClient(0);
  const mod = loadWith(client);
  await assert.rejects(() => mod.mergeCustomers(1, "A", "A"), (e) => e.status === 400);
});

test("mergeCustomers reasigna las 6 tablas y borra el duplicado", async () => {
  const client = recordingClient(0);
  const mod = loadWith(client);
  await mod.mergeCustomers(1, "22222222-2222-2222-2222-222222222222", "33333333-3333-3333-3333-333333333333");
  const updates = client.writes.filter((w) => /UPDATE \w+ SET client_id/.test(w.sql));
  assert.equal(updates.length, 6);
  assert.ok(client.writes.some((w) => /DELETE FROM clients WHERE id = \$1::uuid/.test(w.sql)));
});
```

- [ ] **Step 2: Register the test file**

In `apps/web/package.json`, append ` scripts/customer-admin.test.mjs` to the `"test"` script string.

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL — `Cannot find module '.../customer-admin.ts'`.

- [ ] **Step 4: Create the module**

Create `apps/web/src/lib/customer-admin.ts`:

```ts
import { ApiError } from "@/lib/api-response";
import { withCompanyContext } from "@/lib/db";
import type { PoolClient } from "pg";

// Tablas con FK a clients (verificado en información_schema). Lista fija (no input
// del usuario), por eso es seguro interpolarla en el SQL.
export const CUSTOMER_LINKED_TABLES = [
  "sales",
  "orders",
  "quotes",
  "payments",
  "current_account_movements",
  "sale_documents",
] as const;

export async function customerLinkTotal(
  client: PoolClient,
  companyId: number,
  id: string,
): Promise<number> {
  let total = 0;
  for (const table of CUSTOMER_LINKED_TABLES) {
    const result = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM ${table} WHERE empresa_id = $1 AND client_id = $2::uuid`,
      [companyId, id],
    );
    total += Number(result.rows[0]?.n ?? 0);
  }
  return total;
}

async function assertClientExists(client: PoolClient, companyId: number, id: string): Promise<void> {
  const result = await client.query(
    `SELECT 1 FROM clients WHERE id = $1::uuid AND empresa_id = $2 LIMIT 1`,
    [id, companyId],
  );
  if (!result.rows[0]) throw new ApiError(404, "Cliente no encontrado");
}

export async function deleteCustomer(companyId: number, id: string): Promise<void> {
  await withCompanyContext(companyId, async (client) => {
    await assertClientExists(client, companyId, id);
    const total = await customerLinkTotal(client, companyId, id);
    if (total > 0) {
      throw new ApiError(
        409,
        "El cliente tiene historial (ventas/movimientos) y no puede eliminarse. Usá Fusionar.",
      );
    }
    await client.query(`DELETE FROM clients WHERE id = $1::uuid AND empresa_id = $2`, [id, companyId]);
  });
}

export async function mergeCustomers(
  companyId: number,
  keepId: string,
  duplicateId: string,
): Promise<void> {
  if (keepId === duplicateId) throw new ApiError(400, "No se puede fusionar un cliente consigo mismo");
  await withCompanyContext(companyId, async (client) => {
    await assertClientExists(client, companyId, keepId);
    await assertClientExists(client, companyId, duplicateId);
    for (const table of CUSTOMER_LINKED_TABLES) {
      await client.query(
        `UPDATE ${table} SET client_id = $1::uuid WHERE client_id = $2::uuid AND empresa_id = $3`,
        [keepId, duplicateId, companyId],
      );
    }
    await client.query(`DELETE FROM clients WHERE id = $1::uuid AND empresa_id = $2`, [duplicateId, companyId]);
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test`
Expected: PASS (4 tests nuevos).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/customer-admin.ts apps/web/scripts/customer-admin.test.mjs apps/web/package.json
git commit -m "feat(clientes): backend borrar (con guarda) y fusionar clientes"
```

---

## Task 2: Permiso `clientes.eliminar`

**Files:**
- Modify: `apps/web/src/lib/route-auth.ts` (`LEGACY_ROLE_PERMISSIONS.jefe`)
- Create: `apps/web/scripts/customers-admin-wiring.test.mjs`
- Modify: `apps/web/package.json`

**Interfaces:** ninguna nueva. `administrador` ya es full-access; `vendedor` NO debe recibirlo.

- [ ] **Step 1: Write the failing regression test**

Create `apps/web/scripts/customers-admin-wiring.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeAuth = readFileSync(new URL("../src/lib/route-auth.ts", import.meta.url), "utf8");

test("el rol jefe tiene clientes.eliminar y vendedor no", () => {
  const jefeBlock = routeAuth.slice(routeAuth.indexOf("jefe:"), routeAuth.indexOf("deposito:"));
  const vendedorBlock = routeAuth.slice(routeAuth.indexOf("vendedor:"), routeAuth.length);
  assert.match(jefeBlock, /"clientes\.eliminar"/);
  assert.doesNotMatch(vendedorBlock, /"clientes\.eliminar"/);
});
```

- [ ] **Step 2: Register the test file**

In `apps/web/package.json`, append ` scripts/customers-admin-wiring.test.mjs` to the `"test"` script string.

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL — `clientes.eliminar` no está en el bloque de `jefe`.

- [ ] **Step 4: Add the permission**

In `apps/web/src/lib/route-auth.ts`, inside `LEGACY_ROLE_PERMISSIONS`, in the `jefe` array, right after the line `"clientes.editar",`, add:

```ts
    "clientes.eliminar",
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/route-auth.ts apps/web/scripts/customers-admin-wiring.test.mjs apps/web/package.json
git commit -m "feat(clientes): permiso clientes.eliminar para admin y jefe"
```

---

## Task 3: `listCustomers` (+ campos) y `listClientOptions`

**Files:**
- Modify: `apps/web/src/lib/catalog.ts` (`listCustomers`, ~línea 139; y nueva `listClientOptions`)

**Interfaces:**
- Produces:
  - cada `Customer` de `listCustomers` incluye `address: string`, `observation: string`, `salesCount: number` (además de los campos actuales). Consumido por Task 5.
  - `listClientOptions(companyId: number): Promise<{ id: string; name: string }[]>` — todos los clientes (id + nombre) para el buscador de fusión. Consumido por Task 5.

- [ ] **Step 1: Extend the query and mapping**

En `apps/web/src/lib/catalog.ts`, en `listCustomers`:

1. En el tipo de fila (el genérico de `queryWithCompanyContext<{…}>`), agregar:

```ts
    address: string | null;
    notes: string | null;
    sales_count: string;
```

2. En el `SELECT` de la consulta de datos, agregar las columnas (junto a las existentes):

```sql
             address, notes,
             (SELECT count(*) FROM sales s WHERE s.empresa_id = clients.empresa_id AND s.client_id = clients.id)::text AS sales_count,
```

3. En el `.map(...)` que arma cada `Customer`, agregar:

```ts
      address: row.address ?? "",
      observation: row.notes ?? "",
      salesCount: Number(row.sales_count ?? 0),
```

Si el tipo `Customer` (en `catalog.ts` o `catalog-management.ts`) no declara `salesCount`, agregar `salesCount: number;` a ese tipo. `address` y `observation` ya existen en `Customer` (los usa el PATCH), sólo faltaba poblarlos aquí.

4. Agregar la función `listClientOptions` (misma `queryWithCompanyContext` que usa el resto de `catalog.ts`):

```ts
export async function listClientOptions(companyId: number): Promise<{ id: string; name: string }[]> {
  const result = await queryWithCompanyContext<{ id: string; name: string }>(
    companyId,
    `SELECT id::text AS id, COALESCE(NULLIF(display_name, ''), legal_name, 'Sin nombre') AS name
       FROM clients WHERE empresa_id = $1 ORDER BY display_name ASC, id ASC`,
    [companyId],
  );
  return result.rows;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos (ignorar el error preexistente de `.next/types` sobre `api/pdfs/balance`).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/catalog.ts
git commit -m "feat(clientes): listCustomers expone address, observation y salesCount"
```

---

## Task 4: Server actions de clientes

**Files:**
- Modify: `apps/web/src/app/customers/actions.ts`

**Interfaces:**
- Consumes: `customer-admin.ts` (Task 1), `updateCustomer`/`customerInputFromBody`/`getCustomer` (`@/lib/catalog-management`), `requireApiSession` (`@/lib/route-auth`), `uuidParam`/`stringFieldsFromFormData`.
- Produces: `updateCustomerAction`, `deleteCustomerAction`, `mergeCustomersAction` (todas `(formData: FormData) => Promise<void>`).

- [ ] **Step 1: Add the actions**

En `apps/web/src/app/customers/actions.ts`, agregar imports y funciones (mantener `createCustomerAction`):

```ts
import { deleteCustomer, mergeCustomers } from "@/lib/customer-admin";
import { customerInputFromBody, getCustomer, updateCustomer } from "@/lib/catalog-management";
import { uuidParam } from "@/lib/request-body";
import { requireApiSession } from "@/lib/route-auth";

const CLIENTES_ELIMINAR = { resource: "clientes", action: "eliminar" } as const;

export async function updateCustomerAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "clientes", action: "editar" }]);
  const id = uuidParam(String(formData.get("id") ?? ""), "Cliente");
  const current = await getCustomer(session.companyId, id);
  await updateCustomer(
    session.companyId,
    id,
    customerInputFromBody(stringFieldsFromFormData(formData), {
      name: current.name,
      businessName: current.businessName,
      taxIdType: current.taxIdType,
      taxId: current.taxId,
      vatCondition: current.vatCondition,
      phone: current.phone,
      address: current.address,
      city: current.city,
      province: current.province,
      priceList: current.priceList,
      status: current.status,
      seller: current.seller,
      observation: current.observation,
    }),
  );
  revalidatePath("/customers");
}

export async function deleteCustomerAction(formData: FormData) {
  const session = await requireApiSession([CLIENTES_ELIMINAR]);
  const id = uuidParam(String(formData.get("id") ?? ""), "Cliente");
  await deleteCustomer(session.companyId, id);
  revalidatePath("/customers");
}

export async function mergeCustomersAction(formData: FormData) {
  const session = await requireApiSession([CLIENTES_ELIMINAR]);
  const keepId = uuidParam(String(formData.get("keepId") ?? ""), "Cliente");
  const duplicateId = uuidParam(String(formData.get("duplicateId") ?? ""), "Cliente duplicado");
  await mergeCustomers(session.companyId, keepId, duplicateId);
  revalidatePath("/customers");
}
```

Nota: `createCustomerAction` ya importa `revalidatePath`, `stringFieldsFromFormData`, `createCustomer`, `customerInputFromBody`, `requireApiSession`. Reutilizar esos imports; agregar sólo los que falten (`deleteCustomer`, `mergeCustomers`, `getCustomer`, `updateCustomer`, `uuidParam`).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/customers/actions.ts
git commit -m "feat(clientes): actions editar, eliminar y fusionar"
```

---

## Task 5: UI — acciones por fila en `/customers`

**Files:**
- Create: `apps/web/src/app/customers/customer-row-actions.tsx`
- Modify: `apps/web/src/app/customers/page.tsx`

**Interfaces:**
- Consumes: actions (Task 4), `Customer` (con address/observation/salesCount de Task 3), `@/components/ui` (`Button`, `Field`, `Input`, `Select`, `SearchableSelect`), `sessionAllows` (`@/lib/route-auth`).

- [ ] **Step 1: Create the row-actions client component**

Create `apps/web/src/app/customers/customer-row-actions.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button, Field, Input, SearchableSelect, Select } from "@/components/ui";

type CustomerLite = { id: string; name: string };

type EditableCustomer = {
  id: string;
  name: string;
  businessName: string;
  taxIdType: string;
  taxId: string;
  vatCondition: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  priceList: string;
  status: string;
  seller: string;
  observation: string;
  salesCount: number;
};

type Action = (formData: FormData) => Promise<void>;

type CustomerRowActionsProps = {
  customer: EditableCustomer;
  allClients: CustomerLite[];
  priceLists: string[];
  canDelete: boolean;
  updateAction: Action;
  deleteAction: Action;
  mergeAction: Action;
};

export function CustomerRowActions({
  customer,
  allClients,
  priceLists,
  canDelete,
  updateAction,
  deleteAction,
  mergeAction,
}: CustomerRowActionsProps) {
  const [dialog, setDialog] = useState<"none" | "edit" | "delete" | "merge">("none");
  const [keepId, setKeepId] = useState("");
  const mergeTargets = allClients.filter((client) => client.id !== customer.id);

  return (
    <div className="flex flex-wrap gap-1">
      <Button onClick={() => setDialog("edit")} size="sm" type="button" variant="secondary">Editar</Button>
      {canDelete ? (
        <>
          <Button onClick={() => setDialog("merge")} size="sm" type="button" variant="secondary">Fusionar</Button>
          <Button onClick={() => setDialog("delete")} size="sm" type="button" variant="secondary">Eliminar</Button>
        </>
      ) : null}

      {dialog === "edit" ? (
        <Overlay onClose={() => setDialog("none")} title="Editar cliente">
          <form action={updateAction} className="grid gap-3 sm:grid-cols-2" onSubmit={() => setDialog("none")}>
            <input name="id" type="hidden" value={customer.id} />
            <Field htmlFor={`edit-name-${customer.id}`} label="Nombre">
              <Input defaultValue={customer.name} id={`edit-name-${customer.id}`} name="name" required />
            </Field>
            <Field htmlFor={`edit-business-${customer.id}`} label="Razón social">
              <Input defaultValue={customer.businessName} id={`edit-business-${customer.id}`} name="businessName" />
            </Field>
            <Field htmlFor={`edit-taxidtype-${customer.id}`} label="Tipo ID">
              <Input defaultValue={customer.taxIdType} id={`edit-taxidtype-${customer.id}`} name="taxIdType" placeholder="CUIT / DNI" />
            </Field>
            <Field htmlFor={`edit-taxid-${customer.id}`} label="CUIT/DNI">
              <Input defaultValue={customer.taxId} id={`edit-taxid-${customer.id}`} name="taxId" />
            </Field>
            <Field htmlFor={`edit-vat-${customer.id}`} label="Cond. IVA">
              <Input defaultValue={customer.vatCondition} id={`edit-vat-${customer.id}`} name="vatCondition" />
            </Field>
            <Field htmlFor={`edit-phone-${customer.id}`} label="Teléfono">
              <Input defaultValue={customer.phone} id={`edit-phone-${customer.id}`} name="phone" />
            </Field>
            <Field htmlFor={`edit-address-${customer.id}`} label="Dirección">
              <Input defaultValue={customer.address} id={`edit-address-${customer.id}`} name="address" />
            </Field>
            <Field htmlFor={`edit-city-${customer.id}`} label="Localidad">
              <Input defaultValue={customer.city} id={`edit-city-${customer.id}`} name="city" />
            </Field>
            <Field htmlFor={`edit-province-${customer.id}`} label="Provincia">
              <Input defaultValue={customer.province} id={`edit-province-${customer.id}`} name="province" />
            </Field>
            <Field htmlFor={`edit-pricelist-${customer.id}`} label="Lista de precios">
              <Select defaultValue={customer.priceList} id={`edit-pricelist-${customer.id}`} name="priceList">
                <option value="">Sin lista</option>
                {priceLists.map((list) => (
                  <option key={list} value={list}>{list}</option>
                ))}
              </Select>
            </Field>
            <Field htmlFor={`edit-status-${customer.id}`} label="Estado">
              <Select
                defaultValue={customer.status.trim().toLowerCase() === "inactivo" ? "inactivo" : "activo"}
                id={`edit-status-${customer.id}`}
                name="status"
              >
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </Select>
            </Field>
            <Field htmlFor={`edit-seller-${customer.id}`} label="Vendedor">
              <Input defaultValue={customer.seller} id={`edit-seller-${customer.id}`} name="seller" />
            </Field>
            <div className="sm:col-span-2">
              <Field htmlFor={`edit-obs-${customer.id}`} label="Observación">
                <Input defaultValue={customer.observation} id={`edit-obs-${customer.id}`} name="observation" />
              </Field>
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button onClick={() => setDialog("none")} size="sm" type="button" variant="secondary">Cancelar</Button>
              <Button size="sm" type="submit">Guardar</Button>
            </div>
          </form>
        </Overlay>
      ) : null}

      {dialog === "delete" ? (
        <Overlay onClose={() => setDialog("none")} title="Eliminar cliente">
          <p className="erp-text-body-sm">
            ¿Eliminar a <strong>{customer.name}</strong>? Esta acción no se puede deshacer.
            {customer.salesCount > 0 ? (
              <span className="mt-2 block font-semibold text-[color:var(--danger)]">
                Tiene {customer.salesCount} ventas: no se podrá eliminar (usá Fusionar).
              </span>
            ) : null}
          </p>
          <form action={deleteAction} className="mt-4 flex justify-end gap-2" onSubmit={() => setDialog("none")}>
            <input name="id" type="hidden" value={customer.id} />
            <Button onClick={() => setDialog("none")} size="sm" type="button" variant="secondary">Cancelar</Button>
            <Button size="sm" type="submit">Eliminar</Button>
          </form>
        </Overlay>
      ) : null}

      {dialog === "merge" ? (
        <Overlay onClose={() => setDialog("none")} title="Fusionar duplicado">
          <p className="erp-text-body-sm">
            Se moverá el historial de <strong>{customer.name}</strong>
            {customer.salesCount > 0 ? ` (${customer.salesCount} ventas)` : ""} al cliente que elijas, y
            <strong> {customer.name}</strong> se eliminará. Irreversible.
          </p>
          <form action={mergeAction} className="mt-4 grid gap-3" onSubmit={() => setDialog("none")}>
            <input name="duplicateId" type="hidden" value={customer.id} />
            <input name="keepId" type="hidden" value={keepId} />
            <Field htmlFor={`merge-keep-${customer.id}`} label="Cliente que se queda">
              <SearchableSelect
                id={`merge-keep-${customer.id}`}
                onChange={setKeepId}
                options={mergeTargets.map((client) => ({ value: client.id, label: client.name }))}
                value={keepId}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setDialog("none")} size="sm" type="button" variant="secondary">Cancelar</Button>
              <Button disabled={!keepId} size="sm" type="submit">Fusionar</Button>
            </div>
          </form>
        </Overlay>
      ) : null}
    </div>
  );
}

function Overlay({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog">
      <button aria-label="Cerrar" className="absolute inset-0 cursor-default bg-black/40" onClick={onClose} type="button" />
      <div className="relative z-10 w-full max-w-md rounded-[12px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5">
        <h2 className="erp-text-title-sm font-black">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
```

Nota: verificar que `SearchableSelect` acepte `onChange: (value: string) => void` y `options: {value,label}[]` (así lo usa `orders/new/order-entry-fields.tsx`). Si su API difiere, adaptarlo a esa firma. Si `@/components/ui` no reexporta los componentes desde la raíz, importarlos de sus rutas concretas.

- [ ] **Step 2: Wire into the customers page**

En `apps/web/src/app/customers/page.tsx`:

1. Imports:

```tsx
import { CustomerRowActions } from "@/app/customers/customer-row-actions";
import { deleteCustomerAction, mergeCustomersAction, updateCustomerAction } from "@/app/customers/actions";
import { listClientOptions } from "@/lib/catalog";
import { sessionAllows } from "@/lib/route-auth";
```

2. Después de obtener `result` (la lista) y `session`, calcular permiso y la lista completa para fusionar:

```tsx
  const canDelete = await sessionAllows(session, [{ resource: "clientes", action: "eliminar" }]);
  const allClients = canDelete ? await listClientOptions(session.companyId) : [];
```

`activePriceLists` ya existe en `page.tsx` (se usa en el form de alta) — se reutiliza para el `priceLists` de las acciones; no recalcular.

3. Agregar la cabecera de columna después de `<DataTableHead>Estado</DataTableHead>`:

```tsx
                <DataTableHead>Acciones</DataTableHead>
```

4. Agregar la celda al final de cada fila, después de la celda de Estado (`</DataTableCell>` del `StatusBadge`):

```tsx
                    <DataTableCell>
                      <CustomerRowActions
                        allClients={allClients}
                        canDelete={canDelete}
                        customer={{
                          id: customer.id,
                          name: customer.name,
                          businessName: customer.businessName,
                          taxIdType: customer.taxIdType,
                          taxId: customer.taxId,
                          vatCondition: customer.vatCondition,
                          phone: customer.phone,
                          address: customer.address,
                          city: customer.city,
                          province: customer.province,
                          priceList: customer.priceList,
                          status: customer.status,
                          seller: customer.seller,
                          observation: customer.observation,
                          salesCount: customer.salesCount,
                        }}
                        deleteAction={deleteCustomerAction}
                        mergeAction={mergeCustomersAction}
                        priceLists={activePriceLists.map((list) => list.name)}
                        updateAction={updateCustomerAction}
                      />
                    </DataTableCell>
```

5. Actualizar el `colSpan` del `EmptyState` de 6 a 7 (hay una columna más).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos. (Si `Customer` no expone `businessName`/`vatCondition`/`salesCount`, revisar Task 3 y el tipo `Customer`.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/customers/customer-row-actions.tsx apps/web/src/app/customers/page.tsx
git commit -m "feat(clientes): acciones editar/eliminar/fusionar por fila"
```

---

## Task 6: Verificación + deploy

**Files:** ninguno.

- [ ] **Step 1: Suite completa + typecheck**

Run: `npm run test`
Expected: PASS los tests nuevos (`customer-admin`, `customers-admin-wiring`). Las 11 fallas preexistentes de `static.test.mjs` (CRLF/Windows) siguen; confirmar que no hay fallas nuevas fuera de ese archivo (comparar el set de fallas con el de `static.test.mjs` solo).

Run: `npx tsc --noEmit`
Expected: sólo el error preexistente de `.next/types` sobre `api/pdfs/balance`.

- [ ] **Step 2: Merge a `main` y deploy**

Usar `superpowers:finishing-a-development-branch`: verificar tests, mergear `feat/customers-edit-delete` a `main`, y (con confirmación del usuario) `git push origin main`. No hay migración de base: el permiso es sólo código. Vigilar el commit-status "Vercel" hasta `success`.

- [ ] **Step 3: Verificación viva**

En `https://starlim.vercel.app/customers` (requiere login): editar un cliente y confirmar que persiste; intentar eliminar uno con ventas (debe bloquear con aviso) y uno sin ventas (debe borrarse); fusionar un duplicado de prueba y confirmar que su historial queda en el cliente que se queda y el duplicado desaparece. Como requiere sesión, lo confirma el usuario o se guía paso a paso. **La fusión es irreversible**: probar primero con un cliente de prueba.
```
