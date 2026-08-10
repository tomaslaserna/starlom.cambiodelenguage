# Pedidos a clientes inactivos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir usar clientes inactivos en pedidos y presupuestos; cargar un pedido (directo o por conversión de presupuesto) reactiva al cliente, presupuestar no.

**Architecture:** Un helper aislado `reactivateClientIfInactive` centraliza la reactivación (DRY) y se llama desde la creación de pedido y desde la conversión presupuesto→venta. Se quitan cuatro filtros `active = true` del flujo comercial. El helper se testea por comportamiento con un mock client; los quitados de filtro se cubren con tests de regresión sobre el código fuente (patrón ya usado en el repo).

**Tech Stack:** TypeScript, Next.js (versión con breaking changes — ver `apps/web/AGENTS.md`), PostgreSQL (Supabase) vía `pg`, tests con `node --test` + `typescript` (`ts.transpileModule`).

## Global Constraints

- Todas las consultas van scopeadas por `empresa_id` (multi-tenant). Copiar el patrón existente.
- Tests: `node:test`. Se ejecutan con `npm run test` desde `apps/web`. Cada archivo `.mjs` nuevo debe registrarse en el script `test` de `apps/web/package.json`.
- Módulos `.ts` con imports `@/lib/*` NO se pueden importar directo en tests; usar `loadTypeScriptModule(path, aliases)` (ver `apps/web/scripts/domain-behavior.test.mjs`). Un módulo que solo usa `import type` transpila sin dependencias y no necesita aliases.
- No tocar el filtro `active = true` de **productos** (`orders.ts:742`, `orders.ts:559`, `quotes.ts:427`).
- Todos los comandos se corren desde `apps/web/`.

---

## File Structure

- **Create:** `apps/web/src/lib/client-reactivation.ts` — helper `reactivateClientIfInactive`. Única responsabilidad: reactivar un cliente inactivo dentro de la transacción del llamador.
- **Create:** `apps/web/scripts/client-reactivation.test.mjs` — test de comportamiento del helper (mock client).
- **Create:** `apps/web/scripts/inactive-clients-sql.test.mjs` — tests de regresión sobre el fuente de `orders.ts` y `quotes.ts` (filtros quitados + wiring del helper).
- **Modify:** `apps/web/src/lib/orders.ts` — `getOrderFormData` (quitar filtro) y `getOrderCustomer` (quitar filtro + llamar helper).
- **Modify:** `apps/web/src/lib/quotes.ts` — `createQuote` (quitar filtro) y `acceptQuote` (quitar filtro + llamar helper).
- **Modify:** `apps/web/package.json` — registrar los dos test nuevos.

---

## Task 1: Helper `reactivateClientIfInactive` + test

**Files:**
- Create: `apps/web/src/lib/client-reactivation.ts`
- Test: `apps/web/scripts/client-reactivation.test.mjs`
- Modify: `apps/web/package.json` (script `test`)

**Interfaces:**
- Consumes: `PoolClient` de `pg` (solo tipo).
- Produces: `reactivateClientIfInactive(client: PoolClient, companyId: number, clientId: string): Promise<void>` — usado por las Tasks 2 y 5.

- [ ] **Step 1: Write the failing test**

Create `apps/web/scripts/client-reactivation.test.mjs`:

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

const { reactivateClientIfInactive } = loadTypeScriptModule("../src/lib/client-reactivation.ts");

function recordingClient() {
  const writes = [];
  return {
    writes,
    async query(sql, params) {
      writes.push({ sql, params });
      return { rowCount: 0, rows: [] };
    },
  };
}

