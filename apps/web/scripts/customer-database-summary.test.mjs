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

const requestBody = loadTypeScriptModule("../src/lib/request-body.ts", {
  "@/lib/api-response": { ApiError },
});

const customers = loadTypeScriptModule("../src/lib/catalog-management.ts", {
  "@/lib/customer-segments": loadTypeScriptModule("../src/lib/customer-segments.ts"),
  "@/lib/customer-receipt-types": loadTypeScriptModule("../src/lib/customer-receipt-types.ts"),
  "@/lib/api-response": { ApiError },
  "@/lib/db": {
    clearReadQueryCache: () => undefined,
    queryWithCompanyContext: async () => ({ rows: [] }),
    withCompanyContext: async () => undefined,
  },
  "@/lib/order-pricing": { resolvePriceListName: (value) => value },
  "@/lib/pagination": { parsePagination: () => ({ page: 1, pageSize: 25, offset: 0 }) },
  "@/lib/receipt-types": loadTypeScriptModule("../src/lib/receipt-types.ts"),
  "@/lib/request-body": requestBody,
});

const completeRemito = {
  name: "Cliente completo",
  phone: "3515555555",
  address: "Av. Siempre Viva 123",
  city: "Cordoba",
  province: "Cordoba",
  priceList: "LISTA 1",
  receiptType: "Remito",
  seller: "Matias",
  businessSegment: "Restaurante",
};

test("el alta rechaza fichas sin los datos operativos obligatorios", () => {
  for (const field of ["phone", "address", "city", "province", "priceList", "seller", "businessSegment"]) {
    const input = customers.customerInputFromBody({ ...completeRemito, [field]: "" });
    assert.throws(
      () => customers.validateNewCustomerInput(input),
      (error) => error instanceof ApiError && error.status === 400,
      `debería rechazar ${field}`,
    );
  }
  assert.doesNotThrow(() => customers.validateNewCustomerInput(customers.customerInputFromBody(completeRemito)));
});

test("una ficha con factura exige razón social, identificación fiscal y condición de IVA", () => {
  const invoice = { ...completeRemito, receiptType: "Factura A" };
  assert.throws(
    () => customers.validateNewCustomerInput(customers.customerInputFromBody(invoice)),
    /razón social/i,
  );
  assert.throws(
    () => customers.validateNewCustomerInput(customers.customerInputFromBody({ ...invoice, businessName: "Cliente SA" })),
    /CUIT\/DNI/i,
  );
  assert.throws(
    () => customers.validateNewCustomerInput(customers.customerInputFromBody({ ...invoice, businessName: "Cliente SA", taxId: "30718888009" })),
    /condición de IVA/i,
  );
  assert.doesNotThrow(() => customers.validateNewCustomerInput(customers.customerInputFromBody({
    ...invoice,
    businessName: "Cliente SA",
    taxId: "30-71888800-9",
    vatCondition: "Responsable Inscripto",
  })));
});

test("los indicadores cuentan toda la cartera y clasifican por última compra entregada", async () => {
  const calls = [];
  const statsModule = loadTypeScriptModule("../src/lib/customer-database-stats.ts", {
    "@/lib/db": {
      queryWithCompanyContext: async (companyId, sql, params) => {
        calls.push({ companyId, sql, params });
        return {
          rows: [
            { client_id: "a", last_purchase_date: "2026-11-27" },
            { client_id: "b", last_purchase_date: "2026-10-28" },
            { client_id: "c", last_purchase_date: "2026-08-29" },
            { client_id: "d", last_purchase_date: "2026-08-28" },
            { client_id: "e", last_purchase_date: null },
          ],
        };
      },
    },
    "@/lib/order-status": { normalizedOrderStatusSql: () => "NORMALIZED_STATUS" },
    "@/lib/sales-source-sql": { canonicalSalesSourceSql: () => "CANONICAL_SOURCE" },
    "@/lib/timezone": { localDateIso: () => "2026-11-27" },
  });

  const result = await statsModule.getCustomerDatabaseStats(7, null, "2026-11-27");
  assert.deepEqual(result, { total: 5, active: 3, habitual: 2 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].companyId, 7);
  assert.deepEqual(calls[0].params, [7]);
});

test("los indicadores respetan el alcance de clientes permitido sin paginación", async () => {
  const calls = [];
  const statsModule = loadTypeScriptModule("../src/lib/customer-database-stats.ts", {
    "@/lib/db": {
      queryWithCompanyContext: async (companyId, sql, params) => {
        calls.push({ companyId, sql, params });
        return { rows: [{ client_id: "permitido", last_purchase_date: "2026-11-01" }] };
      },
    },
    "@/lib/order-status": { normalizedOrderStatusSql: () => "NORMALIZED_STATUS" },
    "@/lib/sales-source-sql": { canonicalSalesSourceSql: () => "CANONICAL_SOURCE" },
    "@/lib/timezone": { localDateIso: () => "2026-11-27" },
  });

  assert.deepEqual(
    await statsModule.getCustomerDatabaseStats(7, ["permitido"], "2026-11-27"),
    { total: 1, active: 1, habitual: 1 },
  );
  assert.deepEqual(calls[0].params, [7, ["permitido"]]);
});
