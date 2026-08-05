# Balance por período + Tendencia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `/balance` permita elegir el período (mes puntual o año acumulado) y muestre una tendencia mensual real (facturación, ganancia bruta, margen %).

**Architecture:** Un helper puro de períodos (`period-range.ts`) genera los límites `{previousStart, currentStart, nextStart}` que el SQL de `getAdminMetrics` ya consume; se generaliza el motor para aceptar un período, se cachea por período, y se agrega una consulta de serie mensual. La UI de `/balance` lee el período de `searchParams` y suma un selector client y una sección de evolución con gráfico SVG inline.

**Tech Stack:** Next.js (versión custom del repo — ver `node_modules/next/dist/docs/` antes de tocar APIs de Next), TypeScript, React Server Components, PostgreSQL (`pg`), `node:test`, SVG inline (sin librería de gráficos).

## Global Constraints

- Helpers testeables SIN imports `@/…` ni DB (se importan como `../src/lib/x.ts` desde `.mjs`). Patrón: `price-list-export.ts`.
- No cambiar el cálculo de costos/márgenes existente; reusarlo textual.
- Fechas de la app en formato `YYYY-MM` (mes) y `YYYY` (año). Zona horaria: el mes actual sale de `currentMonth()` de `@/lib/month-range` (ya testeado); `period-range.ts` solo hace aritmética de calendario sobre strings.
- Auth de `/balance`: `requireStaffSession()` + `requirePagePermission(session, [ADMIN_BALANCE_READ_PERMISSION, REPORTS_READ_PERMISSION])` (ya está).
- Estilo UI: `ModulePage`, `StatCard`, `Card`, tokens `var(--…)`, gráficos SVG como en `/metrics`.

---

### Task 1: Helper puro de períodos + tests

**Files:**
- Create: `apps/web/src/lib/period-range.ts`
- Test: `apps/web/scripts/period-range.test.mjs`
- Modify: `apps/web/package.json` (agregar el test al script `test`)

**Interfaces:**
- Produces:
  - `type Period = { kind: "month"; key: string } | { kind: "year"; key: string }`
  - `type PeriodBounds = { previousStart: string; currentStart: string; nextStart: string }`
  - `parsePeriod(raw: string | null | undefined, fallbackMonthKey: string): Period`
  - `periodBounds(period: Period): PeriodBounds`
  - `periodLabel(period: Period): string`
  - `availablePeriods(earliestMonthKey: string, currentMonthKey: string): Period[]`

- [ ] **Step 1: Escribir el test que falla**

Crear `apps/web/scripts/period-range.test.mjs`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePeriod, periodBounds, periodLabel, availablePeriods } from "../src/lib/period-range.ts";

test("parsePeriod distingue mes, año y fallback", () => {
  assert.deepEqual(parsePeriod("2026-03", "2026-08"), { kind: "month", key: "2026-03" });
  assert.deepEqual(parsePeriod("2026", "2026-08"), { kind: "year", key: "2026" });
  assert.deepEqual(parsePeriod("", "2026-08"), { kind: "month", key: "2026-08" });
  assert.deepEqual(parsePeriod("basura", "2026-08"), { kind: "month", key: "2026-08" });
});

test("periodBounds de un mes", () => {
  assert.deepEqual(periodBounds({ kind: "month", key: "2026-03" }), {
    previousStart: "2026-02-01", currentStart: "2026-03-01", nextStart: "2026-04-01",
  });
  assert.deepEqual(periodBounds({ kind: "month", key: "2026-01" }), {
    previousStart: "2025-12-01", currentStart: "2026-01-01", nextStart: "2026-02-01",
  });
  assert.deepEqual(periodBounds({ kind: "month", key: "2026-12" }), {
    previousStart: "2026-11-01", currentStart: "2026-12-01", nextStart: "2027-01-01",
  });
});

