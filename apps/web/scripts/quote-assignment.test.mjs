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
