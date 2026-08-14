# CRM Clientes (base de datos) + pestaña Cobros — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En el CRM de vendedores, convertir la pestaña Clientes en una base de datos de los clientes del vendedor (más el tablero de estados existente) y agregar una pestaña Cobros con la deuda de sus clientes y registro de cobros.

**Architecture:** Funciones nuevas en `crm.ts` que reusan/espejan la lógica existente (`listCustomers`, `listSalesToCollect`) filtrando por el vendedor logueado vía `sellerCandidates`. Los cobros del vendedor reusan `registerCollection` detrás de una acción CRM con guard de propiedad (`assertVendorOwnsSale`), gateada por `crm.ver` (sin el permiso global de cobranzas). Las páginas son server components que reusan `DataTable`/`RegisterCollectionDialog`/`PaginationLinks`.

**Tech Stack:** Next.js (App Router, server components + actions), TypeScript, PostgreSQL (`pg`), `node --test` con transpile TS en memoria.

## Global Constraints

- Next.js de este repo tiene breaking changes: ante dudas de API leer `node_modules/next/dist/docs/` y espejar páginas existentes (`apps/web/AGENTS.md`).
- Todo el trabajo es en `apps/web`. Tests se corren desde `apps/web`.
- Los tests nuevos se agregan al script `test` de `apps/web/package.json` (no hay descubrimiento automático).
- Multi-tenant: toda query filtra por `empresa_id`; parámetros `$n`, nunca interpolar input de usuario.
- Vínculo vendedor↔cliente por texto: `clients.seller_name` (propio) y `clients.assigned_seller` (a cargo). Usar `sellerCandidates(session)` (ya existe en `crm.ts`) para los nombres candidatos en MAYÚSCULAS.
- Ambas vistas gateadas por `CRM_READ_PERMISSION` (`crm.ver`) y auto-filtradas al vendedor. Sin permisos nuevos, sin tocar el rol `vendedor` ni la nav de "Cobros y pagos".
- El registro de cobros del vendedor reusa `registerCollection` (mismo flujo de aprobación) tras `assertVendorOwnsSale`.
- La suite completa tiene ~11 fallas PRE-EXISTENTES en `static.test.mjs`/`wsfe-vat.test.mjs`, sin relación con este trabajo — no tocarlas; solo confirmar que no se agregan fallas nuevas.

---

## File Structure

- `apps/web/src/lib/crm.ts` — MODIFICAR: `getVendorCustomers`, `getVendorCollections`, `assertVendorOwnsSale`; nuevos imports (`ApiError`, `parsePagination`, `listSalesToCollectWhere`).
- `apps/web/src/lib/collections.ts` — MODIFICAR: extraer `listSalesToCollectWhere` (refactor sin cambio de comportamiento; `listSalesToCollect` delega).
- `apps/web/src/app/crm/cobros/actions.ts` — CREAR: `registerCrmCollectionAction`.
- `apps/web/src/app/crm/cobros/page.tsx` — CREAR: página Cobros del CRM.
- `apps/web/src/lib/navigation.ts` — MODIFICAR: entrada `/crm/cobros`.
- `apps/web/src/app/crm/clientes/page.tsx` — MODIFICAR: sacar tira de perfil, agregar tabla DB, mantener tablero.
- `apps/web/scripts/crm-vendor.test.mjs` — CREAR: tests de libs.
- `apps/web/scripts/crm-vendor-wiring.test.mjs` — CREAR: tests de wiring.
- `apps/web/package.json` — MODIFICAR: registrar los 2 test nuevos.

---

## Task 1: `getVendorCustomers` en crm.ts

**Files:**
- Modify: `apps/web/src/lib/crm.ts`
- Test: `apps/web/scripts/crm-vendor.test.mjs` (crear)
- Modify: `apps/web/package.json`

**Interfaces:**
- Produces:
  ```ts
  export type VendorCustomer = {
    id: string; name: string; businessName: string; taxId: string; phone: string;
    city: string; province: string; priceList: string; status: string;
    relation: "propio" | "a cargo";
  };
  export async function getVendorCustomers(
    session: AuthSession,
    input?: { query?: string | null; page?: string | null; pageSize?: string | null },
  ): Promise<{ data: VendorCustomer[]; meta: { query: string; page: number; pageSize: number; total: number; totalPages: number } }>;
  ```

- [ ] **Step 1: Escribir el test que falla**

Crear `apps/web/scripts/crm-vendor.test.mjs`:

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

const parsePagination = loadTypeScriptModule("../src/lib/pagination.ts");

// Mock de @/lib/db que registra cada query y responde por regex.
const dbCalls = [];
let collectionsCall = null;
function makeCrm(queryImpl) {
  dbCalls.length = 0;
  collectionsCall = null;
  return loadTypeScriptModule("../src/lib/crm.ts", {
    "@/lib/api-response": { ApiError },
    "@/lib/crm-quotes": { classifyQuote: () => null, topQuoteClients: () => [] },
    "@/lib/db": {
      queryWithCompanyContext: async (companyId, sql, params) => {
        dbCalls.push({ sql, params });
        return queryImpl(sql, params);
      },
    },
    "@/lib/messages": { getCustomerFollowUp: async () => ({ groups: {} }) },
    "@/lib/order-status": { normalizedOrderStatusSql: () => "estado" },
    "@/lib/pricing": { listPriceListParameters: async () => [] },
    "@/lib/sales-source-sql": { canonicalSalesSourceSql: () => "true" },
    "@/lib/pagination": parsePagination,
    "@/lib/collections": {
      listSalesToCollectWhere: async (companyId, extraWhere, extraParams) => {
        collectionsCall = { companyId, extraWhere, extraParams };
        return [];
      },
    },
  });
}

