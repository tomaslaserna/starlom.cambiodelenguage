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
  assert.match(source, /OPEN_SALES_FOR_AGING_SQL/);
  assert.match(source, /agingDebitsFromOpenSales/);
  // filtra saldos distintos de cero con epsilon
  assert.match(source, /ABS\([^)]*\)\s*>\s*0\.005/);
});

for (const scenario of [
  { name: "sin búsqueda mantiene sólo cuentas abiertas", options: {}, includeSettled: false },
  { name: "una búsqueda de consulta incluye las saldadas", options: { query: "Cliente", includeSettled: true }, includeSettled: true },
  { name: "una búsqueda vacía no incluye cuentas saldadas", options: { query: "   ", includeSettled: true }, includeSettled: false },
  { name: "otros consumidores conservan el filtro de deuda", options: { query: "Cliente" }, includeSettled: false },
]) {
  test(`listOpenCustomerAccounts: ${scenario.name}`, async () => {
    const queries = [];
    const mod = loadCustomerAccounts({
      queryWithCompanyContext: async (companyId, sql, params) => {
        queries.push({ companyId, sql, params });
        if (!sql.includes("WITH client_balances")) return { rows: [] };
        return { rows: /WHERE ABS\(total_debit - total_credit\)/.test(sql) ? [] : [{
          client_id: "11111111-1111-4111-8111-111111111111", name: "Cliente",
          seller_name: "Vendedor", tax_id: "30712345678", last_movement: "2026-10-19",
          total_debit: "15000", total_credit: "15000", debits: [],
        }] };
      },
    });
    const result = await mod.listOpenCustomerAccounts(1, scenario.options);
    assert.equal(queries[0].companyId, 1);
    assert.equal(/WHERE ABS\(total_debit - total_credit\)/.test(queries[0].sql), !scenario.includeSettled);
    assert.equal(result.accounts.length, scenario.includeSettled ? 1 : 0);
    if (scenario.options.query?.trim()) assert.deepEqual(queries[0].params, [1, "%Cliente%"]);
    else assert.deepEqual(queries[0].params, [1]);
    if (scenario.includeSettled) assert.equal(result.accounts[0].balance, 0);
  });
}

