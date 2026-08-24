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

test("statement groups FIFO allocations as one customer payment", () => {
  const rows = accounts.collapsePaymentAllocations([
    { id: "a", date: "2026-08-20", description: "Cobro - efectivo | Imputación histórica FIFO", debit: 0, credit: 48_422.90, kind: "Cobro", paymentId: "payment-1" },
    { id: "b", date: "2026-08-20", description: "Cobro - efectivo | Imputación histórica FIFO", debit: 0, credit: 169_705.07, kind: "Cobro", paymentId: "payment-1" },
    { id: "c", date: "2026-08-20", description: "Cobro - efectivo | Imputación histórica FIFO", debit: 0, credit: 0.03, kind: "Cobro", paymentId: "payment-1" },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].credit, 218_128);
  assert.match(rows[0].description, /distribuido en 3 imputaciones/);
});

test("allocatePaymentAmount imputa FIFO y deja el excedente sin aplicar", () => {
  const sales = [
    { id: "s1", outstanding: 80, receiptNumber: 1 },
    { id: "s2", outstanding: 50, receiptNumber: 2 },
  ];
  const exact = accounts.allocatePaymentAmount(100, sales);
  assert.deepEqual(exact.allocations, [
    { saleId: "s1", receiptNumber: 1, amount: 80 },
    { saleId: "s2", receiptNumber: 2, amount: 20 },
  ]);
  assert.equal(exact.allocated, 100);
  assert.equal(exact.unallocated, 0);

  const excess = accounts.allocatePaymentAmount(150, sales);
  assert.equal(excess.allocated, 130);
  assert.equal(excess.unallocated, 20);
});
