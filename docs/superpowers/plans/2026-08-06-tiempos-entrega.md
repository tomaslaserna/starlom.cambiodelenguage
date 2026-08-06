# Tiempos de entrega por período — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar en `/balance` los tiempos de entrega (cargado→entregado) del período elegido, a partir de los eventos `pedido.entregado` ya registrados.

**Architecture:** Un helper puro (`delivery-times.ts`) resume duraciones y formatea. `getDeliveryTimes(companyId, bounds)` lee `eventos_integracion` (tipo `pedido.entregado`) y joinea a `sales` para el inicio. La página `/balance` (ya period-aware) renderiza una sección con tarjetas y tabla. Sin escrituras nuevas.

**Tech Stack:** Next.js (versión custom — ver `node_modules/next/dist/docs/`), TypeScript, PostgreSQL (`pg`), `node:test`.

## Global Constraints

- Helpers testeables SIN imports `@/…` ni DB (patrón `price-list-export.ts`).
- Sin instrumentación ni escrituras: es reporte sobre eventos existentes.
- Regla del repo (`scripts/static.test.mjs`): prohibido `<table>/<thead>/<tbody>` crudo en `apps/web/src/app/**` → usar `DataTable`/`DataTableHead`/`DataTableCell` de `@/components/ui`.
- Filtro de período por **fecha de entrega**, ancla AR `-03:00`. Lead time = `evento.created_at − sales.created_at`.
- `eventos_integracion`: `id, tipo, datos jsonb, empresa_id, created_at timestamptz`; `datos->>'id'` = id de la venta.

---

### Task 1: Helper puro `delivery-times.ts` + tests

**Files:**
- Create: `apps/web/src/lib/delivery-times.ts`
- Test: `apps/web/scripts/delivery-times.test.mjs`
- Modify: `apps/web/package.json` (agregar el test al script `test`)

**Interfaces:**
- Produces:
  - `summarizeDurations(durationsMs: number[]): { count: number; avgMs: number | null; medianMs: number | null }`
  - `formatDuration(ms: number): string`

- [ ] **Step 1: Escribir el test que falla**

Crear `apps/web/scripts/delivery-times.test.mjs`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeDurations, formatDuration } from "../src/lib/delivery-times.ts";

const H = 3_600_000;

test("summarizeDurations: promedio/mediana y descarte de negativos; lista vacía", () => {
  assert.deepEqual(summarizeDurations([]), { count: 0, avgMs: null, medianMs: null });
  const r = summarizeDurations([1 * H, 3 * H, 5 * H, -1]); // -1 se descarta
  assert.equal(r.count, 3);
  assert.equal(r.avgMs, 3 * H);
  assert.equal(r.medianMs, 3 * H);
});

