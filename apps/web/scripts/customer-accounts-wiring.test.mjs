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

const source = readFileSync(new URL("../src/lib/customer-accounts.ts", import.meta.url), "utf8");

test("listOpenCustomerAccounts arma el vencimiento y reusa el filtro de movimientos activos", () => {
  assert.match(source, /activeAccountMovementWhereSql/);
  assert.match(source, /source_payment_term_days/);
  assert.match(source, /computeAgingBuckets/);
  // filtra saldos distintos de cero con epsilon
  assert.match(source, /ABS\([^)]*\)\s*>\s*0\.005/);
});

test("getCustomerStatement trae todos los movimientos ordenados y delega el corte por fecha", () => {
  assert.match(source, /export async function getCustomerStatement/);
  assert.match(source, /ORDER BY m\.movement_date ASC/);
  assert.match(source, /buildCustomerStatement\(/);
  // NO filtra por fecha en SQL (el opening necesita lo anterior a `from`)
  assert.doesNotMatch(source, /movement_date >= \$/);
});

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
    withCompanyContext: async (_companyId, fn) => fn({
      query: async (sql, params) => {
        queries.push({ sql, params });
        if (/FROM sales s/i.test(sql)) {
          return { rows: [{ id: "s1", outstanding: "100", receipt_number: 1 }] };
        }
        if (/SELECT COALESCE\(display_name/i.test(sql)) return { rows: [{ name: "Cliente" }] };
        return { rows: [{ id: "p1" }] };
      },
    }),
    sessionAllows: async () => true, // admin
  });
  const res = await mod.registerCustomerPayment(
    { companyId: 1, userId: "u1", username: "admin", role: "administrador" },
    { clientId: "c1", amount: 100, date: "2026-08-18", method: "efectivo", destination: "caja", operation: "", notes: "" },
  );
  assert.equal(res.status, "registrado");
  // admin: inserta el pago Y el movimiento de crédito
  assert.ok(queries.some((q) => /INSERT INTO payments/i.test(q.sql)));
  assert.ok(queries.some((q) => /INSERT INTO current_account_movements/i.test(q.sql)));
  assert.ok(queries.some((q) => /UPDATE sales/i.test(q.sql) && /collection_status/i.test(q.sql)));
});

test("registerCustomerPayment: vendedor deja pendiente, sin movimiento de crédito", async () => {
  const queries = [];
  const mod = loadCustomerAccounts({
    withCompanyContext: async (_companyId, fn) => fn({ query: async (sql, params) => { queries.push({ sql, params }); return { rows: [{ id: "p1" }] }; } }),
    sessionAllows: async () => false, // vendor
  });
  const res = await mod.registerCustomerPayment(
    { companyId: 1, userId: "u1", username: "vendor", role: "vendedor" },
    { clientId: "c1", amount: 100, date: "2026-08-18", method: "efectivo", destination: "caja", operation: "", notes: "" },
  );
  assert.equal(res.status, "pendiente_aprobacion");
  // vendor: inserta el pago pero NO el movimiento de crédito
  assert.ok(queries.some((q) => /INSERT INTO payments/i.test(q.sql)));
  assert.equal(queries.some((q) => /INSERT INTO current_account_movements/i.test(q.sql)), false);
});

test("approveCustomerPayment inserta el credito y pasa a registrado", () => {
  assert.match(source, /export async function approveCustomerPayment/);
  assert.match(source, /INSERT INTO current_account_movements/);
  assert.match(source, /pendiente_aprobacion/);
});

const approvalsSource = readFileSync(new URL("../src/lib/approvals.ts", import.meta.url), "utf8");
test("approvals.ts suma el source payment", () => {
  assert.match(approvalsSource, /"payment"/);
  assert.match(approvalsSource, /listPendingCustomerPayments/);
});

const navSource = readFileSync(new URL("../src/lib/navigation.ts", import.meta.url), "utf8");
test("navegacion apunta a los nuevos submenus de Cobros y pagos", () => {
  assert.match(navSource, /href: "\/payments"/);
  assert.match(navSource, /href: "\/payments\/accounts"/);
  assert.match(navSource, /Registro de pagos/i);
});

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
  assert.ok(queries.some((q) => /UPDATE sales s/i.test(q.sql) && /collection_status/i.test(q.sql)));
});

