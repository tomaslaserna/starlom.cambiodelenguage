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

test("quoteInputFromBody lee assignedSellerId", () => {
  const withVendor = quotes.quoteInputFromBody({
    customerId: "28d84c33-122d-4480-a183-26da0dfd17f8",
    productsJson: JSON.stringify([{ productId: "28d84c33-122d-4480-a183-26da0dfd17f8", quantity: 1, unitPrice: 1000 }]),
    assignedSellerId: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(withVendor.assignedSellerId, "11111111-1111-4111-8111-111111111111");
  const withoutVendor = quotes.quoteInputFromBody({
    customerId: "28d84c33-122d-4480-a183-26da0dfd17f8",
    productsJson: JSON.stringify([{ productId: "28d84c33-122d-4480-a183-26da0dfd17f8", quantity: 1, unitPrice: 1000 }]),
  });
  assert.equal(withoutVendor.assignedSellerId, "");
});

test("resolveQuoteAssignment: vendedor valido -> asignado; invalido/'' -> Todos", async () => {
  const session = { companyId: 1, userId: "creator" };
  const okClient = { query: async () => ({ rows: [{ ok: 1 }] }) };
  const assigned = await quotes.resolveQuoteAssignment(okClient, session, "11111111-1111-4111-8111-111111111111");
  assert.deepEqual(assigned, { sellerId: "11111111-1111-4111-8111-111111111111", visibleToAll: false });
  const noClient = { query: async () => { throw new Error("no deberia consultar"); } };
  const all = await quotes.resolveQuoteAssignment(noClient, session, "");
  assert.deepEqual(all, { sellerId: "creator", visibleToAll: true });
  const emptyClient = { query: async () => ({ rows: [] }) };
  const fallback = await quotes.resolveQuoteAssignment(emptyClient, session, "22222222-2222-4222-8222-222222222222");
  assert.deepEqual(fallback, { sellerId: "creator", visibleToAll: true });
});

test("createQuote inserta seller_id resuelto y visible_to_all", async () => {
  const writes = [];
  const client = {
    async query(sql, params) {
      writes.push({ sql, params });
      if (/FROM clients\s+WHERE id = \$1::uuid/i.test(sql)) {
        return { rows: [{ id: "c1", display_name: "ACME", legal_name: "ACME SA", tax_id: "30111111118",
          fiscal_condition: "RI", phone: "11", address: "Calle 1", price_list_name: "L2 - ANCLA",
          seller_name: "V", receipt_type: "Factura A" }], rowCount: 1 };
      }
      if (/FROM listas_precio/i.test(sql)) return { rows: [{ nombre: "L2 - ANCLA" }], rowCount: 1 };
      if (/WITH requested AS/i.test(sql)) {
        return { rows: [{ product_id: "p1", description: "P1", quantity: "1", discount: "0", unit_price: "1000", sort_order: 0 }], rowCount: 1 };
      }
      if (/pg_advisory_xact_lock/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/MAX\(substring\(quote_number/i.test(sql)) return { rows: [{ value: "1" }], rowCount: 1 };
      if (/INSERT INTO quotes/i.test(sql)) return { rows: [{ id: "newq" }], rowCount: 1 };
      if (/INSERT INTO quote_items/i.test(sql)) return { rows: [], rowCount: 1 };
      if (/FROM usuario_empresa/i.test(sql)) return { rows: [{ ok: 1 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  };
  quotesDb.withCompanyContext = async (cb) => cb(client);
  quotesDb.queryWithCompanyContext = async () => ({ rows: [getQuoteRow()], rowCount: 1 });
  const session = { companyId: 1, userId: "creator", username: "creator" };
  const input = quotes.quoteInputFromBody({
    customerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    productsJson: JSON.stringify([{ productId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", quantity: 1, unitPrice: 1000 }]),
    assignedSellerId: "11111111-1111-4111-8111-111111111111",
  });
  await quotes.createQuote(session, input);
  const insert = writes.find((w) => /INSERT INTO quotes/i.test(w.sql));
  assert.match(insert.sql, /visible_to_all/i);
  assert.equal(insert.params[2], "11111111-1111-4111-8111-111111111111");
  assert.equal(insert.params[insert.params.length - 1], false);
});
