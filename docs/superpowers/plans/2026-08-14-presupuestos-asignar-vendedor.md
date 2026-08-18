# Asignar presupuestos a un vendedor + visibilidad — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al crear o editar un presupuesto, poder asignarlo a un vendedor (solo ese vendedor lo ve en su CRM) o dejarlo visible para todos los vendedores.

**Architecture:** Nueva columna `quotes.visible_to_all`. El form (`QuoteEntryFields`) gana un selector "Asignar a" (Todos + vendedores). `createQuote`/`updateQuote` resuelven `seller_id`/`visible_to_all` con un helper que valida el vendedor. `getVendorQuotes` suma `OR visible_to_all` al filtro. La lista `/quotes` muestra la asignación.

**Tech Stack:** Next.js (App Router, server components + actions), TypeScript, PostgreSQL (`pg`), `node --test` con transpile TS en memoria.

## Global Constraints

- Next.js de este repo tiene breaking changes: espejar páginas/componentes existentes; ver `apps/web/AGENTS.md`.
- Todo el trabajo es en `apps/web`. Tests se corren desde `apps/web`.
- Los tests nuevos se agregan al script `test` de `apps/web/package.json`.
- Multi-tenant: toda query filtra `empresa_id`; parámetros `$n`, nunca interpolar input.
- Default del selector = **Todos los vendedores** → `visible_to_all = true`, `seller_id = quien lo crea`.
- Vendedor asignado válido → `seller_id = ese vendedor`, `visible_to_all = false`. Un `assignedSellerId` que no es vendedor de la empresa se trata como "Todos" (no rompe).
- Los presupuestos existentes quedan `visible_to_all = false` (comportamiento actual intacto: solo su `seller_id` los ve en el CRM).
- La migración `quotes.visible_to_all` **debe aplicarse a prod** (Supabase) además del deploy — paso aparte con confirmación del usuario (Task 7).
- La suite completa tiene ~11 fallas PRE-EXISTENTES en `static.test.mjs`/`wsfe-vat.test.mjs`, sin relación — no tocarlas; confirmar que no se agregan nuevas.

---

## File Structure

- `migrations/<ts>_quotes_visible_to_all.sql` — CREAR: columna aditiva.
- `apps/web/src/lib/quotes.ts` — MODIFICAR: `mapQuote` (+SELECTs) expone `sellerId`/`visibleToAll`; `QuoteInput`/`quoteInputFromBody` (+`assignedSellerId`); `resolveQuoteAssignment`; `createQuote`/`updateQuote`.
- `apps/web/src/lib/crm.ts` — MODIFICAR: `getVendorQuotes` filtro OR.
- `apps/web/src/app/quotes/quote-entry-fields.tsx` — MODIFICAR: prop `vendors` + selector "Asignar a".
- `apps/web/src/app/quotes/page.tsx` — MODIFICAR: pasar `vendors`; mostrar asignación en la lista.
- `apps/web/src/app/quotes/[id]/edit/page.tsx` — MODIFICAR: pasar `vendors` + `initialValues.assignedSellerId`.
- `apps/web/scripts/quote-assignment.test.mjs` — CREAR: tests de input/resolve/create/update/getVendorQuotes.
- `apps/web/scripts/quotes-assign-wiring.test.mjs` — CREAR: tests de wiring (form + páginas).
- `apps/web/package.json` — MODIFICAR: registrar los 2 test nuevos.

---

## Task 1: Migración + `mapQuote` expone `sellerId`/`visibleToAll`

**Files:**
- Create: `migrations/20260814180000_quotes_visible_to_all.sql`
- Modify: `apps/web/src/lib/quotes.ts` (`mapQuote` param type + return; `listQuotes` y `getQuote` SELECTs)
- Test: `apps/web/scripts/quote-assignment.test.mjs` (crear)
- Modify: `apps/web/package.json`

**Interfaces:**
- Produces: `mapQuote` return gana `sellerId: string` y `visibleToAll: boolean`.

- [ ] **Step 1: Crear la migración**