test("periodBounds de un año", () => {
  assert.deepEqual(periodBounds({ kind: "year", key: "2026" }), {
    previousStart: "2025-01-01", currentStart: "2026-01-01", nextStart: "2027-01-01",
  });
});

test("periodLabel", () => {
  assert.equal(periodLabel({ kind: "month", key: "2026-03" }), "Marzo 2026");
  assert.equal(periodLabel({ kind: "year", key: "2026" }), "Año 2026");
});

test("availablePeriods: meses desc + años", () => {
  const list = availablePeriods("2026-01", "2026-03");
  assert.deepEqual(list, [
    { kind: "month", key: "2026-03" },
    { kind: "month", key: "2026-02" },
    { kind: "month", key: "2026-01" },
    { kind: "year", key: "2026" },
  ]);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd apps/web && node --test scripts/period-range.test.mjs`
Expected: FAIL (no existe `../src/lib/period-range.ts`).

- [ ] **Step 3: Implementar el módulo puro**

Crear `apps/web/src/lib/period-range.ts`:

```ts
// Helpers puros de períodos para balances. SIN imports "@/" ni DB, para testear
// con node --test importando el .ts directo. Solo aritmética de calendario.

export type Period = { kind: "month"; key: string } | { kind: "year"; key: string };
export type PeriodBounds = { previousStart: string; currentStart: string; nextStart: string };

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// "YYYY-MM" desplazado delta meses -> "YYYY-MM"
function shiftMonthKey(key: string, delta: number): string {
  const [year, month] = key.split("-").map(Number);
  const zero = year * 12 + (month - 1) + delta;
  const y = Math.floor(zero / 12);
  const m = (zero % 12) + 1;
  return `${y}-${pad2(m)}`;
}

export function parsePeriod(raw: string | null | undefined, fallbackMonthKey: string): Period {
  const value = (raw ?? "").trim();
  if (/^\d{4}-\d{2}$/.test(value)) return { kind: "month", key: value };
  if (/^\d{4}$/.test(value)) return { kind: "year", key: value };
  return { kind: "month", key: fallbackMonthKey };
}

export function periodBounds(period: Period): PeriodBounds {
  if (period.kind === "year") {
    const year = Number(period.key);
    return {
      previousStart: `${year - 1}-01-01`,
      currentStart: `${year}-01-01`,
      nextStart: `${year + 1}-01-01`,
    };
  }
  return {
    previousStart: `${shiftMonthKey(period.key, -1)}-01`,
    currentStart: `${period.key}-01`,
    nextStart: `${shiftMonthKey(period.key, 1)}-01`,
  };
}

export function periodLabel(period: Period): string {
  if (period.kind === "year") return `Año ${period.key}`;
  const [year, month] = period.key.split("-").map(Number);
  return `${MESES[month - 1]} ${year}`;
}

export function availablePeriods(earliestMonthKey: string, currentMonthKey: string): Period[] {
  const months: Period[] = [];
  const years = new Set<string>();
  let cursor = currentMonthKey;
  // desc desde el mes actual hasta el más antiguo (guard de 600 iteraciones)
  for (let i = 0; i < 600 && cursor >= earliestMonthKey; i++) {
    months.push({ kind: "month", key: cursor });
    years.add(cursor.slice(0, 4));
    cursor = shiftMonthKey(cursor, -1);
  }
  const yearPeriods: Period[] = [...years]
    .sort((a, b) => Number(b) - Number(a))
    .map((key) => ({ kind: "year", key }));
  return [...months, ...yearPeriods];
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd apps/web && node --test scripts/period-range.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Agregar el test al script `test`**

En `apps/web/package.json`, agregar `scripts/period-range.test.mjs` al final de la lista del script `test`.

Run: `cd apps/web && npm test`
Expected: PASS (incluye los tests nuevos).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/period-range.ts apps/web/scripts/period-range.test.mjs apps/web/package.json
git commit -m "feat(balance): helper puro de períodos (parse/bounds/label/available)"
```

---

### Task 2: Motor de métricas por período + serie mensual

**Files:**
- Modify: `apps/web/src/lib/admin-metrics.ts`
- Test: `apps/web/scripts/metrics-series.test.mjs`
- Create: `apps/web/src/lib/metrics-series.ts` (puro)
- Modify: `apps/web/package.json` (agregar el nuevo test)

**Interfaces:**
- Consumes (Task 1): `Period`, `periodBounds` de `@/lib/period-range`.
- Produces:
  - `getAdminMetrics(companyId: number, period?: Period): Promise<AdminMetrics>` (sin `period` = mes actual, igual que hoy)
  - `getEarliestSalesMonth(companyId: number): Promise<string>` (`"YYYY-MM"`, fallback al mes actual si no hay ventas)
  - `type MonthlyPoint = { monthKey: string; facturacion: number; gananciaBruta: number; margenPct: number | null }`
  - `getMonthlySeries(companyId: number, year: string): Promise<MonthlyPoint[]>` (12 meses del año, ceros donde no hay ventas)
  - En `metrics-series.ts` (puro): `marginPercent(bruta: number, facturacion: number): number | null`, `fillYearMonths(year: string, byKey: Map<string, { facturacion: number; gananciaBruta: number }>): MonthlyPoint[]`

- [ ] **Step 1: Test de los helpers puros (falla)**

Crear `apps/web/scripts/metrics-series.test.mjs`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { marginPercent, fillYearMonths } from "../src/lib/metrics-series.ts";

test("marginPercent", () => {
  assert.equal(marginPercent(40, 100), 40);
  assert.equal(marginPercent(0, 0), null);
  assert.equal(marginPercent(50, 0), null);
});

test("fillYearMonths completa 12 meses con ceros y calcula margen", () => {
  const byKey = new Map([
    ["2026-01", { facturacion: 100, gananciaBruta: 40 }],
    ["2026-03", { facturacion: 0, gananciaBruta: 0 }],
  ]);
  const rows = fillYearMonths("2026", byKey);
  assert.equal(rows.length, 12);
  assert.deepEqual(rows[0], { monthKey: "2026-01", facturacion: 100, gananciaBruta: 40, margenPct: 40 });
  assert.deepEqual(rows[1], { monthKey: "2026-02", facturacion: 0, gananciaBruta: 0, margenPct: null });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd apps/web && node --test scripts/metrics-series.test.mjs`
Expected: FAIL (no existe `metrics-series.ts`).

- [ ] **Step 3: Implementar `metrics-series.ts` (puro)**

Crear `apps/web/src/lib/metrics-series.ts`:

```ts
// Helpers puros para la serie mensual. SIN imports "@/" ni DB.

export type MonthlyPoint = {
  monthKey: string;
  facturacion: number;
  gananciaBruta: number;
  margenPct: number | null;
};

export function marginPercent(bruta: number, facturacion: number): number | null {
  if (!facturacion) return null;
  return (bruta / facturacion) * 100;
}

export function fillYearMonths(
  year: string,
  byKey: Map<string, { facturacion: number; gananciaBruta: number }>,
): MonthlyPoint[] {
  const points: MonthlyPoint[] = [];
  for (let month = 1; month <= 12; month++) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const value = byKey.get(key) ?? { facturacion: 0, gananciaBruta: 0 };
    points.push({
      monthKey: key,
      facturacion: value.facturacion,
      gananciaBruta: value.gananciaBruta,
      margenPct: marginPercent(value.gananciaBruta, value.facturacion),
    });
  }
  return points;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd apps/web && node --test scripts/metrics-series.test.mjs`
Expected: PASS (2 tests). Agregar también este archivo al script `test` de `package.json`.

- [ ] **Step 5: Generalizar `getAdminMetrics` por período**

En `apps/web/src/lib/admin-metrics.ts`:

1. Agregar import: `import { periodBounds, type Period } from "@/lib/period-range";`
2. Cambiar la cache para que sea por período. Reemplazar:

```ts
const adminMetricsCache = new Map<number, { expiresAt: number; value: AdminMetrics }>();

export async function getAdminMetrics(companyId: number): Promise<AdminMetrics> {
  const cached = adminMetricsCache.get(companyId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = await loadAdminMetrics(companyId).catch((error) => {
    if (cached) return cached.value;
    throw error;
  });
  adminMetricsCache.set(companyId, {
    expiresAt: Date.now() + ADMIN_METRICS_CACHE_TTL_MS,
    value,
  });
  return value;
}
```

por:

```ts
const adminMetricsCache = new Map<string, { expiresAt: number; value: AdminMetrics }>();

export async function getAdminMetrics(companyId: number, period?: Period): Promise<AdminMetrics> {
  const bounds = period ? periodBounds(period) : monthBounds();
  const cacheKey = `${companyId}:${period ? period.key : "__current__"}`;
  const cached = adminMetricsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = await loadAdminMetrics(companyId, bounds).catch((error) => {
    if (cached) return cached.value;
    throw error;
  });
  adminMetricsCache.set(cacheKey, {
    expiresAt: Date.now() + ADMIN_METRICS_CACHE_TTL_MS,
    value,
  });
  return value;
}
```

3. Cambiar la firma de `loadAdminMetrics` para recibir los bounds. Reemplazar:

```ts
async function loadAdminMetrics(companyId: number): Promise<AdminMetrics> {
  const bounds = monthBounds();
  const result = await queryWithCompanyContext<{
```

por:

```ts
async function loadAdminMetrics(companyId: number, bounds = monthBounds()): Promise<AdminMetrics> {
  const result = await queryWithCompanyContext<{
```

(El resto de `loadAdminMetrics` no cambia: ya usa `bounds.previousStart/currentStart/nextStart` en el array de params.)

- [ ] **Step 6: Agregar `getEarliestSalesMonth` y `getMonthlySeries`**

Al final de `admin-metrics.ts` (después de `loadAdminMetrics`), usando los mismos SQL de ventas/costo:

```ts
export async function getEarliestSalesMonth(companyId: number): Promise<string> {
  const result = await queryWithCompanyContext<{ month_key: string | null }>(
    companyId,
    `SELECT to_char(MIN(sale_date), 'YYYY-MM') AS month_key
       FROM sales s
      WHERE s.empresa_id = $1 AND ${canonicalSalesSourceSql("s")}`,
    [companyId],
  );
  return result.rows[0]?.month_key ?? currentMonth(new Date());
}

export async function getMonthlySeries(companyId: number, year: string): Promise<import("@/lib/metrics-series").MonthlyPoint[]> {
  const start = `${year}-01-01`;
  const nextYearStart = `${Number(year) + 1}-01-01`;
  const result = await queryWithCompanyContext<{
    month_key: string;
    facturacion: string;
    ganancia_bruta: string;
  }>(
    companyId,
    `
      WITH ventas AS (
        SELECT to_char(s.sale_date, 'YYYY-MM') AS month_key,
               ${netSalesAmountSql("s.total_amount", "s")} AS neto,
               COALESCE(s.source_cost_amount, line_totals.item_cost, 0) AS costo
        FROM sales s
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(dv.quantity * COALESCE(p.cost, 0)), 0) AS item_cost
          FROM sale_items dv
          LEFT JOIN products p ON p.id = dv.product_id AND p.empresa_id = dv.empresa_id
          WHERE dv.sale_id = s.id AND dv.empresa_id = s.empresa_id
        ) line_totals ON true
        WHERE s.empresa_id = $1
          AND ${canonicalSalesSourceSql("s")}
          AND ${normalizedOrderStatusSql("s")} = 'entregado'
          AND s.sale_date >= $2 AND s.sale_date < $3
      )
      SELECT month_key,
             COALESCE(SUM(neto), 0)::text AS facturacion,
             COALESCE(SUM(neto - costo), 0)::text AS ganancia_bruta
      FROM ventas
      GROUP BY month_key
    `,
    [companyId, start, nextYearStart],
  );
  const { fillYearMonths } = await import("@/lib/metrics-series");
  const byKey = new Map(
    result.rows.map((row) => [
      row.month_key,
      { facturacion: Number(row.facturacion), gananciaBruta: Number(row.ganancia_bruta) },
    ]),
  );
  return fillYearMonths(year, byKey);
}
```

(Import estático alternativo: agregar `import { fillYearMonths, type MonthlyPoint } from "@/lib/metrics-series";` arriba y usar los tipos directo en vez del `import(...)` dinámico. Preferir el import estático.)

- [ ] **Step 7: Verificar contra prod que el mes actual no cambió**

Run (script temporal en scratchpad, conecta con `.env.local`, compara `getAdminMetrics(1)` sin período vs. `getAdminMetrics(1, {kind:'month', key: mesActual})` — deben dar iguales; y `getMonthlySeries(1,'2026')` devuelve 12 filas). Alternativamente `npm run build` + revisar en la app.
Expected: mes actual idéntico; serie con 12 meses.

- [ ] **Step 8: Lint + typecheck + commit**

Run: `cd apps/web && npm run lint && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

```bash
git add apps/web/src/lib/admin-metrics.ts apps/web/src/lib/metrics-series.ts apps/web/scripts/metrics-series.test.mjs apps/web/package.json
git commit -m "feat(balance): métricas por período + serie mensual real"
```

---

### Task 3: `/balance` con selector de período (Pieza A end-to-end)

**Files:**
- Modify: `apps/web/src/lib/finance.ts` (`getBalanceDashboard`)
- Modify: `apps/web/src/app/balance/page.tsx`
- Create: `apps/web/src/app/balance/period-picker.tsx` (client)

**Interfaces:**
- Consumes: `getAdminMetrics(companyId, period)`, `getEarliestSalesMonth`, `parsePeriod`, `periodLabel`, `availablePeriods`.

- [ ] **Step 1: `getBalanceDashboard` acepta período**

En `apps/web/src/lib/finance.ts`, reemplazar:

```ts
export async function getBalanceDashboard(companyId: number) {
  const [metrics, payables, cashflow] = await Promise.all([
    getAdminMetrics(companyId),
    getAccountsPayable(companyId),
    getCashflow(companyId),
  ]);

  return {
    metrics,
    payables,
    cashflow,
  };
}
```

por:

```ts
export async function getBalanceDashboard(companyId: number, period?: import("@/lib/period-range").Period) {
  const [metrics, payables, cashflow] = await Promise.all([
    getAdminMetrics(companyId, period),
    getAccountsPayable(companyId),
    getCashflow(companyId),
  ]);

  return {
    metrics,
    payables,
    cashflow,
  };
}
```

(Preferir import estático arriba: `import type { Period } from "@/lib/period-range";` y tipar `period?: Period`.)

- [ ] **Step 2: Crear el selector client**

Crear `apps/web/src/app/balance/period-picker.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import type { Period } from "@/lib/period-range";

type Props = {
  periods: Period[];
  selectedKey: string;
};

export function PeriodPicker({ periods, selectedKey }: Props) {
  const router = useRouter();
  const meses = periods.filter((p) => p.kind === "month");
  const anios = periods.filter((p) => p.kind === "year");
  const go = (key: string) => router.push(`/balance?period=${key}`);
  const label = (p: Period) => (p.kind === "year" ? `Año ${p.key}` : p.key);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Elegir período"
        value={selectedKey}
        onChange={(event) => go(event.target.value)}
        className="rounded-[9px] border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-2 erp-text-body-sm"
      >
        <optgroup label="Meses">
          {meses.map((p) => (
            <option key={p.key} value={p.key}>{label(p)}</option>
          ))}
        </optgroup>
        <optgroup label="Anual">
          {anios.map((p) => (
            <option key={p.key} value={p.key}>{label(p)}</option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}
```

- [ ] **Step 3: Página `/balance` lee el período**

En `apps/web/src/app/balance/page.tsx`:

1. Imports nuevos:
```ts
import { currentMonth } from "@/lib/month-range";
import { getEarliestSalesMonth } from "@/lib/admin-metrics";
import { availablePeriods, parsePeriod, periodLabel } from "@/lib/period-range";
import { PeriodPicker } from "./period-picker";
```
2. Firma con searchParams y resolución del período (la firma exacta de `searchParams` sigue la convención de esta versión de Next — revisar otra página que ya use `searchParams`, p.ej. `orders/page.tsx`, y copiarla):
```ts
export default async function BalancePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [ADMIN_BALANCE_READ_PERMISSION, REPORTS_READ_PERMISSION]);

  const { period: periodParam } = await searchParams;
  const fallbackMonth = currentMonth(new Date());
  const period = parsePeriod(periodParam, fallbackMonth);
  const earliest = await getEarliestSalesMonth(session.companyId);
  const periods = availablePeriods(earliest, fallbackMonth);

  const { metrics, payables, cashflow } = await getBalanceDashboard(session.companyId, period);
```
3. Debajo del `<ModulePage ...>` abrir, agregar el encabezado con el selector:
```tsx
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="erp-text-title-md font-semibold text-[color:var(--foreground)]">Balance · {periodLabel(period)}</h2>
            <p className="erp-text-caption text-[color:var(--muted)]">Por cobrar y por pagar son saldos a la fecha.</p>
          </div>
          <PeriodPicker periods={periods} selectedKey={period.key} />
        </div>
```
(El resto del layout de StatCards/resumen/cashflow queda igual, ya con los números del período.)

- [ ] **Step 4: Lint + build + commit**

Run: `cd apps/web && npm run lint && npm run build`
Expected: compila; `/balance?period=2026-07` renderiza ese mes; `/balance?period=2026` el año.

```bash
git add apps/web/src/lib/finance.ts apps/web/src/app/balance/page.tsx apps/web/src/app/balance/period-picker.tsx
git commit -m "feat(balance): selector de período (mes/año) en /balance"
```

---

### Task 4: Sección "Evolución" con gráfico (Pieza B end-to-end)

**Files:**
- Create: `apps/web/src/app/balance/evolucion.tsx` (server component)
- Modify: `apps/web/src/app/balance/page.tsx` (render de la sección)

**Interfaces:**
- Consumes: `getMonthlySeries(companyId, year)` → `MonthlyPoint[]`; `periodLabel`.

- [ ] **Step 1: Componente de evolución (tabla + SVG)**

Crear `apps/web/src/app/balance/evolucion.tsx`:

```tsx
import { formatCurrency } from "@/lib/format";
import type { MonthlyPoint } from "@/lib/metrics-series";

const MES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function Evolucion({ year, points }: { year: string; points: MonthlyPoint[] }) {
  const maxFact = Math.max(1, ...points.map((p) => p.facturacion));
  const w = 720;
  const h = 180;
  const pad = 24;
  const bandWidth = (w - pad * 2) / points.length;

  return (
    <section className="overflow-hidden rounded-[14px] border border-[color:var(--border)] bg-[color:var(--panel)]">
      <div className="border-b border-[color:var(--border)] px-4 py-3">
        <h2 className="font-semibold text-[color:var(--foreground)]">Evolución {year}</h2>
        <p className="erp-text-caption text-[color:var(--muted)]">Facturación (barras) y margen % (línea), por mes.</p>
      </div>

      <div className="overflow-x-auto p-4">
        <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Facturación y margen mensual ${year}`} className="w-full min-w-[560px]">
          {points.map((p, i) => {
            const barH = (p.facturacion / maxFact) * (h - pad * 2);
            const x = pad + i * bandWidth + bandWidth * 0.2;
            const bw = bandWidth * 0.6;
            const y = h - pad - barH;
            return (
              <g key={p.monthKey}>
                <rect x={x} y={y} width={bw} height={barH} rx={2} fill="var(--accent)" opacity={0.85} />
                <text x={pad + i * bandWidth + bandWidth / 2} y={h - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">
                  {MES_CORTO[i]}
                </text>
              </g>
            );
          })}
          <polyline
            fill="none"
            stroke="var(--success)"
            strokeWidth={2}
            points={points
              .map((p, i) => {
                const mx = pad + i * bandWidth + bandWidth / 2;
                const pct = p.margenPct ?? 0;
                const my = h - pad - (Math.max(0, Math.min(100, pct)) / 100) * (h - pad * 2);
                return `${mx},${my}`;
              })
              .join(" ")}
          />
        </svg>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-t border-[color:var(--border)] text-left erp-text-body-sm">
          <thead>
            <tr className="text-[color:var(--muted)]">
              <th className="px-4 py-2 font-medium">Mes</th>
              <th className="px-4 py-2 text-right font-medium">Facturación</th>
              <th className="px-4 py-2 text-right font-medium">Ganancia bruta</th>
              <th className="px-4 py-2 text-right font-medium">Margen</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={p.monthKey} className="border-t border-[color:var(--border)]">
                <td className="px-4 py-2">{MES_CORTO[i]} {year}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(p.facturacion)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(p.gananciaBruta)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{p.margenPct == null ? "—" : `${p.margenPct.toFixed(1)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Render en la página**

En `apps/web/src/app/balance/page.tsx`:
1. Imports: `import { getMonthlySeries } from "@/lib/admin-metrics";` y `import { Evolucion } from "./evolucion";`
2. Calcular el año del período y traer la serie (después de resolver `period`):
```ts
  const year = period.key.slice(0, 4);
  const series = await getMonthlySeries(session.companyId, year);
```
3. Al final del `<div className="grid gap-5">`, antes de cerrar, agregar:
```tsx
        <Evolucion year={year} points={series} />
```

- [ ] **Step 3: Lint + build + commit**

Run: `cd apps/web && npm run lint && npm run build`
Expected: compila; `/balance` muestra la sección Evolución con barras + línea + tabla de 12 meses.

```bash
git add apps/web/src/app/balance/evolucion.tsx apps/web/src/app/balance/page.tsx
git commit -m "feat(balance): sección Evolución (serie mensual: facturación, ganancia bruta, margen)"
```

---

## Self-review del plan

- **Cobertura del spec:** A (períodos) → Task 1 + 2 + 3; B (serie/gráfico) → Task 2 (datos) + 4 (UI). Nota de resultado operativo respetada (la serie B no lo incluye). ✓
- **Placeholders:** ninguno; todo el código está escrito. Los puntos "revisar `searchParams`/import estático" son instrucciones concretas de patrón, no TODOs de lógica.
- **Consistencia de tipos:** `Period`/`PeriodBounds` (Task 1) usados en Task 2/3; `MonthlyPoint` (Task 2 `metrics-series.ts`) usado en Task 2 `getMonthlySeries` y Task 4 `Evolucion`; `getAdminMetrics(companyId, period?)` firma única. ✓

## Verificación final (manual, sesión admin/jefe)

Requiere login con permiso `admin.balance`/`reportes` (no automatizable acá). El usuario abre `/balance`, cambia el selector a un mes pasado y a "Año 2026", y confirma que los números y la Evolución cambian. Gates automáticos: `cd apps/web && npm test && npm run lint && npm run build`.
