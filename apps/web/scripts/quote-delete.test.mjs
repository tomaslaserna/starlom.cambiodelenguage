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
