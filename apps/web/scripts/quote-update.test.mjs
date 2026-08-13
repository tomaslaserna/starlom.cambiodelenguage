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
