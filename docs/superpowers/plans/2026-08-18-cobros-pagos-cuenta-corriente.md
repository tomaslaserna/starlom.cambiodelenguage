# Cobros y Pagos — Cuenta corriente con saldo corrido — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorientar cobros de factura-céntrico a cuenta-céntrico con saldo corrido: submenú Registro de Pagos (diario + alta híbrida) y submenú Cuentas Corrientes (cuentas abiertas con aging + estado de cuenta con saldo histórico y PDF), reusando `current_account_movements` y `payments`.

**Architecture:** Un módulo nuevo `customer-accounts.ts` concentra la lógica: funciones puras (`computeAgingBuckets`, `buildCustomerStatement`) unit-testeadas, y funciones de query/escritura (`listOpenCustomerAccounts`, `getCustomerStatement`, `registerCustomerPayment`, `voidCustomerPayment`). El alta de pago es a nivel cliente (sin `sale_id`), y con el flujo híbrido: admin/jefe → `registrado` (impacta al instante insertando el crédito en `current_account_movements`); vendedor → `pendiente_aprobacion` en `payments`, resuelto desde la bandeja `/admin/approvals` existente (se extiende `approvals.ts`). Las páginas son server components que espejan las existentes (`collections/page.tsx`, `treasury/current-accounts/page.tsx`).

**Tech Stack:** Next.js (App Router, server components + actions), TypeScript, PostgreSQL (`pg`), `node --test` con transpile TS en memoria.

## Global Constraints

- Next.js de este repo tiene breaking changes: ante dudas de API leer `node_modules/next/dist/docs/` y espejar páginas existentes (`apps/web/AGENTS.md`).
- Todo el trabajo es en `apps/web` salvo la migración SQL (raíz `migrations/`). Los tests se corren desde `apps/web`.
- Los tests nuevos se registran en el script `test` de `apps/web/package.json` (no hay descubrimiento automático).
- Multi-tenant: toda query filtra por `empresa_id`; parámetros `$n`, nunca interpolar input de usuario.
- Dinero: redondear a centavos con el patrón `Math.round(x*100)/100`; epsilon `0.005` para comparaciones (igual que `collections.ts`).
- Saldo cliente = `SUM(debit) - SUM(credit)` (positivo = debe, negativo = a favor). Reusar `accountBalanceExpressionSql` de `accounts.ts` cuando aplique.
- Movimientos activos de cuenta: reusar `activeAccountMovementWhereSql("m","s")` de `accounts.ts` para excluir remitos no entregados/no canónicos.
- Vínculo vendedor↔cliente por texto (`clients.seller_name` propio, `clients.assigned_seller` a cargo); usar `sellerCandidates(session)` de `crm.ts` para el filtro por vendedor.
- La suite completa tiene ~11 fallas PRE-EXISTENTES en `static.test.mjs`/`wsfe-vat.test.mjs`, sin relación con este trabajo — no tocarlas; solo confirmar que no se agregan fallas nuevas.
- No se retira código todavía en la Fase 1; `/collections` sigue existiendo hasta la Tarea 9 (repunte de navegación). No borrar `collections.ts`.

---

## File Structure

- `migrations/20260818000000_customer_accounts_indexes.sql` — CREAR: índices idempotentes para pagos pendientes y estado de cuenta.
- `apps/web/src/lib/customer-accounts.ts` — CREAR: funciones puras + queries + alta/anulación de pagos.
- `apps/web/scripts/customer-accounts.test.mjs` — CREAR: unit tests de funciones puras.
- `apps/web/scripts/customer-accounts-wiring.test.mjs` — CREAR: asserts de SQL/wiring de queries, alta, aprobaciones y navegación.
- `apps/web/src/lib/approvals.ts` — MODIFICAR: incluir pagos pendientes de cuenta corriente y resolverlos.
- `apps/web/src/app/admin/approvals/actions.ts` — MODIFICAR: enrutar approve/reject del source `payment`.
- `apps/web/src/lib/navigation.ts` — MODIFICAR: repuntar el grupo "Cobros y pagos".
- `apps/web/src/app/payments/page.tsx` — CREAR: Registro de Pagos.
- `apps/web/src/app/payments/actions.ts` — CREAR: acciones de alta y anulación.
- `apps/web/src/app/payments/register-payment-dialog.tsx` — CREAR: formulario de pago.
- `apps/web/src/app/payments/accounts/page.tsx` — CREAR: cuentas abiertas.
- `apps/web/src/app/payments/accounts/[id]/page.tsx` — CREAR: estado de cuenta.
- `apps/web/src/app/api/pdfs/accounts/statement/[id]/route.ts` — CREAR: PDF de estado de cuenta.
- `apps/web/src/app/crm/cobros/page.tsx` + `apps/web/src/lib/crm.ts` — MODIFICAR: re-apuntar la vista del vendedor a saldo corrido.
- `apps/web/package.json` — MODIFICAR: registrar los 2 test nuevos.

**Boilerplate del loader de tests** (idéntico al de `apps/web/scripts/collections-final-total.test.mjs`). Cada archivo `.test.mjs` nuevo empieza con:

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

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
```

---

## Task 1: Migración de índices

**Files:**
- Create: `migrations/20260818000000_customer_accounts_indexes.sql`

**Interfaces:**
- Produces: índices `payments_empresa_status_idx` y `current_account_movements_empresa_client_date_idx`. No cambia esquema de columnas (las columnas `entity_type`, `entity_name`, `status`, `method`, `client_id` ya existen — ver `migrations/020_account_payment_metadata.sql` y los INSERT en `collections.ts`).

- [ ] **Step 1: Escribir la migración**

Crear `migrations/20260818000000_customer_accounts_indexes.sql`:

```sql
-- Cuenta corriente con saldo corrido: aceleran la bandeja de pagos pendientes
-- y el estado de cuenta por cliente. Aditivo e idempotente.
create index if not exists payments_empresa_status_idx
  on public.payments (empresa_id, status, payment_date desc);

create index if not exists current_account_movements_empresa_client_date_idx
  on public.current_account_movements (empresa_id, client_id, movement_date);
```

- [ ] **Step 2: Verificar que es idempotente (revisión visual)**

Confirmar que ambos usan `create index if not exists` y no referencian columnas inexistentes. No hay runner de migraciones en el repo; se aplican manualmente a prod luego del merge (igual que las migraciones previas).

- [ ] **Step 3: Commit**

```bash
git add migrations/20260818000000_customer_accounts_indexes.sql
git commit -m "feat(cobros): indices para pagos pendientes y estado de cuenta"
```

---

## Task 2: `computeAgingBuckets` (función pura)

**Files:**
- Create: `apps/web/src/lib/customer-accounts.ts`
- Test: `apps/web/scripts/customer-accounts.test.mjs` (crear)
- Modify: `apps/web/package.json`

**Interfaces:**
- Produces:
  ```ts
  export type AgingDebit = { amount: number; date: string; dueDate: string | null };
  export type AgingBuckets = { current: number; d30: number; d60: number; d90: number; overdueTotal: number };
  // Imputa creditTotal a los débitos más viejos primero (FIFO). El remanente impago
  // de cada débito se ubica por antigüedad de su vencimiento respecto de asOf.
  export function computeAgingBuckets(debits: AgingDebit[], creditTotal: number, asOf: string): AgingBuckets;
  ```

- [ ] **Step 1: Escribir el test que falla**

Crear `apps/web/scripts/customer-accounts.test.mjs` con el boilerplate del loader (ver File Structure) y agregar:

```js
const accounts = loadTypeScriptModule("../src/lib/customer-accounts.ts", {
  "@/lib/api-response": { ApiError },
  "@/lib/db": {
    clearReadQueryCache: () => undefined,
    queryWithCompanyContext: async () => ({ rows: [] }),
    withCompanyContext: async () => undefined,
  },
  "@/lib/accounts": {
    accountBalanceExpressionSql: (a) => `${a}.debit - ${a}.credit`,
    activeAccountMovementWhereSql: () => "TRUE",
  },
  "@/lib/collection-methods": {
    COLLECTION_METHODS: ["efectivo", "transferencia", "echeck"],
    collectionMethodRequiresOperation: (m) => m !== "efectivo",
  },
  "@/lib/request-body": {
    numberField: (b, k, d = 0) => (b[k] !== undefined ? Number(b[k]) : d),
    textField: (b, k) => (b[k] !== undefined ? String(b[k]) : ""),
  },
  "@/lib/route-auth": { COLLECTIONS_APPROVE_PERMISSION: { resource: "cobros", action: "aprobar" }, sessionAllows: async () => false },
  "@/lib/timezone": { localDateIso: () => "2026-08-18" },
});
// Nota: el alias map incluye TODOS los módulos que customer-accounts.ts importará
// en tareas posteriores (request-body, route-auth, etc.), para que este test siga
// cargando el módulo completo a medida que crece.

