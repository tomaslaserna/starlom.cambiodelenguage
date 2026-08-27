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
  desiredDocument: "factura_a",
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

test("buildQuoteDraft permite un prospecto sin alta de cliente", async () => {
  const client = draftClient();
  const session = { companyId: 1, userId: "u1", username: "user" };
  const draft = await quotes.buildQuoteDraft(client, session, {
    ...baseInput,
    customerId: "",
    customer: { name: "Prospecto SA", businessName: "", taxId: "", vatCondition: "", phone: "", address: "" },
    desiredDocument: "remito",
  });
  assert.equal(draft.customer.id, "");
  assert.equal(draft.customer.display_name, "Prospecto SA");
  assert.equal(draft.desiredDocument, "remito");
  assert.equal(draft.vatRate, 10.5);
});

test("buildQuoteDraft conserva el precio congelado recibido", async () => {
  const client = draftClient();
  const session = { companyId: 1, userId: "u1", username: "user" };
  const draft = await quotes.buildQuoteDraft(client, session, baseInput, {
    frozenPrices: new Map([["p1", 750]]),
  });
  assert.equal(draft.detail[0].unitPrice, 750);
  assert.equal(draft.netAmount, 1500);
  assert.equal(draft.total, 1815);
});

// Cliente para updateQuote: agrega SELECT ... FOR UPDATE, UPDATE, DELETE items, INSERT items, y getQuote final.
function updateClient(status) {
  const base = draftClient();
  const inner = base.query;
  base.query = async (sql, params) => {
    base.writes.push({ sql, params });
    if (/FROM quotes q[\s\S]*FOR UPDATE/i.test(sql)) {
      return { rows: [{ id: "q1", status }], rowCount: 1 };
    }
    if (/FROM quote_items/i.test(sql)) {
      return { rows: [{ product_id: "p1", unit_price: "750" }], rowCount: 1 };
    }
    if (/^\s*UPDATE quotes/i.test(sql)) return { rows: [], rowCount: 1 };
    if (/DELETE FROM quote_items/i.test(sql)) return { rows: [], rowCount: 1 };
    if (/INSERT INTO quote_items/i.test(sql)) return { rows: [], rowCount: 1 };
    // getQuote() final (mapQuote): devolver una fila mínima válida.
    if (/FROM quotes q[\s\S]*LEFT JOIN clients/i.test(sql)) {
      return { rows: [{ id: "q1", quote_number: "P-0001", fecha_emision: "2026-08-13",
        fecha_vencimiento: "2026-08-28", cliente_nombre: "ACME", cliente_razon_social: "ACME SA",
        cliente_domicilio: "Calle 1", cliente_telefono: "11", cliente_cond_iva: "RI",
        cliente_cuit: "30111111118", total: "2420", active_price_list: 2, price_list_name: "L2 - ANCLA",
        discount_percent: "0", net_amount: "2000", discount_amount: "0", subtotal_amount: "2000",
        include_vat: true, vat_rate: "21", desired_document: "factura_a", vat_amount: "420",
        validity_days: 15, productos_json: [], estado: "pendiente", creado_por: "user",
        created_at: "2026-08-13", dias_restantes: 15 }], rowCount: 1 };
    }
    return inner(sql, params);
  };
  return base;
}

test("updateQuote conserva el precio original y reemplaza items de un pendiente", async () => {
  const client = updateClient("pendiente");
  const session = { companyId: 1, userId: "u1", username: "user" };
  quotesDb.withCompanyContext = async (cb) => cb(client);
  // getQuote() final se hace via queryWithCompanyContext (fuera de la transacción), no via el client:
  // enrutarlo al mismo mock para que devuelva la fila mínima válida definida en updateClient().
  quotesDb.queryWithCompanyContext = async (sql, params) => client.query(sql, params);
  const result = await quotes.updateQuote(session, "q1", baseInput);
  assert.equal(result.total, 2420);
  assert.ok(client.writes.some((w) => /^\s*UPDATE quotes/i.test(w.sql)));
  assert.ok(client.writes.some((w) => /DELETE FROM quote_items/i.test(w.sql)));
  assert.ok(client.writes.some((w) => /INSERT INTO quote_items/i.test(w.sql)));
  const insert = client.writes.find((w) => /INSERT INTO quote_items/i.test(w.sql));
  assert.equal(insert.params[4], 750);
  // No cambia el número ni el estado en el UPDATE:
  const upd = client.writes.find((w) => /^\s*UPDATE quotes/i.test(w.sql));
  assert.doesNotMatch(upd.sql, /quote_number\s*=/i);
  assert.doesNotMatch(upd.sql, /status\s*=/i);
});

test("updateQuote rechaza (409) un presupuesto no pendiente", async () => {
  const client = updateClient("aceptada");
  const session = { companyId: 1, userId: "u1", username: "user" };
  quotesDb.withCompanyContext = async (cb) => cb(client);
  await assert.rejects(() => quotes.updateQuote(session, "q1", baseInput), (e) => e.status === 409);
});
