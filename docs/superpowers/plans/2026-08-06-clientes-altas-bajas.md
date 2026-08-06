# Clientes: altas y bajas por período — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar en `/balance` las altas y bajas de clientes del período elegido (nuevos vs perdidos, con neto).

**Architecture:** Se extrae la matemática de ritmo de compra (`customerMetrics`/`median`) de `messages.ts` a un módulo puro `customer-rhythm.ts` y se le agrega `classifyChurn`. Un `getCustomerChurn(companyId, bounds)` reusa la consulta del follow-up y clasifica cada cliente. La página `/balance` (ya period-aware) renderiza una sección con tarjetas y dos listas.

**Tech Stack:** Next.js (versión custom — ver `node_modules/next/dist/docs/`), TypeScript, PostgreSQL (`pg`), `node:test`.

## Global Constraints

- Helpers testeables SIN imports `@/…` ni DB (patrón `price-list-export.ts`).
- No cambiar `getCustomerFollowUp` (solo reusar su matemática, comportamiento idéntico).
- Regla del repo (`scripts/static.test.mjs`): prohibido `<table>/<thead>/<tbody>` crudo en `apps/web/src/app/**` → usar `DataTable`/`DataTableHead`/`DataTableCell` de `@/components/ui`.
- Fecha de baja = `última compra + 2 × customerMetrics(timestamps).average` (días). Alta = primera compra dentro del período. Timestamps con ancla `-03:00` (igual que `dayStart`).

---

### Task 1: `customer-rhythm.ts` puro (extraer + classifyChurn) + refactor de messages.ts

**Files:**
- Create: `apps/web/src/lib/customer-rhythm.ts`
- Test: `apps/web/scripts/customer-rhythm.test.mjs`
- Modify: `apps/web/src/lib/messages.ts` (importar desde el nuevo módulo, borrar copias locales)
- Modify: `apps/web/package.json` (agregar el test)

**Interfaces:**
- Produces:
  - `median(values: number[]): number`
  - `customerMetrics(timestamps: number[]): { average: number; deviation: number; intervals: number }`
  - `classifyChurn(timestamps: number[], periodStartMs: number, periodNextMs: number): { alta: boolean; baja: boolean; firstMs: number | null; lostMs: number | null }`

- [ ] **Step 1: Escribir el test que falla**

Crear `apps/web/scripts/customer-rhythm.test.mjs`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { customerMetrics, classifyChurn } from "../src/lib/customer-rhythm.ts";

const D = (iso) => Date.parse(`${iso}T00:00:00-03:00`);

test("customerMetrics: gaps regulares y caso sin gaps", () => {
  // 3 compras separadas 30 días -> promedio 30
  const ts = [D("2025-11-26"), D("2025-12-26"), D("2026-01-25")];
  assert.equal(customerMetrics(ts).average, 30);
  assert.equal(customerMetrics(ts).intervals, 2);
  // 1 compra -> sin gaps
  assert.deepEqual(customerMetrics([D("2026-01-01")]), { average: 1, deviation: 0, intervals: 0 });
});

test("classifyChurn: alta = primera compra dentro del período", () => {
  const start = D("2026-03-01");
  const next = D("2026-04-01");
  assert.equal(classifyChurn([D("2026-03-10")], start, next).alta, true);
  assert.equal(classifyChurn([D("2026-02-10")], start, next).alta, false);
});