test("reactivateClientIfInactive issues a guarded UPDATE scoped to client and company", async () => {
  const client = recordingClient();
  await reactivateClientIfInactive(client, 1, "069aeca6-cf91-4605-b813-a8d5f906d736");

  assert.equal(client.writes.length, 1);
  const { sql, params } = client.writes[0];
  assert.match(sql, /UPDATE clients/);
  assert.match(sql, /SET active = true/);
  assert.match(sql, /updated_at = now\(\)/);
  assert.match(sql, /active = false/); // el guard hace no-op si ya está activo
  assert.deepEqual(params, ["069aeca6-cf91-4605-b813-a8d5f906d736", 1]);
});
```

- [ ] **Step 2: Register the test file so it runs**

In `apps/web/package.json`, append ` scripts/client-reactivation.test.mjs` to the end of the `"test"` script string (before the closing quote), keeping all existing files.

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL — `Cannot find module '../src/lib/client-reactivation.ts'` (el módulo aún no existe).

- [ ] **Step 4: Write minimal implementation**

Create `apps/web/src/lib/client-reactivation.ts`:

```ts
import type { PoolClient } from "pg";

/**
 * Reactiva un cliente si está inactivo. No hace nada si ya está activo o no
 * existe. Corre sobre el `client` de la transacción del llamador, por lo que
 * participa de su transacción.
 */
