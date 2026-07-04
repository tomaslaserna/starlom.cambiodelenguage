# Ventas a cobrar en Cobros y pagos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la cola de aprobación de `/collections` por un listado de ventas entregadas con saldo a cobrar, con registro de cobro por fila; la aprobación sigue en `/admin/approvals`.

**Architecture:** Nueva query `listSalesToCollect` en `lib/collections.ts` (reusa los guards canónicos y el LATERAL de créditos aprobados de `listPendingCollections`, que no se toca porque la consume `listApprovalCenter`). Nueva server action `registerCollectionAction` que reusa `registerCollection`. La página `app/collections/page.tsx` se reescribe con las columnas Fecha / Nro comprobante / Nombre / CUIT / Monto a cobrar / Fecha vencimiento (sale_date + payment_term_days del cliente) / Factura-Remito / Acción.

**Tech Stack:** Next.js App Router (server components + server actions), PostgreSQL vía `pg`, tests estáticos con `node --test` (pattern-matching sobre el fuente).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-04-ventas-a-cobrar-design.md`.
- Textos de UI sin tildes en identificadores ya existentes (la app usa "aprobacion", "operacion", etc. sin acentos en varios lugares; seguir el estilo del archivo que se edita).
- No tocar: `listPendingCollections`, `approveCollection`/`rejectCollection` (lib), `/admin/approvals`, `/api/collections/[id]/register`.
- Tras cada tarea: suite completa `node --test scripts/static.test.mjs` (desde `apps/web`), `npx tsc --noEmit -p .` (solo errores pre-existentes en `pricing/offers/actions.ts` y `rentabilidad/actions.ts` son aceptables), `npx eslint <archivos tocados>`.
- Commits con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: `listSalesToCollect` en lib/collections.ts

**Files:**
- Modify: `apps/web/src/lib/collections.ts` (agregar función al final del archivo)
- Test: `apps/web/scripts/static.test.mjs` (test "collections screen lists delivered sales to collect")

**Interfaces:**
- Consumes: helpers ya presentes en el archivo: `queryWithCompanyContext`, `canonicalSalesSourceSql`, `normalizedOrderStatusSql`.
- Produces: `listSalesToCollect(companyId: number)` → `Promise<Array<{ id: string; date: string | null; receiptNumber: number; customerName: string; customerTaxId: string; outstandingAmount: number; dueDate: string | null; overdue: boolean; desiredDocument: string; collectionStatus: string; registeredAmount: number }>>`.

- [ ] **Step 1: Write the failing test**

En `apps/web/scripts/static.test.mjs`, después del test `"collection registration is off the orders register but still guarded"`, agregar:

```js
test("collections screen lists delivered sales to collect with due dates", () => {
  const collections = read("apps/web/src/lib/collections.ts");
  assert.match(collections, /export async function listSalesToCollect\(companyId: number\)/);
  assert.match(collections, /payment_term_days/);
  assert.match(collections, /IN \('pendiente','vencido','pendiente_aprobacion','en_proceso'\)/);
  assert.match(collections, /fecha_vencimiento/);
  assert.match(collections, /vencida/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (desde `apps/web`): `node --test scripts/static.test.mjs`
Expected: FAIL solo el test nuevo ("listSalesToCollect" no existe).

- [ ] **Step 3: Write minimal implementation**

Al final de `apps/web/src/lib/collections.ts` agregar:

```ts
export async function listSalesToCollect(companyId: number) {
  const result = await queryWithCompanyContext<{
    id: string;
    fecha: string | null;
    nro_comprobante: number;
    nombre_cliente: string;
    cuit_cliente: string;
    saldo: string;
    fecha_vencimiento: string | null;
    vencida: boolean;
    comprobante_deseado: string;
    estado_cobro: string;
    cobro_monto_registrado: string;
  }>(
    companyId,
    `
      SELECT v.id::text AS id,
             v.sale_date::text AS fecha,
             COALESCE(v.receipt_number, nullif(regexp_replace(COALESCE(v.sale_number, ''), '\\D', '', 'g'), '')::bigint, 0)::int AS nro_comprobante,
             COALESCE(v.client_name, cli.display_name, '') AS nombre_cliente,
             COALESCE(cli.tax_id, v.client_document, '') AS cuit_cliente,
             GREATEST(COALESCE(v.total_amount, 0) - COALESCE(approved.total_credit, 0), 0)::text AS saldo,
             (v.sale_date::date + COALESCE(cli.payment_term_days, 0))::text AS fecha_vencimiento,
             (v.sale_date::date + COALESCE(cli.payment_term_days, 0)) < CURRENT_DATE AS vencida,
             COALESCE(v.desired_document, 'remito') AS comprobante_deseado,
             COALESCE(v.collection_status, 'pendiente') AS estado_cobro,
             COALESCE(v.collection_registered_amount, 0)::text AS cobro_monto_registrado
      FROM sales v
      LEFT JOIN clients cli ON cli.id = v.client_id AND cli.empresa_id = v.empresa_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(cam.credit), 0) AS total_credit
        FROM current_account_movements cam
        WHERE cam.empresa_id = v.empresa_id AND cam.sale_id = v.id
      ) approved ON true
      WHERE COALESCE(v.collection_status,'pendiente') IN ('pendiente','vencido','pendiente_aprobacion','en_proceso')
        AND v.empresa_id = $1
        AND ${canonicalSalesSourceSql("v")}
        AND ${normalizedOrderStatusSql("v")} = 'entregado'
        AND GREATEST(COALESCE(v.total_amount, 0) - COALESCE(approved.total_credit, 0), 0) > 0.005
      ORDER BY fecha_vencimiento ASC, v.sale_date ASC, v.id ASC
    `,
    [companyId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    date: row.fecha,
    receiptNumber: row.nro_comprobante,
    customerName: row.nombre_cliente,
    customerTaxId: row.cuit_cliente,
    outstandingAmount: Number(row.saldo),
    dueDate: row.fecha_vencimiento,
    overdue: row.vencida,
    desiredDocument: row.comprobante_deseado,
    collectionStatus: row.estado_cobro,
    registeredAmount: Number(row.cobro_monto_registrado),
  }));
}
```

Nota: en el template literal el `\\D` queda como `\D` en SQL (igual que en `listPendingCollections`).

- [ ] **Step 4: Run test to verify it passes**

Run (desde `apps/web`): `node --test scripts/static.test.mjs`
Expected: PASS todos (15 tests).

- [ ] **Step 5: Verify types and lint**

Run (desde `apps/web`): `npx tsc --noEmit -p .` (solo errores pre-existentes) y `npx eslint src/lib/collections.ts` (sin salida).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/collections.ts apps/web/scripts/static.test.mjs
git commit -m "feat: add listSalesToCollect query for collections screen"
```

### Task 2: `registerCollectionAction` y limpieza de actions

**Files:**
- Modify: `apps/web/src/app/collections/actions.ts` (reemplazo completo del contenido)
- Test: `apps/web/scripts/static.test.mjs` (ampliar el test de Task 1)

**Interfaces:**
- Consumes: `registerCollection(session, saleId, input)` y `collectionRegistrationFromBody(body)` de `@/lib/collections`; `COLLECTIONS_CREATE_PERMISSION` de `@/lib/route-auth`.
- Produces: `registerCollectionAction(formData: FormData): Promise<void>` — server action que usará la página en Task 3. `approveCollectionAction`/`rejectCollectionAction` dejan de existir.

- [ ] **Step 1: Write the failing test**

En el test `"collections screen lists delivered sales to collect with due dates"` agregar al final:

```js
  const collectionsActions = read("apps/web/src/app/collections/actions.ts");
  assert.match(collectionsActions, /registerCollectionAction/);
  assert.match(collectionsActions, /COLLECTIONS_CREATE_PERMISSION/);
  assert.doesNotMatch(collectionsActions, /approveCollectionAction|rejectCollectionAction/);

  const approvalsPage = read("apps/web/src/app/admin/approvals/page.tsx");
  assert.match(approvalsPage, /approveApprovalAction/);
```

- [ ] **Step 2: Run test to verify it fails**

Run (desde `apps/web`): `node --test scripts/static.test.mjs`
Expected: FAIL solo ese test (la action no existe todavía).

- [ ] **Step 3: Write minimal implementation**

Reemplazar el contenido completo de `apps/web/src/app/collections/actions.ts` por:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { collectionRegistrationFromBody, registerCollection } from "@/lib/collections";
import { uuidParam } from "@/lib/request-body";
import { COLLECTIONS_CREATE_PERMISSION, requireApiSession } from "@/lib/route-auth";

export async function registerCollectionAction(formData: FormData) {
  const session = await requireApiSession([COLLECTIONS_CREATE_PERMISSION]);
  const id = uuidParam(String(formData.get("id") ?? ""), "Venta");
  await registerCollection(
    session,
    id,
    collectionRegistrationFromBody(Object.fromEntries(formData.entries())),
  );
  revalidatePath("/collections");
  revalidatePath("/admin/approvals");
  revalidatePath("/orders");
  revalidatePath("/treasury/current-accounts");
  revalidatePath("/metrics");
}
```

(Ojo: esto elimina `approveCollectionAction`/`rejectCollectionAction`; la página vieja que las usa se reescribe en Task 3, así que el type-check del proyecto va a fallar entre Task 2 Step 3 y Task 3 Step 3. Por eso Task 2 y Task 3 se commitean juntas al final de Task 3 — NO commitear al final de Task 2.)

- [ ] **Step 4: Run static tests**

Run (desde `apps/web`): `node --test scripts/static.test.mjs`
Expected: PASS todos (los tests estáticos no compilan TS, así que pasan aunque la página vieja siga importando las actions borradas).

### Task 3: Reescritura de la página `/collections`

**Files:**
- Modify: `apps/web/src/app/collections/page.tsx` (reemplazo completo)
- Test: `apps/web/scripts/static.test.mjs` (ampliar el mismo test)

**Interfaces:**
- Consumes: `listSalesToCollect(companyId)` (Task 1), `registerCollectionAction` (Task 2), `desiredDocumentLabel(value: string)` de `@/lib/receipt-types`, `sessionAllows(session, [COLLECTIONS_CREATE_PERMISSION])` y `sessionCanReadCollections(session)` de `@/lib/route-auth`, `localDateIso()` de `@/lib/timezone`.
- Produces: página final; nada nuevo para tareas posteriores.

- [ ] **Step 1: Write the failing test**

En el mismo test estático agregar al final:

```js
  const collectionsPage = read("apps/web/src/app/collections/page.tsx");
  assert.match(collectionsPage, /listSalesToCollect/);
  assert.match(collectionsPage, /registerCollectionAction/);
  assert.match(collectionsPage, /Registrar cobro/);
  assert.match(collectionsPage, /desiredDocumentLabel/);
  assert.match(collectionsPage, /Vencimiento/);
  assert.match(collectionsPage, /En aprobacion/);
  assert.doesNotMatch(collectionsPage, /listPendingCollections|approveCollectionAction|rejectCollectionAction/);
```

- [ ] **Step 2: Run test to verify it fails**

Run (desde `apps/web`): `node --test scripts/static.test.mjs`
Expected: FAIL solo ese test.

- [ ] **Step 3: Write the page**

Reemplazar el contenido completo de `apps/web/src/app/collections/page.tsx` por:

```tsx
import { ModulePage } from "@/components/module-page";
import {
  Button,
  Card,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  StatCard,
  StatusBadge,
  Toolbar,
} from "@/components/ui";
import { listSalesToCollect } from "@/lib/collections";
import { formatCurrency, formatDate } from "@/lib/format";
import { desiredDocumentLabel } from "@/lib/receipt-types";
import { localDateIso } from "@/lib/timezone";
import { requireStaffSession } from "@/lib/auth";
import {
  COLLECTIONS_CREATE_PERMISSION,
  sessionAllows,
  sessionCanReadCollections,
} from "@/lib/route-auth";
import { redirect } from "next/navigation";
import { registerCollectionAction } from "@/app/collections/actions";

type CollectionsPageProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

type SaleToCollect = Awaited<ReturnType<typeof listSalesToCollect>>[number];

function matchesQuery(item: SaleToCollect, query: string) {
  if (!query) return true;
  const haystack = [item.customerName, item.customerTaxId, String(item.receiptNumber)]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function awaitingApproval(item: SaleToCollect) {
  return item.collectionStatus === "pendiente_aprobacion" || item.collectionStatus === "en_proceso";
}

export default async function CollectionsPage({ searchParams }: CollectionsPageProps) {
  const session = await requireStaffSession();
  if (!(await sessionCanReadCollections(session))) redirect("/");

  const params = await searchParams;
  const query = params.q?.trim().toLowerCase() ?? "";
  const [allSales, canRegister] = await Promise.all([
    listSalesToCollect(session.companyId),
    sessionAllows(session, [COLLECTIONS_CREATE_PERMISSION]),
  ]);
  const sales = allSales.filter((item) => matchesQuery(item, query));
  const totalOutstanding = sales.reduce((sum, item) => sum + item.outstandingAmount, 0);
  const overdueCount = sales.filter((item) => item.overdue).length;
  const today = localDateIso();

  return (
    <ModulePage
      active="collections"
      description="Ventas entregadas con saldo pendiente de cobro."
      session={session}
      title="Cobros"
    >
      <div className="grid gap-5">
        <PageHeader
          description="Registra el cobro de cada venta entregada. La aprobacion se resuelve en Solicitudes y aprobaciones."
          title="Ventas a cobrar"
        />

        <Toolbar ariaLabel="Busqueda de ventas a cobrar">
          <form
            action="/collections"
            className="grid w-full gap-3 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-end"
          >
            <Field htmlFor="collections-query" label="Buscar">
              <Input
                defaultValue={params.q ?? ""}
                id="collections-query"
                name="q"
                placeholder="Cliente, CUIT o nro de comprobante"
                type="search"
              />
            </Field>
            <Button type="submit">Buscar</Button>
          </form>
        </Toolbar>

        <div className="grid gap-3 md:grid-cols-2">
          <StatCard
            className="p-3"
            detail="Calculado sobre las ventas visibles"
            label="Saldo total a cobrar"
            value={formatCurrency(totalOutstanding)}
          />
          <StatCard
            className="p-3"
            detail={`${sales.length} ventas visibles con la busqueda actual`}
            label="Ventas vencidas"
            value={overdueCount}
          />
        </div>

        <Card className="overflow-hidden">
          <DataTable
            caption="Ventas entregadas con saldo pendiente"
            className="rounded-none border-0 shadow-none"
            minWidth="0"
            tableLabel="Ventas a cobrar"
            tableProps={{ className: "table-fixed" }}
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead className="w-[9%] px-2">Fecha</DataTableHead>
                <DataTableHead className="w-[11%] px-2">Comprobante</DataTableHead>
                <DataTableHead className="w-[20%] px-2">Nombre</DataTableHead>
                <DataTableHead className="w-[12%] px-2">CUIT</DataTableHead>
                <DataTableHead align="right" className="w-[12%] px-2">Monto a cobrar</DataTableHead>
                <DataTableHead className="w-[12%] px-2">Vencimiento</DataTableHead>
                <DataTableHead className="w-[10%] px-2">Documento</DataTableHead>
                <DataTableHead className="w-[14%] px-2">Accion</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {sales.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={8}>
                    <EmptyState
                      description="No hay ventas entregadas con saldo pendiente para la busqueda actual."
                      title="Sin ventas a cobrar"
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                sales.map((item) => {
                  const amountInputId = `sale-${item.id}-amount`;
                  const dateInputId = `sale-${item.id}-date`;
                  const methodSelectId = `sale-${item.id}-method`;
                  const destinationInputId = `sale-${item.id}-destination`;
                  const operationInputId = `sale-${item.id}-operation`;
                  const notesInputId = `sale-${item.id}-notes`;

                  return (
                    <DataTableRow key={item.id}>
                      <DataTableCell className="whitespace-nowrap px-2 py-2 text-xs">
                        {formatDate(item.date)}
                      </DataTableCell>
                      <DataTableCell className="px-2 py-2">
                        <span className="font-mono text-xs font-black">
                          #{String(item.receiptNumber).padStart(4, "0")}
                        </span>
                      </DataTableCell>
                      <DataTableCell className="truncate px-2 py-2 font-medium">
                        {item.customerName || "Sin cliente"}
                      </DataTableCell>
                      <DataTableCell className="truncate px-2 py-2 font-mono text-xs">
                        {item.customerTaxId || "-"}
                      </DataTableCell>
                      <DataTableCell align="right" className="whitespace-nowrap px-2 py-2 font-mono text-xs">
                        {formatCurrency(item.outstandingAmount)}
                      </DataTableCell>
                      <DataTableCell className="px-2 py-2">
                        <div className={`whitespace-nowrap text-xs ${item.overdue ? "font-black text-[color:var(--danger)]" : ""}`}>
                          {formatDate(item.dueDate)}
                        </div>
                        {item.overdue ? (
                          <StatusBadge className="mt-1" tone="danger">
                            Vencida
                          </StatusBadge>
                        ) : null}
                      </DataTableCell>
                      <DataTableCell className="truncate px-2 py-2 text-xs">
                        {desiredDocumentLabel(item.desiredDocument)}
                      </DataTableCell>
                      <DataTableCell className="px-2 py-2">
                        {awaitingApproval(item) ? (
                          <div>
                            <StatusBadge tone="warning">En aprobacion</StatusBadge>
                            <div className="mt-1 text-[11px] text-[color:var(--muted)]">
                              {formatCurrency(item.registeredAmount)} registrado
                            </div>
                          </div>
                        ) : canRegister ? (
                          <details className="rounded-md border border-[color:var(--border)] bg-white px-2 py-1.5">
                            <summary className="cursor-pointer select-none text-xs font-black text-[color:var(--accent-strong)]">
                              Registrar cobro
                            </summary>
                            <form action={registerCollectionAction} className="mt-2 grid gap-2">
                              <input name="id" type="hidden" value={item.id} />
                              <Field htmlFor={amountInputId} label="Monto">
                                <Input
                                  className="min-h-9 px-2 text-xs"
                                  defaultValue={item.outstandingAmount.toFixed(2)}
                                  id={amountInputId}
                                  max={item.outstandingAmount.toFixed(2)}
                                  min="0.01"
                                  name="amount"
                                  required
                                  step="0.01"
                                  type="number"
                                />
                              </Field>
                              <Field htmlFor={dateInputId} label="Fecha">
                                <Input
                                  className="min-h-9 px-2 text-xs"
                                  defaultValue={today}
                                  id={dateInputId}
                                  name="date"
                                  required
                                  type="date"
                                />
                              </Field>
                              <Field htmlFor={methodSelectId} label="Metodo">
                                <Select
                                  className="min-h-9 px-2 text-xs"
                                  defaultValue="efectivo"
                                  id={methodSelectId}
                                  name="method"
                                >
                                  <option value="efectivo">Efectivo</option>
                                  <option value="transferencia">Transferencia</option>
                                  <option value="echeck">E-check</option>
                                </Select>
                              </Field>
                              <Field htmlFor={destinationInputId} label="Destino">
                                <Input
                                  className="min-h-9 px-2 text-xs"
                                  defaultValue="Caja"
                                  id={destinationInputId}
                                  name="destination"
                                  placeholder="Cuenta o caja"
                                  required
                                />
                              </Field>
                              <Field htmlFor={operationInputId} label="Operacion">
                                <Input
                                  className="min-h-9 px-2 text-xs"
                                  id={operationInputId}
                                  name="operation"
                                  placeholder="Nro. o referencia"
                                />
                              </Field>
                              <Field htmlFor={notesInputId} label="Notas">
                                <Input
                                  className="min-h-9 px-2 text-xs"
                                  id={notesInputId}
                                  name="notes"
                                  placeholder="Opcional"
                                />
                              </Field>
                              <Button className="min-h-9 px-3 text-xs" size="sm" type="submit">
                                Registrar
                              </Button>
                            </form>
                          </details>
                        ) : (
                          <span className="text-xs text-[color:var(--muted)]">Sin permiso</span>
                        )}
                      </DataTableCell>
                    </DataTableRow>
                  );
                })
              )}
            </DataTableBody>
          </DataTable>
        </Card>
      </div>
    </ModulePage>
  );
}
```

- [ ] **Step 4: Run full static suite**

Run (desde `apps/web`): `node --test scripts/static.test.mjs`
Expected: PASS todos (15 tests).

- [ ] **Step 5: Type-check and lint**

Run (desde `apps/web`):
- `npx tsc --noEmit -p .` — solo los 3 errores pre-existentes (`pricing/offers/actions.ts`, `rentabilidad/actions.ts`).
- `npx eslint src/app/collections/page.tsx src/app/collections/actions.ts src/lib/collections.ts` — sin salida.

- [ ] **Step 6: Commit (Tasks 2 y 3 juntas)**

```bash
git add apps/web/src/app/collections/page.tsx apps/web/src/app/collections/actions.ts apps/web/scripts/static.test.mjs
git commit -m "feat: collections screen lists sales to collect with inline registration"
```
