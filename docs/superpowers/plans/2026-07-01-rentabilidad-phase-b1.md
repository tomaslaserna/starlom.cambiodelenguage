# Rentabilidad (Fase B.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Módulo `/rentabilidad` en Administración: ABM de costos operativos + panel de punto de equilibrio (costos fijos vs margen acumulado del mes) + motor `getBreakEvenStatus` reutilizable.

**Architecture:** Helper puro de mes (`month-range.ts`, node-testeable) + `lib/profitability.ts` (consultas sobre `costos_operativos`, `sales`, `sale_items`, `products`) + página server-component con ABM y StatCards + ítem de nav. Sin tabla nueva (usa `costos_operativos`) → sin migración.

**Tech Stack:** Next.js 16 (server components + actions), TypeScript, Postgres (pg). Sin dependencias nuevas.

## Global Constraints

- Período = mes calendario (`YYYY-MM`, default mes actual; `?month=` navegable). Rango `[start, endExclusive)` sobre `fecha`/`sale_date`.
- Costos fijos del mes = `SUM(costos_operativos.monto)` con `fecha` en el mes.
- Margen = `SUM(sale_items.total_amount)` − `SUM(products.cost * sale_items.quantity)` de las `sale_items` cuyas `sales` están `entregado` (usar `normalizedOrderStatusSql("s")`) con `sale_date` en el mes.
- PE alcanzado = margen ≥ costos fijos; faltante = `max(costosFijos − margen, 0)`; rentabilidad = margen − costos fijos.
- `costos_operativos.id` es **bigint** (no uuid): castear `$1::bigint` en el delete.
- Auth: página con `requirePagePermission([ADMIN_METRICS_READ_PERMISSION])`; acciones con `requireAdminApiSession`.
- El helper `month-range.ts` NO importa nada con alias `@/` (para ser node-testeable) y usa sólo sintaxis TS borrable.
- Tras cambios, correr `node --test scripts/static.test.mjs` (12/12) y `scripts/order-confirmation.test.mjs` (7/7); actualizar aserciones de nav si alguna quedara obsoleta.

## File Structure

- **Create** `apps/web/src/lib/month-range.ts` — `currentMonth`, `monthRange` (puro).
- **Create** `apps/web/scripts/month-range.test.mjs` — tests unitarios.
- **Create** `apps/web/src/lib/profitability.ts` — tipos + `listOperatingCosts`, `createOperatingCost`, `deleteOperatingCost`, `operatingCostInputFromBody`, `getBreakEvenStatus`.
- **Create** `apps/web/src/app/rentabilidad/page.tsx` — panel PE + ABM costos.
- **Create** `apps/web/src/app/rentabilidad/actions.ts` — server actions.
- **Modify** `apps/web/src/lib/navigation.ts` — ítem "Rentabilidad" en el grupo "Administrador".

---

### Task 1: Helper puro de mes + tests