test("computeAgingBuckets imputa FIFO a lo más viejo y bucketea el remanente", () => {
  const debits = [
    { amount: 1000, date: "2026-05-01", dueDate: "2026-05-01" }, // >90? no: +90 días es >60
    { amount: 500, date: "2026-07-20", dueDate: "2026-07-20" },  // vencido +30
    { amount: 300, date: "2026-08-17", dueDate: "2026-08-25" },  // al día (vence futuro)
  ];
  // Un pago de 1000 cancela por completo el débito más viejo.
  const b = accounts.computeAgingBuckets(debits, 1000, "2026-08-18");
  assert.equal(b.current, 300);       // el de vencimiento futuro
  assert.equal(b.d30, 500);           // 29 días vencido
  assert.equal(b.d60, 0);
  assert.equal(b.d90, 0);
  assert.equal(b.overdueTotal, 500);  // solo lo vencido
});

test("computeAgingBuckets: crédito mayor a la deuda deja todo en cero", () => {
  const debits = [{ amount: 200, date: "2026-01-01", dueDate: "2026-01-01" }];
  const b = accounts.computeAgingBuckets(debits, 500, "2026-08-18");
  assert.deepEqual(b, { current: 0, d30: 0, d60: 0, d90: 0, overdueTotal: 0 });
});

test("computeAgingBuckets: sin vencimiento usa la fecha del movimiento", () => {
  const debits = [{ amount: 100, date: "2026-04-01", dueDate: null }];
  const b = accounts.computeAgingBuckets(debits, 0, "2026-08-18"); // >120 días
  assert.equal(b.d90, 100);
});
```

- [ ] **Step 2: Registrar el test y correrlo para verificar que falla**

En `apps/web/package.json`, agregar `apps/web/scripts/customer-accounts.test.mjs` al script `test` (junto a los demás `node --test ...`).

Run: `npm --prefix apps/web test`
Expected: FAIL con "Cannot find module ../src/lib/customer-accounts.ts" (el archivo aún no existe).

- [ ] **Step 3: Implementar la función**

Crear `apps/web/src/lib/customer-accounts.ts`:

```ts
import { ApiError } from "@/lib/api-response";

export type AgingDebit = { amount: number; date: string; dueDate: string | null };
export type AgingBuckets = { current: number; d30: number; d60: number; d90: number; overdueTotal: number };

function money(value: number) {
  return Math.round(value * 100) / 100;
}

function daysBetween(fromIso: string, toIso: string) {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const to = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}

