# Página de detalle del cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página `/customers/[id]` con toda la info del cliente + historial de compras (resumen/ritmo/lista); mover las acciones (editar/fusionar/eliminar) adentro; edición con selectores de vendedor propio y a cargo.

**Architecture:** Módulo puro `customer-purchase-summary.ts` (resumen+ritmo, testeable) + `customer-detail.ts` (datos: historial vía `sales`). La lista deja de tener botones inline (el nombre linkea al detalle). `CustomerRowActions` se extiende con selectores de vendedor y se reubica en el detalle.

**Tech Stack:** TypeScript, Next.js (breaking-changes fork — ver `apps/web/AGENTS.md`), PostgreSQL (Supabase) vía `pg`, tests `node --test` + `typescript`.

## Global Constraints

- Todas las consultas scopeadas por `empresa_id`.
- El hotfix (que `updateCustomerAction` conserve `assignedSeller`) **ya está en main**; este plan no lo repite.
- `customer-rhythm.ts` es puro (sin imports `@/`): `customerMetrics(timestamps: number[]) → { average, deviation, intervals }` (average = días promedio ponderado entre compras; timestamps en ms).
- `listVendors(companyId) → { id, name }[]` (solo rol vendedor). Los selectores deben incluir el valor actual aunque no figure en la lista.
- Tests: `node:test`, `npm run test` desde `apps/web`; registrar cada `.mjs` nuevo en el script `test` de `package.json`. Módulos con imports `@/lib/*` de valor se cargan con `loadTypeScriptModule(path, aliases)`.
- Comandos desde `apps/web/`.

---

## File Structure

- **Create** `apps/web/src/lib/customer-purchase-summary.ts` — `summarizePurchases` (puro).
- **Create** `apps/web/scripts/customer-purchase-summary.test.mjs` — tests unitarios.
- **Create** `apps/web/src/lib/customer-detail.ts` — `getCustomerPurchaseHistory` (datos).
- **Create** `apps/web/scripts/customer-detail-wiring.test.mjs` — regresión de fuente (lista linkea al detalle; form de edición tiene assignedSeller).
- **Create** `apps/web/src/app/customers/[id]/page.tsx` — página de detalle.
- **Modify** `apps/web/src/app/customers/customer-row-actions.tsx` — selectores de vendedor + assignedSeller.
- **Modify** `apps/web/src/app/customers/page.tsx` — nombre linkeado, sin acciones inline.
- **Modify** `apps/web/package.json` — registrar los dos test nuevos.

---

## Task 1: `summarizePurchases` (puro)

**Files:**
- Create: `apps/web/src/lib/customer-purchase-summary.ts`
- Create: `apps/web/scripts/customer-purchase-summary.test.mjs`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: `customerMetrics` (`@/lib/customer-rhythm`).
- Produces:
  - `type PurchaseSummary = { totalAmount: number; count: number; lastPurchase: string | null; averageDays: number; expectedNext: string | null }`.
  - `summarizePurchases(purchases: { date: string | null; amount: number }[]): PurchaseSummary`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/scripts/customer-purchase-summary.test.mjs`:

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
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiledModule = { exports: {} };
  const moduleRequire = (specifier) => aliases[specifier] ?? require(specifier);
  Function("require", "module", "exports", compiled)(moduleRequire, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

const rhythm = loadTypeScriptModule("../src/lib/customer-rhythm.ts");
const { summarizePurchases } = loadTypeScriptModule("../src/lib/customer-purchase-summary.ts", {
  "@/lib/customer-rhythm": rhythm,
});

test("sin compras: todo en cero / null", () => {
  assert.deepEqual(summarizePurchases([]), {
    totalAmount: 0, count: 0, lastPurchase: null, averageDays: 0, expectedNext: null,
  });
});

test("una compra: total y última, sin ritmo", () => {
  const s = summarizePurchases([{ date: "2026-08-01", amount: 100 }]);
  assert.equal(s.count, 1);
  assert.equal(s.totalAmount, 100);
  assert.equal(s.lastPurchase, "2026-08-01");
  assert.equal(s.averageDays, 0);
  assert.equal(s.expectedNext, null);
});

test("varias compras: promedio de días y próxima esperada", () => {
  const s = summarizePurchases([
    { date: "2026-08-01", amount: 100 },
    { date: "2026-08-11", amount: 50 },
    { date: "2026-08-21", amount: 30 },
  ]);
  assert.equal(s.count, 3);
  assert.equal(s.totalAmount, 180);
  assert.equal(s.lastPurchase, "2026-08-21");
  assert.equal(s.averageDays, 10); // gaps de 10 y 10
  assert.equal(s.expectedNext, "2026-08-31"); // 21 + 10 días
});

test("ignora fechas nulas para el ritmo pero cuenta el monto", () => {
  const s = summarizePurchases([
    { date: null, amount: 20 },
    { date: "2026-08-01", amount: 100 },
    { date: "2026-08-11", amount: 50 },
  ]);
  assert.equal(s.count, 3);
  assert.equal(s.totalAmount, 170);
  assert.equal(s.lastPurchase, "2026-08-11");
  assert.equal(s.averageDays, 10);
});
```