test("getCustomerStatement trae todos los movimientos ordenados y delega el corte por fecha", () => {
  assert.match(source, /export async function getCustomerStatement/);
  assert.match(source, /ORDER BY m\.movement_date ASC/);
  assert.match(source, /buildCustomerStatement\(/);
  // NO filtra por fecha en SQL (el opening necesita lo anterior a `from`)
  assert.doesNotMatch(source, /movement_date >= \$/);
});

test("customerPaymentFromBody valida monto, metodo y operacion", () => {
  const mod = loadCustomerAccounts();
  const allocation = JSON.stringify([{ saleId: "11111111-1111-4111-8111-111111111111", amount: 10 }]);
  assert.throws(() => mod.customerPaymentFromBody({ amount: "0", method: "efectivo", treasuryAccountId: "1", allocations: allocation }), /mayor a cero/);
  assert.throws(() => mod.customerPaymentFromBody({ amount: "10", method: "bitcoin", treasuryAccountId: "1", allocations: allocation }), /Metodo/);
  assert.throws(() => mod.customerPaymentFromBody({ amount: "10", method: "transferencia", treasuryAccountId: "2", allocations: allocation }), /operacion/i);
  assert.throws(() => mod.customerPaymentFromBody({ amount: "10", method: "efectivo", allocations: allocation }), /Tesoreria/i);
  assert.throws(() => mod.customerPaymentFromBody({ amount: "10", method: "echeck", operation: "123", allocations: allocation }), /fecha de cobro/i);
  const fullyUnallocated = mod.customerPaymentFromBody({ amount: "10", method: "efectivo", treasuryAccountId: "1", clientId: "c1", allocations: "[]" });
  assert.deepEqual(fullyUnallocated.allocations, []);
  const ok = mod.customerPaymentFromBody({ amount: "10", method: "efectivo", treasuryAccountId: "1", clientId: "c1", allocations: allocation });
  assert.equal(ok.amount, 10);
  assert.equal(ok.method, "efectivo");
  assert.deepEqual(ok.allocations, [{ saleId: "11111111-1111-4111-8111-111111111111", amount: 10 }]);
  const withCredit = mod.customerPaymentFromBody({ amount: "15", method: "efectivo", treasuryAccountId: "1", clientId: "c1", allocations: allocation });
  assert.equal(withCredit.amount, 15);
  assert.throws(
    () => mod.customerPaymentFromBody({ amount: "5", method: "efectivo", treasuryAccountId: "1", clientId: "c1", allocations: allocation }),
    /no puede superar el monto recibido/i,
  );
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
        if (/SUM\(cam\.debit - cam\.credit\)/i.test(sql)) return { rows: [{ balance: "100" }] };
        if (/SELECT COALESCE\(display_name/i.test(sql)) return { rows: [{ name: "Cliente", tax_id: "30-12345678-9" }] };
        if (/FROM admin_treasury_accounts/i.test(sql)) return { rows: [{ id: "1", name: "Efectivo", account_type: "cash" }] };
        return { rows: [{ id: "p1" }] };
      },
    }),
    sessionAllows: async () => true, // admin
  });
  const res = await mod.registerCustomerPayment(
    { companyId: 1, userId: "u1", username: "admin", role: "administrador" },
    { clientId: "c1", amount: 100, date: "2026-08-18", method: "efectivo", treasuryAccountId: "1", operation: "", chequeDueDate: "", notes: "", allocations: [] },
  );
  assert.equal(res.status, "registrado");
  // admin: inserta el pago Y el movimiento de crédito
  assert.ok(queries.some((q) => /INSERT INTO payments/i.test(q.sql)));
  assert.ok(queries.some((q) => /INSERT INTO current_account_movements/i.test(q.sql)));
  assert.ok(queries.some((q) => /UPDATE sales/i.test(q.sql) && /collection_status/i.test(q.sql)));
  assert.ok(queries.some((q) => /INSERT INTO admin_treasury_movements/i.test(q.sql) && /customer_payment/i.test(q.sql)));
});

