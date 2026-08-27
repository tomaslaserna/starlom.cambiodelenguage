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
const presentationPricing = loadTypeScriptModule("../src/lib/presentation-pricing.ts", {
  "@/lib/order-pricing": orderPricing,
});
const orderStatus = loadTypeScriptModule("../src/lib/order-status.ts");
const commonAliases = {
  "@/lib/api-response": { ApiError },
  "@/lib/client-reactivation": {},
  "@/lib/db": {},
  "@/lib/order-pricing": orderPricing,
  "@/lib/presentation-pricing": presentationPricing,
  "@/lib/product-pricing-sql": {},
  "@/lib/receipt-types": receiptTypes,
  "@/lib/request-body": requestBody,
  "@/lib/deliveries": {},
  "@/lib/vat-calculation": vatCalculation,
};
const orders = loadTypeScriptModule("../src/lib/orders.ts", {
  ...commonAliases,
  "@/lib/delivery-times": {},
  "@/lib/pagination": {},
  "@/lib/pricing": {},
  "@/lib/order-status": orderStatus,
  "@/lib/sales-source-sql": {},
  "@/lib/stock": {},
  "@/lib/timezone": { localDateIso: () => "2026-08-12" },
});
const quotes = loadTypeScriptModule("../src/lib/quotes.ts", commonAliases);
const productId = "28d84c33-122d-4480-a183-26da0dfd17f8";

test("sale document derivation is strict and fixes VAT at 10.5 or 21 percent", () => {
  assert.equal(receiptTypes.saleOrderDocument("Remito"), "remito");
  assert.equal(receiptTypes.saleVatRateForDocument("Remito"), 10.5);
  assert.equal(receiptTypes.saleOrderDocument("FACTURA A"), "factura_a");
  assert.equal(receiptTypes.saleVatRateForDocument("Factura A"), 21);
  assert.equal(receiptTypes.saleOrderDocument("Factura B"), "factura_b");
  assert.equal(receiptTypes.saleVatRateForDocument("Factura B"), 21);
  for (const unsupported of ["", "desconocido", "Factura C", "Nota de credito A"]) {
    assert.equal(receiptTypes.saleOrderDocument(unsupported), null);
    assert.equal(receiptTypes.saleVatRateForDocument(unsupported), null);
  }
});

test("orders store final totals from net sale items at both supported rates", () => {
  assert.deepEqual(orders.calculateOrderTotals(1000, 10.5), {
    netAmount: 1000,
    vatAmount: 105,
    totalAmount: 1105,
  });
  assert.deepEqual(orders.calculateOrderTotals(1000, 21), {
    netAmount: 1000,
    vatAmount: 210,
    totalAmount: 1210,
  });
  assert.deepEqual(orders.splitStoredOrderTotal(1105, 10.5), {
    netAmount: 1000,
    vatAmount: 105,
    totalAmount: 1105,
  });
});

test("posted VAT and document overrides are ignored for future orders and quotes", () => {
  const orderInput = orders.basicOrderInputFromBody({
    customerId: productId,
    productsJson: JSON.stringify([{ productId, quantity: 1, discount: 0 }]),
    vatRate: "0",
    desiredDocumentOverride: "factura_a",
  });
  assert.equal("vatRate" in orderInput, false);
  assert.equal("desiredDocumentOverride" in orderInput, false);

  const quoteInput = quotes.quoteInputFromBody({
    customerId: productId,
    productsJson: JSON.stringify([{ productId, quantity: 1, unitPrice: 1000 }]),
    vatRate: "21",
    includeVat: "false",
  });
  assert.equal("vatRate" in quoteInput, false);
  assert.equal("includeVat" in quoteInput, false);
});

test("historical order and quote snapshots must remain internally consistent", () => {
  assert.equal(orders.hasConsistentOrderVatSnapshot({ desiredDocument: "remito", receiptType: 0, vatRate: 10.5 }), true);
  assert.equal(orders.hasConsistentOrderVatSnapshot({ desiredDocument: "factura_a", receiptType: 1, vatRate: 21 }), true);
  assert.equal(orders.hasConsistentOrderVatSnapshot({ desiredDocument: "remito", receiptType: 0, vatRate: 0 }), false);

  assert.deepEqual(
    quotes.acceptedQuoteVatSnapshot({
      desiredDocument: "Factura B",
      vatRate: "21",
      subtotalAmount: "1000",
      totalAmount: "1210",
    }),
    { desiredDocument: "factura_b", vatRate: 21 },
  );
  assert.throws(
    () => quotes.acceptedQuoteVatSnapshot({
      desiredDocument: "remito",
      vatRate: "10.5",
      subtotalAmount: "1000",
      totalAmount: "1000",
    }),
    (error) => error instanceof ApiError && error.status === 409,
  );
});

test("order and quote forms expose the server-derived document and no VAT override fields", () => {
  const orderEntry = readFileSync(
    new URL("../src/app/orders/new/order-entry-fields.tsx", import.meta.url),
    "utf8",
  );
  const quoteEntry = readFileSync(
    new URL("../src/app/quotes/quote-entry-fields.tsx", import.meta.url),
    "utf8",
  );
  const statusRoute = readFileSync(
    new URL("../src/app/api/orders/[id]/status/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(orderEntry, /saleVatRateForDocument/);
  assert.doesNotMatch(orderEntry, /name=["']vatRate["']/);
  assert.doesNotMatch(orderEntry, /desiredDocumentOverride/);
  assert.match(quoteEntry, /saleVatRateForDocument/);
  assert.doesNotMatch(quoteEntry, /name=["']vatRate["']/);
  assert.doesNotMatch(quoteEntry, /name=["']includeVat["']/);
  assert.doesNotMatch(quoteEntry, /quote-customer-mode|Cliente ocasional/);
  assert.doesNotMatch(statusRoute, /confirmationDocument/);
});