Crear `migrations/20260814180000_quotes_visible_to_all.sql`:
```sql
-- Presupuestos visibles para todos los vendedores en el CRM.
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS visible_to_all boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: Escribir el test que falla**

Crear `apps/web/scripts/quote-assignment.test.mjs`:
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
const vatCalculation = loadTypeScriptModule("../src/lib/vat-calculation.ts");
const receiptTypes = loadTypeScriptModule("../src/lib/receipt-types.ts");
const requestBody = loadTypeScriptModule("../src/lib/request-body.ts", { "@/lib/api-response": { ApiError } });
const orderPricing = loadTypeScriptModule("../src/lib/order-pricing.ts");

const quotesDb = {
  withCompanyContext: async (cb) => cb(),
  queryWithCompanyContext: async () => ({ rows: [], rowCount: 0 }),
};
const aliases = {
  "@/lib/api-response": { ApiError },
  "@/lib/client-reactivation": { reactivateClientIfInactive: async () => {} },
  "@/lib/db": {
    withCompanyContext: async (_companyId, cb) => quotesDb.withCompanyContext(cb),
    queryWithCompanyContext: async (_companyId, sql, params) => quotesDb.queryWithCompanyContext(sql, params),
    clearReadQueryCache: () => {},
  },
  "@/lib/order-pricing": orderPricing,
  "@/lib/product-pricing-sql": { dynamicPriceSqlExpression: () => "0", productMarginCodeExpression: () => "'x'" },
  "@/lib/receipt-types": receiptTypes,
  "@/lib/request-body": requestBody,
  "@/lib/deliveries": { createCommercialRemittanceForSale: async () => ({ id: "r", number: "R-1" }) },
  "@/lib/vat-calculation": vatCalculation,
};
const quotes = loadTypeScriptModule("../src/lib/quotes.ts", aliases);

// getQuote lee via queryWithCompanyContext; devolvemos una fila con los campos nuevos.
function getQuoteRow(extra = {}) {
  return {
    id: "q1", client_id: "c1", quote_number: "P-0001", fecha_emision: "2026-08-14",
    fecha_vencimiento: "2026-08-29", cliente_nombre: "ACME", cliente_razon_social: "ACME SA",
    cliente_domicilio: "Calle 1", cliente_telefono: "11", cliente_cond_iva: "RI", cliente_cuit: "30111111118",
    total: "2420", active_price_list: 2, price_list_name: "L2 - ANCLA", discount_percent: "0",
    net_amount: "2000", discount_amount: "0", subtotal_amount: "2000", include_vat: true, vat_rate: "21",
    desired_document: "factura_a", vat_amount: "420", validity_days: 15, productos_json: [], estado: "pendiente",
    creado_por: "juan", created_at: "2026-08-14", dias_restantes: 15,
    seller_id: "s1", visible_to_all: false, ...extra,
  };
}

test("mapQuote (via getQuote) expone sellerId y visibleToAll", async () => {
  quotesDb.queryWithCompanyContext = async () => ({ rows: [getQuoteRow({ visible_to_all: true, seller_id: "s9" })], rowCount: 1 });
  const q = await quotes.getQuote(1, "q1");
  assert.equal(q.sellerId, "s9");
  assert.equal(q.visibleToAll, true);
});
```

- [ ] **Step 3: Correr y verificar que falla**

Run (desde `apps/web`): `node --test scripts/quote-assignment.test.mjs`
Expected: FAIL — `q.sellerId`/`q.visibleToAll` son `undefined`.

- [ ] **Step 4: Implementar en `quotes.ts`**