export async function reactivateClientIfInactive(
  client: PoolClient,
  companyId: number,
  clientId: string,
): Promise<void> {
  await client.query(
    `
      UPDATE clients
      SET active = true, updated_at = now()
      WHERE id = $1::uuid AND empresa_id = $2 AND active = false
    `,
    [clientId, companyId],
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test`
Expected: PASS (todos los tests, incluido el nuevo).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/client-reactivation.ts apps/web/scripts/client-reactivation.test.mjs apps/web/package.json
git commit -m "feat(clients): helper reactivateClientIfInactive"
```

---

## Task 2: Permitir inactivos al crear pedido + reactivar (`getOrderCustomer`)

**Files:**
- Modify: `apps/web/src/lib/orders.ts:489-503` (`getOrderCustomer`)
- Test: `apps/web/scripts/inactive-clients-sql.test.mjs` (Create)
- Modify: `apps/web/package.json` (script `test`)

**Interfaces:**
- Consumes: `reactivateClientIfInactive` (Task 1).
- Produces: nada nuevo para tasks posteriores.

- [ ] **Step 1: Write the failing regression test**

Create `apps/web/scripts/inactive-clients-sql.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ordersSource = readFileSync(new URL("../src/lib/orders.ts", import.meta.url), "utf8");

test("getOrderCustomer: la búsqueda de cliente no filtra por active y reactiva", () => {
  // El lookup del cliente del pedido ya no exige active = true
  assert.doesNotMatch(ordersSource, /id = \$1::uuid AND empresa_id = \$2 AND active = true/);
  // Y se reactiva al cliente al crear el pedido
  assert.match(ordersSource, /reactivateClientIfInactive\(/);
});
```

- [ ] **Step 2: Register the test file so it runs**

In `apps/web/package.json`, append ` scripts/inactive-clients-sql.test.mjs` to the end of the `"test"` script string, keeping all existing files.

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL — el fuente todavía contiene `id = $1::uuid AND empresa_id = $2 AND active = true` y no contiene `reactivateClientIfInactive(`.

- [ ] **Step 4: Add the import in `orders.ts`**

At the top of `apps/web/src/lib/orders.ts`, after line 1 (`import { ApiError } from "@/lib/api-response";`), add:

```ts
import { reactivateClientIfInactive } from "@/lib/client-reactivation";
```

- [ ] **Step 5: Remove the filter and reactivate in `getOrderCustomer`**

Replace the body of `getOrderCustomer` (`apps/web/src/lib/orders.ts:489-503`):

```ts
async function getOrderCustomer(client: PoolClient, companyId: number, customerId: string) {
  const customerResult = await client.query<OrderCustomerRow>(
    `
      SELECT id::text, display_name, legal_name, tax_id, fiscal_condition,
             price_list_name, receipt_type, seller_name, payment_term_days
      FROM clients
      WHERE id = $1::uuid AND empresa_id = $2
      LIMIT 1
    `,
    [customerId, companyId],
  );
  const customer = customerResult.rows[0];
  if (!customer) throw new ApiError(404, "Cliente no encontrado");
  await reactivateClientIfInactive(client, companyId, customerId);
  return customer;
}
```

(Cambios: se quitó `AND active = true` del `WHERE`; se agregó la llamada a `reactivateClientIfInactive` antes del `return`.)

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 7: Type-check**

Run: `npm run typecheck`
Expected: sin errores. (Si no existe el script `typecheck`, usar `npx tsc --noEmit`.)

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/orders.ts apps/web/scripts/inactive-clients-sql.test.mjs apps/web/package.json
git commit -m "feat(orders): permitir cliente inactivo al crear pedido y reactivarlo"
```

---

## Task 3: Mostrar inactivos en el buscador de cliente (`getOrderFormData`)

**Files:**
- Modify: `apps/web/src/lib/orders.ts:672-680` (query de `clients` en `getOrderFormData`)
- Test: `apps/web/scripts/inactive-clients-sql.test.mjs` (Modify — agregar test)

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Add the failing regression test**

Append to `apps/web/scripts/inactive-clients-sql.test.mjs`:

```js
test("getOrderFormData: la lista de clientes del formulario no filtra por active", () => {
  // La query de clientes del selector (WHERE empresa_id = $1) ya no exige active.
  // El filtro de productos usa el prefijo `p.` y no matchea este patrón.
  assert.doesNotMatch(ordersSource, /empresa_id = \$1 AND active = true/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL — el fuente aún contiene `empresa_id = $1 AND active = true` (línea 676).

- [ ] **Step 3: Remove the filter**

In `apps/web/src/lib/orders.ts`, in the `clients` query inside `getOrderFormData` (around line 672-678), change:

```sql
      FROM clients
      WHERE empresa_id = $1 AND active = true
      ORDER BY display_name ASC, id ASC
```

to:

```sql
      FROM clients
      WHERE empresa_id = $1
      ORDER BY display_name ASC, id ASC
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/orders.ts apps/web/scripts/inactive-clients-sql.test.mjs
git commit -m "feat(orders): incluir clientes inactivos en el buscador de pedido/presupuesto"
```

---

## Task 4: Permitir inactivos al crear presupuesto (`createQuote`)

**Files:**
- Modify: `apps/web/src/lib/quotes.ts:487-499` (validación de cliente en `createQuote`)
- Test: `apps/web/scripts/inactive-clients-sql.test.mjs` (Modify — agregar test + leer fuente de quotes)

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Add the failing regression test**

In `apps/web/scripts/inactive-clients-sql.test.mjs`, after the `ordersSource` line at the top, add a second source read:

```js
const quotesSource = readFileSync(new URL("../src/lib/quotes.ts", import.meta.url), "utf8");
```

Then append this test:

```js
test("createQuote: la validación de cliente no filtra por active", () => {
  assert.doesNotMatch(quotesSource, /id = \$1::uuid AND empresa_id = \$2 AND active = true/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL — `quotes.ts` aún contiene `id = $1::uuid AND empresa_id = $2 AND active = true` (línea 491).

- [ ] **Step 3: Remove the filter**

In `apps/web/src/lib/quotes.ts`, in the customer validation query inside `createQuote` (around line 489-492), change:

```sql
          FROM clients
          WHERE id = $1::uuid AND empresa_id = $2 AND active = true
          LIMIT 1
```

to:

```sql
          FROM clients
          WHERE id = $1::uuid AND empresa_id = $2
          LIMIT 1
```

(No se reactiva: un presupuesto es no vinculante.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/quotes.ts apps/web/scripts/inactive-clients-sql.test.mjs
git commit -m "feat(quotes): permitir presupuestar a clientes inactivos"
```

---

## Task 5: Conversión presupuesto→venta: enganchar inactivo + reactivar (`acceptQuote`)

**Files:**
- Modify: `apps/web/src/lib/quotes.ts` — import del helper; lookup por CUIT (línea ~753) y reactivación tras resolver `clientId` (tras línea ~789, antes del `INSERT INTO sales`)
- Test: `apps/web/scripts/inactive-clients-sql.test.mjs` (Modify — agregar test)

**Interfaces:**
- Consumes: `reactivateClientIfInactive` (Task 1).
- Produces: nada.

- [ ] **Step 1: Add the failing regression test**

Append to `apps/web/scripts/inactive-clients-sql.test.mjs`:

```js
test("acceptQuote: el match por CUIT no filtra por active y reactiva el cliente resultante", () => {
  // El lookup por CUIT (regexp_replace) ya no exige active = true
  assert.doesNotMatch(quotesSource, /active = true\s+AND regexp_replace/);
  // La conversión reactiva al cliente resultante
  assert.match(quotesSource, /reactivateClientIfInactive\(/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL — `quotes.ts` aún tiene `active = true` antes del `regexp_replace` (línea 753) y no contiene `reactivateClientIfInactive(`.

- [ ] **Step 3: Add the import in `quotes.ts`**

At the top of `apps/web/src/lib/quotes.ts`, after line 2 (`import { ApiError } from "@/lib/api-response";`), add:

```ts
import { reactivateClientIfInactive } from "@/lib/client-reactivation";
```

- [ ] **Step 4: Remove the filter in the CUIT lookup**

In `acceptQuote`, in the client-by-CUIT query (around line 750-758), change:

```sql
            SELECT id::text
            FROM clients
            WHERE empresa_id = $1
              AND active = true
              AND regexp_replace(COALESCE(tax_id, ''), '[^0-9]', '', 'g') =
                  regexp_replace($2, '[^0-9]', '', 'g')
            ORDER BY created_at
            LIMIT 1
```

to (quitar la línea `AND active = true`):

```sql
            SELECT id::text
            FROM clients
            WHERE empresa_id = $1
              AND regexp_replace(COALESCE(tax_id, ''), '[^0-9]', '', 'g') =
                  regexp_replace($2, '[^0-9]', '', 'g')
            ORDER BY created_at
            LIMIT 1
```

- [ ] **Step 5: Reactivate the resolved client before creating the sale**

In `acceptQuote`, right after the block that resolves `clientId` closes (the two nested `if (!clientId)` blocks end around line 789 with `    }`), and immediately before `const saleResult = await client.query<{ id: string }>(` (around line 791), insert:

```ts
    if (clientId) {
      await reactivateClientIfInactive(client, session.companyId, clientId);
    }
```

(Esto cubre tanto el caso en que el presupuesto ya referencia al cliente por `client_id` como el matcheado por CUIT. Si el cliente se acaba de crear, el guard `active = false` hace no-op.)

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 7: Type-check**

Run: `npm run typecheck`
Expected: sin errores. (o `npx tsc --noEmit`.)

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/quotes.ts apps/web/scripts/inactive-clients-sql.test.mjs
git commit -m "feat(quotes): conversión reutiliza y reactiva cliente inactivo (evita duplicados)"
```

---

## Task 6: Verificación end-to-end en el navegador

**Files:** ninguno (verificación manual asistida).

- [ ] **Step 1: Full test + typecheck**

Run: `npm run test`
Expected: PASS (todos los archivos, incluidos `client-reactivation.test.mjs` e `inactive-clients-sql.test.mjs`).

Run: `npm run typecheck` (o `npx tsc --noEmit`)
Expected: sin errores.

- [ ] **Step 2: Levantar la app y probar el flujo**

Levantar el dev server (vía preview_start con la config de `.claude/launch.json`; si no existe, crearla apuntando al script de dev de `apps/web`). Con un cliente inactivo de prueba (o APADRO):

1. En `/orders/new`: el cliente inactivo aparece en el buscador de cliente.
2. Cargar un pedido a su nombre: se crea sin error `Cliente no encontrado`.
3. Verificar en la base que quedó `active = true` (consulta puntual sobre `clients`).
4. En `/quotes`: el cliente inactivo aparece; crear un presupuesto funciona.
5. (Opcional) Convertir un presupuesto de un cliente inactivo y verificar que reutiliza el cliente (no crea duplicado) y lo deja activo.

- [ ] **Step 3: Capturar evidencia**

Screenshot del pedido creado al cliente antes inactivo, y/o el resultado de la consulta `SELECT display_name, active FROM clients WHERE ...` mostrando `active = true`.

- [ ] **Step 4: Cerrar la rama**

Usar la skill `superpowers:finishing-a-development-branch` para decidir merge/PR.
