# Editar y eliminar presupuestos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir editar presupuestos pendientes y eliminar presupuestos pendientes o rechazados desde `/quotes`, con recálculo completo de totales/IVA y sin tocar los aceptados.

**Architecture:** Se extrae la resolución de cliente/lista/productos/totales de `createQuote` a un helper `buildQuoteDraft` que comparten crear y el nuevo `updateQuote`. La edición reutiliza el componente client `QuoteEntryFields` precargado, en una página dedicada `/quotes/[id]/edit`. El borrado endurece `deleteQuote` con guard de estado dentro de una transacción. Nuevos server actions conectan UI y backend.

**Tech Stack:** Next.js (App Router, server actions), TypeScript, PostgreSQL (`pg`), `node --test` con transpile TS en memoria (`typescript`).

## Global Constraints

- Next.js de este repo tiene breaking changes: ante dudas de API, leer `node_modules/next/dist/docs/` antes de escribir (ver `apps/web/AGENTS.md`).
- Todo el trabajo es dentro de `apps/web`. Comandos de test se corren desde `apps/web`.
- Los tests nuevos se agregan al script `test` de `apps/web/package.json` (no hay descubrimiento automático).
- Multi-tenant: toda query filtra por `empresa_id`. Nunca interpolar input de usuario en SQL (usar parámetros `$n`).
- Estados de presupuesto: `pendiente`, `aceptada`, `rechazada`. Los `aceptada` tienen `converted_order_id` y NO se editan ni borran.
- Montos con helper `money()` / `vatAmountsFromNet()` existentes; IVA fijo 10,5% (remito) o 21% (factura A/B) derivado del `receipt_type` del cliente.
- Permisos: editar `presupuestos.editar`; eliminar `presupuestos.cancelar`.

---

## File Structure

- `apps/web/src/lib/quotes.ts` — MODIFICAR: extraer `buildQuoteDraft`, refactor `createQuote`, nuevo `updateQuote`, endurecer `deleteQuote`, agregar `validityDays` a `mapQuote`.
- `apps/web/src/app/quotes/actions.ts` — MODIFICAR: `updateQuoteAction`, `deleteQuoteAction`.
- `apps/web/src/lib/route-auth.ts` — MODIFICAR: `presupuestos.cancelar` al rol `jefe`; opcional constantes de permiso.
- `apps/web/src/app/quotes/quote-entry-fields.tsx` — MODIFICAR: props `initialValues`, `mode`, `quoteId` (retrocompatibles).
- `apps/web/src/app/quotes/[id]/edit/page.tsx` — CREAR: página de edición.
- `apps/web/src/app/quotes/quote-delete-button.tsx` — CREAR: botón client con overlay de confirmación.
- `apps/web/src/app/quotes/page.tsx` — MODIFICAR: botones Editar/Eliminar, flags de permiso, banners de éxito.
- `apps/web/scripts/quote-update.test.mjs` — CREAR: tests de `buildQuoteDraft` + `updateQuote`.
- `apps/web/scripts/quote-delete.test.mjs` — CREAR: tests del guard de `deleteQuote`.
- `apps/web/scripts/quotes-edit-wiring.test.mjs` — CREAR: tests de wiring (UI/actions/permiso).
- `apps/web/package.json` — MODIFICAR: registrar los 3 test nuevos.

---

## Task 1: Extraer `buildQuoteDraft` (refactor sin cambio de comportamiento)

**Files:**
- Modify: `apps/web/src/lib/quotes.ts` (función `createQuote`, ~494-671)
- Test: `apps/web/scripts/quote-update.test.mjs` (crear; se amplía en Task 2)
- Modify: `apps/web/package.json` (script `test`)

**Interfaces:**
- Produces:
  ```ts
  export type QuoteDraft = {
    customer: { id: string; display_name: string; legal_name: string | null;
      tax_id: string | null; fiscal_condition: string | null;
      phone: string | null; address: string | null };
    desiredDocument: SaleOrderDocument;   // ya importado en el archivo
    vatRate: SaleVatRate;                 // de "@/lib/vat-calculation"
    priceListKey: PriceListKey;
    priceListName: string;
    detail: { productId: string; description: string; quantity: number;
      discount: number; unitPrice: number; subtotal: number }[];
    netAmount: number; discountAmount: number; subtotal: number;
    vatAmount: number; total: number;
  };
  export async function buildQuoteDraft(
    client: PoolClient, session: AuthSession, input: QuoteInput,
  ): Promise<QuoteDraft>;
  ```
  `buildQuoteDraft` valida `input.customerId`, trae el cliente, `reactivateClientIfInactive`, deriva documento/IVA, resuelve lista y productos, y calcula montos. `SaleVatRate` ya se importa; agregar `SaleVatRate` al import existente de `@/lib/vat-calculation` si no está.

- [ ] **Step 1: Escribir el test que falla (buildQuoteDraft)**

Crear `apps/web/scripts/quote-update.test.mjs`:

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

const vatCalculation = loadTypeScriptModule("../src/lib/vat-calculation.ts");
const receiptTypes = loadTypeScriptModule("../src/lib/receipt-types.ts");
const requestBody = loadTypeScriptModule("../src/lib/request-body.ts", {
  "@/lib/api-response": { ApiError },
});
const orderPricing = loadTypeScriptModule("../src/lib/order-pricing.ts");

const dbState = { withCompanyContext: null };
const aliases = {
  "@/lib/api-response": { ApiError },
  "@/lib/client-reactivation": { reactivateClientIfInactive: async () => {} },
  "@/lib/db": {
    withCompanyContext: async (_companyId, cb) => dbState.withCompanyContext(cb),
    queryWithCompanyContext: async () => ({ rows: [], rowCount: 0 }),
    clearReadQueryCache: () => {},
  },
  "@/lib/order-pricing": orderPricing,
  "@/lib/product-pricing-sql": {
    dynamicPriceSqlExpression: () => "0",
    productMarginCodeExpression: () => "'x'",
  },
  "@/lib/receipt-types": receiptTypes,
  "@/lib/request-body": requestBody,
  "@/lib/deliveries": { createCommercialRemittanceForSale: async () => ({ id: "r", number: "R-1" }) },
  "@/lib/vat-calculation": vatCalculation,
};

const quotes = loadTypeScriptModule("../src/lib/quotes.ts", aliases);