const session = { companyId: 1, userId: "u1", username: "juan", displayName: "Juan Perez" };

test("getVendorCustomers filtra por vendedor (propio/a cargo), busca y pagina", async () => {
  const crm = makeCrm((sql) => {
    if (/COUNT\(\*\)/i.test(sql)) return { rows: [{ total: "2" }] };
    return {
      rows: [
        { id: "c1", display_name: "ACME", legal_name: "ACME SA", tax_id: "30111111118",
          fiscal_condition: "RI", phone: "11", locality: "CABA", province: "BA",
          price_list_name: "L2 - ANCLA", active: true, relation: "propio" },
        { id: "c2", display_name: "Beta", legal_name: "", tax_id: "", fiscal_condition: "",
          phone: "", locality: "", province: "", price_list_name: "", active: false, relation: "a cargo" },
      ],
    };
  });
  const result = await crm.getVendorCustomers(session, { query: "ac", page: "1" });
  // SQL de filas incluye filtro de vendedor + busqueda + LIMIT/OFFSET
  const rowsCall = dbCalls.find((c) => /CASE WHEN/i.test(c.sql));
  assert.match(rowsCall.sql, /assigned_seller/i);
  assert.match(rowsCall.sql, /seller_name/i);
  assert.match(rowsCall.sql, /ILIKE/i);
  assert.match(rowsCall.sql, /LIMIT \$\d+ OFFSET \$\d+/i);
  // names van como $2 (array en MAYUSCULAS)
  assert.ok(rowsCall.params[1].includes("JUAN"));
  // mapea relation y estado
  assert.equal(result.data[0].relation, "propio");
  assert.equal(result.data[0].status, "Activo");
  assert.equal(result.data[1].relation, "a cargo");
  assert.equal(result.data[1].status, "Inactivo");
  assert.equal(result.meta.total, 2);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run (desde `apps/web`): `node --test scripts/crm-vendor.test.mjs`
Expected: FAIL — `crm.getVendorCustomers is not a function`.

- [ ] **Step 3: Implementar `getVendorCustomers`**

En `apps/web/src/lib/crm.ts`:

1. Agregar el import arriba (junto a los existentes):
```ts
import { parsePagination } from "@/lib/pagination";
```
(Los imports de `ApiError` y `listSalesToCollectWhere` se agregan en Task 2, donde se usan.)

2. Agregar al final del archivo:
```ts
export type VendorCustomer = {
  id: string;
  name: string;
  businessName: string;
  taxId: string;
  phone: string;
  city: string;
  province: string;
  priceList: string;
  status: string;
  relation: "propio" | "a cargo";
};

// Base de datos de clientes del vendedor (propios ∪ a cargo). Espeja listCustomers
// (catalog.ts) pero acota al vendedor logueado y agrega la relacion.
export async function getVendorCustomers(
  session: AuthSession,
  input: { query?: string | null; page?: string | null; pageSize?: string | null } = {},
) {
  const names = sellerCandidates(session);
  const query = input.query?.trim() ?? "";
  const pagination = parsePagination(input);
  const params: unknown[] = [session.companyId, names];
  const sellerFilter =
    "(UPPER(BTRIM(COALESCE(seller_name,''))) = ANY($2::text[]) OR UPPER(BTRIM(COALESCE(assigned_seller,''))) = ANY($2::text[]))";
  const filters = ["empresa_id = $1", sellerFilter];
  if (query) {
    params.push(`%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
    const p = params.length;
    filters.push(
      `(display_name ILIKE $${p} ESCAPE '\\' OR legal_name ILIKE $${p} ESCAPE '\\' OR tax_id ILIKE $${p} ESCAPE '\\' OR phone ILIKE $${p} ESCAPE '\\')`,
    );
  }
  const where = filters.join(" AND ");

  const countResult = await queryWithCompanyContext<{ total: string }>(
    session.companyId,
    `SELECT COUNT(*)::text AS total FROM clients WHERE ${where}`,
    params,
  );

  params.push(pagination.pageSize, pagination.offset);
  const rows = await queryWithCompanyContext<{
    id: string;
    display_name: string;
    legal_name: string | null;
    tax_id: string | null;
    phone: string | null;
    locality: string | null;
    province: string | null;
    price_list_name: string | null;
    active: boolean;
    relation: "propio" | "a cargo";
  }>(
    session.companyId,
    `
      SELECT id::text AS id, display_name, legal_name, tax_id, phone,
             locality, province, price_list_name, active,
             CASE WHEN UPPER(BTRIM(COALESCE(seller_name,''))) = ANY($2::text[])
                  THEN 'propio' ELSE 'a cargo' END AS relation
        FROM clients
       WHERE ${where}
       ORDER BY display_name ASC, id ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );

  const total = Number.parseInt(countResult.rows[0]?.total ?? "0", 10);
  return {
    data: rows.rows.map((row) => ({
      id: row.id,
      name: row.display_name,
      businessName: row.legal_name ?? "",
      taxId: row.tax_id ?? "",
      phone: row.phone ?? "",
      city: row.locality ?? "",
      province: row.province ?? "",
      priceList: row.price_list_name ?? "",
      status: row.active ? "Activo" : "Inactivo",
      relation: row.relation,
    })),
    meta: {
      query,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
    },
  };
}
```

Nota: `getVendorCollections`/`assertVendorOwnsSale` llegan en Task 2 (con sus imports).

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node --test scripts/crm-vendor.test.mjs`
Expected: PASS (1 test).

- [ ] **Step 5: Registrar el test y correr la suite**

En `apps/web/package.json`, agregar `scripts/crm-vendor.test.mjs` al final de la lista del script `test`.
Run: `npm test`
Expected: los tests nuevos pasan; siguen las ~11 fallas pre-existentes, sin nuevas.

- [ ] **Step 6: Commit**
```bash
git add apps/web/src/lib/crm.ts apps/web/scripts/crm-vendor.test.mjs apps/web/package.json
git commit -m "feat(crm): getVendorCustomers (base de datos filtrada al vendedor)"
```

---

## Task 2: `listSalesToCollectWhere` + `getVendorCollections` + `assertVendorOwnsSale`

**Files:**
- Modify: `apps/web/src/lib/collections.ts` (extraer `listSalesToCollectWhere`)
- Modify: `apps/web/src/lib/crm.ts` (`getVendorCollections`, `assertVendorOwnsSale`)
- Test: `apps/web/scripts/crm-vendor.test.mjs` (ampliar)

**Interfaces:**
- Produces:
  ```ts
  // collections.ts
  export async function listSalesToCollectWhere(
    companyId: number, extraWhere?: string, extraParams?: unknown[],
  ): Promise<ReturnType<typeof listSalesToCollect> extends Promise<infer T> ? T : never>;
  // crm.ts
  export async function getVendorCollections(session: AuthSession): ReturnType<typeof listSalesToCollectWhere>;
  export async function assertVendorOwnsSale(session: AuthSession, saleId: string): Promise<void>;
  ```
- Consumes: `sellerCandidates` (existente).

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `apps/web/scripts/crm-vendor.test.mjs`:

```js
test("getVendorCollections delega en listSalesToCollectWhere con filtro de vendedor", async () => {
  const crm = makeCrm(() => ({ rows: [] }));
  await crm.getVendorCollections(session);
  assert.ok(collectionsCall, "debe llamar listSalesToCollectWhere");
  assert.match(collectionsCall.extraWhere, /cli\.seller_name/i);
  assert.match(collectionsCall.extraWhere, /cli\.assigned_seller/i);
  assert.ok(collectionsCall.extraParams[0].includes("JUAN"));
});

test("assertVendorOwnsSale lanza 403 si la venta no es de un cliente del vendedor", async () => {
  const crm = makeCrm(() => ({ rows: [] }));
  await assert.rejects(
    () => crm.assertVendorOwnsSale(session, "11111111-1111-1111-1111-111111111111"),
    (e) => e.status === 403,
  );
});

test("assertVendorOwnsSale pasa cuando la venta es de un cliente del vendedor", async () => {
  const crm = makeCrm(() => ({ rows: [{ ok: 1 }] }));
  await crm.assertVendorOwnsSale(session, "11111111-1111-1111-1111-111111111111");
  const call = dbCalls.find((c) => /FROM sales v/i.test(c.sql));
  assert.match(call.sql, /JOIN clients c/i);
  assert.match(call.sql, /assigned_seller/i);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test scripts/crm-vendor.test.mjs`
Expected: FAIL — `getVendorCollections`/`assertVendorOwnsSale` no existen (y `listSalesToCollectWhere` tampoco).

- [ ] **Step 3: Extraer `listSalesToCollectWhere` en collections.ts**

En `apps/web/src/lib/collections.ts`, reemplazar la función `listSalesToCollect` por un par que comparte el SELECT. El cuerpo del SELECT y el `.map(...)` son EXACTAMENTE los actuales; solo se parametriza el WHERE extra y los params:

```ts
export async function listSalesToCollectWhere(
  companyId: number,
  extraWhere = "",
  extraParams: unknown[] = [],
) {
  const result = await queryWithCompanyContext<{
    id: string;
    fecha: string | null;
    nro_comprobante: number;
    nombre_cliente: string;
    cuit_cliente: string;
    telefono_cliente: string;
    saldo: string;
    fecha_vencimiento: string | null;
    vencida: boolean;
    dias_atraso: number;
    comprobante_deseado: string;
    estado_cobro: string;
    cobro_monto_registrado: string;
    tiene_pdf_fiscal: boolean;
    remito_id: string | null;
  }>(
    companyId,
    `
      SELECT v.id::text AS id,
             v.sale_date::text AS fecha,
             COALESCE(v.receipt_number, nullif(regexp_replace(COALESCE(v.sale_number, ''), '\\D', '', 'g'), '')::bigint, 0)::int AS nro_comprobante,
             COALESCE(v.client_name, cli.display_name, '') AS nombre_cliente,
             COALESCE(cli.tax_id, v.client_document, '') AS cuit_cliente,
             COALESCE(cli.phone, '') AS telefono_cliente,
             GREATEST(COALESCE(v.total_amount, 0) + COALESCE(approved.debit_notes, 0) - COALESCE(approved.total_credit, 0), 0)::text AS saldo,
             (v.sale_date::date + COALESCE(v.source_payment_term_days, cli.payment_term_days, 0))::text AS fecha_vencimiento,
             (v.sale_date::date + COALESCE(v.source_payment_term_days, cli.payment_term_days, 0)) < CURRENT_DATE AS vencida,
             GREATEST(CURRENT_DATE - (v.sale_date::date + COALESCE(v.source_payment_term_days, cli.payment_term_days, 0)), 0)::int AS dias_atraso,
             COALESCE(v.desired_document, 'remito') AS comprobante_deseado,
             COALESCE(v.collection_status, 'pendiente') AS estado_cobro,
             COALESCE(v.collection_registered_amount, 0)::text AS cobro_monto_registrado,
             (COALESCE(v.fiscal_status, 'no_enviado') = 'aprobado'
               AND COALESCE(v.cae, '') NOT IN ('', 'manual')
               AND v.fiscal_point_of_sale IS NOT NULL
               AND v.fiscal_receipt_type IS NOT NULL
               AND v.fiscal_receipt_number IS NOT NULL) AS tiene_pdf_fiscal,
             remito.id AS remito_id
      FROM sales v
      LEFT JOIN clients cli ON cli.id = v.client_id AND cli.empresa_id = v.empresa_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(cam.credit), 0) AS total_credit,
               COALESCE(SUM(cam.debit) FILTER (WHERE cam.description ILIKE 'nota de debito%'), 0) AS debit_notes
        FROM current_account_movements cam
        WHERE cam.empresa_id = v.empresa_id AND cam.sale_id = v.id
      ) approved ON true
      LEFT JOIN LATERAL (
        SELECT dd.id::text AS id
        FROM delivery_documents dd
        WHERE dd.sale_id = v.id AND dd.empresa_id = v.empresa_id
        LIMIT 1
      ) remito ON true
      WHERE COALESCE(v.collection_status,'pendiente') IN ('pendiente','vencido','pendiente_aprobacion','en_proceso')
        AND v.empresa_id = $1
        AND ${canonicalSalesSourceSql("v")}
        AND ${normalizedOrderStatusSql("v")} = 'entregado'
        AND GREATEST(COALESCE(v.total_amount, 0) + COALESCE(approved.debit_notes, 0) - COALESCE(approved.total_credit, 0), 0) > 0.005
        ${extraWhere}
      ORDER BY v.sale_date DESC NULLS LAST, v.created_at DESC, v.id DESC
    `,
    [companyId, ...extraParams],
  );

  return result.rows.map((row) => ({
    id: row.id,
    date: row.fecha,
    receiptNumber: row.nro_comprobante,
    customerName: row.nombre_cliente,
    customerTaxId: row.cuit_cliente,
    phone: row.telefono_cliente,
    outstandingAmount: Number(row.saldo),
    dueDate: row.fecha_vencimiento,
    overdue: row.vencida,
    overdueDays: row.dias_atraso,
    desiredDocument: row.comprobante_deseado,
    collectionStatus: row.estado_cobro,
    registeredAmount: Number(row.cobro_monto_registrado),
    hasFiscalPdf: row.tiene_pdf_fiscal,
    deliveryDocumentId: row.remito_id,
  }));
}

export async function listSalesToCollect(companyId: number) {
  return listSalesToCollectWhere(companyId);
}
```

(Borrar la implementación anterior de `listSalesToCollect`. El `${extraWhere}` se inserta después del último `AND ... > 0.005` y antes del `ORDER BY`; con `extraWhere=""` el SQL es idéntico al actual.)

- [ ] **Step 4: Implementar `getVendorCollections` + `assertVendorOwnsSale` en crm.ts**

Primero agregar los imports arriba de `apps/web/src/lib/crm.ts` (junto a los existentes):
```ts
import { ApiError } from "@/lib/api-response";
import { listSalesToCollectWhere } from "@/lib/collections";
```
Luego agregar al final del archivo:
```ts
// Ventas a cobrar de los clientes del vendedor (propios ∪ a cargo). Reusa el
// SELECT canonico de collections.ts, acotando por el cliente (alias cli).
export async function getVendorCollections(session: AuthSession) {
  const names = sellerCandidates(session);
  return listSalesToCollectWhere(
    session.companyId,
    "AND (UPPER(BTRIM(COALESCE(cli.seller_name,''))) = ANY($2::text[]) OR UPPER(BTRIM(COALESCE(cli.assigned_seller,''))) = ANY($2::text[]))",
    [names],
  );
}

// Guard: la venta debe pertenecer a un cliente del vendedor, si no 403.
export async function assertVendorOwnsSale(session: AuthSession, saleId: string) {
  const names = sellerCandidates(session);
  const result = await queryWithCompanyContext<{ ok: number }>(
    session.companyId,
    `
      SELECT 1 AS ok
        FROM sales v
        JOIN clients c ON c.id = v.client_id AND c.empresa_id = v.empresa_id
       WHERE v.id = $1::uuid AND v.empresa_id = $2
         AND (UPPER(BTRIM(COALESCE(c.seller_name,''))) = ANY($3::text[])
              OR UPPER(BTRIM(COALESCE(c.assigned_seller,''))) = ANY($3::text[]))
       LIMIT 1
    `,
    [saleId, session.companyId, names],
  );
  if (!result.rows[0]) {
    throw new ApiError(403, "No podés registrar cobros de una venta que no es de tus clientes.");
  }
}
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `node --test scripts/crm-vendor.test.mjs`
Expected: PASS (4 tests en el archivo).

- [ ] **Step 6: Verificar que no se rompió collections**

Run: `node --test scripts/collections-final-total.test.mjs scripts/collection-methods.test.mjs`
Expected: PASS (el refactor de `listSalesToCollect` es sin cambio de comportamiento).

- [ ] **Step 7: Commit**
```bash
git add apps/web/src/lib/collections.ts apps/web/src/lib/crm.ts apps/web/scripts/crm-vendor.test.mjs
git commit -m "feat(crm): getVendorCollections + assertVendorOwnsSale (reusa listSalesToCollect)"
```

---

## Task 3: Acción `registerCrmCollectionAction`

**Files:**
- Create: `apps/web/src/app/crm/cobros/actions.ts`
- Test: `apps/web/scripts/crm-vendor-wiring.test.mjs` (crear)
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: `assertVendorOwnsSale` (Task 2), `registerCollection`/`collectionRegistrationFromBody` (existentes), `CRM_READ_PERMISSION`/`requireApiSession` (existentes), `uuidParam` (existente).
- Produces: `export async function registerCrmCollectionAction(formData: FormData): Promise<void>;`

- [ ] **Step 1: Escribir el test que falla**

Crear `apps/web/scripts/crm-vendor-wiring.test.mjs`:
```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("registerCrmCollectionAction gatea por crm.ver y verifica propiedad", () => {
  const src = read("../src/app/crm/cobros/actions.ts");
  assert.match(src, /export async function registerCrmCollectionAction/);
  assert.match(src, /CRM_READ_PERMISSION/);
  assert.match(src, /assertVendorOwnsSale/);
  assert.match(src, /registerCollection\(/);
  assert.doesNotMatch(src, /COLLECTIONS_CREATE_PERMISSION/); // no usa el permiso global
  assert.match(src, /revalidatePath\("\/crm\/cobros"\)/);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test scripts/crm-vendor-wiring.test.mjs`
Expected: FAIL — el archivo no existe.

- [ ] **Step 3: Crear la acción**

Crear `apps/web/src/app/crm/cobros/actions.ts`:
```ts
"use server";

import { revalidatePath } from "next/cache";
import { collectionRegistrationFromBody, registerCollection } from "@/lib/collections";
import { assertVendorOwnsSale } from "@/lib/crm";
import { uuidParam } from "@/lib/request-body";
import { CRM_READ_PERMISSION, requireApiSession } from "@/lib/route-auth";

export async function registerCrmCollectionAction(formData: FormData) {
  const session = await requireApiSession([CRM_READ_PERMISSION]);
  const id = uuidParam(String(formData.get("id") ?? ""), "Venta");
  await assertVendorOwnsSale(session, id);
  await registerCollection(
    session,
    id,
    collectionRegistrationFromBody(Object.fromEntries(formData.entries())),
  );
  revalidatePath("/crm/cobros");
  revalidatePath("/admin/approvals");
  revalidatePath("/treasury/current-accounts");
  revalidatePath("/metrics");
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test scripts/crm-vendor-wiring.test.mjs`
Expected: PASS (1 test).

- [ ] **Step 5: Registrar el test**

En `apps/web/package.json`, agregar `scripts/crm-vendor-wiring.test.mjs` al script `test`.
Run: `npm test` → sin fallas nuevas.

- [ ] **Step 6: Commit**
```bash
git add apps/web/src/app/crm/cobros/actions.ts apps/web/scripts/crm-vendor-wiring.test.mjs apps/web/package.json
git commit -m "feat(crm): accion registerCrmCollectionAction con guard de propiedad"
```

---

## Task 4: Página `/crm/cobros` + entrada en la nav

**Files:**
- Create: `apps/web/src/app/crm/cobros/page.tsx`
- Modify: `apps/web/src/lib/navigation.ts`
- Test: `apps/web/scripts/crm-vendor-wiring.test.mjs` (ampliar)

**Interfaces:**
- Consumes: `getVendorCollections` (Task 2), `registerCrmCollectionAction` (Task 3), `RegisterCollectionDialog`, `buildCollectionOrderMessage`, `normalizePhoneForWhatsapp`, `desiredDocumentLabel`, `localDateIso`, `sessionCanUseCrm`.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `apps/web/scripts/crm-vendor-wiring.test.mjs`:
```js
test("nav CRM incluye /crm/cobros con crm.ver", () => {
  const nav = read("../src/lib/navigation.ts");
  assert.match(nav, /href: "\/crm\/cobros"/);
  const line = nav.split("\n").find((l) => l.includes('"/crm/cobros"'));
  assert.match(line, /active: "crm"/);
  assert.match(line, /CRM_READ_PERMISSION/);
});

test("pagina /crm/cobros usa getVendorCollections y la accion CRM", () => {
  const src = read("../src/app/crm/cobros/page.tsx");
  assert.match(src, /getVendorCollections/);
  assert.match(src, /registerCrmCollectionAction/);
  assert.match(src, /RegisterCollectionDialog/);
  assert.match(src, /sessionCanUseCrm/);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test scripts/crm-vendor-wiring.test.mjs`
Expected: FAIL — nav sin `/crm/cobros`, página inexistente.

- [ ] **Step 3: Agregar la entrada de nav**

En `apps/web/src/lib/navigation.ts`, en el bloque CRM (después de la línea de `/crm/clientes`), agregar:
```ts
  { href: "/crm/cobros", label: "Cobros", active: "crm", permission: CRM_READ_PERMISSION },
```
(Queda: Perfil, Clientes, Cobros, Leads, Presupuestos, Listas.)

- [ ] **Step 4: Crear la página**

Crear `apps/web/src/app/crm/cobros/page.tsx` (espeja `/collections` con la lib y acción del CRM):
```tsx
import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import {
  Button,
  ButtonLink,
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
  StatCard,
  StatusBadge,
  Toolbar,
} from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { getVendorCollections } from "@/lib/crm";
import { buildCollectionOrderMessage } from "@/lib/collection-order";
import { formatCurrency, formatDate } from "@/lib/format";
import { normalizePhoneForWhatsapp } from "@/lib/order-confirmation";
import { desiredDocumentLabel } from "@/lib/receipt-types";
import { sessionCanUseCrm } from "@/lib/route-auth";
import { localDateIso } from "@/lib/timezone";
import { registerCrmCollectionAction } from "@/app/crm/cobros/actions";
import { RegisterCollectionDialog } from "@/app/collections/register-collection-dialog";

type CrmCobrosPageProps = {
  searchParams: Promise<{ q?: string }>;
};

type SaleToCollect = Awaited<ReturnType<typeof getVendorCollections>>[number];

const actionItemClass =
  "block w-full rounded-[6px] px-2.5 py-1.5 text-left text-xs font-semibold text-[#0f172a] transition-colors hover:bg-[color:var(--panel-subtle)] hover:text-[color:var(--accent-strong)]";

function matchesQuery(item: SaleToCollect, query: string) {
  if (!query) return true;
  return [item.customerName, item.customerTaxId, String(item.receiptNumber)]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function awaitingApproval(item: SaleToCollect) {
  return item.collectionStatus === "pendiente_aprobacion" || item.collectionStatus === "en_proceso";
}

function collectionOrderHref(item: SaleToCollect) {
  const phone = normalizePhoneForWhatsapp(item.phone);
  if (!phone) return null;
  const message = buildCollectionOrderMessage({
    customerName: item.customerName,
    documentLabel: desiredDocumentLabel(item.desiredDocument),
    receiptNumber: item.receiptNumber,
    amountLabel: formatCurrency(item.outstandingAmount),
    dueDateLabel: formatDate(item.dueDate),
    overdueDays: item.overdueDays,
  });
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export default async function CrmCobrosPage({ searchParams }: CrmCobrosPageProps) {
  const session = await requireStaffSession();
  if (!(await sessionCanUseCrm(session))) redirect("/");

  const params = await searchParams;
  const query = params.q?.trim().toLowerCase() ?? "";
  const allSales = await getVendorCollections(session);
  const sales = allSales.filter((item) => matchesQuery(item, query));
  const totalOutstanding = sales.reduce((sum, item) => sum + item.outstandingAmount, 0);
  const overdueSales = sales.filter((item) => item.overdue);
  const overdueAmount = overdueSales.reduce((sum, item) => sum + item.outstandingAmount, 0);
  const today = localDateIso();

  return (
    <ModulePage
      active="crm"
      description="Lo que te deben tus clientes, con vencimientos y registro de cobros."
      session={session}
      title="CRM · Cobros"
    >
      <div className="grid gap-5">
        <PageHeader
          title="Cobros de tus clientes"
          description="Ventas entregadas de tus clientes con saldo pendiente. Podés registrar el cobro (queda pendiente de aprobación)."
        />

        <Toolbar ariaLabel="Busqueda de cobros">
          <form action="/crm/cobros" className="grid w-full gap-3 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-end">
            <Field htmlFor="crm-cobros-query" label="Buscar">
              <Input
                defaultValue={params.q ?? ""}
                id="crm-cobros-query"
                name="q"
                placeholder="Cliente, CUIT o nro de comprobante"
                type="search"
              />
            </Field>
            <Button type="submit">Buscar</Button>
          </form>
        </Toolbar>

        <div className="grid gap-3 md:grid-cols-3">
          <StatCard className="p-3" detail="Sobre las ventas visibles" label="Saldo total a cobrar" value={formatCurrency(totalOutstanding)} />
          <StatCard className="p-3" detail={`${overdueSales.length} ventas vencidas`} label="Monto vencido" value={formatCurrency(overdueAmount)} />
          <StatCard className="p-3" detail="Con la busqueda actual" label="Ventas visibles" value={sales.length} />
        </div>

        <Card className="overflow-hidden">
          <DataTable
            caption="Ventas de tus clientes con saldo pendiente"
            className="rounded-none border-0 shadow-none"
            minWidth="1120px"
            tableLabel="Cobros del vendedor"
            tableProps={{ className: "table-fixed" }}
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead className="w-[9%] px-2">Fecha</DataTableHead>
                <DataTableHead className="w-[11%] px-2">Comprobante</DataTableHead>
                <DataTableHead className="w-[20%] px-2">Cliente</DataTableHead>
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
                      description="No hay ventas de tus clientes con saldo pendiente para la busqueda actual."
                      title="Sin cobros pendientes"
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                sales.map((item) => {
                  const pdfHref = item.hasFiscalPdf
                    ? `/api/pdfs/fiscal/sales/${item.id}`
                    : item.deliveryDocumentId
                      ? `/api/pdfs/deliveries/${item.deliveryDocumentId}`
                      : `/api/pdfs/orders/${item.id}/request`;
                  const orderHref = collectionOrderHref(item);
                  const receiptLabel = `${desiredDocumentLabel(item.desiredDocument)} #${String(item.receiptNumber).padStart(4, "0")}`;

                  return (
                    <DataTableRow key={item.id}>
                      <DataTableCell className="whitespace-nowrap px-2 py-2 text-xs">{formatDate(item.date)}</DataTableCell>
                      <DataTableCell className="px-2 py-2">
                        <span className="font-mono text-xs font-black">#{String(item.receiptNumber).padStart(4, "0")}</span>
                      </DataTableCell>
                      <DataTableCell className="truncate px-2 py-2 font-medium">{item.customerName || "Sin cliente"}</DataTableCell>
                      <DataTableCell className="truncate px-2 py-2 font-mono text-xs">{item.customerTaxId || "-"}</DataTableCell>
                      <DataTableCell align="right" className="whitespace-nowrap px-2 py-2 font-mono text-xs">{formatCurrency(item.outstandingAmount)}</DataTableCell>
                      <DataTableCell className="px-2 py-2">
                        <div className={`whitespace-nowrap text-xs ${item.overdue ? "font-black text-[color:var(--danger)]" : ""}`}>
                          {formatDate(item.dueDate)}
                        </div>
                        {item.overdue ? <StatusBadge className="mt-1" tone="danger">Vencida</StatusBadge> : null}
                      </DataTableCell>
                      <DataTableCell className="px-2 py-2">
                        <div className="grid justify-items-start gap-1.5">
                          <span className="truncate text-xs">{desiredDocumentLabel(item.desiredDocument)}</span>
                          <ButtonLink
                            aria-label={`Descargar PDF de ${receiptLabel}`}
                            className="shrink-0"
                            href={pdfHref}
                            prefetch={false}
                            rel="noreferrer"
                            size="sm"
                            target="_blank"
                            variant="secondary"
                          >
                            PDF
                          </ButtonLink>
                        </div>
                      </DataTableCell>
                      <DataTableCell className="px-2 py-2">
                        {awaitingApproval(item) ? (
                          <div className="min-w-0">
                            <StatusBadge tone="warning">En aprobacion</StatusBadge>
                            <div className="mt-1 text-[11px] text-[color:var(--muted)]">
                              {formatCurrency(item.registeredAmount)} registrado
                            </div>
                          </div>
                        ) : (
                          <details className="erp-action-menu">
                            <summary>Acciones</summary>
                            <div className="grid gap-0.5">
                              <RegisterCollectionDialog
                                action={registerCrmCollectionAction}
                                customerName={item.customerName}
                                outstandingAmount={item.outstandingAmount}
                                receiptLabel={receiptLabel}
                                saleId={item.id}
                                today={today}
                                triggerClassName={actionItemClass}
                              />
                              {orderHref ? (
                                <a
                                  aria-label={`Emitir orden de cobro por WhatsApp para ${receiptLabel}`}
                                  className={actionItemClass}
                                  href={orderHref}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  Emitir orden de cobro
                                </a>
                              ) : (
                                <span className="block px-2.5 py-1.5 text-xs text-[color:var(--muted)]">Sin telefono</span>
                              )}
                            </div>
                          </details>
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

- [ ] **Step 5: Correr y verificar que pasa**

Run: `node --test scripts/crm-vendor-wiring.test.mjs`
Expected: PASS.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: build OK, ruta `/crm/cobros` presente, sin type errors.

- [ ] **Step 7: Commit**
```bash
git add apps/web/src/app/crm/cobros/page.tsx apps/web/src/lib/navigation.ts apps/web/scripts/crm-vendor-wiring.test.mjs
git commit -m "feat(crm): pestaña Cobros con deuda de clientes del vendedor"
```

---

## Task 5: Rediseño de `/crm/clientes` (tabla DB + tablero, sin tira de perfil)

**Files:**
- Modify: `apps/web/src/app/crm/clientes/page.tsx`
- Test: `apps/web/scripts/crm-vendor-wiring.test.mjs` (ampliar)

**Interfaces:**
- Consumes: `getVendorCustomers` (Task 1), `getVendorClients` (existente), `ClientesDashboard` (existente), `agendarClienteAction` (existente), `PaginationLinks`, `DataTable`, `sessionCanUseCrm`.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `apps/web/scripts/crm-vendor-wiring.test.mjs`:
```js
test("pagina /crm/clientes es DB del vendedor: tabla + tablero, sin tira de perfil", () => {
  const src = read("../src/app/crm/clientes/page.tsx");
  assert.match(src, /getVendorCustomers/);
  assert.match(src, /ClientesDashboard/); // mantiene el tablero
  assert.match(src, /\/customers\/\$\{/); // linkea a la ficha
  assert.match(src, /PaginationLinks/);
  assert.doesNotMatch(src, /getVendorProfile/); // saca la tira de perfil
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test scripts/crm-vendor-wiring.test.mjs`
Expected: FAIL — la página aún usa `getVendorProfile` y no usa `getVendorCustomers`.

- [ ] **Step 3: Reescribir la página**

Reemplazar `apps/web/src/app/crm/clientes/page.tsx` por:
```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { ModulePage } from "@/components/module-page";
import { PaginationLinks } from "@/components/pagination-links";
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
  StatusBadge,
  Toolbar,
  type StatusBadgeTone,
} from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { getVendorClients, getVendorCustomers } from "@/lib/crm";
import { sessionCanUseCrm } from "@/lib/route-auth";
import { agendarClienteAction } from "@/app/crm/actions";
import { ClientesDashboard } from "@/app/crm/clientes/clientes-dashboard";

type CrmClientesPageProps = {
  searchParams: Promise<{ q?: string; page?: string }>;
};

function clientStatusTone(status: string): StatusBadgeTone {
  return status.trim().toLowerCase() === "activo" ? "success" : "neutral";
}

export default async function CrmClientesPage({ searchParams }: CrmClientesPageProps) {
  const session = await requireStaffSession();
  if (!(await sessionCanUseCrm(session))) redirect("/");

  const params = await searchParams;
  const [customers, { groups, counts, zonas }] = await Promise.all([
    getVendorCustomers(session, { query: params.q, page: params.page }),
    getVendorClients(session),
  ]);

  const enRiesgo = counts.riesgo ?? 0;
  const aRecontactar = counts.contactar ?? 0;
  const vendor = session.displayName || session.username || "vendedor";

  return (
    <ModulePage
      active="crm"
      description="Tu base de clientes y su seguimiento."
      session={session}
      title="CRM · Clientes"
    >
      <div className="grid gap-5">
        <PageHeader
          title={`Hola, ${vendor} 👋`}
          description={`Tenés ${enRiesgo} ${enRiesgo === 1 ? "cliente" : "clientes"} en riesgo y ${aRecontactar} para recontactar.`}
        />

        {/* Base de datos de tus clientes */}
        <Toolbar ariaLabel="Busqueda de clientes">
          <form action="/crm/clientes" className="grid w-full gap-3 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-end">
            <Field htmlFor="crm-clientes-query" label="Buscar">
              <Input
                defaultValue={customers.meta.query}
                id="crm-clientes-query"
                name="q"
                placeholder="Nombre, razon social, CUIT o telefono"
                type="search"
              />
            </Field>
            <Button type="submit">Buscar</Button>
          </form>
        </Toolbar>

        <Card className="overflow-hidden">
          <DataTable
            caption="Tus clientes (propios y a cargo)"
            className="rounded-none border-0 shadow-none"
            minWidth="960px"
            tableLabel="Clientes del vendedor"
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>Cliente</DataTableHead>
                <DataTableHead>CUIT</DataTableHead>
                <DataTableHead>Contacto</DataTableHead>
                <DataTableHead>Ubicacion</DataTableHead>
                <DataTableHead>Lista</DataTableHead>
                <DataTableHead>Relacion</DataTableHead>
                <DataTableHead>Estado</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {customers.data.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={7}>
                    <EmptyState
                      description={customers.meta.query
                        ? "Ajusta la busqueda para encontrar tus clientes."
                        : "Todavia no tenes clientes propios ni a cargo cargados."}
                      title={customers.meta.query ? "Sin resultados" : "Sin clientes asignados"}
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                customers.data.map((customer) => (
                  <DataTableRow key={customer.id}>
                    <DataTableCell>
                      <Link className="max-w-[260px] break-words font-medium text-[color:var(--accent)] hover:underline" href={`/customers/${customer.id}`}>
                        {customer.name || "Sin nombre"}
                      </Link>
                      <div className="mt-1 max-w-[260px] break-words text-xs text-[color:var(--muted)]">
                        {customer.businessName || `ID ${customer.id}`}
                      </div>
                    </DataTableCell>
                    <DataTableCell className="whitespace-nowrap font-mono text-xs">{customer.taxId || "-"}</DataTableCell>
                    <DataTableCell className="whitespace-nowrap">{customer.phone || "-"}</DataTableCell>
                    <DataTableCell className="text-[color:var(--muted)]">
                      <div className="max-w-[220px] break-words">
                        {[customer.city, customer.province].filter(Boolean).join(", ") || "-"}
                      </div>
                    </DataTableCell>
                    <DataTableCell>{customer.priceList || "-"}</DataTableCell>
                    <DataTableCell>
                      <StatusBadge tone={customer.relation === "propio" ? "success" : "neutral"}>
                        {customer.relation}
                      </StatusBadge>
                    </DataTableCell>
                    <DataTableCell>
                      <StatusBadge tone={clientStatusTone(customer.status)}>{customer.status}</StatusBadge>
                    </DataTableCell>
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>
          <PaginationLinks
            basePath="/crm/clientes"
            page={customers.meta.page}
            query={customers.meta.query}
            totalPages={customers.meta.totalPages}
          />
        </Card>

        {/* Seguimiento por estado (tablero existente) */}
        <ClientesDashboard groups={groups} counts={counts} zonas={zonas} agendar={agendarClienteAction} />
      </div>
    </ModulePage>
  );
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test scripts/crm-vendor-wiring.test.mjs`
Expected: PASS.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build OK, sin type errors en `/crm/clientes`.

- [ ] **Step 6: Commit**
```bash
git add apps/web/src/app/crm/clientes/page.tsx apps/web/scripts/crm-vendor-wiring.test.mjs
git commit -m "feat(crm): Clientes como base de datos del vendedor + tablero"
```

---

## Task 6: Verificación en navegador y cierre

**Files:** ninguno (verificación).

- [ ] **Step 1: Suite completa + build**

Run (desde `apps/web`): `npm test` y `npm run build`
Expected: sin fallas nuevas (solo las ~11 pre-existentes); build OK con rutas `/crm/clientes` y `/crm/cobros`.

- [ ] **Step 2: Verificación manual (si hay entorno con login de vendedor)**

Levantar dev server, entrar como vendedor al CRM:
- `/crm/clientes`: aparece la tabla de sus clientes (propios/a cargo) con buscador y paginación; el link abre `/customers/[id]`; debajo sigue el tablero de estados; ya no está la tira de 6 StatCards.
- `/crm/cobros`: aparece la deuda de sus clientes; registrar un cobro deja la venta "En aprobación"; buscar filtra.

- [ ] **Step 3: Commit/push** solo si el usuario lo pide.

---

## Notas de decisiones (del spec)

- Clientes = tabla DB del vendedor (link a la ficha) **+** tablero de estados; sin tira de perfil (esa es la duplicación con Perfil).
- Cobros = deuda de los clientes del vendedor, con registro de cobros vía acción CRM (`crm.ver` + `assertVendorOwnsSale`), reusando `registerCollection`. Sin permiso global de cobranzas ni nav de Administración.
- `listSalesToCollectWhere` extraído para reusar el SELECT de cobros sin duplicar; `listSalesToCollect` delega con `extraWhere=""` (comportamiento idéntico).