- [ ] **Step 2: Register the test file**

In `apps/web/package.json`, append ` scripts/customer-purchase-summary.test.mjs` to the `"test"` script string.

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL — `Cannot find module '.../customer-purchase-summary.ts'`.

- [ ] **Step 4: Create the module**

Create `apps/web/src/lib/customer-purchase-summary.ts`:

```ts
import { customerMetrics } from "@/lib/customer-rhythm";

export type PurchaseSummary = {
  totalAmount: number;
  count: number;
  lastPurchase: string | null;
  averageDays: number;
  expectedNext: string | null;
};

const DAY_MS = 86_400_000;

function isoToMs(date: string): number {
  return new Date(`${date}T00:00:00Z`).getTime();
}

function msToIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function summarizePurchases(purchases: { date: string | null; amount: number }[]): PurchaseSummary {
  const count = purchases.length;
  const totalAmount = purchases.reduce((sum, p) => sum + (Number.isFinite(p.amount) ? p.amount : 0), 0);

  const timestamps = purchases
    .map((p) => p.date)
    .filter((date): date is string => Boolean(date))
    .map(isoToMs)
    .sort((a, b) => a - b);

  if (timestamps.length === 0) {
    return { totalAmount, count, lastPurchase: null, averageDays: 0, expectedNext: null };
  }

  const lastMs = timestamps[timestamps.length - 1]!;
  const lastPurchase = msToIso(lastMs);

  if (timestamps.length < 2) {
    return { totalAmount, count, lastPurchase, averageDays: 0, expectedNext: null };
  }

  const { average } = customerMetrics(timestamps);
  return {
    totalAmount,
    count,
    lastPurchase,
    averageDays: average,
    expectedNext: msToIso(lastMs + average * DAY_MS),
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test`
Expected: PASS (4 tests nuevos).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/customer-purchase-summary.ts apps/web/scripts/customer-purchase-summary.test.mjs apps/web/package.json
git commit -m "feat(clientes): summarizePurchases (resumen y ritmo de compra)"
```

---

## Task 2: `getCustomerPurchaseHistory` (datos)

**Files:**
- Create: `apps/web/src/lib/customer-detail.ts`
- Create: `apps/web/scripts/customer-detail-wiring.test.mjs`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: `queryWithCompanyContext` (`@/lib/db`), `normalizeOrderStatusValue` (`@/lib/order-status`), `summarizePurchases`/`PurchaseSummary` (Task 1).
- Produces:
  - `type CustomerOrder = { id: string; number: string; date: string | null; amount: number; orderStatus: string; collectionStatus: string }`.
  - `type CustomerPurchaseHistory = { summary: PurchaseSummary; orders: CustomerOrder[] }`.
  - `getCustomerPurchaseHistory(companyId: number, clientId: string): Promise<CustomerPurchaseHistory>`.

- [ ] **Step 1: Write the failing regression test**

Create `apps/web/scripts/customer-detail-wiring.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const detailSource = readFileSync(new URL("../src/lib/customer-detail.ts", import.meta.url), "utf8");