// Mock client: responde a las 3 queries de buildQuoteDraft.
function draftClient() {
  const writes = [];
  return {
    writes,
    async query(sql, params) {
      writes.push({ sql, params });
      if (/FROM clients\s+WHERE id = \$1::uuid/i.test(sql)) {
        return { rows: [{ id: "c1", display_name: "ACME", legal_name: "ACME SA",
          tax_id: "30111111118", fiscal_condition: "RI", phone: "11", address: "Calle 1",
          price_list_name: "L2 - ANCLA", seller_name: "Vend", receipt_type: "Factura A" }], rowCount: 1 };
      }
      if (/FROM listas_precio/i.test(sql)) {
        return { rows: [{ nombre: "L2 - ANCLA" }], rowCount: 1 };
      }
      if (/WITH requested AS/i.test(sql)) {
        return { rows: [{ product_id: "p1", description: "Prod 1", quantity: "2",
          discount: "0", unit_price: "1000", sort_order: 0 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

const baseInput = {
  customerId: "c1",
  customer: {},
  products: [{ id: "p1", name: "Prod 1", quantity: 2, unitPrice: 1000, discount: 0, netUnitPrice: 1000, subtotal: 2000 }],
  discountPercent: 0,
  activePriceList: 2,
  priceListOverride: "",
  validityDays: 15,
};

test("buildQuoteDraft resuelve cliente, IVA y totales (Factura A, 21%)", async () => {
  const client = draftClient();
  const session = { companyId: 1, userId: "u1", username: "user" };
  const draft = await quotes.buildQuoteDraft(client, session, baseInput);
  assert.equal(draft.desiredDocument, "factura_a");
  assert.equal(draft.vatRate, 21);
  assert.equal(draft.netAmount, 2000);
  assert.equal(draft.subtotal, 2000);
  assert.equal(draft.vatAmount, 420);
  assert.equal(draft.total, 2420);
  assert.equal(draft.detail.length, 1);
  assert.equal(draft.customer.id, "c1");
});

test("buildQuoteDraft rechaza sin cliente", async () => {
  const client = draftClient();
  const session = { companyId: 1, userId: "u1", username: "user" };
  await assert.rejects(
    () => quotes.buildQuoteDraft(client, session, { ...baseInput, customerId: "" }),
    (e) => e.status === 400,
  );
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run (desde `apps/web`): `node --test scripts/quote-update.test.mjs`
Expected: FAIL — `quotes.buildQuoteDraft is not a function`.

- [ ] **Step 3: Extraer `buildQuoteDraft` y refactorizar `createQuote`**

En `apps/web/src/lib/quotes.ts`:

1. Asegurar el import de tipo: en la línea `import { ... type SaleVatRate, ... } from "@/lib/vat-calculation";` ya está `SaleVatRate`. Confirmar que `PriceListKey` está importado desde `@/lib/order-pricing` (sí lo está).

2. Agregar el tipo y la función ANTES de `createQuote` (mover el bloque que hoy vive dentro de `createQuote`):

```ts
export type QuoteDraft = {
  customer: {
    id: string; display_name: string; legal_name: string | null;
    tax_id: string | null; fiscal_condition: string | null;
    phone: string | null; address: string | null;
  };
  desiredDocument: SaleOrderDocument;
  vatRate: SaleVatRate;
  priceListKey: PriceListKey;
  priceListName: string;
  detail: {
    productId: string; description: string; quantity: number;
    discount: number; unitPrice: number; subtotal: number;
  }[];
  netAmount: number; discountAmount: number; subtotal: number;
  vatAmount: number; total: number;
};

export async function buildQuoteDraft(
  client: PoolClient,
  session: AuthSession,
  input: QuoteInput,
): Promise<QuoteDraft> {
  if (!input.customerId) {
    throw new ApiError(
      400,
      "Selecciona un cliente registrado con comprobante configurado para crear el presupuesto.",
    );
  }
  type QuoteClientRow = {
    id: string | null; display_name: string; legal_name: string | null;
    tax_id: string | null; fiscal_condition: string | null; phone: string | null;
    address: string | null; price_list_name: string | null;
    seller_name: string | null; receipt_type: string | null;
  };
  const customerResult = await client.query<QuoteClientRow>(
    `
      SELECT id::text, display_name, legal_name, tax_id, fiscal_condition,
             phone, address, price_list_name, seller_name, receipt_type
      FROM clients
      WHERE id = $1::uuid AND empresa_id = $2
      LIMIT 1
    `,
    [input.customerId, session.companyId],
  );
  const customer = customerResult.rows[0];
  if (!customer) throw new ApiError(404, "Cliente no encontrado");
  await reactivateClientIfInactive(client, session.companyId, input.customerId);
  const desiredDocument = saleOrderDocument(customer.receipt_type);
  const vatRate = saleVatRateForDocument(customer.receipt_type);
  if (!desiredDocument || !vatRate) {
    throw new ApiError(
      400,
      "El cliente no tiene un comprobante valido. Configuralo como Remito, Factura A o Factura B antes de crear el presupuesto.",
    );
  }
  const activePriceLists = await getActivePriceListNames(client, session.companyId);
  const priceListName = resolvePriceListName(
    input.priceListOverride || customer.price_list_name || priceListNameFromNumber(input.activePriceList),
    activePriceLists,
  );
  const priceListKey = normalizePriceListKey(priceListName);
  const allProductsHaveIds = input.products.every((product) => Boolean(product.id));
  const detail = allProductsHaveIds
    ? await resolveQuoteProductsFromCatalog(client, session.companyId, input.products, priceListKey, priceListName)
    : input.products.map((product) => {
        const unitPrice = money(Number(product.unitPrice ?? 0));
        if (unitPrice <= 0) {
          throw new ApiError(400, `El producto ${product.name || product.id || ""} no tiene precio`);
        }
        return {
          productId: product.id,
          description: product.name || `Producto ${product.id || ""}`.trim(),
          quantity: product.quantity,
          discount: product.discount,
          unitPrice,
          subtotal: lineSubtotal(unitPrice, product.quantity, product.discount),
        };
      });
  const netAmount = money(detail.reduce((sum, product) => sum + product.subtotal, 0));
  const discountAmount = money((netAmount * input.discountPercent) / 100);
  const subtotal = money(netAmount - discountAmount);
  const calculatedTotals = vatAmountsFromNet(subtotal, vatRate);
  const vatAmount = calculatedTotals.vat;
  const total = calculatedTotals.total;
  if (total <= 0) throw new ApiError(400, "El presupuesto no tiene importe calculable");
  return {
    customer: {
      id: customer.id ?? input.customerId,
      display_name: customer.display_name,
      legal_name: customer.legal_name,
      tax_id: customer.tax_id,
      fiscal_condition: customer.fiscal_condition,
      phone: customer.phone,
      address: customer.address,
    },
    desiredDocument, vatRate, priceListKey, priceListName, detail,
    netAmount, discountAmount, subtotal, vatAmount, total,
  };
}
```

3. Reemplazar el cuerpo de `createQuote` para usar el draft. La función queda:

```ts
export async function createQuote(session: AuthSession, input: QuoteInput) {
  const quoteId = await withCompanyContext(session.companyId, async (client) => {
    const draft = await buildQuoteDraft(client, session, input);

    await client.query("SELECT pg_advisory_xact_lock(83011, $1::int)", [session.companyId]);
    const sequence = await client.query<{ value: string }>(
      `
        SELECT (COALESCE(MAX(substring(quote_number FROM '^P-([0-9]+)$')::bigint), 0) + 1)::text AS value
        FROM quotes
        WHERE empresa_id = $1 AND quote_number ~ '^P-[0-9]+$'
      `,
      [session.companyId],
    );
    const commercialNumber = Number(sequence.rows[0]?.value ?? 1);
    const quoteNumber = `P-${String(commercialNumber).padStart(4, "0")}`;

    const quoteResult = await client.query<{ id: string }>(
      `
        INSERT INTO quotes (
          quote_number, client_id, seller_id, status, total_amount,
          validity_days, include_vat, vat_rate, desired_document, active_price_list, price_list_name, discount_percent,
          net_amount, discount_amount, subtotal_amount, vat_amount,
          client_name, client_legal_name, client_document, client_fiscal_condition,
          client_phone, client_address, empresa_id
        )
        VALUES (
          $1, $2::uuid, $3::uuid, 'pendiente', $4, $5, $6, $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
        )
        RETURNING id::text
      `,
      [
        quoteNumber,
        draft.customer.id,
        session.userId,
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
      ],
    );
    const newQuoteId = quoteResult.rows[0].id;

    for (const product of draft.detail) {
      await client.query(
        `
          INSERT INTO quote_items (
            quote_id, product_id, description, quantity, unit_price, discount, total_amount, empresa_id
          )
          VALUES ($1::uuid, NULLIF($2, '')::uuid, $3, $4, $5, $6, $7, $8)
        `,
        [
          newQuoteId,
          product.productId,
          product.description,
          product.quantity,
          product.unitPrice,
          product.discount,
          product.subtotal,
          session.companyId,
        ],
      );
    }
    return newQuoteId;
  });

  clearReadQueryCache();
  return getQuote(session.companyId, quoteId);
}
```

Borrar del cuerpo viejo de `createQuote` todo lo que se movió a `buildQuoteDraft` (la resolución de cliente, lista, productos y montos), dejando solo lo de arriba.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node --test scripts/quote-update.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Registrar el test en package.json y correr la suite**

En `apps/web/package.json`, agregar `scripts/quote-update.test.mjs` al final de la lista del script `test` (antes del cierre de comillas).

Run: `npm test`
Expected: PASS (incluye el nuevo archivo, sin romper los existentes).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/quotes.ts apps/web/scripts/quote-update.test.mjs apps/web/package.json
git commit -m "refactor(presupuestos): extraer buildQuoteDraft compartido por crear/editar"
```

---

## Task 2: `updateQuote` + `validityDays` en `mapQuote`

**Files:**
- Modify: `apps/web/src/lib/quotes.ts` (`mapQuote`, `listQuotes`, `getQuote`, nuevo `updateQuote`)
- Test: `apps/web/scripts/quote-update.test.mjs` (ampliar)

**Interfaces:**
- Consumes: `buildQuoteDraft` (Task 1).
- Produces:
  ```ts
  export async function updateQuote(
    session: AuthSession, id: string, input: QuoteInput,
  ): Promise<ReturnType<typeof mapQuote>>;
  ```
  `mapQuote` gana el campo `validityDays: number`.

- [ ] **Step 1: Escribir el test que falla (updateQuote)**

Agregar a `apps/web/scripts/quote-update.test.mjs` (reusa `draftClient`, `baseInput`, `quotes`):

```js
// Cliente para updateQuote: agrega SELECT ... FOR UPDATE, UPDATE, DELETE items, INSERT items, y getQuote final.
function updateClient(status) {
  const base = draftClient();
  const inner = base.query;
  base.query = async (sql, params) => {
    base.writes.push({ sql, params });
    if (/FROM quotes q[\s\S]*FOR UPDATE/i.test(sql)) {
      return { rows: [{ id: "q1", status }], rowCount: 1 };
    }
    if (/^\s*UPDATE quotes/i.test(sql)) return { rows: [], rowCount: 1 };
    if (/DELETE FROM quote_items/i.test(sql)) return { rows: [], rowCount: 1 };
    if (/INSERT INTO quote_items/i.test(sql)) return { rows: [], rowCount: 1 };
    // getQuote() final (mapQuote): devolver una fila mínima válida.
    if (/FROM quotes q[\s\S]*LEFT JOIN clients/i.test(sql)) {
      return { rows: [{ id: "q1", quote_number: "P-0001", fecha_emision: "2026-08-13",
        fecha_vencimiento: "2026-08-28", cliente_nombre: "ACME", cliente_razon_social: "ACME SA",
        cliente_domicilio: "Calle 1", cliente_telefono: "11", cliente_cond_iva: "RI",
        cliente_cuit: "30111111118", total: "2420", active_price_list: 2, price_list_name: "L2 - ANCLA",
        discount_percent: "0", net_amount: "2000", discount_amount: "0", subtotal_amount: "2000",
        include_vat: true, vat_rate: "21", desired_document: "factura_a", vat_amount: "420",
        validity_days: 15, productos_json: [], estado: "pendiente", creado_por: "user",
        created_at: "2026-08-13", dias_restantes: 15 }], rowCount: 1 };
    }
    return inner(sql, params);
  };
  return base;
}

test("updateQuote recalcula y reemplaza items de un pendiente", async () => {
  const client = updateClient("pendiente");
  const session = { companyId: 1, userId: "u1", username: "user" };
  quotesDb.withCompanyContext = async (cb) => cb(client);
  const result = await quotes.updateQuote(session, "q1", baseInput);
  assert.equal(result.total, 2420);
  assert.ok(client.writes.some((w) => /^\s*UPDATE quotes/i.test(w.sql)));
  assert.ok(client.writes.some((w) => /DELETE FROM quote_items/i.test(w.sql)));
  assert.ok(client.writes.some((w) => /INSERT INTO quote_items/i.test(w.sql)));
  // No cambia el número ni el estado en el UPDATE:
  const upd = client.writes.find((w) => /^\s*UPDATE quotes/i.test(w.sql));
  assert.doesNotMatch(upd.sql, /quote_number\s*=/i);
  assert.doesNotMatch(upd.sql, /status\s*=/i);
});

test("updateQuote rechaza (409) un presupuesto no pendiente", async () => {
  const client = updateClient("aceptada");
  const session = { companyId: 1, userId: "u1", username: "user" };
  quotesDb.withCompanyContext = async (cb) => cb(client);
  await assert.rejects(() => quotes.updateQuote(session, "q1", baseInput), (e) => e.status === 409);
});
```

Y para poder inyectar `withCompanyContext` por test, cambiar la definición del alias `@/lib/db` (arriba en el archivo) por una que lea de un objeto mutable:

```js
const quotesDb = {
  withCompanyContext: async (cb) => cb(),
  queryWithCompanyContext: async () => ({ rows: [], rowCount: 0 }),
};
// dentro de `aliases`, reemplazar la entrada "@/lib/db" por:
"@/lib/db": {
  withCompanyContext: async (_companyId, cb) => quotesDb.withCompanyContext(cb),
  queryWithCompanyContext: async (_companyId, sql, params) => quotesDb.queryWithCompanyContext(sql, params),
  clearReadQueryCache: () => {},
},
```

(Eliminar el `dbState` previo y usar `quotesDb`. En el test de Task 1 `buildQuoteDraft` recibe el client directo, no usa `withCompanyContext`, así que no lo afecta.)

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node --test scripts/quote-update.test.mjs`
Expected: FAIL — `quotes.updateQuote is not a function`.

- [ ] **Step 3: Agregar `validityDays` a `mapQuote` + queries y escribir `updateQuote`**

En `apps/web/src/lib/quotes.ts`:

1. En el tipo del parámetro de `mapQuote`, agregar `validity_days: number;` y en el objeto de retorno agregar `validityDays: Number(row.validity_days),`.

2. En `listQuotes` y `getQuote`, agregar `q.validity_days,` al `SELECT` (después de `q.active_price_list,`).

3. Agregar `updateQuote` después de `createQuote`:

```ts
export async function updateQuote(session: AuthSession, id: string, input: QuoteInput) {
  const quoteId = await withCompanyContext(session.companyId, async (client) => {
    const existing = await client.query<{ id: string; status: string }>(
      `
        SELECT q.id::text, q.status
        FROM quotes q
        WHERE q.id = $1::uuid AND q.empresa_id = $2
        FOR UPDATE OF q
      `,
      [id, session.companyId],
    );
    const quote = existing.rows[0];
    if (!quote) throw new ApiError(404, "Presupuesto no encontrado");
    if (quote.status !== "pendiente") {
      throw new ApiError(409, "Solo se pueden editar presupuestos pendientes");
    }

    const draft = await buildQuoteDraft(client, session, input);

    await client.query(
      `
        UPDATE quotes
        SET client_id = $1::uuid,
            total_amount = $2,
            validity_days = $3,
            include_vat = $4,
            vat_rate = $5,
            desired_document = $6,
            active_price_list = $7,
            price_list_name = $8,
            discount_percent = $9,
            net_amount = $10,
            discount_amount = $11,
            subtotal_amount = $12,
            vat_amount = $13,
            client_name = $14,
            client_legal_name = $15,
            client_document = $16,
            client_fiscal_condition = $17,
            client_phone = $18,
            client_address = $19,
            updated_at = NOW()
        WHERE id = $20::uuid AND empresa_id = $21
      `,
      [
        draft.customer.id,
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
        id,
        session.companyId,
      ],
    );

    await client.query(`DELETE FROM quote_items WHERE quote_id = $1::uuid AND empresa_id = $2`, [id, session.companyId]);

    for (const product of draft.detail) {
      await client.query(
        `
          INSERT INTO quote_items (
            quote_id, product_id, description, quantity, unit_price, discount, total_amount, empresa_id
          )
          VALUES ($1::uuid, NULLIF($2, '')::uuid, $3, $4, $5, $6, $7, $8)
        `,
        [id, product.productId, product.description, product.quantity, product.unitPrice, product.discount, product.subtotal, session.companyId],
      );
    }
    return id;
  });

  clearReadQueryCache();
  return getQuote(session.companyId, quoteId);
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node --test scripts/quote-update.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/quotes.ts apps/web/scripts/quote-update.test.mjs
git commit -m "feat(presupuestos): updateQuote recalcula pendientes y expone validityDays"
```

---

## Task 3: Endurecer `deleteQuote` con guard de estado

**Files:**
- Modify: `apps/web/src/lib/quotes.ts` (`deleteQuote`, ~917-925)
- Test: `apps/web/scripts/quote-delete.test.mjs` (crear)
- Modify: `apps/web/package.json`

**Interfaces:**
- Produces: `deleteQuote(companyId: number, id: string): Promise<{ id: string }>` — ahora borra dentro de una transacción y solo si `status IN ('pendiente','rechazada')` y `converted_order_id IS NULL`.

- [ ] **Step 1: Escribir el test que falla**

Crear `apps/web/scripts/quote-delete.test.mjs`:

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

function makeClient(quoteRow) {
  const writes = [];
  return {
    writes,
    async query(sql, params) {
      writes.push({ sql, params });
      if (/SELECT[\s\S]*FROM quotes[\s\S]*FOR UPDATE/i.test(sql)) {
        return { rows: quoteRow ? [quoteRow] : [], rowCount: quoteRow ? 1 : 0 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}
function loadWith(client) {
  return loadTypeScriptModule("../src/lib/quotes.ts", {
    "@/lib/api-response": { ApiError },
    "@/lib/client-reactivation": { reactivateClientIfInactive: async () => {} },
    "@/lib/db": {
      withCompanyContext: async (_companyId, cb) => cb(client),
      queryWithCompanyContext: async () => ({ rows: [], rowCount: 0 }),
      clearReadQueryCache: () => {},
    },
    "@/lib/order-pricing": orderPricing,
    "@/lib/product-pricing-sql": { dynamicPriceSqlExpression: () => "0", productMarginCodeExpression: () => "'x'" },
    "@/lib/receipt-types": receiptTypes,
    "@/lib/request-body": requestBody,
    "@/lib/deliveries": { createCommercialRemittanceForSale: async () => ({ id: "r", number: "R-1" }) },
    "@/lib/vat-calculation": vatCalculation,
  });
}

test("deleteQuote borra un pendiente (items + quote)", async () => {
  const client = makeClient({ id: "q1", status: "pendiente", converted_order_id: null });
  const mod = loadWith(client);
  await mod.deleteQuote(1, "q1");
  assert.ok(client.writes.some((w) => /DELETE FROM quote_items/i.test(w.sql)));
  assert.ok(client.writes.some((w) => /DELETE FROM quotes/i.test(w.sql)));
});

test("deleteQuote borra un rechazado", async () => {
  const client = makeClient({ id: "q1", status: "rechazada", converted_order_id: null });
  const mod = loadWith(client);
  await mod.deleteQuote(1, "q1");
  assert.ok(client.writes.some((w) => /DELETE FROM quotes/i.test(w.sql)));
});

test("deleteQuote rechaza (409) un aceptado", async () => {
  const client = makeClient({ id: "q1", status: "aceptada", converted_order_id: "o1" });
  const mod = loadWith(client);
  await assert.rejects(() => mod.deleteQuote(1, "q1"), (e) => e.status === 409);
  assert.ok(!client.writes.some((w) => /DELETE FROM quotes/i.test(w.sql)));
});

test("deleteQuote 404 si no existe", async () => {
  const client = makeClient(null);
  const mod = loadWith(client);
  await assert.rejects(() => mod.deleteQuote(1, "q1"), (e) => e.status === 404);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node --test scripts/quote-delete.test.mjs`
Expected: FAIL — el `deleteQuote` actual usa `queryWithCompanyContext` (no `withCompanyContext`) y borra sin chequear estado, así que no hace el `SELECT ... FOR UPDATE` ni el `DELETE FROM quote_items` esperados.

- [ ] **Step 3: Reescribir `deleteQuote`**

Reemplazar la función en `apps/web/src/lib/quotes.ts` por:

```ts
export async function deleteQuote(companyId: number, id: string) {
  await withCompanyContext(companyId, async (client) => {
    const existing = await client.query<{ id: string; status: string; converted_order_id: string | null }>(
      `
        SELECT id::text, status, converted_order_id::text
        FROM quotes
        WHERE id = $1::uuid AND empresa_id = $2
        FOR UPDATE
      `,
      [id, companyId],
    );
    const quote = existing.rows[0];
    if (!quote) throw new ApiError(404, "Presupuesto no encontrado");
    if (quote.converted_order_id || (quote.status !== "pendiente" && quote.status !== "rechazada")) {
      throw new ApiError(409, "No se puede eliminar un presupuesto aceptado");
    }
    await client.query(`DELETE FROM quote_items WHERE quote_id = $1::uuid AND empresa_id = $2`, [id, companyId]);
    await client.query(`DELETE FROM quotes WHERE id = $1::uuid AND empresa_id = $2`, [id, companyId]);
  });
  clearReadQueryCache();
  return { id };
}
```

(Verificar que `withCompanyContext` y `clearReadQueryCache` ya están importados de `@/lib/db` — sí lo están.)

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node --test scripts/quote-delete.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Registrar en package.json y correr suite**

Agregar `scripts/quote-delete.test.mjs` al script `test` de `apps/web/package.json`.
Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/quotes.ts apps/web/scripts/quote-delete.test.mjs apps/web/package.json
git commit -m "feat(presupuestos): deleteQuote bloquea aceptados y borra en transaccion"
```

---

## Task 4: Server actions `updateQuoteAction` y `deleteQuoteAction` + permiso jefe

**Files:**
- Modify: `apps/web/src/app/quotes/actions.ts`
- Modify: `apps/web/src/lib/route-auth.ts` (agregar `presupuestos.cancelar` a `jefe`)
- Test: `apps/web/scripts/quotes-edit-wiring.test.mjs` (crear; se amplía en Tasks 6-8)
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: `updateQuote`, `deleteQuote` (Tasks 2-3), `quoteInputFromBody` (existente), `CreateQuoteState` (existente).
- Produces:
  ```ts
  export async function updateQuoteAction(prev: CreateQuoteState, formData: FormData): Promise<CreateQuoteState>;
  export async function deleteQuoteAction(formData: FormData): Promise<void>;
  ```

- [ ] **Step 1: Escribir el test que falla (wiring por lectura de fuente)**

Crear `apps/web/scripts/quotes-edit-wiring.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("actions expone updateQuoteAction y deleteQuoteAction con permisos correctos", () => {
  const src = read("../src/app/quotes/actions.ts");
  assert.match(src, /export async function updateQuoteAction/);
  assert.match(src, /export async function deleteQuoteAction/);
  assert.match(src, /updateQuote\(/);
  assert.match(src, /deleteQuote\(/);
  assert.match(src, /resource: "presupuestos", action: "editar"/);
  assert.match(src, /resource: "presupuestos", action: "cancelar"/);
  assert.match(src, /redirect\("\/quotes\?updated=1"\)/);
  assert.match(src, /redirect\("\/quotes\?deleted=1"\)/);
});

test("el rol jefe puede cancelar presupuestos", () => {
  const src = read("../src/lib/route-auth.ts");
  const jefeBlock = src.slice(src.indexOf("jefe: ["), src.indexOf("deposito:"));
  assert.match(jefeBlock, /"presupuestos\.cancelar"/);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node --test scripts/quotes-edit-wiring.test.mjs`
Expected: FAIL — las funciones y el permiso aún no existen.

- [ ] **Step 3: Implementar los actions y el permiso**

En `apps/web/src/app/quotes/actions.ts`:
1. En el import de `@/lib/quotes`, agregar `updateQuote` y `deleteQuote`:
   `import { acceptQuote, createQuote, deleteQuote, quoteInputFromBody, updateQuote } from "@/lib/quotes";`
2. Agregar al final del archivo:

```ts
export async function updateQuoteAction(
  _prev: CreateQuoteState,
  formData: FormData,
): Promise<CreateQuoteState> {
  const session = await requireApiSession([{ resource: "presupuestos", action: "editar" }]);
  const id = String(formData.get("quoteId") ?? "").trim();
  try {
    await updateQuote(session, id, quoteInputFromBody(Object.fromEntries(formData.entries())));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo actualizar el presupuesto" };
  }
  revalidatePath("/quotes");
  redirect("/quotes?updated=1");
}

export async function deleteQuoteAction(formData: FormData) {
  const session = await requireApiSession([{ resource: "presupuestos", action: "cancelar" }]);
  const id = String(formData.get("id") ?? "").trim();
  try {
    await deleteQuote(session.companyId, id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo eliminar el presupuesto";
    redirect(`/quotes?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/quotes");
  redirect("/quotes?deleted=1");
}
```

Nota: `redirect()` lanza `NEXT_REDIRECT`; en `updateQuoteAction` va fuera del `try/catch` (el catch solo captura errores de `updateQuote`). En `deleteQuoteAction`, como el redirect de éxito va después del `try`, y el de error dentro del `catch`, está bien porque el catch relanza vía redirect.

En `apps/web/src/lib/route-auth.ts`, en `LEGACY_ROLE_PERMISSIONS.jefe`, agregar `"presupuestos.cancelar",` justo después de `"presupuestos.editar",`.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node --test scripts/quotes-edit-wiring.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Registrar en package.json**

Agregar `scripts/quotes-edit-wiring.test.mjs` al script `test`.
Run: `npm test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/quotes/actions.ts apps/web/src/lib/route-auth.ts apps/web/scripts/quotes-edit-wiring.test.mjs apps/web/package.json
git commit -m "feat(presupuestos): actions de editar/eliminar y permiso cancelar para jefe"
```

---

## Task 5: `QuoteEntryFields` — modo edición con valores iniciales

**Files:**
- Modify: `apps/web/src/app/quotes/quote-entry-fields.tsx`
- Test: `apps/web/scripts/quotes-edit-wiring.test.mjs` (ampliar)

**Interfaces:**
- Produces: `QuoteEntryFields` acepta props opcionales
  ```ts
  initialValues?: {
    customerId: string; validityDays: string; priceListOverride: string;
    lines: { productId: string; quantity: string; discount: string }[];
  };
  mode?: "create" | "edit";
  quoteId?: string;
  ```
  Retrocompatible: sin props, comportamiento idéntico al actual.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `apps/web/scripts/quotes-edit-wiring.test.mjs`:

```js
test("QuoteEntryFields soporta modo edicion (initialValues, quoteId, boton Guardar)", () => {
  const src = read("../src/app/quotes/quote-entry-fields.tsx");
  assert.match(src, /initialValues\?/);
  assert.match(src, /mode\?:/);
  assert.match(src, /name="quoteId"/);
  assert.match(src, /Guardar cambios/);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node --test scripts/quotes-edit-wiring.test.mjs`
Expected: FAIL — los identificadores no existen.

- [ ] **Step 3: Implementar el modo edición**

En `apps/web/src/app/quotes/quote-entry-fields.tsx`:

1. Ampliar el type de props:

```tsx
type QuoteEntryFieldsProps = {
  clients: OrderFormClient[];
  priceLists: OrderFormPriceList[];
  products: OrderFormProduct[];
  initialValues?: {
    customerId: string;
    validityDays: string;
    priceListOverride: string;
    lines: { productId: string; quantity: string; discount: string }[];
  };
  mode?: "create" | "edit";
  quoteId?: string;
};
```

2. Firmar el componente con las nuevas props y usar los valores iniciales en el estado:

```tsx
export function QuoteEntryFields({ clients, priceLists, products, initialValues, mode = "create", quoteId }: QuoteEntryFieldsProps) {
  const isEdit = mode === "edit";
  const [customerId, setCustomerId] = useState(initialValues?.customerId ?? "");
  const [validityDays, setValidityDays] = useState(initialValues?.validityDays ?? "15");
  const [priceListOverride, setPriceListOverride] = useState(initialValues?.priceListOverride ?? "");
  const [draftLine, setDraftLine] = useState<QuoteLineDraft>(emptyLine());
  const [lines, setLines] = useState<QuoteLineState[]>(
    () => (initialValues?.lines ?? []).map((line, index) => ({ id: `quote-line-init-${index}`, ...line })),
  );
  // ...resto igual
```

Mantener `const lineIdRef = useRef(0);` — como las líneas iniciales usan ids `-init-`, no colisionan con los `quote-line-${lineIdRef.current++}` de nuevas altas.

3. Renderizar el `quoteId` oculto (junto a los otros hidden inputs al inicio del `return`):

```tsx
{isEdit && quoteId ? <input name="quoteId" type="hidden" value={quoteId} /> : null}
```

4. En la barra de acciones final (el `<div className="flex flex-col justify-end ...">`), en modo edición mostrar Guardar/Cancelar en vez de WhatsApp rápido/Crear. Reemplazar el bloque de botones por:

```tsx
<div className="flex flex-col justify-end gap-2 sm:flex-row sm:flex-wrap">
  {isEdit ? (
    <>
      <ButtonLink href="/quotes" variant="secondary">Cancelar</ButtonLink>
      <Button disabled={!customerReady || calculatedLines.length === 0} type="submit">
        Guardar cambios
      </Button>
    </>
  ) : (
    <>
      <Button
        aria-controls="quick-quote-whatsapp-editor"
        aria-expanded={isQuickQuoteMessageEditing}
        disabled={!canComposeQuickQuote}
        type="button"
        variant="secondary"
        onClick={() => setIsQuickQuoteMessageEditing((current) => !current)}
      >
        {isQuickQuoteMessageEditing ? "Ocultar mensaje" : "Editar mensaje"}
      </Button>
      {canSendQuickQuote ? (
        <ButtonLink href={quickQuoteHref} prefetch={false} rel="noreferrer" target="_blank" variant="outline">
          WhatsApp rapido
        </ButtonLink>
      ) : (
        <Button disabled type="button" variant="outline">WhatsApp rapido</Button>
      )}
      <Button disabled={!customerReady || calculatedLines.length === 0} type="submit">
        Crear presupuesto formal
      </Button>
    </>
  )}
</div>
```

`ButtonLink` ya está importado en el archivo.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node --test scripts/quotes-edit-wiring.test.mjs`
Expected: PASS.

- [ ] **Step 5: Verificar que el alta sigue intacta (regresión wiring existente)**

Run: `node --test scripts/order-quote-vat.test.mjs`
Expected: PASS (el test `order and quote forms expose ...` sigue verde: no se agregó `name="vatRate"`/`includeVat` ni `Cliente ocasional`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/quotes/quote-entry-fields.tsx apps/web/scripts/quotes-edit-wiring.test.mjs
git commit -m "feat(presupuestos): QuoteEntryFields con modo edicion precargado"
```

---

## Task 6: Página de edición `/quotes/[id]/edit`

**Files:**
- Create: `apps/web/src/app/quotes/[id]/edit/page.tsx`
- Test: `apps/web/scripts/quotes-edit-wiring.test.mjs` (ampliar)

**Interfaces:**
- Consumes: `getQuote`, `mapQuote.validityDays` (Task 2), `getOrderFormData`, `QuoteEntryForm`, `QuoteEntryFields` (Task 5), `updateQuoteAction` (Task 4), `QUOTES_READ`/`presupuestos.editar` permisos.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `apps/web/scripts/quotes-edit-wiring.test.mjs`:

```js
test("existe la pagina de edicion y usa updateQuoteAction en modo edit", () => {
  const src = read("../src/app/quotes/[id]/edit/page.tsx");
  assert.match(src, /updateQuoteAction/);
  assert.match(src, /mode="edit"/);
  assert.match(src, /initialValues=/);
  assert.match(src, /notFound|redirect\("\/quotes/); // no editable => fuera
  assert.match(src, /presupuestos.*editar|QUOTES_EDIT/s);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node --test scripts/quotes-edit-wiring.test.mjs`
Expected: FAIL — el archivo no existe.

- [ ] **Step 3: Crear la página**

Crear `apps/web/src/app/quotes/[id]/edit/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import { Card, PageHeader } from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { getOrderFormData } from "@/lib/orders";
import { getQuote } from "@/lib/quotes";
import { requirePagePermission } from "@/lib/page-auth";
import { updateQuoteAction } from "@/app/quotes/actions";
import { QuoteEntryFields } from "@/app/quotes/quote-entry-fields";
import { QuoteEntryForm } from "@/app/quotes/quote-entry-form";

type EditQuotePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditQuotePage({ params }: EditQuotePageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [{ resource: "presupuestos", action: "editar" }]);
  const { id } = await params;

  const quote = await getQuote(session.companyId, id).catch(() => null);
  if (!quote) redirect("/quotes?error=Presupuesto%20no%20encontrado");
  if (quote.status !== "pendiente") {
    redirect("/quotes?error=Solo%20se%20pueden%20editar%20presupuestos%20pendientes");
  }

  const quoteFormData = await getOrderFormData(session.companyId);

  const customerId =
    quoteFormData.clients.find((client) => client.name === quote.customer.name || client.taxId === quote.customer.taxId)?.id ?? "";

  const initialValues = {
    customerId,
    validityDays: String(quote.validityDays ?? 15),
    priceListOverride: quote.priceListName ?? "",
    lines: (Array.isArray(quote.products) ? quote.products : [])
      .filter((product) => Boolean(product?.id))
      .map((product) => ({
        productId: String(product.id),
        quantity: String(product.quantity ?? 1),
        discount: String(product.discount ?? 0),
      })),
  };

  return (
    <ModulePage active="sales" description="Editar presupuesto pendiente." session={session} title={`Editar ${quote.quoteNumber}`}>
      <div className="grid gap-5">
        <PageHeader description={`Presupuesto ${quote.quoteNumber}`} title="Editar presupuesto" />
        <Card>
          <QuoteEntryForm action={updateQuoteAction} className="grid gap-4 p-4">
            <QuoteEntryFields
              clients={quoteFormData.clients}
              initialValues={initialValues}
              mode="edit"
              priceLists={quoteFormData.priceLists}
              products={quoteFormData.products}
              quoteId={quote.id}
            />
          </QuoteEntryForm>
        </Card>
      </div>
    </ModulePage>
  );
}
```

Nota de scope: `getQuote` no devuelve el `client_id` crudo, así que el cliente inicial se resuelve por nombre/CUIT contra la lista de `getOrderFormData`. Es suficiente para el caso normal; si no matchea, el usuario reselecciona el cliente. (Mejora futura opcional: exponer `clientId` en `mapQuote`.)

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node --test scripts/quotes-edit-wiring.test.mjs`
Expected: PASS.

- [ ] **Step 5: Verificar tipos/lint del módulo tocado**

Run: `npx tsc --noEmit` (desde `apps/web`)
Expected: sin errores nuevos en `quotes.ts`, `actions.ts`, `edit/page.tsx`, `quote-entry-fields.tsx`.
(Si el repo no usa `tsc` directo, correr `npm run lint` y `npm run build` como verificación.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/quotes/[id]/edit/page.tsx apps/web/scripts/quotes-edit-wiring.test.mjs
git commit -m "feat(presupuestos): pagina de edicion /quotes/[id]/edit"
```

---

## Task 7: Botones Editar/Eliminar en la lista + confirmación + banners

**Files:**
- Create: `apps/web/src/app/quotes/quote-delete-button.tsx`
- Modify: `apps/web/src/app/quotes/page.tsx`
- Test: `apps/web/scripts/quotes-edit-wiring.test.mjs` (ampliar)

**Interfaces:**
- Consumes: `deleteQuoteAction` (Task 4), `sessionAllows`, permisos.
- Produces: `QuoteDeleteButton` client component:
  ```tsx
  export function QuoteDeleteButton(props: {
    quoteId: string; quoteNumber: string;
    action: (formData: FormData) => Promise<void>;
  }): JSX.Element;
  ```

- [ ] **Step 1: Escribir el test que falla**

Agregar a `apps/web/scripts/quotes-edit-wiring.test.mjs`:

```js
test("la lista de presupuestos ofrece Editar y Eliminar con guardas de estado y permiso", () => {
  const page = read("../src/app/quotes/page.tsx");
  assert.match(page, /\/quotes\/\$\{[^}]*\}\/edit|\/quotes\/\$\{quote\.id\}\/edit/);
  assert.match(page, /canEditQuotes/);
  assert.match(page, /canDeleteQuotes/);
  assert.match(page, /QuoteDeleteButton/);
  assert.match(page, /updated|deleted/); // banner de exito
  const del = read("../src/app/quotes/quote-delete-button.tsx");
  assert.match(del, /"use client"/);
  assert.match(del, /deleteQuoteAction|action/);
  assert.match(del, /name="id"/);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node --test scripts/quotes-edit-wiring.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Crear `QuoteDeleteButton`**

Crear `apps/web/src/app/quotes/quote-delete-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

type QuoteDeleteButtonProps = {
  quoteId: string;
  quoteNumber: string;
  action: (formData: FormData) => Promise<void>;
};

export function QuoteDeleteButton({ quoteId, quoteNumber, action }: QuoteDeleteButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className="w-full justify-center text-center" onClick={() => setOpen(true)} size="sm" type="button" variant="secondary">
        Eliminar
      </Button>
      {open ? (
        <div aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog">
          <button aria-label="Cerrar" className="absolute inset-0 cursor-default bg-black/40" onClick={() => setOpen(false)} type="button" />
          <div className="relative z-10 w-full max-w-md rounded-[12px] border border-[color:var(--border)] bg-[color:var(--panel)] p-5">
            <h2 className="erp-text-title-sm font-black">Eliminar presupuesto</h2>
            <p className="erp-text-body-sm mt-3">
              ¿Eliminar el presupuesto <strong>{quoteNumber}</strong>? Esta acción no se puede deshacer.
            </p>
            <form action={action} className="mt-4 flex justify-end gap-2" onSubmit={() => setOpen(false)}>
              <input name="id" type="hidden" value={quoteId} />
              <Button onClick={() => setOpen(false)} size="sm" type="button" variant="secondary">Cancelar</Button>
              <Button size="sm" type="submit">Eliminar</Button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
```

- [ ] **Step 4: Modificar la lista `page.tsx`**

En `apps/web/src/app/quotes/page.tsx`:

1. Imports:
   - `import { acceptQuoteAction, createQuoteAction, deleteQuoteAction } from "@/app/quotes/actions";`
   - `import { QuoteDeleteButton } from "@/app/quotes/quote-delete-button";`
   - En el import de `route-auth`, agregar nada nuevo (se usan objetos permiso inline).

2. En `searchParams` type, agregar `updated?: string; deleted?: string;`.

3. En el `Promise.all` de flags, agregar dos:

```tsx
const [canCreateQuotes, canApproveQuotes, canEditQuotes, canDeleteQuotes, rawQuotes, quoteFormData] = await Promise.all([
  sessionAllows(session, [QUOTES_CREATE_PERMISSION]),
  sessionAllows(session, [QUOTES_APPROVE_PERMISSION]),
  sessionAllows(session, [{ resource: "presupuestos", action: "editar" }]),
  sessionAllows(session, [{ resource: "presupuestos", action: "cancelar" }]),
  listQuotes(session.companyId, status === "all" ? "" : status),
  getOrderFormData(session.companyId),
]);
```

4. Banner de éxito, debajo del banner de `params.error`:

```tsx
{params.updated ? (
  <p className="rounded-lg border border-[color:var(--success)]/30 bg-white p-3 text-sm font-semibold text-[color:var(--success)]">
    Presupuesto actualizado.
  </p>
) : null}
{params.deleted ? (
  <p className="rounded-lg border border-[color:var(--success)]/30 bg-white p-3 text-sm font-semibold text-[color:var(--success)]">
    Presupuesto eliminado.
  </p>
) : null}
```

5. Dentro del `<div className="grid gap-1.5">` del menú Acciones, agregar Editar (solo pendiente) al inicio y Eliminar (pendiente/rechazada) al final:

```tsx
{quote.status === "pendiente" && canEditQuotes ? (
  <ButtonLink
    aria-label={`Editar presupuesto ${quote.quoteNumber}`}
    className={quoteActionClassName}
    href={`/quotes/${quote.id}/edit`}
    size="sm"
    variant="secondary"
  >
    Editar
  </ButtonLink>
) : null}
```

(...PDF, WhatsApp, Aprobar quedan igual...)

```tsx
{(quote.status === "pendiente" || quote.status === "rechazada") && canDeleteQuotes ? (
  <QuoteDeleteButton action={deleteQuoteAction} quoteId={quote.id} quoteNumber={quote.quoteNumber} />
) : null}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `node --test scripts/quotes-edit-wiring.test.mjs`
Expected: PASS.

- [ ] **Step 6: Suite completa**

Run: `npm test`
Expected: PASS (todos los archivos, incluidos los 3 nuevos).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/quotes/quote-delete-button.tsx apps/web/src/app/quotes/page.tsx apps/web/scripts/quotes-edit-wiring.test.mjs
git commit -m "feat(presupuestos): botones Editar/Eliminar con confirmacion en la lista"
```

---

## Task 8: Verificación en navegador y cierre

**Files:** ninguno (verificación).

- [ ] **Step 1: Build de producción**

Run (desde `apps/web`): `npm run build`
Expected: build sin errores; aparece la ruta `/quotes/[id]/edit`.

- [ ] **Step 2: Verificación manual en preview (si hay entorno con datos)**

Levantar dev server (`preview_start` con el dev de `apps/web`), loguearse, ir a `/quotes`:
- En un pendiente: menú Acciones muestra Editar + Eliminar. Editar abre `/quotes/[id]/edit` precargado; cambiar una cantidad y Guardar → vuelve a `/quotes?updated=1` con total nuevo.
- Eliminar en un pendiente/rechazado → confirma y vuelve con `?deleted=1`.
- En un aceptado: no aparecen Editar ni Eliminar.

Capturar screenshot del menú Acciones con las nuevas opciones.

- [ ] **Step 3: Commit final / push**

Solo si el usuario lo pide: `git push origin main` (Vercel auto-deploya `starlim.vercel.app`).

---

## Notas de decisiones (del spec)

- `aceptada` nunca editable ni borrable (tiene `converted_order_id`).
- Editar solo `pendiente`; eliminar `pendiente` + `rechazada`.
- Permisos: editar `presupuestos.editar` (admin+jefe); eliminar `presupuestos.cancelar` (admin + jefe nuevo).
- `buildQuoteDraft` unifica el cálculo de crear y editar (DRY, misma consistencia de IVA/lista/precios).
- Borrado en transacción con `DELETE FROM quote_items` explícito (no se asume `ON DELETE CASCADE`, no verificable desde el repo).