1. En el tipo del parámetro de `mapQuote` (donde está `creado_por: string | null;`), agregar:
```ts
  seller_id: string | null;
  visible_to_all: boolean;
```
2. En el objeto que devuelve `mapQuote` (cerca de `id: row.id,`), agregar:
```ts
    sellerId: row.seller_id ?? "",
    visibleToAll: Boolean(row.visible_to_all),
```
3. En `listQuotes` Y en `getQuote`, agregar al `SELECT` (después de `q.id::text,`):
```sql
             q.seller_id::text AS seller_id,
             q.visible_to_all,
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `node --test scripts/quote-assignment.test.mjs`
Expected: PASS (1 test).

- [ ] **Step 6: Registrar el test y correr la suite**

En `apps/web/package.json`, agregar `scripts/quote-assignment.test.mjs` al script `test`.
Run: `npm test` → sin fallas nuevas.

- [ ] **Step 7: Commit**
```bash
git add migrations/20260814180000_quotes_visible_to_all.sql apps/web/src/lib/quotes.ts apps/web/scripts/quote-assignment.test.mjs apps/web/package.json
git commit -m "feat(presupuestos): columna visible_to_all + mapQuote expone sellerId/visibleToAll"
```

---

## Task 2: `assignedSellerId` en input + `resolveQuoteAssignment` + `createQuote`

**Files:**
- Modify: `apps/web/src/lib/quotes.ts`
- Test: `apps/web/scripts/quote-assignment.test.mjs` (ampliar)

**Interfaces:**
- Consumes: `getQuote` mapping (Task 1).
- Produces:
  ```ts
  // QuoteInput gana:
  assignedSellerId: string; // "" = Todos; si no, uuid del vendedor
  export async function resolveQuoteAssignment(
    client: PoolClient, session: AuthSession, assignedSellerId: string,
  ): Promise<{ sellerId: string; visibleToAll: boolean }>;
  ```

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `apps/web/scripts/quote-assignment.test.mjs`:
```js
test("quoteInputFromBody lee assignedSellerId", () => {
  const withVendor = quotes.quoteInputFromBody({
    customerId: "28d84c33-122d-4480-a183-26da0dfd17f8",
    productsJson: JSON.stringify([{ productId: "28d84c33-122d-4480-a183-26da0dfd17f8", quantity: 1, unitPrice: 1000 }]),
    assignedSellerId: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(withVendor.assignedSellerId, "11111111-1111-4111-8111-111111111111");
  const withoutVendor = quotes.quoteInputFromBody({
    customerId: "28d84c33-122d-4480-a183-26da0dfd17f8",
    productsJson: JSON.stringify([{ productId: "28d84c33-122d-4480-a183-26da0dfd17f8", quantity: 1, unitPrice: 1000 }]),
  });
  assert.equal(withoutVendor.assignedSellerId, "");
});

test("resolveQuoteAssignment: vendedor valido -> asignado; invalido/'' -> Todos", async () => {
  const session = { companyId: 1, userId: "creator" };
  // vendedor valido: el SELECT de validacion devuelve una fila
  const okClient = { query: async () => ({ rows: [{ ok: 1 }] }) };
  const assigned = await quotes.resolveQuoteAssignment(okClient, session, "11111111-1111-4111-8111-111111111111");
  assert.deepEqual(assigned, { sellerId: "11111111-1111-4111-8111-111111111111", visibleToAll: false });
  // "" -> Todos (no consulta)
  const noClient = { query: async () => { throw new Error("no deberia consultar"); } };
  const all = await quotes.resolveQuoteAssignment(noClient, session, "");
  assert.deepEqual(all, { sellerId: "creator", visibleToAll: true });
  // uuid que no es vendedor: el SELECT devuelve vacio -> Todos
  const emptyClient = { query: async () => ({ rows: [] }) };
  const fallback = await quotes.resolveQuoteAssignment(emptyClient, session, "22222222-2222-4222-8222-222222222222");
  assert.deepEqual(fallback, { sellerId: "creator", visibleToAll: true });
});

test("createQuote inserta seller_id resuelto y visible_to_all", async () => {
  const writes = [];
  const client = {
    async query(sql, params) {
      writes.push({ sql, params });
      if (/FROM clients\s+WHERE id = \$1::uuid/i.test(sql)) {
        return { rows: [{ id: "c1", display_name: "ACME", legal_name: "ACME SA", tax_id: "30111111118",
          fiscal_condition: "RI", phone: "11", address: "Calle 1", price_list_name: "L2 - ANCLA",
          seller_name: "V", receipt_type: "Factura A" }], rowCount: 1 };
      }
      if (/FROM listas_precio/i.test(sql)) return { rows: [{ nombre: "L2 - ANCLA" }], rowCount: 1 };
      if (/WITH requested AS/i.test(sql)) {
        return { rows: [{ product_id: "p1", description: "P1", quantity: "1", discount: "0", unit_price: "1000", sort_order: 0 }], rowCount: 1 };
      }
      if (/pg_advisory_xact_lock/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/MAX\(substring\(quote_number/i.test(sql)) return { rows: [{ value: "1" }], rowCount: 1 };
      if (/INSERT INTO quotes/i.test(sql)) return { rows: [{ id: "newq" }], rowCount: 1 };
      if (/INSERT INTO quote_items/i.test(sql)) return { rows: [], rowCount: 1 };
      // vendedor valido para resolveQuoteAssignment
      if (/FROM usuario_empresa/i.test(sql)) return { rows: [{ ok: 1 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  };
  quotesDb.withCompanyContext = async (cb) => cb(client);
  quotesDb.queryWithCompanyContext = async () => ({ rows: [getQuoteRow()], rowCount: 1 }); // getQuote final
  const session = { companyId: 1, userId: "creator", username: "creator" };
  const input = quotes.quoteInputFromBody({
    customerId: "c1",
    productsJson: JSON.stringify([{ productId: "p1", quantity: 1, unitPrice: 1000 }]),
    assignedSellerId: "11111111-1111-4111-8111-111111111111",
  });
  await quotes.createQuote(session, input);
  const insert = writes.find((w) => /INSERT INTO quotes/i.test(w.sql));
  assert.match(insert.sql, /visible_to_all/i);
  // seller_id ($3) es el vendedor asignado, no el creador
  assert.equal(insert.params[2], "11111111-1111-4111-8111-111111111111");
  // ultimo param = visibleToAll false
  assert.equal(insert.params[insert.params.length - 1], false);
});
```
(El input de este test necesita `assignedSellerId` en `QuoteInput`, que llega en el Step siguiente. `getQuoteRow` viene de Task 1.)

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test scripts/quote-assignment.test.mjs`
Expected: FAIL — `assignedSellerId`/`resolveQuoteAssignment` no existen; el INSERT no tiene `visible_to_all`.

- [ ] **Step 3: Implementar en `quotes.ts`**

1. En el tipo `QuoteInput`, agregar `assignedSellerId: string;`.
2. En `quoteInputFromBody`, en el objeto de retorno, agregar:
```ts
    assignedSellerId: textField(body, "assignedSellerId"),
```
(`textField` ya está importado y usado en la función.)

3. Agregar el helper (cerca de `buildQuoteDraft`, y exportarlo). Reusar la constante de uuid del archivo (misma regex que usa `nestedUuid`):
```ts
const QUOTE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Resuelve a quién se asigna el presupuesto. Un vendedor válido de la empresa => solo
// ese vendedor lo ve. "" o un id inválido => visible para todos (y se conserva el creador).
export async function resolveQuoteAssignment(
  client: PoolClient,
  session: AuthSession,
  assignedSellerId: string,
): Promise<{ sellerId: string; visibleToAll: boolean }> {
  const candidate = (assignedSellerId ?? "").trim();
  if (candidate && QUOTE_UUID_RE.test(candidate)) {
    const result = await client.query(
      `
        SELECT 1
          FROM usuario_empresa ue
          JOIN profiles p ON p.id = ue.id_usuario
         WHERE ue.empresa_id = $1 AND ue.id_usuario = $2::uuid
           AND ue.activo = TRUE AND ue.role::text = 'vendedor'
         LIMIT 1
      `,
      [session.companyId, candidate],
    );
    if (result.rows[0]) return { sellerId: candidate, visibleToAll: false };
  }
  return { sellerId: session.userId, visibleToAll: true };
}
```
(`PoolClient` ya está importado en `quotes.ts`.)

4. En `createQuote`, dentro del `withCompanyContext`, después de `const draft = await buildQuoteDraft(client, session, input);` agregar:
```ts
    const assignment = await resolveQuoteAssignment(client, session, input.assignedSellerId);
```
5. En el `INSERT INTO quotes`, agregar `visible_to_all` al final de la lista de columnas (después de `empresa_id`) y `$23` al final de `VALUES`. En el array de params: reemplazar `session.userId` (3er elemento, el de `seller_id`) por `assignment.sellerId`, y agregar `assignment.visibleToAll` como último elemento (después de `session.companyId`). El bloque queda:
```ts
    const quoteResult = await client.query<{ id: string }>(
      `
        INSERT INTO quotes (
          quote_number, client_id, seller_id, status, total_amount,
          validity_days, include_vat, vat_rate, desired_document, active_price_list, price_list_name, discount_percent,
          net_amount, discount_amount, subtotal_amount, vat_amount,
          client_name, client_legal_name, client_document, client_fiscal_condition,
          client_phone, client_address, empresa_id, visible_to_all
        )
        VALUES (
          $1, $2::uuid, $3::uuid, 'pendiente', $4, $5, $6, $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
        )
        RETURNING id::text
      `,
      [
        quoteNumber,
        draft.customer.id,
        assignment.sellerId,
        draft.total,
        input.validityDays,
        true,
        draft.vatRate,
        draft.desiredDocument,
        priceListNumber(draft.priceListKey),
        draft.priceListName,
        input.discountPercent,
        draft.netAmount,
        draft.discountAmount,
        draft.subtotal,
        draft.vatAmount,
        draft.customer.display_name,
        draft.customer.legal_name ?? "",
        draft.customer.tax_id ?? "",
        draft.customer.fiscal_condition ?? "",
        draft.customer.phone ?? "",
        draft.customer.address ?? "",
        session.companyId,
        assignment.visibleToAll,
      ],
    );
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test scripts/quote-assignment.test.mjs`
Expected: PASS (todos los tests del archivo).

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/lib/quotes.ts apps/web/scripts/quote-assignment.test.mjs
git commit -m "feat(presupuestos): asignar vendedor al crear (resolveQuoteAssignment + visible_to_all)"
```

---

## Task 3: `updateQuote` asigna `seller_id` + `visible_to_all`

**Files:**
- Modify: `apps/web/src/lib/quotes.ts` (`updateQuote`)
- Test: `apps/web/scripts/quote-assignment.test.mjs` (ampliar)

**Interfaces:**
- Consumes: `resolveQuoteAssignment` (Task 2).

- [ ] **Step 1: Escribir el test que falla**

Agregar a `apps/web/scripts/quote-assignment.test.mjs`:
```js
test("updateQuote setea seller_id y visible_to_all segun la asignacion", async () => {
  const writes = [];
  const client = {
    async query(sql, params) {
      writes.push({ sql, params });
      if (/FROM quotes q[\s\S]*FOR UPDATE/i.test(sql)) return { rows: [{ id: "q1", status: "pendiente" }], rowCount: 1 };
      if (/FROM clients\s+WHERE id = \$1::uuid/i.test(sql)) {
        return { rows: [{ id: "c1", display_name: "ACME", legal_name: "ACME SA", tax_id: "30111111118",
          fiscal_condition: "RI", phone: "11", address: "Calle 1", price_list_name: "L2 - ANCLA",
          seller_name: "V", receipt_type: "Factura A" }], rowCount: 1 };
      }
      if (/FROM listas_precio/i.test(sql)) return { rows: [{ nombre: "L2 - ANCLA" }], rowCount: 1 };
      if (/WITH requested AS/i.test(sql)) {
        return { rows: [{ product_id: "p1", description: "P1", quantity: "1", discount: "0", unit_price: "1000", sort_order: 0 }], rowCount: 1 };
      }
      if (/FROM usuario_empresa/i.test(sql)) return { rows: [], rowCount: 0 }; // no vendedor -> Todos
      if (/^\s*UPDATE quotes/i.test(sql)) return { rows: [], rowCount: 1 };
      if (/DELETE FROM quote_items/i.test(sql)) return { rows: [], rowCount: 1 };
      if (/INSERT INTO quote_items/i.test(sql)) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  };
  quotesDb.withCompanyContext = async (cb) => cb(client);
  quotesDb.queryWithCompanyContext = async () => ({ rows: [getQuoteRow()], rowCount: 1 });
  const session = { companyId: 1, userId: "editor", username: "editor" };
  const input = quotes.quoteInputFromBody({
    customerId: "c1",
    productsJson: JSON.stringify([{ productId: "p1", quantity: 1, unitPrice: 1000 }]),
    assignedSellerId: "",
  });
  await quotes.updateQuote(session, "q1", input);
  const upd = writes.find((w) => /^\s*UPDATE quotes/i.test(w.sql));
  assert.match(upd.sql, /seller_id = \$\d+::uuid/i);
  assert.match(upd.sql, /visible_to_all = \$\d+/i);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test scripts/quote-assignment.test.mjs`
Expected: FAIL — el `UPDATE quotes` no setea `seller_id`/`visible_to_all`.

- [ ] **Step 3: Implementar en `updateQuote`**

Dentro del `withCompanyContext` de `updateQuote`, después de `const draft = await buildQuoteDraft(client, session, input);` agregar:
```ts
    const assignment = await resolveQuoteAssignment(client, session, input.assignedSellerId);
```
En el `UPDATE quotes ... SET`, agregar dos asignaciones antes de `updated_at = NOW()`:
```sql
            seller_id = $22::uuid,
            visible_to_all = $23,
            updated_at = NOW()
```
Y en el array de params del UPDATE, después de `session.companyId` (que es `$21`), agregar:
```ts
        assignment.sellerId,
        assignment.visibleToAll,
```
(Quedan: `... id ($20), session.companyId ($21), assignment.sellerId ($22), assignment.visibleToAll ($23)`. El `WHERE id = $20::uuid AND empresa_id = $21` no cambia.)

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test scripts/quote-assignment.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/lib/quotes.ts apps/web/scripts/quote-assignment.test.mjs
git commit -m "feat(presupuestos): updateQuote reasigna vendedor/visibilidad"
```

---

## Task 4: `getVendorQuotes` muestra los "Todos"

**Files:**
- Modify: `apps/web/src/lib/crm.ts` (`getVendorQuotes`)
- Test: `apps/web/scripts/quote-assignment.test.mjs` (ampliar; carga `crm.ts`)

**Interfaces:**
- Consumes: `quotes.visible_to_all` (Task 1).

- [ ] **Step 1: Escribir el test que falla**

Agregar a `apps/web/scripts/quote-assignment.test.mjs`:
```js
test("getVendorQuotes incluye OR visible_to_all en el filtro", async () => {
  const calls = [];
  const crm = loadTypeScriptModule("../src/lib/crm.ts", {
    "@/lib/api-response": { ApiError },
    "@/lib/crm-quotes": { classifyQuote: () => null, topQuoteClients: () => [] },
    "@/lib/db": { queryWithCompanyContext: async (_c, sql) => { calls.push(sql); return { rows: [] }; } },
    "@/lib/messages": { getCustomerFollowUp: async () => ({ groups: {} }) },
    "@/lib/order-status": { normalizedOrderStatusSql: () => "estado" },
    "@/lib/pricing": { listPriceListParameters: async () => [] },
    "@/lib/sales-source-sql": { canonicalSalesSourceSql: () => "true" },
    "@/lib/pagination": { parsePagination: () => ({ page: 1, pageSize: 25, offset: 0 }) },
    "@/lib/collections": { listSalesToCollectWhere: async () => [] },
  });
  await crm.getVendorQuotes({ companyId: 1, userId: "u", username: "juan", displayName: "Juan" });
  assert.ok(calls.some((sql) => /q\.visible_to_all = true/i.test(sql)));
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test scripts/quote-assignment.test.mjs`
Expected: FAIL — el SQL de `getVendorQuotes` no menciona `visible_to_all`.

- [ ] **Step 3: Implementar**

En `apps/web/src/lib/crm.ts`, dentro de `getVendorQuotes`, cambiar el `WHERE` del query:
```sql
        WHERE q.empresa_id = $1
          AND (UPPER(BTRIM(COALESCE(p.username, p.full_name, ''))) = ANY($2::text[])
               OR q.visible_to_all = true)
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test scripts/quote-assignment.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/lib/crm.ts apps/web/scripts/quote-assignment.test.mjs
git commit -m "feat(crm): getVendorQuotes muestra los presupuestos visibles para todos"
```

---

## Task 5: Selector "Asignar a" en `QuoteEntryFields`

**Files:**
- Modify: `apps/web/src/app/quotes/quote-entry-fields.tsx`
- Test: `apps/web/scripts/quotes-assign-wiring.test.mjs` (crear)
- Modify: `apps/web/package.json`

**Interfaces:**
- Produces: `QuoteEntryFields` gana prop `vendors: { id: string; name: string }[]` y, en `initialValues`, un campo opcional `assignedSellerId?: string`. Renderiza un `Select name="assignedSellerId"`.

- [ ] **Step 1: Escribir el test que falla**

Crear `apps/web/scripts/quotes-assign-wiring.test.mjs`:
```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("QuoteEntryFields tiene el selector Asignar a", () => {
  const src = read("../src/app/quotes/quote-entry-fields.tsx");
  assert.match(src, /vendors/);
  assert.match(src, /name="assignedSellerId"/);
  assert.match(src, /Todos los vendedores/);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test scripts/quotes-assign-wiring.test.mjs`
Expected: FAIL — no existen esos identificadores.

- [ ] **Step 3: Implementar en `quote-entry-fields.tsx`**

1. En `QuoteEntryFieldsProps`, agregar la prop y el campo de `initialValues`:
```tsx
  vendors: { id: string; name: string }[];
```
y dentro de `initialValues?: { ... }` agregar `assignedSellerId?: string;`.

2. En la firma del componente, agregar `vendors` a los parámetros destructurados. Agregar el estado:
```tsx
  const [assignedSellerId, setAssignedSellerId] = useState(initialValues?.assignedSellerId ?? "");
```

3. Renderizar el selector. En el grid superior (el `div` con `xl:grid-cols-[minmax(280px,1fr)_150px_210px]` que tiene Cliente/Vigencia/Comprobante), agregar una fila nueva justo DESPUÉS de ese `div` de cierre, un `Field` con el `Select`:
```tsx
      <Field htmlFor="quote-assigned-seller" label="Asignar a">
        <Select
          id="quote-assigned-seller"
          name="assignedSellerId"
          value={assignedSellerId}
          onChange={(event) => setAssignedSellerId(event.target.value)}
        >
          <option value="">Todos los vendedores</option>
          {assignedSellerId && !vendors.some((v) => v.id === assignedSellerId) ? (
            <option value={assignedSellerId}>Vendedor asignado</option>
          ) : null}
          {vendors.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
          ))}
        </Select>
      </Field>
```
(`Select` y `Field` ya están importados en el archivo.)

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test scripts/quotes-assign-wiring.test.mjs`
Expected: PASS.

- [ ] **Step 5: Registrar el test**

En `apps/web/package.json`, agregar `scripts/quotes-assign-wiring.test.mjs` al script `test`.
Run: `npm test` → sin fallas nuevas.

- [ ] **Step 6: Commit**
```bash
git add apps/web/src/app/quotes/quote-entry-fields.tsx apps/web/scripts/quotes-assign-wiring.test.mjs apps/web/package.json
git commit -m "feat(presupuestos): selector Asignar a en el formulario de presupuesto"
```

---

## Task 6: Pasar `vendors` desde las páginas + precarga en edición + mostrar asignación en la lista

**Files:**
- Modify: `apps/web/src/app/quotes/page.tsx`
- Modify: `apps/web/src/app/quotes/[id]/edit/page.tsx`
- Test: `apps/web/scripts/quotes-assign-wiring.test.mjs` (ampliar)

**Interfaces:**
- Consumes: `QuoteEntryFields` prop `vendors` (Task 5); `getQuote.sellerId`/`.visibleToAll` (Task 1); `listVendors` (`@/lib/imports`).

- [ ] **Step 1: Escribir el test que falla**

Agregar a `apps/web/scripts/quotes-assign-wiring.test.mjs`:
```js
test("la pagina de alta pasa vendors a QuoteEntryFields", () => {
  const src = read("../src/app/quotes/page.tsx");
  assert.match(src, /listVendors/);
  assert.match(src, /vendors=\{/);
});

test("la pagina de edicion pasa vendors y precarga assignedSellerId", () => {
  const src = read("../src/app/quotes/[id]/edit/page.tsx");
  assert.match(src, /listVendors/);
  assert.match(src, /vendors=\{/);
  assert.match(src, /assignedSellerId/);
});

test("la lista muestra el vendedor asignado o Todos", () => {
  const src = read("../src/app/quotes/page.tsx");
  assert.match(src, /visibleToAll/);
  assert.match(src, /Todos/);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test scripts/quotes-assign-wiring.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Modificar `/quotes/page.tsx`**

1. Import: `import { listVendors } from "@/lib/imports";`.
2. Agregar `listVendors` al `Promise.all` (junto a `getOrderFormData`), capturando `vendors`:
```tsx
  const [canCreateQuotes, canApproveQuotes, canEditQuotes, canDeleteQuotes, rawQuotes, quoteFormData, vendors] = await Promise.all([
    sessionAllows(session, [QUOTES_CREATE_PERMISSION]),
    sessionAllows(session, [QUOTES_APPROVE_PERMISSION]),
    sessionAllows(session, [{ resource: "presupuestos", action: "editar" }]),
    sessionAllows(session, [{ resource: "presupuestos", action: "cancelar" }]),
    listQuotes(session.companyId, status === "all" ? "" : status),
    getOrderFormData(session.companyId),
    listVendors(session.companyId),
  ]);
```
3. Pasar la prop al form:
```tsx
            <QuoteEntryFields
              clients={quoteFormData.clients}
              priceLists={quoteFormData.priceLists}
              products={quoteFormData.products}
              vendors={vendors}
            />
```
4. En la fila de la lista, debajo del `createdBy`, mostrar la asignación. Reemplazar:
```tsx
                      <div className="mt-1 text-xs text-[color:var(--muted)]">{quote.createdBy || "-"}</div>
```
por:
```tsx
                      <div className="mt-1 text-xs text-[color:var(--muted)]">{quote.createdBy || "-"}</div>
                      <div className="mt-0.5 text-xs text-[color:var(--muted)]">
                        Asignado a: {quote.visibleToAll ? "Todos" : quote.createdBy || "-"}
                      </div>
```
(`quote.visibleToAll` viene de `mapQuote` (Task 1). El nombre del vendedor asignado es `quote.createdBy`, que es `p.username` del `seller_id`.)

- [ ] **Step 4: Modificar `/quotes/[id]/edit/page.tsx`**

1. Import: `import { listVendors } from "@/lib/imports";`.
2. Cargar vendors (junto a `getOrderFormData`):
```tsx
  const [quoteFormData, vendors] = await Promise.all([
    getOrderFormData(session.companyId),
    listVendors(session.companyId),
  ]);
```
(Si hoy es `const quoteFormData = await getOrderFormData(session.companyId);`, reemplazar por el `Promise.all` de arriba.)
3. En `initialValues`, agregar:
```tsx
    assignedSellerId: quote.visibleToAll ? "" : (quote.sellerId ?? ""),
```
4. Pasar `vendors` al `<QuoteEntryFields ... vendors={vendors} />`.

- [ ] **Step 5: Correr y verificar que pasa + build**

Run: `node --test scripts/quotes-assign-wiring.test.mjs` → PASS.
Run: `npm run build` → build OK, rutas `/quotes` y `/quotes/[id]/edit` presentes, sin type errors.

- [ ] **Step 6: Commit**
```bash
git add apps/web/src/app/quotes/page.tsx "apps/web/src/app/quotes/[id]/edit/page.tsx" apps/web/scripts/quotes-assign-wiring.test.mjs
git commit -m "feat(presupuestos): selector de vendedor en alta/edicion + asignacion en la lista"
```

---

## Task 7: Aplicar migración a prod + verificación

**Files:** ninguno (operación).

- [ ] **Step 1: Suite completa + build**

Run (desde `apps/web`): `npm test` y `npm run build`
Expected: sin fallas nuevas (solo las ~11 pre-existentes); build OK.

- [ ] **Step 2: Aplicar la migración a prod (CON CONFIRMACIÓN DEL USUARIO)**

`quotes.visible_to_all` no existe en prod hasta correr la migración; el código nuevo la usa (INSERT/UPDATE/SELECT). Antes del merge/deploy, aplicar
`migrations/20260814180000_quotes_visible_to_all.sql` a la base de prod (Supabase). Es aditiva y segura (`ADD COLUMN IF NOT EXISTS ... DEFAULT false`).

**Parar y pedir confirmación al usuario** antes de correrla (es un cambio en prod). Correrla con el mecanismo del repo (script temporal que lee `apps/web/.env.local`, p. ej. copiar el runner a `apps/web/scripts/tmp-run-migration.mjs`, `node --env-file=apps/web/.env.local apps/web/scripts/tmp-run-migration.mjs migrations/20260814180000_quotes_visible_to_all.sql`, y borrarlo después). Verificar que la columna existe.

Nota de orden: conviene aplicar la migración **antes** de que el deploy con el código nuevo quede sirviendo (si el código corre contra una tabla sin la columna, el INSERT/SELECT falla). Coordinar: aplicar migración → luego merge/deploy.

- [ ] **Step 3: Verificación funcional (si hay entorno)**

Como admin: crear un presupuesto eligiendo un vendedor → ese vendedor lo ve en `/crm/presupuestos` y otros no. Crear uno con "Todos" → aparece para todos. Editar y reasignar. En `/quotes` se ve "Asignado a: X / Todos".

---

## Notas de decisiones (del spec)

- Default = Todos (`visible_to_all=true`, `seller_id=creador`). Vendedor válido → `visible_to_all=false`, `seller_id=vendedor`.
- Existentes quedan `visible_to_all=false` (comportamiento actual).
- El contador "Presupuestos vigentes" del Perfil NO se cambia (queda en los asignados al vendedor).
- Migración aditiva; aplicar a prod antes del deploy, con confirmación.
