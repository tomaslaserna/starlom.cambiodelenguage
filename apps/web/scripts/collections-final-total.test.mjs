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

const collections = loadTypeScriptModule("../src/lib/collections.ts", {
  "@/lib/api-response": { ApiError },
  "@/lib/collection-methods": {
    COLLECTION_METHODS: ["efectivo", "transferencia", "echeck"],
    collectionMethodRequiresOperation: (method) => method !== "efectivo",
  },
  "@/lib/db": {
    clearReadQueryCache: () => undefined,
    queryWithCompanyContext: async () => ({ rows: [] }),
    withCompanyContext: async () => undefined,
  },
  "@/lib/order-status": {
    normalizeOrderStatusValue: (value) => value,
    normalizedOrderStatusSql: () => "'entregado'",
  },
  "@/lib/request-body": {
    numberField: () => 0,
    textField: () => "",
  },
  "@/lib/sales-source-sql": { canonicalSalesSourceSql: () => "TRUE" },
  "@/lib/timezone": { localDateIso: () => "2026-08-12" },
});

test("Cobros treats persisted 10.5% and 21% sale totals as already final", () => {
  assert.equal(collections.saleOutstandingAmount(1105), 1105);
  assert.equal(collections.saleOutstandingAmount(1210), 1210);
  assert.equal(collections.saleOutstandingAmount("1105.00", "100", "205"), 1000);
  assert.equal(collections.saleOutstandingAmount(1210, 0, 1210), 0);
  assert.equal(collections.saleOutstandingAmount(100, 0, 150), 0);
});

test("Cobros reads sales.total_amount and never applies or removes VAT", () => {
  const source = readFileSync(new URL("../src/lib/collections.ts", import.meta.url), "utf8");

  assert.match(source, /sales\.total_amount is persisted as the final amount/);
  assert.match(source, /COALESCE\(v\.total_amount, 0\)/);
  assert.match(source, /saleOutstandingAmount\(\s*saleTotal,/);
  assert.doesNotMatch(source, /vat_rate|\/\s*1\.21|\*\s*1\.21|\/\s*1\.105|\*\s*1\.105/);
});

test("opening sale debit is not confused with later debit notes", () => {
  const source = readFileSync(new URL("../src/lib/collections.ts", import.meta.url), "utf8");

  assert.match(source, /SALE_OPENING_DEBIT_DESCRIPTION_PREFIX = "Saldo pendiente - Remito "/);
  assert.match(source, /AND debit > 0\s*AND credit = 0\s*AND description LIKE \$3/);
  assert.match(source, /FILTER \(WHERE description ILIKE 'nota de debito%'\)/);
});

test("collection registration locks the sale while preserving configured transfer methods", () => {
  const source = readFileSync(new URL("../src/lib/collections.ts", import.meta.url), "utf8");
  const locks = source.match(/FOR UPDATE OF v/g) ?? [];

  assert.ok(locks.length >= 2);
  assert.match(source, /PAYMENT_METHODS = new Set<string>\(COLLECTION_METHODS\)/);
  assert.match(source, /collectionMethodRequiresOperation\(method\)/);
});