test("getCustomerPurchaseHistory consulta sales scopeado y usa summarizePurchases", () => {
  assert.match(detailSource, /FROM sales/);
  assert.match(detailSource, /client_id = \$2::uuid/);
  assert.match(detailSource, /summarizePurchases\(/);
});
```

- [ ] **Step 2: Register the test file**

In `apps/web/package.json`, append ` scripts/customer-detail-wiring.test.mjs` to the `"test"` script string.

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL — `Cannot find module '.../customer-detail.ts'`.

- [ ] **Step 4: Create the module**

Create `apps/web/src/lib/customer-detail.ts`:

```ts
import { queryWithCompanyContext } from "@/lib/db";
import { normalizeOrderStatusValue } from "@/lib/order-status";
import { summarizePurchases, type PurchaseSummary } from "@/lib/customer-purchase-summary";

export type CustomerOrder = {
  id: string;
  number: string;
  date: string | null;
  amount: number;
  orderStatus: string;
  collectionStatus: string;
};

export type CustomerPurchaseHistory = {
  summary: PurchaseSummary;
  orders: CustomerOrder[];
};

export async function getCustomerPurchaseHistory(
  companyId: number,
  clientId: string,
): Promise<CustomerPurchaseHistory> {
  const rows = (
    await queryWithCompanyContext<{
      id: string;
      number: string;
      date: string | null;
      amount: string;
      order_status: string;
      collection_status: string;
    }>(
      companyId,
      `
        SELECT s.id::text AS id,
               COALESCE(NULLIF(s.commercial_number::text, ''), s.sale_number, '') AS number,
               s.sale_date::text AS date,
               COALESCE(s.total_amount, 0)::text AS amount,
               COALESCE(s.order_status, '') AS order_status,
               COALESCE(s.collection_status, 'pendiente') AS collection_status
          FROM sales s
         WHERE s.empresa_id = $1 AND s.client_id = $2::uuid
         ORDER BY s.sale_date DESC NULLS LAST, s.created_at DESC
         LIMIT 1000
      `,
      [companyId, clientId],
    )
  ).rows;

  const orders: CustomerOrder[] = rows.map((row) => ({
    id: row.id,
    number: row.number,
    date: row.date,
    amount: Number(row.amount),
    orderStatus: normalizeOrderStatusValue(row.order_status),
    collectionStatus: row.collection_status,
  }));

  const summary = summarizePurchases(rows.map((row) => ({ date: row.date, amount: Number(row.amount) })));
  return { summary, orders };
}
```

- [ ] **Step 5: Run test + typecheck**

Run: `npm run test`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: sin errores nuevos (ignorar el error preexistente de `.next/types` sobre `api/pdfs/balance`). Verificar que `normalizeOrderStatusValue` se exporta desde `@/lib/order-status` (lo usa `orders.ts`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/customer-detail.ts apps/web/scripts/customer-detail-wiring.test.mjs apps/web/package.json
git commit -m "feat(clientes): getCustomerPurchaseHistory (historial de compras)"
```

---

## Task 3: Sacar acciones inline de la lista + nombre linkeado

**Files:**
- Modify: `apps/web/src/app/customers/page.tsx`
- Modify: `apps/web/scripts/customer-detail-wiring.test.mjs`

**Interfaces:** ninguna nueva.

- [ ] **Step 1: Add the failing regression assertion**

Append to `apps/web/scripts/customer-detail-wiring.test.mjs`:

```js
const listSource = readFileSync(new URL("../src/app/customers/page.tsx", import.meta.url), "utf8");

test("la lista de clientes linkea al detalle y no usa acciones inline", () => {
  assert.match(listSource, /\/customers\/\$\{customer\.id\}/);
  assert.doesNotMatch(listSource, /CustomerRowActions/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL — la lista todavía usa `CustomerRowActions` y no tiene el link.

- [ ] **Step 3: Edit `customers/page.tsx`**

1. Remove these imports (ya no se usan en la lista):

```tsx
import {
  createCustomerAction,
  deleteCustomerAction,
  mergeCustomersAction,
  updateCustomerAction,
} from "@/app/customers/actions";
import { CustomerRowActions } from "@/app/customers/customer-row-actions";
import { listClientOptions, listCustomers } from "@/lib/catalog";
```

and replace with (mantener `createCustomerAction`, que usa el form de alta):

```tsx
import { createCustomerAction } from "@/app/customers/actions";
import { listCustomers } from "@/lib/catalog";
```

Añadir el import de `Link` de Next arriba del archivo:

```tsx
import Link from "next/link";
```

2. Remove the two computed lines added for inline actions:

```tsx
  const canDelete = await sessionAllows(session, [{ resource: "clientes", action: "eliminar" }]);
  const allClients = canDelete ? await listClientOptions(session.companyId) : [];
```

(y el comentario `activePriceLists ya existe…` si quedó). Si `sessionAllows` ya no se
usa en el archivo, quitar también su import.

3. Wrap the customer name in a link. Reemplazar:

```tsx
                      <div className="max-w-[260px] break-words font-medium">
                        {customer.name || "Sin nombre"}
                      </div>
```

por:

```tsx
                      <Link
                        className="max-w-[260px] break-words font-medium text-[color:var(--accent)] hover:underline"
                        href={`/customers/${customer.id}`}
                      >
                        {customer.name || "Sin nombre"}
                      </Link>
```

4. Remove the "Acciones" header:

```tsx
                <DataTableHead>Acciones</DataTableHead>
```

5. Remove the whole actions cell (el `<DataTableCell>` que contiene `<CustomerRowActions … />`).

6. Revert the EmptyState `colSpan` de 7 a 6.

- [ ] **Step 4: Run test + typecheck**

Run: `npm run test`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: sin errores nuevos (ni imports sin usar que rompan lint — si `eslint` marca imports sin usar, quitarlos).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/customers/page.tsx apps/web/scripts/customer-detail-wiring.test.mjs
git commit -m "feat(clientes): lista linkea al detalle y quita acciones inline"
```

---

## Task 4: Selectores de vendedor + assignedSeller en `CustomerRowActions`

**Files:**
- Modify: `apps/web/src/app/customers/customer-row-actions.tsx`
- Modify: `apps/web/scripts/customer-detail-wiring.test.mjs`

**Interfaces:**
- Produces: `CustomerRowActions` ahora requiere prop `vendors: { id: string; name: string }[]`; `EditableCustomer` incluye `assignedSeller: string`.

(En este punto `CustomerRowActions` no tiene consumidores — se sacó de la lista en Task 3 y el detalle se crea en Task 5 — así que no hay call-sites que romper.)

- [ ] **Step 1: Add the failing regression assertion**

Append to `apps/web/scripts/customer-detail-wiring.test.mjs`:

```js
const actionsComp = readFileSync(new URL("../src/app/customers/customer-row-actions.tsx", import.meta.url), "utf8");

test("el form de edición incluye el selector de vendedor a cargo", () => {
  assert.match(actionsComp, /name="assignedSeller"/);
  assert.match(actionsComp, /name="seller"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL — el componente no tiene `name="assignedSeller"`.

- [ ] **Step 3: Edit `customer-row-actions.tsx`**

1. En `EditableCustomer`, agregar `assignedSeller: string;` (después de `seller`).

2. En `CustomerRowActionsProps`, agregar `vendors: { id: string; name: string }[];`.

3. Desestructurar `vendors` en los parámetros del componente.

4. Antes del `return`, calcular las opciones de vendedor (incluyendo el valor actual aunque no esté en la lista):

```tsx
  const vendorNames = vendors.map((vendor) => vendor.name);
  const sellerOptions = vendorNames.includes(customer.seller) || !customer.seller
    ? vendorNames
    : [customer.seller, ...vendorNames];
  const assignedOptions = vendorNames.includes(customer.assignedSeller) || !customer.assignedSeller
    ? vendorNames
    : [customer.assignedSeller, ...vendorNames];
```

5. Reemplazar el campo "Vendedor" actual (Input `name="seller"`) por un `Select`, y agregar el de "Vendedor a cargo":

```tsx
            <Field htmlFor={`edit-seller-${customer.id}`} label="Vendedor propio">
              <Select defaultValue={customer.seller} id={`edit-seller-${customer.id}`} name="seller">
                <option value="">Sin asignar</option>
                {sellerOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </Select>
            </Field>
            <Field htmlFor={`edit-assigned-${customer.id}`} label="Vendedor a cargo">
              <Select defaultValue={customer.assignedSeller} id={`edit-assigned-${customer.id}`} name="assignedSeller">
                <option value="">Sin asignar</option>
                {assignedOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </Select>
            </Field>
```

(`Select` ya está importado en el archivo.)

- [ ] **Step 4: Run test + typecheck**

Run: `npm run test`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/customers/customer-row-actions.tsx apps/web/scripts/customer-detail-wiring.test.mjs
git commit -m "feat(clientes): selectores de vendedor propio y a cargo en edición"
```

---

## Task 5: Página de detalle `/customers/[id]`

**Files:**
- Create: `apps/web/src/app/customers/[id]/page.tsx`

**Interfaces:**
- Consumes: `getCustomer` (`@/lib/catalog-management`), `getCustomerPurchaseHistory` (Task 2), `listVendors` (`@/lib/imports`), `listClientOptions` (`@/lib/catalog`), `sessionAllows` (`@/lib/route-auth`), `CustomerRowActions` (Task 4), las server actions (`@/app/customers/actions`), `formatCurrency`/`formatNumber` (`@/lib/format`).

- [ ] **Step 1: Create the page**

Create `apps/web/src/app/customers/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import {
  Card,
  CardContent,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  EmptyState,
  PageHeader,
  StatCard,
  StatusBadge,
} from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { getCustomer } from "@/lib/catalog-management";
import { listClientOptions } from "@/lib/catalog";
import { getCustomerPurchaseHistory } from "@/lib/customer-detail";
import { formatCurrency } from "@/lib/format";
import { listVendors } from "@/lib/imports";
import { listPriceLists } from "@/lib/pricing";
import { requirePagePermission } from "@/lib/page-auth";
import { CUSTOMERS_READ_PERMISSION, sessionAllows } from "@/lib/route-auth";
import { CustomerRowActions } from "@/app/customers/customer-row-actions";
import { deleteCustomerAction, mergeCustomersAction, updateCustomerAction } from "@/app/customers/actions";

type CustomerDetailPageProps = {
  params: Promise<{ id: string }>;
};

function line(label: string, value: string) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <span className="erp-text-caption text-[color:var(--muted)]">{label}</span>
      <span className="erp-text-body-sm font-medium">{value || "-"}</span>
    </div>
  );
}

export default async function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [CUSTOMERS_READ_PERMISSION]);
  const { id } = await params;

  const customer = await getCustomer(session.companyId, id).catch(() => null);
  if (!customer) notFound();

  const [history, vendors, canDelete, allClients, priceLists] = await Promise.all([
    getCustomerPurchaseHistory(session.companyId, id),
    listVendors(session.companyId),
    sessionAllows(session, [{ resource: "clientes", action: "eliminar" }]),
    listClientOptions(session.companyId),
    listPriceLists(session.companyId, true),
  ]);
  const priceListNames = priceLists.filter((list) => list.active).map((list) => list.name);

  return (
    <ModulePage active="database" description="Ficha del cliente." session={session} title={customer.name || "Cliente"}>
      <div className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PageHeader
            description={`${customer.taxIdType || "ID"} ${customer.taxId || "-"}`}
            title={customer.name || "Sin nombre"}
          />
          <div className="flex items-center gap-2">
            <Link className="erp-text-body-sm text-[color:var(--accent)] hover:underline" href="/customers">
              ← Volver a Clientes
            </Link>
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
                assignedSeller: customer.assignedSeller,
                observation: customer.observation,
                salesCount: history.summary.count,
              }}
              deleteAction={deleteCustomerAction}
              mergeAction={mergeCustomersAction}
              priceLists={priceListNames}
              updateAction={updateCustomerAction}
              vendors={vendors}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total comprado" value={formatCurrency(history.summary.totalAmount)} />
          <StatCard label="Compras" value={String(history.summary.count)} />
          <StatCard label="Última compra" value={history.summary.lastPurchase ?? "-"} />
          <StatCard
            detail={history.summary.expectedNext ? `próxima ~ ${history.summary.expectedNext}` : undefined}
            label="Ritmo (días)"
            value={history.summary.averageDays > 0 ? String(history.summary.averageDays) : "-"}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent>
              <h2 className="erp-text-body-sm font-black">Contacto</h2>
              {line("Teléfono", customer.phone)}
              {line("Dirección", customer.address)}
              {line("Localidad", customer.city)}
              {line("Provincia", customer.province)}
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <h2 className="erp-text-body-sm font-black">Fiscal</h2>
              {line("Tipo ID", customer.taxIdType)}
              {line("CUIT/DNI", customer.taxId)}
              {line("Cond. IVA", customer.vatCondition)}
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <h2 className="erp-text-body-sm font-black">Comercial</h2>
              {line("Lista de precios", customer.priceList)}
              {line("Estado", customer.status)}
              {line("Vendedor propio", customer.seller)}
              {line("Vendedor a cargo", customer.assignedSeller)}
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <h2 className="erp-text-body-sm font-black">Notas</h2>
              <p className="erp-text-body-sm">{customer.observation || "Sin notas."}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <div className="border-b border-[color:var(--border)] p-4">
            <h2 className="erp-text-body-sm font-black">Historial de compras</h2>
          </div>
          <DataTable caption="Historial de compras del cliente" minWidth="640px" tableLabel="Compras">
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>Comprobante</DataTableHead>
                <DataTableHead>Fecha</DataTableHead>
                <DataTableHead>Monto</DataTableHead>
                <DataTableHead>Estado pedido</DataTableHead>
                <DataTableHead>Cobro</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {history.orders.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={5}>
                    <EmptyState description="Este cliente todavía no tiene compras." title="Sin compras registradas" />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                history.orders.map((order) => (
                  <DataTableRow key={order.id}>
                    <DataTableCell className="font-mono text-xs">{order.number || "-"}</DataTableCell>
                    <DataTableCell className="whitespace-nowrap">{order.date ?? "-"}</DataTableCell>
                    <DataTableCell>{formatCurrency(order.amount)}</DataTableCell>
                    <DataTableCell><StatusBadge tone="neutral">{order.orderStatus || "-"}</StatusBadge></DataTableCell>
                    <DataTableCell>{order.collectionStatus}</DataTableCell>
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>
        </Card>
      </div>
    </ModulePage>
  );
}
```

Nota: si `getCustomer` lanza `ApiError(404)` en vez de devolver null, el `.catch(() => null)` lo cubre → `notFound()`. Verificar que `Card`/`CardContent`/`PageHeader`/`StatCard`/`StatusBadge`/`DataTable*`/`EmptyState` se exportan desde `@/components/ui` (los usa `customers/page.tsx`). `listPriceLists(companyId, true)` devuelve objetos con `.name` y `.active` (igual que en `customers/page.tsx`).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos. (Si `getCustomer` no acepta encadenar `.catch`, envolver en try/catch equivalente.)

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/customers/[id]/page.tsx"
git commit -m "feat(clientes): página de detalle del cliente con historial"
```

---

## Task 6: Verificación + deploy

**Files:** ninguno.

- [ ] **Step 1: Suite completa + typecheck**

Run: `npm run test`
Expected: PASS los tests nuevos (`customer-purchase-summary`, `customer-detail-wiring`). Las 11 fallas preexistentes de `static.test.mjs` (CRLF/Windows) siguen; confirmar que no hay fallas nuevas fuera de ese archivo (comparar el set de fallas con el de `static.test.mjs` solo).

Run: `npx tsc --noEmit`
Expected: sólo el error preexistente de `.next/types` sobre `api/pdfs/balance`.

- [ ] **Step 2: Merge a `main` y deploy**

Usar `superpowers:finishing-a-development-branch`: verificar tests, mergear `feat/customer-detail-page` a `main`, y (con confirmación del usuario) `git push origin main`. No hay migración. Vigilar el commit-status "Vercel" hasta `success`.

- [ ] **Step 3: Verificación viva**

En `https://starlim.vercel.app/customers` (requiere login): clickear un cliente → abre `/customers/[id]` con contacto/fiscal/comercial/notas + historial (resumen, ritmo, lista). Editar → el diálogo permite elegir **vendedor propio** y **vendedor a cargo** (selectores), y al guardar el "a cargo" persiste. Fusionar/Eliminar visibles solo con `clientes.eliminar`. Como requiere sesión, lo confirma el usuario o se guía paso a paso.
```