test("formatDuration: min / h min / d h", () => {
  assert.equal(formatDuration(45 * 60_000), "45 min");
  assert.equal(formatDuration((5 * 60 + 20) * 60_000), "5 h 20 min");
  assert.equal(formatDuration(26 * 60 * 60_000), "1 d 2 h");
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd apps/web && node --test scripts/delivery-times.test.mjs`
Expected: FAIL (no existe `delivery-times.ts`).

- [ ] **Step 3: Crear `delivery-times.ts`**

```ts
// Helpers puros de tiempos de entrega. SIN imports "@/" ni DB. Autocontenido.

export function summarizeDurations(
  durationsMs: number[],
): { count: number; avgMs: number | null; medianMs: number | null } {
  const valid = durationsMs.filter((value) => Number.isFinite(value) && value >= 0);
  if (!valid.length) return { count: 0, avgMs: null, medianMs: null };
  const avgMs = valid.reduce((sum, value) => sum + value, 0) / valid.length;
  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianMs = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return { count: valid.length, avgMs, medianMs };
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days >= 1) return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  if (hours >= 1) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  return `${minutes} min`;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd apps/web && node --test scripts/delivery-times.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Agregar al script `test` y correr todo**

En `apps/web/package.json`, agregar `scripts/delivery-times.test.mjs` al final de la lista del script `test`.

Run: `cd apps/web && npm test`
Expected: PASS (incluye los tests nuevos).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/delivery-times.ts apps/web/scripts/delivery-times.test.mjs apps/web/package.json
git commit -m "feat(balance): helper puro de tiempos de entrega (summarize + formatDuration)"
```

---

### Task 2: `getDeliveryTimes` en orders.ts

**Files:**
- Modify: `apps/web/src/lib/orders.ts`

**Interfaces:**
- Consumes (Task 1): `summarizeDurations` de `@/lib/delivery-times`.
- Produces:
  - `type Delivery = { saleId: string; pedido: string; cliente: string; deliveredAt: string; leadMs: number }`
  - `getDeliveryTimes(companyId: number, bounds: { currentStart: string; nextStart: string }): Promise<{ deliveries: Delivery[]; summary: { count: number; avgMs: number | null; medianMs: number | null } }>`

- [ ] **Step 1: Asegurar imports en orders.ts**

En `apps/web/src/lib/orders.ts`, verificar que estén (y agregar los que falten) en el bloque de imports:
```ts
import { queryWithCompanyContext } from "@/lib/db";
import { summarizeDurations } from "@/lib/delivery-times";
```
(`orders.ts` ya importa de `@/lib/db`; agregar `queryWithCompanyContext` a ese import si no está, y la línea de `delivery-times`.)

- [ ] **Step 2: Agregar `getDeliveryTimes` (al final de orders.ts)**

```ts
export type Delivery = { saleId: string; pedido: string; cliente: string; deliveredAt: string; leadMs: number };

// Tiempos de entrega del período a partir de los eventos pedido.entregado ya
// registrados por updateOrderStatus. Lead time = entrega - creación del pedido.
export async function getDeliveryTimes(
  companyId: number,
  bounds: { currentStart: string; nextStart: string },
): Promise<{ deliveries: Delivery[]; summary: { count: number; avgMs: number | null; medianMs: number | null } }> {
  const result = await queryWithCompanyContext<{
    sale_id: string;
    pedido: string;
    cliente: string;
    started_at: string;
    delivered_at: string;
  }>(
    companyId,
    `
      SELECT (e.datos->>'id') AS sale_id,
             COALESCE(NULLIF(s.sale_number, ''), '') AS pedido,
             COALESCE(NULLIF(s.client_name, ''), c.display_name, c.legal_name, '') AS cliente,
             s.created_at::text AS started_at,
             e.created_at::text AS delivered_at
      FROM eventos_integracion e
      JOIN sales s ON s.id = (e.datos->>'id')::uuid AND s.empresa_id = e.empresa_id
      LEFT JOIN clients c ON c.id = s.client_id AND c.empresa_id = s.empresa_id
      WHERE e.empresa_id = $1
        AND e.tipo = 'pedido.entregado'
        AND e.created_at >= ($2 || 'T00:00:00-03:00')::timestamptz
        AND e.created_at <  ($3 || 'T00:00:00-03:00')::timestamptz
      ORDER BY e.created_at DESC
    `,
    [companyId, bounds.currentStart, bounds.nextStart],
  );

  const deliveries: Delivery[] = [];
  for (const row of result.rows) {
    const leadMs = Date.parse(row.delivered_at) - Date.parse(row.started_at);
    if (!Number.isFinite(leadMs) || leadMs < 0) continue;
    deliveries.push({
      saleId: row.sale_id,
      pedido: row.pedido,
      cliente: row.cliente,
      deliveredAt: row.delivered_at.slice(0, 10),
      leadMs,
    });
  }
  const summary = summarizeDurations(deliveries.map((delivery) => delivery.leadMs));
  return { deliveries, summary };
}
```

- [ ] **Step 3: Lint + typecheck**

Run: `cd apps/web && npm run lint && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 4: Verificar contra prod (recomendado)**

Script temporal en scratchpad: importa `summarizeDurations`/`formatDuration` (`@/`-free) y corre la query de arriba para el año 2026 (`currentStart='2026-01-01'`, `nextStart='2027-01-01'`); imprimir count, promedio y mediana formateados y las primeras filas. Confirmar que da ~8 entregas con tiempos plausibles.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/orders.ts
git commit -m "feat(balance): getDeliveryTimes (tiempos de entrega por período)"
```

---

### Task 3: Sección "Tiempos de entrega" en /balance

**Files:**
- Create: `apps/web/src/app/balance/tiempos-entrega.tsx` (server)
- Modify: `apps/web/src/app/balance/page.tsx`

**Interfaces:**
- Consumes (Task 2): `getDeliveryTimes(companyId, bounds)`; `formatDuration` de `@/lib/delivery-times`; `periodBounds` de `@/lib/period-range`.

- [ ] **Step 1: Crear el componente**

Crear `apps/web/src/app/balance/tiempos-entrega.tsx`:

```tsx
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/ui";
import { formatDuration } from "@/lib/delivery-times";

type Delivery = { saleId: string; pedido: string; cliente: string; deliveredAt: string; leadMs: number };
type Props = {
  data: { deliveries: Delivery[]; summary: { count: number; avgMs: number | null; medianMs: number | null } };
};

export function TiemposEntrega({ data }: Props) {
  const { deliveries, summary } = data;
  const cards = [
    { label: "Entregas", value: String(summary.count) },
    { label: "Promedio", value: summary.avgMs == null ? "—" : formatDuration(summary.avgMs) },
    { label: "Mediana", value: summary.medianMs == null ? "—" : formatDuration(summary.medianMs) },
  ];

  return (
    <section className="overflow-hidden rounded-[14px] border border-[color:var(--border)] bg-[color:var(--panel)]">
      <div className="border-b border-[color:var(--border)] px-4 py-3">
        <h2 className="font-semibold text-[color:var(--foreground)]">Tiempos de entrega</h2>
        <p className="erp-text-caption text-[color:var(--muted)]">
          Desde que se carga el pedido hasta que se marca entregado, en el período.
        </p>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-[12px] border border-[color:var(--border)] bg-[color:var(--panel-subtle)] p-4">
            <div className="text-[1.5rem] font-bold leading-none tabular-nums text-[color:var(--foreground)]">{card.value}</div>
            <div className="erp-text-body mt-1 font-semibold text-[color:var(--foreground)]">{card.label}</div>
          </div>
        ))}
      </div>

      {deliveries.length === 0 ? (
        <p className="erp-text-body-sm border-t border-[color:var(--border)] px-4 py-8 text-center text-[color:var(--muted)]">
          Se llena a medida que marcás pedidos como entregados en la app (cargado → entregado).
        </p>
      ) : (
        <DataTable
          caption="Entregas del período"
          className="rounded-none border-0 border-t border-[color:var(--border)] shadow-none"
          minWidth="100%"
          tableLabel="Entregas del período"
        >
          <DataTableHeader>
            <DataTableRow>
              <DataTableHead>Pedido</DataTableHead>
              <DataTableHead>Cliente</DataTableHead>
              <DataTableHead align="right">Entrega</DataTableHead>
              <DataTableHead align="right">Tiempo</DataTableHead>
            </DataTableRow>
          </DataTableHeader>
          <DataTableBody>
            {deliveries.map((delivery) => (
              <DataTableRow key={delivery.saleId}>
                <DataTableCell className="tabular-nums">{delivery.pedido || "—"}</DataTableCell>
                <DataTableCell>{delivery.cliente || "Sin cliente"}</DataTableCell>
                <DataTableCell align="right" className="tabular-nums">{delivery.deliveredAt}</DataTableCell>
                <DataTableCell align="right" className="tabular-nums">{formatDuration(delivery.leadMs)}</DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Enchufar en la página**

En `apps/web/src/app/balance/page.tsx`:
1. Imports:
```ts
import { getDeliveryTimes } from "@/lib/orders";
import { TiemposEntrega } from "./tiempos-entrega";
```
2. Después de calcular `churn` (junto a los otros fetch):
```ts
  const entregas = await getDeliveryTimes(session.companyId, periodBounds(period));
```
3. Al final del `<div className="grid gap-5">`, después de `<ChurnClientes ... />`:
```tsx
        <TiemposEntrega data={entregas} />
```

- [ ] **Step 3: Lint + build**

Run: `cd apps/web && npm run lint && npm run build`
Expected: compila; `/balance?period=2026` muestra la sección con las entregas del año.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/balance/tiempos-entrega.tsx apps/web/src/app/balance/page.tsx
git commit -m "feat(balance): sección Tiempos de entrega por período"
```

---

## Self-review del plan

- **Cobertura del spec:** helper puro (summarize/format) → Task 1; datos desde eventos_integracion → Task 2; UI en /balance con selector → Task 3. Sin instrumentación (correcto). ✓
- **Placeholders:** ninguno; todo el código está escrito.
- **Consistencia de tipos:** `summarizeDurations(...) → { count, avgMs, medianMs }` (Task 1) usado por `getDeliveryTimes` (Task 2); `Delivery`/`summary` (Task 2) consumidos por `TiemposEntrega` (Task 3); `formatDuration` compartido. `periodBounds` viene de la Pieza A ya en `main`. ✓

## Verificación final (manual, admin/jefe)

Login con permiso `admin.balance`/`reportes` (no automatizable). Abrir `/balance`, elegir "Año 2026", confirmar que aparecen las ~8 entregas con sus tiempos y las tarjetas Promedio/Mediana. Gates automáticos: `cd apps/web && npm test && npm run lint && npm run build`.