**Files:**
- Create: `apps/web/src/lib/month-range.ts`
- Test: `apps/web/scripts/month-range.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces: `currentMonth(now?: Date): string` (`YYYY-MM`); `monthRange(month: string): { month: string; start: string; endExclusive: string }` (fechas `YYYY-MM-DD`; `endExclusive` = primer día del mes siguiente; entrada inválida → mes actual).

- [ ] **Step 1: Escribir el test que falla**

Create `apps/web/scripts/month-range.test.mjs`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { currentMonth, monthRange } from "../src/lib/month-range.ts";

test("monthRange mes normal", () => {
  assert.deepEqual(monthRange("2026-03"), {
    month: "2026-03",
    start: "2026-03-01",
    endExclusive: "2026-04-01",
  });
});

test("monthRange diciembre rota el anio", () => {
  assert.deepEqual(monthRange("2026-12"), {
    month: "2026-12",
    start: "2026-12-01",
    endExclusive: "2027-01-01",
  });
});

test("monthRange invalido usa el mes actual", () => {
  const cur = currentMonth();
  const r = monthRange("nope");
  assert.equal(r.month, cur);
  assert.match(r.start, /^\d{4}-\d{2}-01$/);
});

test("currentMonth formatea YYYY-MM", () => {
  assert.equal(currentMonth(new Date(2026, 0, 15)), "2026-01");
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run (desde `apps/web`): `node --test scripts/month-range.test.mjs`
Expected: FALLA (módulo `../src/lib/month-range.ts` inexistente).

- [ ] **Step 3: Implementar el helper**

Create `apps/web/src/lib/month-range.ts`:

```ts
export function currentMonth(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export type MonthRange = {
  month: string;
  start: string;
  endExclusive: string;
};

export function monthRange(month: string): MonthRange {
  const normalized = /^(\d{4})-(\d{2})$/.test((month ?? "").trim())
    ? (month ?? "").trim()
    : currentMonth();
  const [year, monthNum] = normalized.split("-").map(Number);
  const start = `${String(year).padStart(4, "0")}-${String(monthNum).padStart(2, "0")}-01`;
  const nextYear = monthNum === 12 ? year + 1 : year;
  const nextMonth = monthNum === 12 ? 1 : monthNum + 1;
  const endExclusive = `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`;
  return { month: normalized, start, endExclusive };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run (desde `apps/web`): `node --test scripts/month-range.test.mjs`
Expected: PASS (4 tests). (Warning `MODULE_TYPELESS_PACKAGE_JSON` es esperado.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/month-range.ts apps/web/scripts/month-range.test.mjs
git commit -m "feat(admin): helper puro de rango de mes con tests"
```

---

### Task 2: Módulo Rentabilidad (lib + página + actions + nav)

**Files:**
- Create: `apps/web/src/lib/profitability.ts`
- Create: `apps/web/src/app/rentabilidad/page.tsx`
- Create: `apps/web/src/app/rentabilidad/actions.ts`
- Modify: `apps/web/src/lib/navigation.ts`

**Interfaces:**
- Consumes de Task 1: `currentMonth`, `monthRange` (`@/lib/month-range`). También `queryWithCompanyContext` (`@/lib/db`), `ApiError` (`@/lib/api-response`), `normalizedOrderStatusSql` (`@/lib/order-status`), `requireStaffSession`, `requirePagePermission`, `requireAdminApiSession`, `ADMIN_METRICS_READ_PERMISSION`, `stringFieldsFromFormData`, `formatCurrency`, componentes de `@/components/ui`.
- Produces (lo usará Fase B.2): `getBreakEvenStatus(companyId, month): Promise<BreakEvenStatus>` con `BreakEvenStatus = { month, fixedCosts, accumulatedMargin, revenue, cogs, reached, remaining, profit }`.

- [ ] **Step 1: Crear `lib/profitability.ts`**

Create `apps/web/src/lib/profitability.ts`:

```ts
import { ApiError } from "@/lib/api-response";
import { queryWithCompanyContext } from "@/lib/db";
import { monthRange } from "@/lib/month-range";
import { normalizedOrderStatusSql } from "@/lib/order-status";

export type OperatingCost = {
  id: string;
  concept: string;
  amount: number;
  category: string;
  date: string;
};

export type OperatingCostInput = {
  concept: string;
  amount: number;
  category: string;
  date: string;
};

export type BreakEvenStatus = {
  month: string;
  fixedCosts: number;
  accumulatedMargin: number;
  revenue: number;
  cogs: number;
  reached: boolean;
  remaining: number;
  profit: number;
};

export async function listOperatingCosts(companyId: number, month: string): Promise<OperatingCost[]> {
  const { start, endExclusive } = monthRange(month);
  const result = await queryWithCompanyContext<{
    id: string;
    concepto: string;
    monto: string;
    categoria: string | null;
    fecha: string;
  }>(
    companyId,
    `SELECT id::text AS id, concepto, monto::text AS monto, categoria, fecha::text AS fecha
     FROM costos_operativos
     WHERE empresa_id = $1 AND fecha >= $2::date AND fecha < $3::date
     ORDER BY fecha DESC, id DESC`,
    [companyId, start, endExclusive],
  );
  return result.rows.map((row) => ({
    id: row.id,
    concept: row.concepto,
    amount: Number(row.monto),
    category: row.categoria ?? "",
    date: row.fecha,
  }));
}

export async function createOperatingCost(companyId: number, input: OperatingCostInput): Promise<string> {
  const result = await queryWithCompanyContext<{ id: string }>(
    companyId,
    `INSERT INTO costos_operativos (concepto, monto, categoria, fecha, empresa_id)
     VALUES ($1, $2, $3, $4::date, $5)
     RETURNING id::text AS id`,
    [input.concept, input.amount, input.category, input.date, companyId],
  );
  return result.rows[0].id;
}

export async function deleteOperatingCost(companyId: number, id: string): Promise<void> {
  const result = await queryWithCompanyContext(
    companyId,
    `DELETE FROM costos_operativos WHERE id = $1::bigint AND empresa_id = $2`,
    [id, companyId],
  );
  if (result.rowCount === 0) throw new ApiError(404, "Costo no encontrado");
}

export function operatingCostInputFromBody(body: Record<string, string>): OperatingCostInput {
  const concept = (body.concept ?? "").trim();
  const amount = Number(body.amount);
  const category = (body.category ?? "").trim();
  const date = (body.date ?? "").trim();
  if (!concept) throw new ApiError(400, "El concepto es obligatorio");
  if (!Number.isFinite(amount) || amount <= 0) throw new ApiError(400, "El monto debe ser mayor a 0");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(400, "Fecha invalida");
  return { concept, amount, category, date };
}

export async function getBreakEvenStatus(companyId: number, month: string): Promise<BreakEvenStatus> {
  const { month: normalizedMonth, start, endExclusive } = monthRange(month);

  const costsResult = await queryWithCompanyContext<{ total: string }>(
    companyId,
    `SELECT COALESCE(SUM(monto), 0)::text AS total
     FROM costos_operativos
     WHERE empresa_id = $1 AND fecha >= $2::date AND fecha < $3::date`,
    [companyId, start, endExclusive],
  );
  const fixedCosts = Number(costsResult.rows[0].total);

  const marginResult = await queryWithCompanyContext<{ revenue: string; cogs: string }>(
    companyId,
    `SELECT
       COALESCE(SUM(si.total_amount), 0)::text AS revenue,
       COALESCE(SUM(COALESCE(p.cost, 0) * si.quantity), 0)::text AS cogs
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id AND s.empresa_id = si.empresa_id
     LEFT JOIN products p ON p.id = si.product_id AND p.empresa_id = si.empresa_id
     WHERE si.empresa_id = $1
       AND s.sale_date >= $2::date AND s.sale_date < $3::date
       AND ${normalizedOrderStatusSql("s")} = 'entregado'`,
    [companyId, start, endExclusive],
  );
  const revenue = Number(marginResult.rows[0].revenue);
  const cogs = Number(marginResult.rows[0].cogs);
  const accumulatedMargin = revenue - cogs;

  return {
    month: normalizedMonth,
    fixedCosts,
    accumulatedMargin,
    revenue,
    cogs,
    reached: accumulatedMargin >= fixedCosts,
    remaining: Math.max(fixedCosts - accumulatedMargin, 0),
    profit: accumulatedMargin - fixedCosts,
  };
}
```

- [ ] **Step 2: Crear las server actions**

Create `apps/web/src/app/rentabilidad/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api-response";
import {
  createOperatingCost,
  deleteOperatingCost,
  operatingCostInputFromBody,
} from "@/lib/profitability";
import { requireAdminApiSession } from "@/lib/route-auth";
import { stringFieldsFromFormData } from "@/lib/storage";

function monthRedirect(formData: FormData): string {
  const month = String(formData.get("month") ?? "");
  return /^\d{4}-\d{2}$/.test(month) ? `/rentabilidad?month=${month}` : "/rentabilidad";
}

export async function createOperatingCostAction(formData: FormData) {
  const session = await requireAdminApiSession();
  await createOperatingCost(session.companyId, operatingCostInputFromBody(stringFieldsFromFormData(formData)));
  revalidatePath("/rentabilidad");
  redirect(monthRedirect(formData));
}

export async function deleteOperatingCostAction(formData: FormData) {
  const session = await requireAdminApiSession();
  const id = String(formData.get("id") ?? "");
  if (!/^\d+$/.test(id)) throw new ApiError(400, "Costo invalido");
  await deleteOperatingCost(session.companyId, id);
  revalidatePath("/rentabilidad");
  redirect(monthRedirect(formData));
}
```

- [ ] **Step 3: Crear la página**

Create `apps/web/src/app/rentabilidad/page.tsx`:

```tsx
import { ModulePage } from "@/components/module-page";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
  StatCard,
  StatusBadge,
} from "@/components/ui";
import {
  createOperatingCostAction,
  deleteOperatingCostAction,
} from "@/app/rentabilidad/actions";
import { requireStaffSession } from "@/lib/auth";
import { formatCurrency } from "@/lib/format";
import { currentMonth } from "@/lib/month-range";
import { requirePagePermission } from "@/lib/page-auth";
import { getBreakEvenStatus, listOperatingCosts } from "@/lib/profitability";
import { ADMIN_METRICS_READ_PERMISSION } from "@/lib/route-auth";

type RentabilidadPageProps = {
  searchParams: Promise<{ month?: string }>;
};

export default async function RentabilidadPage({ searchParams }: RentabilidadPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [ADMIN_METRICS_READ_PERMISSION]);
  const { month: monthParam } = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(monthParam ?? "") ? (monthParam as string) : currentMonth();

  const [status, costs] = await Promise.all([
    getBreakEvenStatus(session.companyId, month),
    listOperatingCosts(session.companyId, month),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <ModulePage
      active="admin"
      description="Costos operativos y punto de equilibrio del mes."
      session={session}
      title="Rentabilidad"
    >
      <div className="grid gap-5">
        <PageHeader
          title="Rentabilidad"
          description={`Punto de equilibrio y costos del mes ${month}.`}
          actions={
            <form action="/rentabilidad" className="flex items-end gap-2">
              <Field htmlFor="rent-month" label="Mes">
                <Input defaultValue={month} id="rent-month" name="month" type="month" />
              </Field>
              <Button type="submit">Ver</Button>
            </form>
          }
        />

        <div className="grid gap-3 md:grid-cols-4">
          <StatCard label="Costos fijos del mes" value={formatCurrency(status.fixedCosts)} />
          <StatCard label="Margen acumulado" value={formatCurrency(status.accumulatedMargin)} />
          <StatCard
            label={status.reached ? "Punto de equilibrio" : "Faltante para PE"}
            value={status.reached ? "Alcanzado" : formatCurrency(status.remaining)}
          />
          <StatCard label="Rentabilidad del mes" value={formatCurrency(status.profit)} />
        </div>

        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <StatusBadge tone={status.reached ? "success" : "warning"}>
              {status.reached ? "PE alcanzado — ofertas habilitables" : "PE no alcanzado"}
            </StatusBadge>
            <span className="erp-text-body-sm text-[color:var(--muted)]">
              Ingresos {formatCurrency(status.revenue)} − COGS {formatCurrency(status.cogs)} = Margen{" "}
              {formatCurrency(status.accumulatedMargin)}
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nuevo costo operativo</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createOperatingCostAction} className="grid gap-3 md:grid-cols-4">
              <input name="month" type="hidden" value={month} />
              <Field htmlFor="cost-concept" label="Concepto">
                <Input id="cost-concept" name="concept" placeholder="Alquiler" required />
              </Field>
              <Field htmlFor="cost-amount" label="Monto">
                <Input id="cost-amount" min="0.01" name="amount" step="0.01" type="number" required />
              </Field>
              <Field htmlFor="cost-category" label="Categoria (opcional)">
                <Input id="cost-category" name="category" placeholder="Fijo" />
              </Field>
              <Field htmlFor="cost-date" label="Fecha">
                <Input defaultValue={today} id="cost-date" name="date" type="date" required />
              </Field>
              <div className="md:col-span-4">
                <Button type="submit">Agregar costo</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <DataTable caption="Costos operativos del mes" tableLabel="Costos operativos">
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>Concepto</DataTableHead>
                <DataTableHead>Categoria</DataTableHead>
                <DataTableHead>Fecha</DataTableHead>
                <DataTableHead align="right">Monto</DataTableHead>
                <DataTableHead align="right">Accion</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {costs.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={5}>
                    <EmptyState
                      description="Carga los costos fijos del mes con el formulario de arriba."
                      title="Sin costos cargados"
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                costs.map((cost) => (
                  <DataTableRow key={cost.id}>
                    <DataTableCell className="font-medium">{cost.concept}</DataTableCell>
                    <DataTableCell>{cost.category || "—"}</DataTableCell>
                    <DataTableCell>{cost.date}</DataTableCell>
                    <DataTableCell align="right" className="font-mono">
                      {formatCurrency(cost.amount)}
                    </DataTableCell>
                    <DataTableCell align="right">
                      <form action={deleteOperatingCostAction}>
                        <input name="id" type="hidden" value={cost.id} />
                        <input name="month" type="hidden" value={month} />
                        <Button size="sm" type="submit" variant="secondary">
                          Eliminar
                        </Button>
                      </form>
                    </DataTableCell>
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

- [ ] **Step 4: Agregar el ítem de nav "Rentabilidad"**

En `apps/web/src/lib/navigation.ts`, dentro del grupo `label: "Administrador"`, agregar el ítem justo después del de "Metricas". Reemplazar:

```tsx
      { href: "/metrics", label: "Metricas", active: "metrics", permission: ADMIN_METRICS_READ_PERMISSION },
```

por:

```tsx
      { href: "/metrics", label: "Metricas", active: "metrics", permission: ADMIN_METRICS_READ_PERMISSION },
      { href: "/rentabilidad", label: "Rentabilidad", active: "admin", permission: ADMIN_METRICS_READ_PERMISSION },
```

(`ADMIN_METRICS_READ_PERMISSION` ya está importado en `navigation.ts`.)

- [ ] **Step 5: Lint + tests + compilación**

Desde `apps/web`:
- `npm run lint` → exit 0 (corregir orden de imports si eslint lo pide).
- `node --test scripts/static.test.mjs` → 12/12 (si una aserción de nav quedó obsoleta por el ítem nuevo, actualizarla en `static.test.mjs` en el mismo commit y re-correr). `node --test scripts/order-confirmation.test.mjs` → 7/7. `node --test scripts/month-range.test.mjs` → 4/4.
- Dev server: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/rentabilidad` → 307/200; revisar el log del dev server, sin `⨯` para `rentabilidad`.

(La verificación funcional autenticada — cargar un costo, ver el panel, eliminarlo — la hace el controlador.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/profitability.ts apps/web/src/app/rentabilidad/page.tsx apps/web/src/app/rentabilidad/actions.ts apps/web/src/lib/navigation.ts
git commit -m "feat(admin): modulo Rentabilidad con costos operativos y punto de equilibrio"
```

Nota: si al agregar el ítem de nav se tuvo que tocar `apps/web/scripts/static.test.mjs`, incluirlo en el `git add`.