test("registerCustomerPayment: vendedor deja pendiente, sin movimiento de crédito", async () => {
  const queries = [];
  const mod = loadCustomerAccounts({
    withCompanyContext: async (_companyId, fn) => fn({ query: async (sql, params) => {
      queries.push({ sql, params });
      if (/SELECT COALESCE\(display_name/i.test(sql)) return { rows: [{ name: "Cliente", tax_id: "" }] };
      if (/FROM admin_treasury_accounts/i.test(sql)) return { rows: [{ id: "1", name: "Efectivo", account_type: "cash" }] };
      return { rows: [{ id: "p1" }] };
    } }),
    sessionAllows: async () => false, // vendor
  });
  const res = await mod.registerCustomerPayment(
    { companyId: 1, userId: "u1", username: "vendor", role: "vendedor" },
    { clientId: "c1", amount: 100, date: "2026-08-18", method: "efectivo", treasuryAccountId: "1", operation: "", chequeDueDate: "", notes: "", allocations: [] },
  );
  assert.equal(res.status, "pendiente_aprobacion");
  // vendor: inserta el pago pero NO el movimiento de crédito
  assert.ok(queries.some((q) => /INSERT INTO payments/i.test(q.sql)));
  assert.equal(queries.some((q) => /INSERT INTO current_account_movements/i.test(q.sql)), false);
  assert.equal(queries.some((q) => /INSERT INTO admin_treasury_movements/i.test(q.sql)), false);
});

test("registerCustomerPayment: un E-cheq queda en cartera y no suma saldo bancario", async () => {
  const queries = [];
  const mod = loadCustomerAccounts({
    withCompanyContext: async (_companyId, fn) => fn({
      query: async (sql, params) => {
        queries.push({ sql, params });
        if (/SELECT COALESCE\(display_name/i.test(sql)) return { rows: [{ name: "Cliente", tax_id: "30-12345678-9" }] };
        if (/FROM sales s/i.test(sql)) return { rows: [] };
        if (/INSERT INTO payments/i.test(sql)) return { rows: [{ id: "p1" }] };
        return { rows: [] };
      },
    }),
    sessionAllows: async () => true,
  });
  const res = await mod.registerCustomerPayment(
    { companyId: 1, userId: "u1", username: "admin", role: "administrador" },
    {
      clientId: "c1", amount: 100, date: "2026-10-11", method: "echeck",
      treasuryAccountId: "", operation: "123456", chequeDueDate: "2026-10-30", notes: "", allocations: [],
    },
  );
  assert.equal(res.status, "registrado");
  assert.ok(queries.some((q) => /INSERT INTO admin_echeqs/i.test(q.sql) && q.params.includes("2026-10-30")));
  assert.equal(queries.some((q) => /INSERT INTO admin_treasury_movements/i.test(q.sql)), false);
});

test("approveCustomerPayment inserta el credito y pasa a registrado", () => {
  assert.match(source, /export async function approveCustomerPayment/);
  assert.match(source, /INSERT INTO current_account_movements/);
  assert.match(source, /pendiente_aprobacion/);
});

test("la registracion conserva la imputacion elegida para pagos pendientes", () => {
  assert.match(source, /customer_payment_allocation_requests/);
  assert.match(source, /requested_amount/);
  assert.match(source, /validateExplicitAllocations/);
});

test("el formulario permite elegir remitos e importes parciales", () => {
  const dialog = readFileSync(new URL("../src/app/payments/register-payment-dialog.tsx", import.meta.url), "utf8");
  assert.match(dialog, /open-remittances/);
  assert.match(dialog, /Aplicar a remitos pendientes/);
  assert.match(dialog, /importe parcial/i);
  assert.match(dialog, /name="allocations"/);
  assert.match(dialog, /Importe recibido/);
  assert.match(dialog, /Saldo a favor/);
  assert.match(dialog, /Cuenta de destino/);
  assert.match(dialog, /Fecha de cobro/);
  assert.match(dialog, /Cheque pendiente de cobro/);
});

test("cada cobro genera su contrapartida en Tesoreria dentro de la misma transaccion", () => {
  assert.match(source, /resolvePaymentTreasuryTarget/);
  assert.match(source, /postCustomerPaymentToTreasury/);
  assert.match(source, /INSERT INTO admin_treasury_movements/);
  assert.match(source, /INSERT INTO admin_echeqs/);
  assert.match(source, /source_type, source_id/);
  const migration = readFileSync(
    new URL("../../../supabase/migrations/20261011163000_link_customer_payments_to_treasury.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /treasury_account_id/);
  assert.match(migration, /treasury_reference/);
  assert.match(migration, /cheque_due_date/);
  assert.match(migration, /payment_status ADD VALUE IF NOT EXISTS 'pendiente_aprobacion'/);
  assert.match(migration, /payment_status ADD VALUE IF NOT EXISTS 'rechazado'/);
});

test("el formulario limita cada imputacion al saldo y permite cobros totalmente a favor", () => {
  const dialog = readFileSync(new URL('../src/app/payments/register-payment-dialog.tsx', import.meta.url), 'utf8');
  assert.match(dialog, /Math\.min\(Math\.max\(Number\(rawValue\)/);
  assert.match(dialog, /sale\.outstanding/);
  assert.doesNotMatch(dialog, /allocations\.length === 0/);
  assert.doesNotMatch(source, /Selecciona al menos un remito para aplicar el pago/);
});

test("el formulario aplica el cobro solo a remitos seleccionados y sin un maximo HTML", () => {
  const dialog = readFileSync(new URL('../src/app/payments/register-payment-dialog.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(dialog, /distributeCustomerPayment/);
  assert.doesNotMatch(dialog, /max=\{sale\.outstanding\}/);
  assert.match(dialog, /únicamente a los remitos que selecciones/i);
  assert.match(dialog, /cualquier excedente queda como saldo a favor/i);
});

test("el excedente del cobro se registra como saldo a favor", () => {
  assert.match(source, /allocation\.unallocated > 0\.005/);
  assert.match(source, /Saldo a favor \|/);
  assert.match(source, /payment_id, movement_date, debit, credit/);
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
  assert.match(navSource, /Resumen de cobranzas/i);
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
  const page = readFileSync(new URL("../src/app/payments/accounts/[id]/statement-movements.tsx", import.meta.url), "utf8");
  assert.match(source, /delivery_documents/);
  assert.match(source, /has_priced_items/);
  assert.match(source, /has_fiscal_pdf/);
  // Los documentos originales quedan disponibles en el detalle desplegable.
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
  assert.match(source, /ROUND\(GREATEST\(p\.amount - COALESCE\(allocation\.applied_amount, 0\), 0\), 0\) > 0/);
  assert.match(page, /Pagos registrados pendientes de aplicar/);
  assert.match(page, /no reducen la deuda/i);
  assert.match(source, /p\.allocation_reconciled_at IS NULL/);
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
  const table = readFileSync(new URL("../src/app/payments/accounts/customer-accounts-table.tsx", import.meta.url), "utf8");
  const presentation = readFileSync(new URL("../src/lib/customer-account-presentation.ts", import.meta.url), "utf8");
  assert.match(src, /listOpenCustomerAccounts/);
  assert.match(src, /includeSettled: Boolean\(query\)/);
  assert.match(src, /requirePagePermission/);
  assert.match(src, /CustomerAccountsTable/);
  assert.match(table, /\/payments\/accounts\/\$\{account\.clientId\}/);
  assert.match(table, /aria-expanded=\{open\}/);
  assert.match(table, /hidden=\{!open\}/);
  assert.equal((table.match(/<th scope="col"/g) ?? []).length, 4);
  assert.match(presentation, /aging\.d7/);
  assert.match(presentation, /aging\.d15/);
  assert.match(presentation, /aging\.d30/);
  assert.match(presentation, /aging\.d30Plus/);
  assert.doesNotMatch(presentation, /aging\.d60|aging\.d90/);
  assert.doesNotMatch(src + table, /sampleAccounts|Reporte para contador/);
});

test("la situación muestra el tramo más antiguo sin alterar el saldo ni los importes", () => {
  const { customerAccountAging, customerAccountSituation } = loadTypeScriptModule("../src/lib/customer-account-presentation.ts");
  const aging = { current: 10, d7: 20, d15: 30, d30: 40, d30Plus: 50, overdueTotal: 140 };
  assert.deepEqual(customerAccountAging(aging).map((bucket) => bucket.amount), [10, 20, 30, 40, 50]);
  const account = { balance: 150, aging };
  assert.equal(customerAccountSituation(account).label, "+30 días");
  assert.equal(customerAccountSituation({ ...account, balance: -150 }).label, "A favor");
  assert.equal(customerAccountSituation({ ...account, balance: 0 }).label, "Saldada");
  for (const [expected, zeroed] of [
    ["16–30 días", { d30Plus: 0 }],
    ["8–15 días", { d30Plus: 0, d30: 0 }],
    ["1–7 días", { d30Plus: 0, d30: 0, d15: 0 }],
    ["Al día", { d30Plus: 0, d30: 0, d15: 0, d7: 0 }],
  ]) {
    assert.equal(customerAccountSituation({ balance: 10, aging: { ...aging, ...zeroed } }).label, expected);
  }
  assert.equal(account.balance, 150);
  assert.equal(aging.d30Plus, 50);
});

test("el PDF contable agrupa toda la deuda por cliente, remito y factura", () => {
  const route = readFileSync(new URL("../src/app/api/pdfs/accounts/current/route.ts", import.meta.url), "utf8");
  const documents = readFileSync(new URL("../src/lib/pdf/documents.ts", import.meta.url), "utf8");
  assert.match(route, /buildAccountsReceivablePdf/);
  assert.match(documents, /export async function buildAccountsReceivablePdf/);
  assert.match(documents, /Total por cobrar/);
  assert.match(documents, /Total cliente/);
  assert.match(documents, /delivery_documents/);
  assert.match(documents, /fiscal_receipt_number/);
  assert.match(documents, /allocateAccountsReceivableRows/);
  assert.match(documents, /Stock actual valorizado/);
  assert.match(documents, /stock_movements/);
  assert.match(documents, /Activos informados/);
});
const homePage = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
test("el acceso rapido Cobranzas del Escritorio abre Cuentas corrientes", () => {
  assert.match(homePage, /href: "\/payments\/accounts", label: "Cobranzas"/);
  assert.doesNotMatch(homePage, /href: "\/collections", label: "Cobranzas"/);
});

test("estado de cuenta usa getCustomerStatement, filtro de fecha y saldo anterior", () => {
  const src = readFileSync(new URL("../src/app/payments/accounts/[id]/page.tsx", import.meta.url), "utf8");
  const table = readFileSync(new URL("../src/app/payments/accounts/[id]/statement-movements.tsx", import.meta.url), "utf8");
  assert.match(src, /getCustomerStatement/);
  assert.match(table, /Saldo anterior/i);
  assert.match(table, /openingBalance/);
  assert.match(table, /statement\.finalBalance/);
  assert.match(table, /line\.balance/);
  assert.match(src, /currentBalance = fullResult\.statement\.finalBalance/);
  assert.match(src, /RegisterPaymentDialog/);
  assert.match(src, /requirePagePermission/);
  assert.match(src, /api\/pdfs\/accounts\/statement\//);
});

test("el detalle clasifica notas, pagos, anulaciones y ajustes sin inventar remitos", () => {
  const { statementCategory, statementMovementPresentation, summarizeStatement, filterStatementLines } =
    loadTypeScriptModule("../src/lib/customer-statement-presentation.ts");
  const base = { id: "1", date: "2026-09-01", kind: "remito", description: "Remito #1", debit: 100, credit: 0, balance: 100, saleId: "s1" };
  const payment = { ...base, id: "2", kind: "pago", description: "Cobro - transferencia | Destino Santander | Op. 123", debit: 0, credit: 40, balance: 60, saleId: null };
  const credit = { ...base, id: "3", kind: "nota_credito", description: "Nota de crédito interna #1", internalDocumentId: "n1", debit: 0, credit: 10, balance: 50 };
  const debitNote = { ...base, id: "4", kind: "nota_debito", description: "Nota de débito #2", debit: 5, credit: 0, balance: 55 };
  const adjustment = { ...base, id: "5", description: "Ajuste contable histórico", debit: 7, balance: 62, saleId: null };
  const lines = [base, payment, credit, debitNote, adjustment];
  assert.deepEqual(lines.map(statementCategory), ["remito", "pago", "nota_credito", "nota_debito", "ajuste"]);
  assert.equal(statementCategory({ ...base, description: "Cobro anulado", saleId: null }), "ajuste");
  assert.equal(statementCategory({ ...base, description: "Saldo inicial", saleId: null }), "ajuste");
  assert.equal(statementCategory({ ...base, description: "Mercadería adicional", saleId: null }), "ajuste");
  assert.equal(statementCategory({ ...payment, description: "Saldo a favor | transferencia" }), "pago");
  assert.equal(statementCategory({ ...base, saleId: null }), "remito");
  const historicalSale = { ...base, saleId: null, description: "Venta histórica conciliada | REM-2026-0844 | CLIENTE" };
  assert.equal(statementCategory(historicalSale), "remito");
  assert.equal(statementMovementPresentation(historicalSale).title, "Remito histórico REM-2026-0844");
  assert.equal(statementMovementPresentation(payment).amount, -40);
  assert.equal(statementMovementPresentation(payment).title, "Pago · transferencia");
  assert.equal(statementMovementPresentation({ ...base, debit: 100, credit: 5 }).amount, 95);
  assert.deepEqual(summarizeStatement(lines), { sales: 100, payments: 40, creditNotes: 10, other: 12 });
  assert.deepEqual(filterStatementLines(lines, "notas").map((line) => line.id), ["3", "4"]);
  assert.strictEqual(filterStatementLines(lines, "todos"), lines);
  assert.strictEqual(filterStatementLines(lines, "pago")[0], payment);
  assert.equal(filterStatementLines(lines, "pago")[0].balance, 60);
  assert.deepEqual(lines.map((line) => line.balance), [100, 60, 50, 55, 62]);
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