export function computeAgingBuckets(debits: AgingDebit[], creditTotal: number, asOf: string): AgingBuckets {
  const buckets: AgingBuckets = { current: 0, d30: 0, d60: 0, d90: 0, overdueTotal: 0 };
  let remainingCredit = Math.max(0, money(creditTotal));
  const ordered = [...debits].sort((a, b) => a.date.localeCompare(b.date));

  for (const debit of ordered) {
    let outstanding = money(debit.amount);
    if (remainingCredit > 0) {
      const applied = Math.min(outstanding, remainingCredit);
      outstanding = money(outstanding - applied);
      remainingCredit = money(remainingCredit - applied);
    }
    if (outstanding <= 0.005) continue;

    const overdueDays = daysBetween(debit.dueDate ?? debit.date, asOf);
    if (overdueDays <= 0) {
      buckets.current = money(buckets.current + outstanding);
    } else {
      if (overdueDays <= 30) buckets.d30 = money(buckets.d30 + outstanding);
      else if (overdueDays <= 60) buckets.d60 = money(buckets.d60 + outstanding);
      else buckets.d90 = money(buckets.d90 + outstanding);
      buckets.overdueTotal = money(buckets.overdueTotal + outstanding);
    }
  }
  return buckets;
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npm --prefix apps/web test`
Expected: los 3 tests de `computeAgingBuckets` en PASS. (Las fallas pre-existentes de `static.test.mjs`/`wsfe-vat.test.mjs` siguen ahí; no deben aumentar.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/customer-accounts.ts apps/web/scripts/customer-accounts.test.mjs apps/web/package.json
git commit -m "feat(cobros): computeAgingBuckets con imputacion FIFO"
```

---

## Task 3: `buildCustomerStatement` (función pura)

**Files:**
- Modify: `apps/web/src/lib/customer-accounts.ts`
- Test: `apps/web/scripts/customer-accounts.test.mjs`

**Interfaces:**
- Consumes: nada de tareas previas.
- Produces:
  ```ts
  export type StatementMovement = { id: string; date: string; description: string; debit: number; credit: number; kind: string };
  export type StatementLine = StatementMovement & { balance: number };
  export type CustomerStatement = { openingBalance: number; lines: StatementLine[]; finalBalance: number };
  // `movements` viene ordenado ascendente por fecha. `from`/`to` en ISO (YYYY-MM-DD) o null.
  // openingBalance = saldo (debit-credit) de todo lo anterior a `from`. Las líneas dentro
  // del rango llevan saldo corrido arrancando desde openingBalance.
  export function buildCustomerStatement(
    movements: StatementMovement[],
    options: { from?: string | null; to?: string | null },
  ): CustomerStatement;
  ```

- [ ] **Step 1: Escribir el test que falla**

Agregar a `apps/web/scripts/customer-accounts.test.mjs`:

```js
test("buildCustomerStatement arranca con saldo anterior y corre el saldo", () => {
  const movements = [
    { id: "1", date: "2026-07-15", description: "Remito #0400", debit: 1150000, credit: 0, kind: "remito" },
    { id: "2", date: "2026-08-03", description: "Remito #0412", debit: 980000, credit: 0, kind: "remito" },
    { id: "3", date: "2026-08-07", description: "Pago", debit: 0, credit: 600000, kind: "pago" },
    { id: "4", date: "2026-08-25", description: "Remito futuro", debit: 111, credit: 0, kind: "remito" },
  ];
  const st = accounts.buildCustomerStatement(movements, { from: "2026-08-01", to: "2026-08-18" });
  assert.equal(st.openingBalance, 1150000);      // el remito del 15/07 quedó afuera del filtro
  assert.equal(st.lines.length, 2);              // 03/08 y 07/08 (el 25/08 queda fuera de `to`)
  assert.equal(st.lines[0].balance, 2130000);
  assert.equal(st.lines[1].balance, 1530000);
  assert.equal(st.finalBalance, 1530000);
});

test("buildCustomerStatement sin filtro: opening 0 y final = saldo total", () => {
  const movements = [
    { id: "1", date: "2026-08-03", description: "Remito", debit: 1000, credit: 0, kind: "remito" },
    { id: "2", date: "2026-08-07", description: "Pago", debit: 0, credit: 400, kind: "pago" },
  ];
  const st = accounts.buildCustomerStatement(movements, {});
  assert.equal(st.openingBalance, 0);
  assert.equal(st.finalBalance, 600);
});
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `npm --prefix apps/web test`
Expected: FAIL con "accounts.buildCustomerStatement is not a function".

- [ ] **Step 3: Implementar la función**

Agregar a `apps/web/src/lib/customer-accounts.ts`:

```ts
export type StatementMovement = { id: string; date: string; description: string; debit: number; credit: number; kind: string };
export type StatementLine = StatementMovement & { balance: number };
export type CustomerStatement = { openingBalance: number; lines: StatementLine[]; finalBalance: number };

export function buildCustomerStatement(
  movements: StatementMovement[],
  options: { from?: string | null; to?: string | null },
): CustomerStatement {
  const from = options.from?.trim() || null;
  const to = options.to?.trim() || null;

  let openingBalance = 0;
  const lines: StatementLine[] = [];

  for (const movement of movements) {
    const delta = money(movement.debit - movement.credit);
    if (from && movement.date < from) {
      openingBalance = money(openingBalance + delta);
      continue;
    }
    if (to && movement.date > to) continue;
    const previous = lines.length ? lines[lines.length - 1].balance : openingBalance;
    lines.push({ ...movement, balance: money(previous + delta) });
  }

  const finalBalance = lines.length ? lines[lines.length - 1].balance : openingBalance;
  return { openingBalance, lines, finalBalance };
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npm --prefix apps/web test`
Expected: los 2 tests nuevos en PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/customer-accounts.ts apps/web/scripts/customer-accounts.test.mjs
git commit -m "feat(cobros): buildCustomerStatement con saldo anterior y saldo corrido"
```

---

## Task 4: `listOpenCustomerAccounts` (cuentas abiertas + aging)

**Files:**
- Modify: `apps/web/src/lib/customer-accounts.ts`
- Test: `apps/web/scripts/customer-accounts-wiring.test.mjs` (crear)
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: `computeAgingBuckets` (Task 2).
- Produces:
  ```ts
  export type OpenCustomerAccount = {
    clientId: string; name: string; sellerName: string; taxId: string;
    lastMovementDate: string | null; balance: number; aging: AgingBuckets;
  };
  export async function listOpenCustomerAccounts(
    companyId: number,
    options?: { query?: string | null; sellerNames?: string[] | null },
  ): Promise<{ accounts: OpenCustomerAccount[]; totals: { debit: number; credit: number } }>;
  ```
  Implementación: una query trae por cliente sus débitos activos (con `dueDate = movement_date` para notas/manuales, o `sale_date + COALESCE(source_payment_term_days, payment_term_days, 0)` cuando hay `sale_id`) y el total de créditos; luego `computeAgingBuckets` por cliente en JS. Filtra clientes con `SUM(debit)-SUM(credit) <> 0` (epsilon 0.005). `sellerNames` (si viene) filtra por `UPPER(BTRIM(COALESCE(c.seller_name,''))) = ANY($n) OR ... assigned_seller ...`.

- [ ] **Step 1: Escribir el test de wiring que falla**

Crear `apps/web/scripts/customer-accounts-wiring.test.mjs` con el boilerplate del loader y:

```js
const source = readFileSync(new URL("../src/lib/customer-accounts.ts", import.meta.url), "utf8");

test("listOpenCustomerAccounts arma el vencimiento y reusa el filtro de movimientos activos", () => {
  assert.match(source, /activeAccountMovementWhereSql/);
  assert.match(source, /source_payment_term_days/);
  assert.match(source, /computeAgingBuckets/);
  // filtra saldos distintos de cero con epsilon
  assert.match(source, /ABS\([^)]*\)\s*>\s*0\.005/);
});
```

- [ ] **Step 2: Registrar el test y correrlo para verificar que falla**

En `apps/web/package.json`, agregar `apps/web/scripts/customer-accounts-wiring.test.mjs` al script `test`.

Run: `npm --prefix apps/web test`
Expected: FAIL — los `assert.match` no encuentran los patrones (la función no existe aún).

- [ ] **Step 3: Implementar la función**

Agregar imports al tope de `apps/web/src/lib/customer-accounts.ts`:

```ts
import { activeAccountMovementWhereSql } from "@/lib/accounts";
import { queryWithCompanyContext } from "@/lib/db";
```

Y la función:

```ts
export type OpenCustomerAccount = {
  clientId: string; name: string; sellerName: string; taxId: string;
  lastMovementDate: string | null; balance: number; aging: AgingBuckets;
};

const DUE_DATE_SQL = `CASE
  WHEN m.sale_id IS NOT NULL THEN (s.sale_date::date + COALESCE(s.source_payment_term_days, c.payment_term_days, 0))
  ELSE m.movement_date::date END`;

export async function listOpenCustomerAccounts(
  companyId: number,
  options: { query?: string | null; sellerNames?: string[] | null } = {},
): Promise<{ accounts: OpenCustomerAccount[]; totals: { debit: number; credit: number } }> {
  const params: unknown[] = [companyId];
  const filters = [
    "m.empresa_id = $1",
    "m.entity_type = 'cliente'",
    "m.client_id IS NOT NULL",
    activeAccountMovementWhereSql("m", "s"),
  ];

  const query = options.query?.trim() ?? "";
  if (query) {
    params.push(`%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
    filters.push(`(COALESCE(c.display_name, m.entity_name, '') ILIKE $${params.length} ESCAPE '\\'
      OR COALESCE(c.tax_id, '') ILIKE $${params.length} ESCAPE '\\')`);
  }
  const sellerNames = (options.sellerNames ?? []).filter(Boolean);
  if (sellerNames.length) {
    params.push(sellerNames);
    filters.push(`(UPPER(BTRIM(COALESCE(c.seller_name,''))) = ANY($${params.length}::text[])
      OR UPPER(BTRIM(COALESCE(c.assigned_seller,''))) = ANY($${params.length}::text[]))`);
  }

  const rows = await queryWithCompanyContext<{
    client_id: string; name: string; seller_name: string; tax_id: string;
    last_movement: string | null; total_debit: string; total_credit: string;
    debits: { amount: string; date: string; due: string | null }[] | null;
  }>(
    companyId,
    `
      SELECT m.client_id::text AS client_id,
             COALESCE(c.display_name, MAX(m.entity_name), '') AS name,
             COALESCE(c.seller_name, '') AS seller_name,
             COALESCE(c.tax_id, '') AS tax_id,
             MAX(m.movement_date)::text AS last_movement,
             COALESCE(SUM(m.debit), 0)::text AS total_debit,
             COALESCE(SUM(m.credit), 0)::text AS total_credit,
             COALESCE(JSON_AGG(JSON_BUILD_OBJECT('amount', m.debit, 'date', m.movement_date::text, 'due', ${DUE_DATE_SQL}))
               FILTER (WHERE m.debit > 0), '[]'::json) AS debits
      FROM current_account_movements m
      LEFT JOIN sales s ON s.id = m.sale_id AND s.empresa_id = m.empresa_id
      LEFT JOIN clients c ON c.id = m.client_id AND c.empresa_id = m.empresa_id
      WHERE ${filters.join(" AND ")}
      GROUP BY m.client_id, c.display_name, c.seller_name, c.tax_id
      HAVING ABS(COALESCE(SUM(m.debit),0) - COALESCE(SUM(m.credit),0)) > 0.005
      ORDER BY (COALESCE(SUM(m.debit),0) - COALESCE(SUM(m.credit),0)) DESC
    `,
    params,
  );

  const today = new Date().toISOString().slice(0, 10);
  let totalDebit = 0;
  let totalCredit = 0;
  const accounts = rows.rows.map((row) => {
    const debits = (row.debits ?? []).map((d) => ({ amount: Number(d.amount), date: d.date, dueDate: d.due }));
    totalDebit = money(totalDebit + Number(row.total_debit));
    totalCredit = money(totalCredit + Number(row.total_credit));
    return {
      clientId: row.client_id,
      name: row.name,
      sellerName: row.seller_name,
      taxId: row.tax_id,
      lastMovementDate: row.last_movement,
      balance: money(Number(row.total_debit) - Number(row.total_credit)),
      aging: computeAgingBuckets(debits, Number(row.total_credit), today),
    };
  });

  return { accounts, totals: { debit: totalDebit, credit: totalCredit } };
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npm --prefix apps/web test`
Expected: el test de wiring de `listOpenCustomerAccounts` en PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/customer-accounts.ts apps/web/scripts/customer-accounts-wiring.test.mjs apps/web/package.json
git commit -m "feat(cobros): listOpenCustomerAccounts con aging por cliente"
```

---

## Task 5: `getCustomerStatement` (estado de cuenta)

**Files:**
- Modify: `apps/web/src/lib/customer-accounts.ts`
- Test: `apps/web/scripts/customer-accounts-wiring.test.mjs`

**Interfaces:**
- Consumes: `buildCustomerStatement` (Task 3).
- Produces:
  ```ts
  export type CustomerStatementResult = {
    customer: { id: string; name: string; taxId: string; sellerName: string };
    statement: CustomerStatement;
  };
  export async function getCustomerStatement(
    companyId: number,
    clientId: string,
    options?: { from?: string | null; to?: string | null },
  ): Promise<CustomerStatementResult>;
  ```
  Trae los datos del cliente y TODOS sus movimientos activos ordenados asc por fecha, y delega el corte por fecha a `buildCustomerStatement` (el opening necesita ver los movimientos previos a `from`).

- [ ] **Step 1: Escribir el test de wiring que falla**

Agregar a `apps/web/scripts/customer-accounts-wiring.test.mjs`:

```js
test("getCustomerStatement trae todos los movimientos ordenados y delega el corte por fecha", () => {
  assert.match(source, /export async function getCustomerStatement/);
  assert.match(source, /ORDER BY m\.movement_date ASC/);
  assert.match(source, /buildCustomerStatement\(/);
  // NO filtra por fecha en SQL (el opening necesita lo anterior a `from`)
  assert.doesNotMatch(source, /movement_date >= \$/);
});
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `npm --prefix apps/web test`
Expected: FAIL — patrones ausentes.

- [ ] **Step 3: Implementar la función**

Agregar a `apps/web/src/lib/customer-accounts.ts`:

```ts
export type CustomerStatementResult = {
  customer: { id: string; name: string; taxId: string; sellerName: string };
  statement: CustomerStatement;
};

function movementKind(description: string, debit: number): string {
  const lower = description.toLowerCase();
  if (lower.startsWith("nota de debito")) return "nota_debito";
  if (lower.includes("nota de credito") || lower.includes("devolucion")) return "nota_credito";
  if (debit > 0) return "remito";
  return "pago";
}

export async function getCustomerStatement(
  companyId: number,
  clientId: string,
  options: { from?: string | null; to?: string | null } = {},
): Promise<CustomerStatementResult> {
  const info = await queryWithCompanyContext<{ name: string; tax_id: string; seller_name: string }>(
    companyId,
    `SELECT COALESCE(display_name, '') AS name, COALESCE(tax_id, '') AS tax_id, COALESCE(seller_name, '') AS seller_name
     FROM clients WHERE id = $1::uuid AND empresa_id = $2 LIMIT 1`,
    [clientId, companyId],
  );
  if (!info.rows[0]) throw new ApiError(404, "Cliente no encontrado");

  const rows = await queryWithCompanyContext<{
    id: string; movement_date: string; description: string; debit: string; credit: string;
  }>(
    companyId,
    `
      SELECT m.id::text AS id, m.movement_date::text AS movement_date,
             COALESCE(m.description, '') AS description, m.debit::text, m.credit::text
      FROM current_account_movements m
      LEFT JOIN sales s ON s.id = m.sale_id AND s.empresa_id = m.empresa_id
      WHERE m.empresa_id = $1 AND m.client_id = $2::uuid
        AND ${activeAccountMovementWhereSql("m", "s")}
      ORDER BY m.movement_date ASC, m.created_at ASC
    `,
    [companyId, clientId],
  );

  const movements: StatementMovement[] = rows.rows.map((row) => ({
    id: row.id,
    date: row.movement_date,
    description: row.description,
    debit: Number(row.debit),
    credit: Number(row.credit),
    kind: movementKind(row.description, Number(row.debit)),
  }));

  return {
    customer: { id: clientId, name: info.rows[0].name, taxId: info.rows[0].tax_id, sellerName: info.rows[0].seller_name },
    statement: buildCustomerStatement(movements, options),
  };
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npm --prefix apps/web test`
Expected: test de wiring de `getCustomerStatement` en PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/customer-accounts.ts apps/web/scripts/customer-accounts-wiring.test.mjs
git commit -m "feat(cobros): getCustomerStatement por cliente"
```

---

## Task 6: `registerCustomerPayment` (alta híbrida)

**Files:**
- Modify: `apps/web/src/lib/customer-accounts.ts`
- Test: `apps/web/scripts/customer-accounts-wiring.test.mjs`

**Interfaces:**
- Consumes: nada de tareas previas (usa `withCompanyContext`).
- Produces:
  ```ts
  export type CustomerPaymentInput = {
    clientId: string; amount: number; date: string; method: string;
    destination: string; operation: string; notes: string;
  };
  export function customerPaymentFromBody(body: RequestBody): CustomerPaymentInput;
  export async function registerCustomerPayment(
    session: AuthSession,
    input: CustomerPaymentInput,
  ): Promise<{ id: string; status: "registrado" | "pendiente_aprobacion" }>;
  ```
  Regla híbrida: si `sessionAllows(session, [COLLECTIONS_APPROVE_PERMISSION])` → status `registrado` e inserta el crédito en `current_account_movements` de una vez. Si no → status `pendiente_aprobacion` (solo fila en `payments`, sin movimiento; el crédito lo crea la aprobación en la Task 8). Siempre valida `amount>0`, método en `COLLECTION_METHODS`, `destination` no vacío, y operación obligatoria según método.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `apps/web/scripts/customer-accounts-wiring.test.mjs`:

```js
test("customerPaymentFromBody valida monto, metodo y operacion", () => {
  const mod = loadCustomerAccounts();
  assert.throws(() => mod.customerPaymentFromBody({ amount: "0", method: "efectivo", destination: "caja" }), /mayor a cero/);
  assert.throws(() => mod.customerPaymentFromBody({ amount: "10", method: "bitcoin", destination: "caja" }), /Metodo/);
  assert.throws(() => mod.customerPaymentFromBody({ amount: "10", method: "transferencia", destination: "banco" }), /operacion/i);
  const ok = mod.customerPaymentFromBody({ amount: "10", method: "efectivo", destination: "caja", clientId: "c1" });
  assert.equal(ok.amount, 10);
  assert.equal(ok.method, "efectivo");
});

test("registerCustomerPayment: admin registra directo, vendedor deja pendiente", async () => {
  const queries = [];
  const mod = loadCustomerAccounts({
    withCompanyContext: async (_companyId, fn) => fn({ query: async (sql, params) => { queries.push({ sql, params }); return { rows: [{ id: "p1" }] }; } }),
    sessionAllows: async (_session, perms) => true, // admin
  });
  const res = await mod.registerCustomerPayment(
    { companyId: 1, userId: "u1", username: "admin", role: "administrador" },
    { clientId: "c1", amount: 100, date: "2026-08-18", method: "efectivo", destination: "caja", operation: "", notes: "" },
  );
  assert.equal(res.status, "registrado");
  // admin: inserta el pago Y el movimiento de crédito
  assert.ok(queries.some((q) => /INSERT INTO payments/i.test(q.sql)));
  assert.ok(queries.some((q) => /INSERT INTO current_account_movements/i.test(q.sql)));
});
```

Para poder inyectar mocks distintos por test, agregar cerca del tope del archivo un helper:

```js
function loadCustomerAccounts(overrides = {}) {
  return loadTypeScriptModule("../src/lib/customer-accounts.ts", {
    "@/lib/api-response": { ApiError },
    "@/lib/db": {
      clearReadQueryCache: () => undefined,
      queryWithCompanyContext: overrides.queryWithCompanyContext ?? (async () => ({ rows: [] })),
      withCompanyContext: overrides.withCompanyContext ?? (async () => undefined),
    },
    "@/lib/accounts": { activeAccountMovementWhereSql: () => "TRUE" },
    "@/lib/collection-methods": {
      COLLECTION_METHODS: ["efectivo", "transferencia", "echeck"],
      collectionMethodRequiresOperation: (m) => m !== "efectivo",
    },
    "@/lib/request-body": {
      numberField: (b, k, d = 0) => (b[k] !== undefined ? Number(b[k]) : d),
      textField: (b, k) => (b[k] !== undefined ? String(b[k]) : ""),
    },
    "@/lib/route-auth": {
      COLLECTIONS_APPROVE_PERMISSION: { resource: "cobros", action: "aprobar" },
      sessionAllows: overrides.sessionAllows ?? (async () => false),
    },
    "@/lib/timezone": { localDateIso: () => "2026-08-18" },
  });
}
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `npm --prefix apps/web test`
Expected: FAIL — `customerPaymentFromBody`/`registerCustomerPayment` no existen.

- [ ] **Step 3: Implementar**

Agregar imports faltantes al tope de `apps/web/src/lib/customer-accounts.ts`:

```ts
import { COLLECTION_METHODS, collectionMethodRequiresOperation } from "@/lib/collection-methods";
import { clearReadQueryCache, withCompanyContext } from "@/lib/db";
import { numberField, textField, type RequestBody } from "@/lib/request-body";
import { COLLECTIONS_APPROVE_PERMISSION, sessionAllows } from "@/lib/route-auth";
import { localDateIso } from "@/lib/timezone";
import type { AuthSession } from "@/lib/auth";
```

Y la lógica:

```ts
const PAYMENT_METHODS = new Set<string>(COLLECTION_METHODS);

export type CustomerPaymentInput = {
  clientId: string; amount: number; date: string; method: string;
  destination: string; operation: string; notes: string;
};

export function customerPaymentFromBody(body: RequestBody): CustomerPaymentInput {
  const clientId = textField(body, "clientId") || textField(body, "cliente_id");
  const amount = numberField(body, "amount", numberField(body, "monto", 0));
  const method = (textField(body, "method") || textField(body, "metodo")).toLowerCase();
  const destination = textField(body, "destination") || textField(body, "destino");
  const operation = textField(body, "operation") || textField(body, "operacion");
  const notes = textField(body, "notes") || textField(body, "notas");
  const date = textField(body, "date") || textField(body, "fecha") || localDateIso();

  if (amount <= 0) throw new ApiError(400, "El monto debe ser mayor a cero");
  if (!PAYMENT_METHODS.has(method)) throw new ApiError(400, "Metodo de cobro invalido");
  if (!destination) throw new ApiError(400, "El destino es obligatorio");
  if (collectionMethodRequiresOperation(method) && !operation) throw new ApiError(400, "La operacion es obligatoria");

  return { clientId, amount, date, method, destination, operation, notes };
}

export async function registerCustomerPayment(session: AuthSession, input: CustomerPaymentInput) {
  if (!input.clientId) throw new ApiError(400, "El cliente es obligatorio");
  const canApprove = await sessionAllows(session, [COLLECTIONS_APPROVE_PERMISSION]);
  const status = canApprove ? "registrado" : "pendiente_aprobacion";

  const result = await withCompanyContext(session.companyId, async (client) => {
    const clientInfo = await client.query(
      `SELECT COALESCE(display_name,'') AS name FROM clients WHERE id = $1::uuid AND empresa_id = $2 LIMIT 1`,
      [input.clientId, session.companyId],
    );
    const clientName = clientInfo.rows[0]?.name ?? "";
    const reference = [input.operation, input.notes].filter(Boolean).join(" | ");

    const payment = await client.query(
      `
        INSERT INTO payments (
          client_id, payment_date, amount, method, reference, status,
          registered_by, entity_type, entity_name, concept, notes, empresa_id
        )
        VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::uuid, 'cliente', $8, $9, $10, $11)
        RETURNING id::text AS id
      `,
      [
        input.clientId, input.date, input.amount, input.method, reference, status,
        session.userId, clientName, `Cobro ${input.method}`, input.notes, session.companyId,
      ],
    );
    const paymentId = payment.rows[0].id as string;

    if (status === "registrado") {
      await client.query(
        `
          INSERT INTO current_account_movements (
            client_id, payment_id, movement_date, debit, credit, description, entity_type, entity_name, empresa_id
          )
          VALUES ($1::uuid, $2::uuid, $3, 0, $4, $5, 'cliente', $6, $7)
        `,
        [
          input.clientId, paymentId, input.date, input.amount,
          `Cobro - ${input.method} | Destino ${input.destination} | ${reference}`.trim(),
          clientName, session.companyId,
        ],
      );
    }

    await client.query(
      "INSERT INTO audit_log (actor_id, action, entity_table, entity_id, new_data, empresa_id) VALUES ($1,$2,$3,$4,$5,$6)",
      [session.userId, "customer_payment.registered", "payments", paymentId, JSON.stringify({ status, amount: input.amount }), session.companyId],
    );

    return { id: paymentId, status };
  });

  clearReadQueryCache();
  return result as { id: string; status: "registrado" | "pendiente_aprobacion" };
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npm --prefix apps/web test`
Expected: los 2 tests nuevos en PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/customer-accounts.ts apps/web/scripts/customer-accounts-wiring.test.mjs
git commit -m "feat(cobros): registerCustomerPayment con flujo hibrido"
```

---

## Task 7: `voidCustomerPayment` (anulación)

**Files:**
- Modify: `apps/web/src/lib/customer-accounts.ts`
- Test: `apps/web/scripts/customer-accounts-wiring.test.mjs`

**Interfaces:**
- Produces:
  ```ts
  export async function voidCustomerPayment(session: AuthSession, paymentId: string): Promise<{ id: string; status: "anulado" }>;
  ```
  Marca el pago `anulado` e inserta un movimiento compensatorio (débito por el monto del crédito original) si el pago ya tenía movimiento. No borra filas. Idempotente: si ya está `anulado`, lanza 409.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `apps/web/scripts/customer-accounts-wiring.test.mjs`:

```js
test("voidCustomerPayment marca anulado y compensa el credito con un debito", async () => {
  const queries = [];
  const mod = loadCustomerAccounts({
    withCompanyContext: async (_companyId, fn) => fn({
      query: async (sql, params) => {
        queries.push({ sql, params });
        if (/SELECT/i.test(sql)) return { rows: [{ id: "p1", client_id: "c1", amount: "100", status: "registrado", entity_name: "Cliente", movement_id: "m1" }] };
        return { rows: [{ id: "p1" }] };
      },
    }),
  });
  const res = await mod.voidCustomerPayment({ companyId: 1, userId: "u1", username: "admin" }, "p1");
  assert.equal(res.status, "anulado");
  assert.ok(queries.some((q) => /UPDATE payments/i.test(q.sql) && /anulado/i.test(q.sql)));
  assert.ok(queries.some((q) => /INSERT INTO current_account_movements/i.test(q.sql) && /debit/i.test(q.sql)));
});
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `npm --prefix apps/web test`
Expected: FAIL — `voidCustomerPayment` no existe.

- [ ] **Step 3: Implementar**

Agregar a `apps/web/src/lib/customer-accounts.ts`:

```ts
export async function voidCustomerPayment(session: AuthSession, paymentId: string) {
  const result = await withCompanyContext(session.companyId, async (client) => {
    const found = await client.query(
      `SELECT id::text AS id, client_id::text AS client_id, amount::text AS amount,
              COALESCE(status,'') AS status, COALESCE(entity_name,'') AS entity_name
       FROM payments WHERE id = $1::uuid AND empresa_id = $2 FOR UPDATE`,
      [paymentId, session.companyId],
    );
    const payment = found.rows[0];
    if (!payment) throw new ApiError(404, "Pago no encontrado");
    if (payment.status === "anulado") throw new ApiError(409, "El pago ya esta anulado");

    const hadMovement = payment.status === "registrado";

    await client.query(
      `UPDATE payments SET status = 'anulado', updated_at = now() WHERE id = $1::uuid AND empresa_id = $2`,
      [paymentId, session.companyId],
    );

    if (hadMovement) {
      await client.query(
        `
          INSERT INTO current_account_movements (
            client_id, payment_id, movement_date, debit, credit, description, entity_type, entity_name, empresa_id
          )
          VALUES ($1::uuid, $2::uuid, CURRENT_DATE, $3, 0, $4, 'cliente', $5, $6)
        `,
        [payment.client_id, paymentId, Number(payment.amount), `Anulacion de cobro (pago ${paymentId})`, payment.entity_name, session.companyId],
      );
    }

    await client.query(
      "INSERT INTO audit_log (actor_id, action, entity_table, entity_id, new_data, empresa_id) VALUES ($1,$2,$3,$4,$5,$6)",
      [session.userId, "customer_payment.voided", "payments", paymentId, JSON.stringify({ amount: Number(payment.amount) }), session.companyId],
    );

    return { id: paymentId, status: "anulado" as const };
  });

  clearReadQueryCache();
  return result;
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npm --prefix apps/web test`
Expected: test de `voidCustomerPayment` en PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/customer-accounts.ts apps/web/scripts/customer-accounts-wiring.test.mjs
git commit -m "feat(cobros): voidCustomerPayment con movimiento compensatorio"
```

---

## Task 8: Aprobación de pagos pendientes en la bandeja existente

**Files:**
- Modify: `apps/web/src/lib/approvals.ts`
- Modify: `apps/web/src/app/admin/approvals/actions.ts`
- Modify: `apps/web/src/lib/customer-accounts.ts` (agregar `approveCustomerPayment` / `rejectCustomerPayment`)
- Test: `apps/web/scripts/customer-accounts-wiring.test.mjs`

**Interfaces:**
- Consumes: `registerCustomerPayment` (Task 6) — el crédito se crea recién al aprobar.
- Produces en `customer-accounts.ts`:
  ```ts
  export type PendingCustomerPayment = {
    id: string; clientId: string; customerName: string; amount: number;
    method: string; reference: string; registeredBy: string; createdAt: string | null;
  };
  export async function listPendingCustomerPayments(companyId: number): Promise<PendingCustomerPayment[]>;
  export async function approveCustomerPayment(session: AuthSession, paymentId: string): Promise<{ id: string; status: "registrado" }>;
  export async function rejectCustomerPayment(session: AuthSession, paymentId: string, reason: string): Promise<{ id: string; status: "rechazado" }>;
  ```
- Produces en `approvals.ts`: el `ApprovalSource` gana el valor `"payment"`; `listApprovalCenter` incluye los pagos pendientes cuando `access.collections`; `parseApprovalSource` acepta `"payment"`; `canOperateApprovalSource` mapea `payment → access.collections`; `meta` suma `payments`.

- [ ] **Step 1: Escribir el test de wiring que falla**

Agregar a `apps/web/scripts/customer-accounts-wiring.test.mjs`:

```js
test("approveCustomerPayment inserta el credito y pasa a registrado", () => {
  assert.match(source, /export async function approveCustomerPayment/);
  assert.match(source, /INSERT INTO current_account_movements/);
  assert.match(source, /pendiente_aprobacion/);
});
```

Y crear/añadir asserts sobre `approvals.ts` en el mismo archivo:

```js
const approvalsSource = readFileSync(new URL("../src/lib/approvals.ts", import.meta.url), "utf8");
test("approvals.ts suma el source payment", () => {
  assert.match(approvalsSource, /"payment"/);
  assert.match(approvalsSource, /listPendingCustomerPayments/);
});
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `npm --prefix apps/web test`
Expected: FAIL — patrones ausentes.

- [ ] **Step 3a: Implementar en `customer-accounts.ts`**

Agregar `listPendingCustomerPayments`, `approveCustomerPayment` (mueve `pendiente_aprobacion → registrado`, valida con `FOR UPDATE`, e inserta el crédito en `current_account_movements` igual que el bloque `registrado` de la Task 6) y `rejectCustomerPayment` (mueve `pendiente_aprobacion → rechazado`, sin movimiento). Ambas idempotentes con `RETURNING id` y guard 409 si la fila ya no está `pendiente_aprobacion`. Registrar en `audit_log` (`customer_payment.approved` / `.rejected`).

```ts
export type PendingCustomerPayment = {
  id: string; clientId: string; customerName: string; amount: number;
  method: string; reference: string; registeredBy: string; createdAt: string | null;
};

export async function listPendingCustomerPayments(companyId: number): Promise<PendingCustomerPayment[]> {
  const rows = await queryWithCompanyContext<{
    id: string; client_id: string; name: string; amount: string; method: string;
    reference: string; registered_by: string; created_at: string | null;
  }>(
    companyId,
    `
      SELECT p.id::text AS id, p.client_id::text AS client_id,
             COALESCE(c.display_name, p.entity_name, '') AS name,
             p.amount::text, COALESCE(p.method,'') AS method, COALESCE(p.reference,'') AS reference,
             COALESCE(u.display_name, '') AS registered_by, p.created_at::text
      FROM payments p
      LEFT JOIN clients c ON c.id = p.client_id AND c.empresa_id = p.empresa_id
      LEFT JOIN profiles u ON u.id = p.registered_by
      WHERE p.empresa_id = $1 AND p.status = 'pendiente_aprobacion' AND p.entity_type = 'cliente'
      ORDER BY p.created_at DESC
    `,
    [companyId],
  );
  return rows.rows.map((row) => ({
    id: row.id, clientId: row.client_id, customerName: row.name, amount: Number(row.amount),
    method: row.method, reference: row.reference, registeredBy: row.registered_by, createdAt: row.created_at,
  }));
}

export async function approveCustomerPayment(session: AuthSession, paymentId: string) {
  const result = await withCompanyContext(session.companyId, async (client) => {
    const found = await client.query(
      `SELECT id::text AS id, client_id::text AS client_id, amount::text AS amount,
              COALESCE(method,'') AS method, COALESCE(reference,'') AS reference, COALESCE(entity_name,'') AS entity_name
       FROM payments WHERE id = $1::uuid AND empresa_id = $2 AND status = 'pendiente_aprobacion' FOR UPDATE`,
      [paymentId, session.companyId],
    );
    const payment = found.rows[0];
    if (!payment) throw new ApiError(409, "El pago ya no esta pendiente de aprobacion");

    await client.query(
      `INSERT INTO current_account_movements (client_id, payment_id, movement_date, debit, credit, description, entity_type, entity_name, empresa_id)
       VALUES ($1::uuid, $2::uuid, CURRENT_DATE, 0, $3, $4, 'cliente', $5, $6)`,
      [payment.client_id, paymentId, Number(payment.amount), `Cobro aprobado - ${payment.method} | ${payment.reference}`.trim(), payment.entity_name, session.companyId],
    );
    await client.query(
      `UPDATE payments SET status = 'registrado', updated_at = now() WHERE id = $1::uuid AND empresa_id = $2`,
      [paymentId, session.companyId],
    );
    await client.query(
      "INSERT INTO audit_log (actor_id, action, entity_table, entity_id, new_data, empresa_id) VALUES ($1,$2,$3,$4,$5,$6)",
      [session.userId, "customer_payment.approved", "payments", paymentId, JSON.stringify({ amount: Number(payment.amount) }), session.companyId],
    );
    return { id: paymentId, status: "registrado" as const };
  });
  clearReadQueryCache();
  return result;
}

export async function rejectCustomerPayment(session: AuthSession, paymentId: string, reason: string) {
  const result = await withCompanyContext(session.companyId, async (client) => {
    const updated = await client.query<{ id: string }>(
      `UPDATE payments SET status = 'rechazado', notes = CASE WHEN $3 = '' THEN notes ELSE CONCAT_WS(' | ', NULLIF(notes,''), 'Rechazo: ' || $3) END, updated_at = now()
       WHERE id = $1::uuid AND empresa_id = $2 AND status = 'pendiente_aprobacion' RETURNING id::text AS id`,
      [paymentId, session.companyId, reason.trim()],
    );
    if (!updated.rows[0]) throw new ApiError(409, "El pago ya no esta pendiente de aprobacion");
    await client.query(
      "INSERT INTO audit_log (actor_id, action, entity_table, entity_id, new_data, empresa_id) VALUES ($1,$2,$3,$4,$5,$6)",
      [session.userId, "customer_payment.rejected", "payments", paymentId, JSON.stringify({ reason: reason.trim() }), session.companyId],
    );
    return { id: paymentId, status: "rechazado" as const };
  });
  clearReadQueryCache();
  return result;
}
```

- [ ] **Step 3b: Extender `approvals.ts`**

- Importar `listPendingCustomerPayments` de `@/lib/customer-accounts`.
- Cambiar `export type ApprovalSource = "collection" | "request" | "purchase" | "payment";`
- En `parseApprovalSource`, agregar `case "payment": return "payment";`
- En `canOperateApprovalSource`, agregar `case "payment": return access.collections;`
- En `listApprovalCenter`, agregar a `Promise.all` `access.collections ? listPendingCustomerPayments(companyId) : Promise.resolve([])`, mapear a `ApprovalItem` con `source: "payment"`, `type: "Solicitud de aprobacion de pago"`, `title: 'Pago ' + customerName`, `amount: amount`, `requester: registeredBy`; concatenar a `items` y sumar `payments: paymentItems.length` en `meta`.

- [ ] **Step 3c: Enrutar en `admin/approvals/actions.ts`**

En las acciones `approveApprovalAction` / `rejectApprovalAction`, cuando `source === "payment"` llamar `approveCustomerPayment(session, id)` / `rejectCustomerPayment(session, id, reason)` (importados de `@/lib/customer-accounts`), con el mismo guard de permiso que usa `collection`. Revalidar además `/payments` y `/payments/accounts`.

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npm --prefix apps/web test`
Expected: los tests de aprobación en PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/customer-accounts.ts apps/web/src/lib/approvals.ts apps/web/src/app/admin/approvals/actions.ts apps/web/scripts/customer-accounts-wiring.test.mjs
git commit -m "feat(cobros): aprobar/rechazar pagos pendientes desde la bandeja"
```

---

## Task 9: Navegación — repuntar el grupo "Cobros y pagos"

**Files:**
- Modify: `apps/web/src/lib/navigation.ts`
- Test: `apps/web/scripts/customer-accounts-wiring.test.mjs`

**Interfaces:**
- Consumes: rutas nuevas `/payments` y `/payments/accounts` (se crean en Tasks 10-12; la nav puede apuntar antes de que existan las páginas, pero para que el enlace no rompa, esta tarea se ejecuta junto o después de la Task 10).

- [ ] **Step 1: Escribir el test que falla**

Agregar a `apps/web/scripts/customer-accounts-wiring.test.mjs`:

```js
const navSource = readFileSync(new URL("../src/lib/navigation.ts", import.meta.url), "utf8");
test("navegacion apunta a los nuevos submenus de Cobros y pagos", () => {
  assert.match(navSource, /href: "\/payments"/);
  assert.match(navSource, /href: "\/payments\/accounts"/);
  assert.match(navSource, /Registro de pagos/i);
});
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `npm --prefix apps/web test`
Expected: FAIL — patrones ausentes.

- [ ] **Step 3: Editar la navegación**

En `apps/web/src/lib/navigation.ts`, dentro del grupo `label: "Cobros y pagos"` (líneas ~182-207), reemplazar el item `href: "/collections"` por:

```ts
{
  href: "/payments",
  label: "Registro de pagos",
  active: "collections",
  badge: "collectionApprovals",
  permission: COLLECTIONS_READ_PERMISSION,
},
{
  href: "/payments/accounts",
  label: "Cuentas corrientes",
  active: "collections",
  permission: COLLECTIONS_READ_PERMISSION,
},
```

Dejar el item "Pagos proveedores" (`/treasury/movements?type=pago`) como está. Quitar el viejo item `href: "/treasury/current-accounts"` de este grupo (sigue accesible para proveedores desde Finanzas si aplica; verificar que no quede huérfano — si era el único uso, moverlo a la sección Finanzas no es parte de esta etapa, simplemente se saca de este grupo).

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npm --prefix apps/web test`
Expected: test de navegación en PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/navigation.ts apps/web/scripts/customer-accounts-wiring.test.mjs
git commit -m "feat(cobros): repuntar navegacion a Registro de pagos y Cuentas corrientes"
```

---

## Task 10: Página Registro de Pagos + acciones + diálogo

**Files:**
- Create: `apps/web/src/app/payments/page.tsx`
- Create: `apps/web/src/app/payments/actions.ts`
- Create: `apps/web/src/app/payments/register-payment-dialog.tsx`
- Modify: `apps/web/src/lib/customer-accounts.ts` (agregar `listCustomerPayments` para el diario)
- Test: `apps/web/scripts/customer-accounts-wiring.test.mjs`

**Interfaces:**
- Consumes: `registerCustomerPayment`, `voidCustomerPayment`, `customerPaymentFromBody` (Tasks 6-7).
- Produces:
  ```ts
  export type CustomerPaymentRow = {
    id: string; date: string | null; customerName: string; method: string;
    reference: string; registeredBy: string; amount: number; status: string;
  };
  export async function listCustomerPayments(
    companyId: number,
    options?: { query?: string | null; status?: string | null; from?: string | null; to?: string | null },
  ): Promise<CustomerPaymentRow[]>;
  ```
  Server actions en `payments/actions.ts`: `registerCustomerPaymentAction` (gate `COLLECTIONS_CREATE_PERMISSION`), `voidCustomerPaymentAction` (gate `COLLECTIONS_CREATE_PERMISSION`; revalida `/payments`, `/payments/accounts`, `/admin/approvals`).

- [ ] **Step 1: Escribir el test de wiring que falla**

Agregar a `apps/web/scripts/customer-accounts-wiring.test.mjs`:

```js
test("listCustomerPayments filtra por status del diario", () => {
  assert.match(source, /export async function listCustomerPayments/);
  assert.match(source, /FROM payments/);
  assert.match(source, /entity_type = 'cliente'/);
});

const paymentsActions = readFileSync(new URL("../src/app/payments/actions.ts", import.meta.url), "utf8");
test("payments/actions.ts registra y anula con gate de permiso", () => {
  assert.match(paymentsActions, /registerCustomerPayment/);
  assert.match(paymentsActions, /voidCustomerPayment/);
  assert.match(paymentsActions, /COLLECTIONS_CREATE_PERMISSION/);
  assert.match(paymentsActions, /revalidatePath\("\/payments"\)/);
});
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `npm --prefix apps/web test`
Expected: FAIL — archivos/funciones inexistentes.

- [ ] **Step 3a: Implementar `listCustomerPayments`** en `apps/web/src/lib/customer-accounts.ts`:

```ts
export type CustomerPaymentRow = {
  id: string; date: string | null; customerName: string; method: string;
  reference: string; registeredBy: string; amount: number; status: string;
};

export async function listCustomerPayments(
  companyId: number,
  options: { query?: string | null; status?: string | null; from?: string | null; to?: string | null } = {},
): Promise<CustomerPaymentRow[]> {
  const params: unknown[] = [companyId];
  const filters = ["p.empresa_id = $1", "p.entity_type = 'cliente'"];
  const status = options.status?.trim() ?? "";
  if (status) { params.push(status); filters.push(`p.status = $${params.length}`); }
  const query = options.query?.trim() ?? "";
  if (query) {
    params.push(`%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
    filters.push(`COALESCE(c.display_name, p.entity_name, '') ILIKE $${params.length} ESCAPE '\\'`);
  }
  if (options.from?.trim()) { params.push(options.from.trim()); filters.push(`p.payment_date >= $${params.length}`); }
  if (options.to?.trim()) { params.push(options.to.trim()); filters.push(`p.payment_date <= $${params.length}`); }

  const rows = await queryWithCompanyContext<{
    id: string; date: string | null; name: string; method: string; reference: string;
    registered_by: string; amount: string; status: string;
  }>(
    companyId,
    `
      SELECT p.id::text AS id, p.payment_date::text AS date,
             COALESCE(c.display_name, p.entity_name, '') AS name,
             COALESCE(p.method,'') AS method, COALESCE(p.reference,'') AS reference,
             COALESCE(u.display_name,'') AS registered_by, p.amount::text, COALESCE(p.status,'') AS status
      FROM payments p
      LEFT JOIN clients c ON c.id = p.client_id AND c.empresa_id = p.empresa_id
      LEFT JOIN profiles u ON u.id = p.registered_by
      WHERE ${filters.join(" AND ")}
      ORDER BY p.payment_date DESC NULLS LAST, p.created_at DESC
      LIMIT 500
    `,
    params,
  );
  return rows.rows.map((row) => ({
    id: row.id, date: row.date, customerName: row.name, method: row.method,
    reference: row.reference, registeredBy: row.registered_by, amount: Number(row.amount), status: row.status,
  }));
}
```

- [ ] **Step 3b: Implementar `apps/web/src/app/payments/actions.ts`** (espejar `apps/web/src/app/collections/actions.ts`):

```ts
"use server";

import { revalidatePath } from "next/cache";
import { customerPaymentFromBody, registerCustomerPayment, voidCustomerPayment } from "@/lib/customer-accounts";
import { uuidParam } from "@/lib/request-body";
import { COLLECTIONS_CREATE_PERMISSION, requireApiSession } from "@/lib/route-auth";

function revalidatePaymentsFlow() {
  revalidatePath("/payments");
  revalidatePath("/payments/accounts");
  revalidatePath("/admin/approvals");
}

export async function registerCustomerPaymentAction(formData: FormData) {
  const session = await requireApiSession([COLLECTIONS_CREATE_PERMISSION]);
  await registerCustomerPayment(session, customerPaymentFromBody(Object.fromEntries(formData.entries())));
  revalidatePaymentsFlow();
}

export async function voidCustomerPaymentAction(formData: FormData) {
  const session = await requireApiSession([COLLECTIONS_CREATE_PERMISSION]);
  const id = uuidParam(String(formData.get("id") ?? ""), "Pago");
  await voidCustomerPayment(session, id);
  revalidatePaymentsFlow();
}
```

- [ ] **Step 3c: Implementar el diálogo** `apps/web/src/app/payments/register-payment-dialog.tsx`

Espejar la estructura de `apps/web/src/app/collections/register-collection-dialog.tsx` (leerlo primero). Campos: selector de cliente (recibe `customers: { id: string; name: string }[]` por props; si viene `defaultCustomerId`, prellenar y ocultar el selector), monto, fecha (default `today`), método (`<Select>` con `COLLECTION_METHODS`), destino, operación, notas. `action={registerCustomerPaymentAction}`.

- [ ] **Step 3d: Implementar la página** `apps/web/src/app/payments/page.tsx`

Espejar `apps/web/src/app/collections/page.tsx`: `requireStaffSession` + `sessionCanReadCollections` (redirect `/` si no). Toolbar con búsqueda + filtro de estado (`Todos/registrado/pendiente_aprobacion/anulado`). Botón "+ Nuevo pago" que abre `RegisterPaymentDialog` (pasando la lista de clientes vía una función existente de clientes, p. ej. `listAccountEntities`/`listCustomers` — usar la que devuelva `{id,name}`; si no hay una liviana, agregar `listCustomerOptions(companyId)` mínima en `customer-accounts.ts`). Tabla con columnas Fecha, Cliente, Método, Operación/Ref., Cargó, Monto, Estado (badge: `registrado`=success, `pendiente_aprobacion`=warning, `anulado`=neutral tachado, `rechazado`=danger). En filas `registrado`, acción "Anular" (form → `voidCustomerPaymentAction`) sólo si `canRegister`. Data desde `listCustomerPayments`.

> Nota de aprobación: la página NO aprueba; el estado `pendiente_aprobacion` es informativo. El aviso "● N pendientes" enlaza a `/admin/approvals`.

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npm --prefix apps/web test`
Expected: tests de wiring de Task 10 en PASS.

- [ ] **Step 5: Verificar en el navegador (preview)**

Levantar el dev server (preview_start con la config del proyecto) y navegar a `/payments`. Confirmar que la tabla carga, el diálogo abre y "Nuevo pago" registra. Revisar `read_console_messages` sin errores.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/customer-accounts.ts apps/web/src/app/payments apps/web/scripts/customer-accounts-wiring.test.mjs
git commit -m "feat(cobros): pagina Registro de Pagos con alta y anulacion"
```

---

## Task 11: Página Cuentas Corrientes (cuentas abiertas)

**Files:**
- Create: `apps/web/src/app/payments/accounts/page.tsx`
- Test: `apps/web/scripts/customer-accounts-wiring.test.mjs`

**Interfaces:**
- Consumes: `listOpenCustomerAccounts` (Task 4).

- [ ] **Step 1: Escribir el test de wiring que falla**

Agregar a `apps/web/scripts/customer-accounts-wiring.test.mjs`:

```js
const accountsPage = () => readFileSync(new URL("../src/app/payments/accounts/page.tsx", import.meta.url), "utf8");
test("cuentas abiertas usa listOpenCustomerAccounts y linkea al detalle", () => {
  const src = accountsPage();
  assert.match(src, /listOpenCustomerAccounts/);
  assert.match(src, /\/payments\/accounts\//); // link al estado de cuenta [id]
  assert.match(src, /Vencido|aging|\+30/i);
});
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `npm --prefix apps/web test`
Expected: FAIL — archivo inexistente.

- [ ] **Step 3: Implementar la página**

Crear `apps/web/src/app/payments/accounts/page.tsx` (server component). Espejar el layout de `apps/web/src/app/treasury/current-accounts/page.tsx`. `requireStaffSession` + `requirePagePermission(session, [COLLECTIONS_READ_PERMISSION])`. Toolbar con búsqueda por nombre/CUIT. StatCards: Deuda total (suma de balances > 0), A favor (suma de balances < 0). Tabla: Cliente (link a `/payments/accounts/${clientId}`), Vendedor, Últ. movimiento, Al día, +30, +60, +90, Saldo (rojo si >0, verde si <0). Colorear la columna de saldo con `var(--danger)` / `var(--accent-strong)` según signo. Data desde `listOpenCustomerAccounts(session.companyId, { query })`.

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npm --prefix apps/web test`
Expected: test de Task 11 en PASS.

- [ ] **Step 5: Verificar en el navegador**

Navegar a `/payments/accounts`. Confirmar tabla con aging y que el clic en un cliente navega a su detalle.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/payments/accounts/page.tsx apps/web/scripts/customer-accounts-wiring.test.mjs
git commit -m "feat(cobros): pagina de cuentas abiertas con aging"
```

---

## Task 12: Estado de cuenta + PDF

**Files:**
- Create: `apps/web/src/app/payments/accounts/[id]/page.tsx`
- Create: `apps/web/src/app/api/pdfs/accounts/statement/[id]/route.ts`
- Test: `apps/web/scripts/customer-accounts-wiring.test.mjs`

**Interfaces:**
- Consumes: `getCustomerStatement` (Task 5), `RegisterPaymentDialog` (Task 10).

- [ ] **Step 1: Escribir el test de wiring que falla**

Agregar a `apps/web/scripts/customer-accounts-wiring.test.mjs`:

```js
test("estado de cuenta usa getCustomerStatement, filtro de fecha y saldo anterior", () => {
  const src = readFileSync(new URL("../src/app/payments/accounts/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(src, /getCustomerStatement/);
  assert.match(src, /Saldo anterior/i);
  assert.match(src, /openingBalance/);
  assert.match(src, /api\/pdfs\/accounts\/statement\//);
});
test("ruta PDF de estado de cuenta existe y usa getCustomerStatement", () => {
  const src = readFileSync(new URL("../src/app/api/pdfs/accounts/statement/[id]/route.ts", import.meta.url), "utf8");
  assert.match(src, /getCustomerStatement/);
});
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `npm --prefix apps/web test`
Expected: FAIL — archivos inexistentes.

- [ ] **Step 3a: Implementar la página** `apps/web/src/app/payments/accounts/[id]/page.tsx`

Server component. `requireStaffSession` + `requirePagePermission([COLLECTIONS_READ_PERMISSION])`. `searchParams` con `from`/`to`. Llama `getCustomerStatement(companyId, id, { from, to })`. Encabezado con nombre, CUIT, vendedor, saldo actual (usar `finalBalance` sin filtro para el saldo actual real — hacer una segunda llamada sin fechas, o exponer el saldo total). Botón "+ Registrar pago" (RegisterPaymentDialog con `defaultCustomerId=id`), botón "Exportar PDF" (link a `/api/pdfs/accounts/statement/${id}?from=&to=`). Filtro Desde/Hasta (form GET). Tabla: primera fila "Saldo anterior" con `openingBalance` en la columna Saldo; luego `statement.lines` con Fecha, Comprobante/Detalle (`description`), Debe, Haber, Saldo (`balance`); fila final "Saldo final del período" con `finalBalance`.

- [ ] **Step 3b: Implementar la ruta PDF** `apps/web/src/app/api/pdfs/accounts/statement/[id]/route.ts`

Leer primero `apps/web/src/app/api/pdfs/accounts/current/route.ts` y `apps/web/src/lib/pdf/documents.ts` para el patrón exacto (auth, `renderDocument`, headers `Content-Type: application/pdf`). Construir el documento con los datos de `getCustomerStatement(companyId, id, { from, to })`: encabezado con datos del cliente y rango de fechas, fila de saldo anterior, filas de movimientos (fecha, detalle, debe, haber, saldo) y saldo final. Reusar los helpers de `documents.ts`/`renderer.ts`.

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npm --prefix apps/web test`
Expected: los 2 tests de Task 12 en PASS.

- [ ] **Step 5: Verificar en el navegador**

Navegar a un `/payments/accounts/<id>`. Confirmar el saldo anterior, el saldo corrido y que "Exportar PDF" descarga un PDF con el mismo cuadro. Probar el filtro de fechas (el saldo anterior debe cambiar).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/payments/accounts/[id]/page.tsx apps/web/src/app/api/pdfs/accounts/statement apps/web/scripts/customer-accounts-wiring.test.mjs
git commit -m "feat(cobros): estado de cuenta con saldo anterior y PDF"
```

---

## Task 13: Re-apuntar `/crm/cobros` a saldo corrido

**Files:**
- Modify: `apps/web/src/lib/crm.ts`
- Modify: `apps/web/src/app/crm/cobros/page.tsx`
- Test: `apps/web/scripts/customer-accounts-wiring.test.mjs`

**Interfaces:**
- Consumes: `listOpenCustomerAccounts` con `sellerNames` (Task 4), `sellerCandidates` (existente en `crm.ts`).
- Produces: `getVendorOpenAccounts(session)` en `crm.ts` que delega a `listOpenCustomerAccounts(session.companyId, { sellerNames: sellerCandidates(session) })`.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `apps/web/scripts/customer-accounts-wiring.test.mjs`:

```js
const crmSource = readFileSync(new URL("../src/lib/crm.ts", import.meta.url), "utf8");
test("crm.ts expone las cuentas abiertas del vendedor por saldo corrido", () => {
  assert.match(crmSource, /getVendorOpenAccounts/);
  assert.match(crmSource, /listOpenCustomerAccounts/);
  assert.match(crmSource, /sellerCandidates/);
});
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `npm --prefix apps/web test`
Expected: FAIL — `getVendorOpenAccounts` ausente.

- [ ] **Step 3: Implementar**

En `apps/web/src/lib/crm.ts` agregar:

```ts
import { listOpenCustomerAccounts } from "@/lib/customer-accounts";

export async function getVendorOpenAccounts(session: AuthSession) {
  return listOpenCustomerAccounts(session.companyId, { sellerNames: sellerCandidates(session) });
}
```

En `apps/web/src/app/crm/cobros/page.tsx`, reemplazar el listado por remito por la tabla de cuentas abiertas del vendedor (cliente, saldo, aging), reusando el mismo layout que la Task 11 pero gateado por `CRM_READ_PERMISSION` y filtrado al vendedor. Mantener el botón de registrar cobro del vendedor apuntando a la acción CRM existente (o al nuevo `registerCustomerPaymentAction` con `defaultCustomerId`, según prefiera el flujo — respetar el gate `crm.ver` sin permiso global). Si esto último agranda el alcance, dejar el registro como está y sólo cambiar la LISTA a saldo corrido.

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npm --prefix apps/web test`
Expected: test de Task 13 en PASS.

- [ ] **Step 5: Verificar en el navegador**

Navegar a `/crm/cobros` (con un usuario vendedor si es posible) y confirmar que muestra las cuentas de sus clientes con saldo corrido.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/crm.ts apps/web/src/app/crm/cobros/page.tsx apps/web/scripts/customer-accounts-wiring.test.mjs
git commit -m "feat(cobros): CRM cobros del vendedor por saldo corrido"
```

---

## Cierre

- [ ] **Correr la suite completa** y confirmar que no hay fallas nuevas respecto de la línea base (~11 fallas pre-existentes en `static.test.mjs`/`wsfe-vat.test.mjs`).

Run: `npm --prefix apps/web test`

- [ ] **Verificación funcional de punta a punta** en el navegador: alta de pago admin (impacta saldo) → alta de pago vendedor (queda pendiente) → aprobación en `/admin/approvals` (impacta saldo) → cuenta abierta refleja el nuevo saldo y aging → estado de cuenta con filtro de fecha → PDF.

- [ ] **Actualizar la memoria** del proyecto con el resultado (nueva entrada en `MEMORY.md`) cuando esté mergeado.

## Notas de riesgo (del spec)

- **Regla eliminada:** el nuevo alta de pago NO usa `assertCollectionAmountWithinBalance`. La vieja `/collections` sigue usándola hasta que se retire; no se toca en esta etapa.
- **`sale_id` en `payments`:** ya es nullable (los INSERT de `accounts.ts` no lo setean). No requiere migración.
- **Coexistencia de datos:** los movimientos existentes (débito por remito, crédito por cobro aprobado) ya cuadran el saldo; el cambio sólo afecta cómo se dan de alta los pagos nuevos.
- **`profiles` join:** `payments.registered_by` es UUID de `profiles.id` (ver `approveCollection`). Confirmar el nombre de la columna de display (`display_name`) al implementar los joins de `registered_by`.
```