test("classifyChurn: baja = última + 2×promedio cae en el período; requiere >=2 compras", () => {
  const start = D("2026-03-01");
  const next = D("2026-04-01");
  // promedio 30, última 2026-01-25 -> baja = +60d = 2026-03-26 (dentro)
  const ts = [D("2025-11-26"), D("2025-12-26"), D("2026-01-25")];
  const r = classifyChurn(ts, start, next);
  assert.equal(r.baja, true);
  assert.equal(r.alta, false);
  // 1 sola compra -> nunca baja
  assert.equal(classifyChurn([D("2026-01-01")], start, next).baja, false);
  // recompra que mueve la última fuera del umbral del período -> no baja
  const reactivado = [...ts, D("2026-05-01")];
  assert.equal(classifyChurn(reactivado, start, next).baja, false);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd apps/web && node --test scripts/customer-rhythm.test.mjs`
Expected: FAIL (no existe `customer-rhythm.ts`).

- [ ] **Step 3: Crear `customer-rhythm.ts`**

```ts
// Matemática pura del ritmo de compra por cliente. SIN imports "@/" ni DB.
// median y customerMetrics están movidos textualmente desde messages.ts.

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function customerMetrics(timestamps: number[]): { average: number; deviation: number; intervals: number } {
  const gaps: number[] = [];
  for (let index = 1; index < timestamps.length; index++) {
    gaps.push(Math.round((timestamps[index] - timestamps[index - 1]) / 86_400_000));
  }
  if (!gaps.length) return { average: 1, deviation: 0, intervals: 0 };

  const med = Math.max(1, median(gaps));
  const processed = gaps.map((gap) =>
    gaps.length >= 3 ? Math.max(med * 0.3, Math.min(med * 3, gap)) : gap,
  );
  let numerator = 0;
  let denominator = 0;
  for (const [index, gap] of processed.entries()) {
    const weight = index + 1;
    numerator += weight * gap;
    denominator += weight;
  }
  const average = Math.max(1, Math.round(numerator / denominator));
  const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  const variance = gaps.reduce((sum, gap) => sum + (gap - mean) ** 2, 0) / gaps.length;
  return { average, deviation: Math.round(Math.sqrt(variance)), intervals: gaps.length };
}

// Alta = primera compra dentro de [start, next). Baja = con >=2 compras, la fecha
// (última + 2×average días) cae en [start, next). Devuelve las fechas en ms.
export function classifyChurn(
  timestamps: number[],
  periodStartMs: number,
  periodNextMs: number,
): { alta: boolean; baja: boolean; firstMs: number | null; lostMs: number | null } {
  const sorted = [...new Set(timestamps)].sort((a, b) => a - b);
  const purchases = sorted.length;
  if (purchases === 0) return { alta: false, baja: false, firstMs: null, lostMs: null };

  const firstMs = sorted[0];
  const lastMs = sorted[purchases - 1];
  const alta = firstMs >= periodStartMs && firstMs < periodNextMs;

  let baja = false;
  let lostMs: number | null = null;
  if (purchases >= 2) {
    const { average } = customerMetrics(sorted);
    lostMs = lastMs + 2 * average * 86_400_000;
    baja = lostMs >= periodStartMs && lostMs < periodNextMs;
  }
  return { alta, baja, firstMs, lostMs };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd apps/web && node --test scripts/customer-rhythm.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Refactor `messages.ts` para reusar el módulo**

En `apps/web/src/lib/messages.ts`:
1. Agregar import (junto a los otros imports, respetando el orden alfabético del bloque `@/lib/*`):
```ts
import { customerMetrics, median } from "@/lib/customer-rhythm";
```
2. Borrar las definiciones locales `function median(...) {...}` (líneas ~600-604) y `function customerMetrics(...) {...}` (líneas ~606-628). Dejar `dayStart` como está (usa `localDateIso`, no se mueve).

- [ ] **Step 6: Agregar el test al script `test` y verificar todo**

En `apps/web/package.json`, agregar `scripts/customer-rhythm.test.mjs` al final de la lista del script `test`.

Run: `cd apps/web && npm test && npm run lint && npx tsc --noEmit -p tsconfig.json`
Expected: todo PASA (incluye los tests nuevos; `messages.ts` sigue compilando con el import).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/customer-rhythm.ts apps/web/scripts/customer-rhythm.test.mjs apps/web/src/lib/messages.ts apps/web/package.json
git commit -m "refactor(crm): extraer ritmo de compra a customer-rhythm.ts + classifyChurn"
```

---

### Task 2: `getCustomerChurn` en messages.ts

**Files:**
- Modify: `apps/web/src/lib/messages.ts`

**Interfaces:**
- Consumes (Task 1): `classifyChurn` de `@/lib/customer-rhythm`.
- Produces:
  - `type ChurnEntry = { customerId: string; customerName: string; seller: string; date: string }`
  - `getCustomerChurn(companyId: number, bounds: { currentStart: string; nextStart: string }): Promise<{ altas: ChurnEntry[]; bajas: ChurnEntry[]; counts: { altas: number; bajas: number; net: number } }>`

- [ ] **Step 1: Agregar import de classifyChurn**

En `apps/web/src/lib/messages.ts`, extender el import de Task 1:
```ts
import { classifyChurn, customerMetrics, median } from "@/lib/customer-rhythm";
```
(Si `median`/`customerMetrics` no se usan ya directamente en messages.ts tras el refactor, dejar solo los que se usen — al menos `customerMetrics` lo sigue usando `getCustomerFollowUp`.)

- [ ] **Step 2: Agregar `getCustomerChurn` (después de `getCustomerFollowUp`)**

```ts
export type ChurnEntry = { customerId: string; customerName: string; seller: string; date: string };

export async function getCustomerChurn(
  companyId: number,
  bounds: { currentStart: string; nextStart: string },
): Promise<{ altas: ChurnEntry[]; bajas: ChurnEntry[]; counts: { altas: number; bajas: number; net: number } }> {
  const result = await queryWithCompanyContext<{
    id: string;
    nombre_cliente: string;
    vendedor: string;
    fecha: string | null;
  }>(
    companyId,
    `
      SELECT c.id::text AS id, c.display_name AS nombre_cliente,
             COALESCE(c.seller_name,'') AS vendedor, d.fecha::text
      FROM clients c
      LEFT JOIN (
        SELECT DISTINCT empresa_id, client_id, sale_date AS fecha
        FROM sales
        WHERE empresa_id = $1
          AND ${normalizedOrderStatusSql("sales")} = 'entregado'
      ) d ON d.empresa_id = c.empresa_id AND d.client_id = c.id
      WHERE c.empresa_id = $1
    `,
    [companyId],
  );

  const customers = new Map<string, { name: string; seller: string; timestamps: number[] }>();
  for (const row of result.rows) {
    const current = customers.get(row.id) ?? { name: row.nombre_cliente, seller: row.vendedor, timestamps: [] };
    if (row.fecha) current.timestamps.push(dayStart(new Date(row.fecha)));
    customers.set(row.id, current);
  }

  const startMs = Date.parse(`${bounds.currentStart}T00:00:00-03:00`);
  const nextMs = Date.parse(`${bounds.nextStart}T00:00:00-03:00`);
  const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

  const altas: ChurnEntry[] = [];
  const bajas: ChurnEntry[] = [];
  for (const [id, customer] of customers) {
    const { alta, baja, firstMs, lostMs } = classifyChurn(customer.timestamps, startMs, nextMs);
    if (alta && firstMs != null) {
      altas.push({ customerId: id, customerName: customer.name, seller: customer.seller, date: toIso(firstMs) });
    }
    if (baja && lostMs != null) {
      bajas.push({ customerId: id, customerName: customer.name, seller: customer.seller, date: toIso(lostMs) });
    }
  }
  altas.sort((a, b) => a.date.localeCompare(b.date));
  bajas.sort((a, b) => a.date.localeCompare(b.date));

  return { altas, bajas, counts: { altas: altas.length, bajas: bajas.length, net: altas.length - bajas.length } };
}
```

- [ ] **Step 3: Lint + typecheck**

Run: `cd apps/web && npm run lint && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 4: Verificar contra prod (opcional pero recomendado)**

Script temporal en scratchpad que importa `normalizedOrderStatusSql` (`@/`-free) y corre la consulta para un mes conocido, luego aplica `classifyChurn` (importable, puro) y muestra conteos de altas/bajas. Confirmar que dan números plausibles.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/messages.ts
git commit -m "feat(balance): getCustomerChurn (altas/bajas por período)"
```

---

### Task 3: Sección "Clientes: altas y bajas" en /balance

**Files:**
- Create: `apps/web/src/app/balance/churn-clientes.tsx` (server)
- Modify: `apps/web/src/app/balance/page.tsx`

**Interfaces:**
- Consumes (Task 2): `getCustomerChurn(companyId, bounds)`; `periodBounds` de `@/lib/period-range`.

- [ ] **Step 1: Crear el componente**

Crear `apps/web/src/app/balance/churn-clientes.tsx`:

```tsx
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/ui";

type ChurnEntry = { customerId: string; customerName: string; seller: string; date: string };
type Props = {
  churn: { altas: ChurnEntry[]; bajas: ChurnEntry[]; counts: { altas: number; bajas: number; net: number } };
};

function Lista({ title, tone, entries }: { title: string; tone: string; entries: ChurnEntry[] }) {
  return (
    <DataTable
      caption={title}
      className="rounded-none border-0 shadow-none"
      minWidth="100%"
      tableLabel={title}
    >
      <DataTableHeader>
        <DataTableRow>
          <DataTableHead>
            <span style={{ color: tone }}>{title}</span>
          </DataTableHead>
          <DataTableHead align="right">Fecha</DataTableHead>
        </DataTableRow>
      </DataTableHeader>
      <DataTableBody>
        {entries.length === 0 ? (
          <DataTableRow>
            <DataTableCell>Sin movimientos en el período.</DataTableCell>
            <DataTableCell align="right">—</DataTableCell>
          </DataTableRow>
        ) : (
          entries.map((entry) => (
            <DataTableRow key={entry.customerId}>
              <DataTableCell>
                <div className="font-semibold text-[color:var(--foreground)]">{entry.customerName || "Sin nombre"}</div>
                {entry.seller ? <div className="erp-text-caption text-[color:var(--muted)]">{entry.seller}</div> : null}
              </DataTableCell>
              <DataTableCell align="right" className="tabular-nums">{entry.date}</DataTableCell>
            </DataTableRow>
          ))
        )}
      </DataTableBody>
    </DataTable>
  );
}

export function ChurnClientes({ churn }: Props) {
  const cards = [
    { label: "Altas", value: churn.counts.altas, tone: "var(--success)" },
    { label: "Bajas", value: churn.counts.bajas, tone: "var(--danger)" },
    { label: "Neto", value: churn.counts.net, tone: churn.counts.net >= 0 ? "var(--success)" : "var(--danger)" },
  ];

  return (
    <section className="overflow-hidden rounded-[14px] border border-[color:var(--border)] bg-[color:var(--panel)]">
      <div className="border-b border-[color:var(--border)] px-4 py-3">
        <h2 className="font-semibold text-[color:var(--foreground)]">Clientes: altas y bajas</h2>
        <p className="erp-text-caption text-[color:var(--muted)]">
          Nuevos (primera compra) y perdidos (cruzaron su ritmo) en el período.
        </p>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-[12px] border border-[color:var(--border)] bg-[color:var(--panel-subtle)] p-4">
            <div className="text-[1.75rem] font-bold leading-none tabular-nums" style={{ color: card.tone }}>
              {card.label === "Neto" && card.value > 0 ? `+${card.value}` : card.value}
            </div>
            <div className="erp-text-body mt-1 font-semibold text-[color:var(--foreground)]">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-0 border-t border-[color:var(--border)] md:grid-cols-2 md:divide-x md:divide-[color:var(--border)]">
        <Lista title="Nuevos" tone="var(--success)" entries={churn.altas} />
        <Lista title="Perdidos" tone="var(--danger)" entries={churn.bajas} />
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Enchufar en la página**

En `apps/web/src/app/balance/page.tsx`:
1. Imports:
```ts
import { getCustomerChurn } from "@/lib/messages";
import { availablePeriods, parsePeriod, periodBounds, periodLabel } from "@/lib/period-range";
import { ChurnClientes } from "./churn-clientes";
```
(Es decir, agregar `periodBounds` al import ya existente de `@/lib/period-range`, y las dos líneas nuevas.)
2. Después de calcular `series` (o junto a los otros fetch), agregar:
```ts
  const churn = await getCustomerChurn(session.companyId, periodBounds(period));
```
3. Al final del `<div className="grid gap-5">`, después de `<Evolucion ... />`, agregar:
```tsx
        <ChurnClientes churn={churn} />
```

- [ ] **Step 3: Lint + build**

Run: `cd apps/web && npm run lint && npm run build`
Expected: compila; `/balance?period=2026-03` muestra la sección con altas/bajas de marzo; `?period=2026` el año.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/balance/churn-clientes.tsx apps/web/src/app/balance/page.tsx
git commit -m "feat(balance): sección Clientes altas y bajas por período"
```

---

## Self-review del plan

- **Cobertura del spec:** definiciones alta/baja → Task 1 (`classifyChurn`); refactor puro → Task 1; datos → Task 2 (`getCustomerChurn`); UI en /balance con selector → Task 3. ✓
- **Placeholders:** ninguno; todo el código está escrito (median/customerMetrics copiados textual del original).
- **Consistencia de tipos:** `classifyChurn(...) → { alta, baja, firstMs, lostMs }` (Task 1) usado por `getCustomerChurn` (Task 2); `ChurnEntry`/`counts` (Task 2) consumidos por `ChurnClientes` (Task 3). `periodBounds` viene de la Pieza A/B ya en `main`. ✓

## Verificación final (manual, admin/jefe)

Login con permiso `admin.balance`/`reportes` (no automatizable). Abrir `/balance`, cambiar el período y confirmar que las tarjetas Altas/Bajas/Neto y las listas cambian. Gates automáticos: `cd apps/web && npm test && npm run lint && npm run build`.