test("el estado de cuenta linkea el remito con precios y la factura", () => {
  const page = readFileSync(new URL("../src/app/payments/accounts/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(source, /delivery_documents/);
  assert.match(source, /has_priced_items/);
  assert.match(source, /has_fiscal_pdf/);
  // La descripcion "Remito #XXXX" es el unico hipervinculo, y abre el remito con precios.
  assert.match(page, /remito\?precios=si/);
  assert.doesNotMatch(page, /Abrir Remito/);
  assert.doesNotMatch(page, /con productos y precios/);
  // Ademas, cuando corresponde, se puede ver la factura.
  assert.match(page, /\/api\/pdfs\/fiscal\/sales\/\$\{line\.saleId\}/);
  assert.match(page, /Ver factura/);
});

test("el estado de cuenta muestra pagos registrados pendientes de aplicar", () => {
  const page = readFileSync(new URL("../src/app/payments/accounts/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(source, /unappliedPayments/);
  assert.match(source, /p\.amount - COALESCE\(allocation\.applied_amount, 0\) > 0\.005/);
  assert.match(page, /Pagos registrados pendientes de aplicar/);
  assert.match(page, /no reducen la deuda/i);
});

test("un excedente de pago no se inserta como saldo a favor sin remito", () => {
  assert.doesNotMatch(source, /Saldo a favor sin imputar/);
  assert.match(source, /GREATEST\(p\.amount - COALESCE\(allocation\.allocated_amount, 0\), 0\)/);
});

test("la migracion no imputa ni recrea cobros historicos", () => {
  const migration = readFileSync(
    new URL("../../../supabase/migrations/20260824154614_reconcile_customer_collections.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /Historical customer-level payments remain untouched/);
  assert.doesNotMatch(migration, /INSERT INTO public\.current_account_movements/i);
  assert.doesNotMatch(migration, /UPDATE public\.current_account_movements/i);
  assert.doesNotMatch(migration, /DELETE FROM public\.current_account_movements/i);
});

test("voidCustomerPayment rechaza anular un pago pendiente de aprobacion", async () => {
  const queries = [];
  const mod = loadCustomerAccounts({
    withCompanyContext: async (_companyId, fn) => fn({
      query: async (sql, params) => {
        queries.push({ sql, params });
        if (/SELECT/i.test(sql)) return { rows: [{ id: "p1", client_id: "c1", amount: "100", status: "pendiente_aprobacion", entity_name: "Cliente" }] };
        return { rows: [{ id: "p1" }] };
      },
    }),
  });
  await assert.rejects(
    () => mod.voidCustomerPayment({ companyId: 1, userId: "u1", username: "admin" }, "p1"),
    /pendiente de aprobacion se rechaza, no se anula/,
  );
  assert.equal(queries.some((q) => /UPDATE payments/i.test(q.sql)), false);
});

test("voidCustomerPayment rechaza anular un pago ya anulado", async () => {
  const queries = [];
  const mod = loadCustomerAccounts({
    withCompanyContext: async (_companyId, fn) => fn({
      query: async (sql, params) => {
        queries.push({ sql, params });
        if (/SELECT/i.test(sql)) return { rows: [{ id: "p1", client_id: "c1", amount: "100", status: "anulado", entity_name: "Cliente" }] };
        return { rows: [{ id: "p1" }] };
      },
    }),
  });
  await assert.rejects(
    () => mod.voidCustomerPayment({ companyId: 1, userId: "u1", username: "admin" }, "p1"),
    /ya esta anulado/,
  );
  assert.equal(queries.some((q) => /UPDATE payments/i.test(q.sql)), false);
});

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

const accountsPage = () => readFileSync(new URL("../src/app/payments/accounts/page.tsx", import.meta.url), "utf8");
test("cuentas abiertas usa listOpenCustomerAccounts y linkea al detalle", () => {
  const src = accountsPage();
  assert.match(src, /listOpenCustomerAccounts/);
  assert.match(src, /\/payments\/accounts\//); // link al estado de cuenta [id]
  assert.match(src, /Vencido|aging|\+30/i);
});

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

const crmSource = readFileSync(new URL("../src/lib/crm.ts", import.meta.url), "utf8");
test("crm.ts expone las cuentas abiertas del vendedor por saldo corrido", () => {
  assert.match(crmSource, /getVendorOpenAccounts/);
  assert.match(crmSource, /listOpenCustomerAccounts/);
  assert.match(crmSource, /sellerCandidates/);
});
