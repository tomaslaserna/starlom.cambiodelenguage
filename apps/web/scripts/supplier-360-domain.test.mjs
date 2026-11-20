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
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const requestBody = loadTypeScriptModule("../src/lib/request-body.ts", {
  "@/lib/api-response": { ApiError },
});
const receiptTypes = loadTypeScriptModule("../src/lib/receipt-types.ts");
const customerReceiptTypes = loadTypeScriptModule("../src/lib/customer-receipt-types.ts");

function loadCatalog(dbOverrides = {}) {
  return loadTypeScriptModule("../src/lib/catalog-management.ts", {
    "@/lib/api-response": { ApiError },
    "@/lib/db": {
      clearReadQueryCache: () => undefined,
      queryWithCompanyContext: async () => ({ rows: [] }),
      withCompanyContext: async () => undefined,
      ...dbOverrides,
    },
    "@/lib/order-pricing": { resolvePriceListName: (value) => value },
    "@/lib/pagination": { parsePagination: () => ({ page: 1, pageSize: 25, offset: 0 }) },
    "@/lib/receipt-types": receiptTypes,
    "@/lib/customer-receipt-types": customerReceiptTypes,
    "@/lib/request-body": requestBody,
  });
}

const fullInput = {
  name: "  Maralimm  ",
  legalName: "  Maralimm SAS  ",
  contactName: "  Andrea  ",
  taxId: "30-71147802-2",
  fiscalCondition: " Responsable inscripto ",
  rubric: " Descartables ",
  phone: " 3515550000 ",
  email: " VENTAS@MARALIMM.COM ",
  address: " Ruta 9 ",
  locality: " Córdoba ",
  province: " Córdoba ",
  notes: " Entrega por la mañana ",
  paymentTermDays: "30",
  deliveryLeadDays: "2",
  minimumOrderAmount: "125000.50",
  shippingMethod: " Reparto propio ",
  bankName: " Santander ",
  bankAccountType: " Cuenta corriente ",
  bankAccountHolder: " Maralimm SAS ",
  bankAccountIdentifier: "0000003100030821892599",
  bankAlias: " maralimm.cobros ",
};

test("supplier input separates identity and contact while normalizing fiscal and bank data", () => {
  const catalog = loadCatalog();
  const input = catalog.supplierInputFromBody(fullInput);

  assert.deepEqual(input, {
    name: "Maralimm",
    legalName: "Maralimm SAS",
    contactName: "Andrea",
    taxId: "30711478022",
    fiscalCondition: "Responsable inscripto",
    rubric: "Descartables",
    phone: "3515550000",
    email: "ventas@maralimm.com",
    address: "Ruta 9",
    locality: "Córdoba",
    province: "Córdoba",
    notes: "Entrega por la mañana",
    paymentTermDays: 30,
    deliveryLeadDays: 2,
    minimumOrderAmount: 125000.5,
    shippingMethod: "Reparto propio",
    bankName: "Santander",
    bankAccountType: "Cuenta corriente",
    bankAccountHolder: "Maralimm SAS",
    bankAccountIdentifier: "0000003100030821892599",
    bankAlias: "maralimm.cobros",
  });
});

test("supplier input rejects malformed identifiers, negatives, and missing name", () => {
  const catalog = loadCatalog();
  assert.throws(() => catalog.supplierInputFromBody({ ...fullInput, taxId: "20-123" }), /11 dígitos/);
  assert.throws(() => catalog.supplierInputFromBody({ ...fullInput, bankAccountIdentifier: "123" }), /22 dígitos/);
  assert.throws(() => catalog.supplierInputFromBody({ ...fullInput, paymentTermDays: "-1" }), /plazo de pago/i);
  assert.throws(() => catalog.supplierInputFromBody({ ...fullInput, deliveryLeadDays: "-1" }), /plazo de entrega/i);
  assert.throws(() => catalog.supplierInputFromBody({ ...fullInput, minimumOrderAmount: "-1" }), /compra mínima/i);
  assert.throws(() => catalog.supplierInputFromBody({ ...fullInput, name: " " }), /nombre es obligatorio/i);
});

test("supplier PATCH defaults preserve every omitted field", () => {
  const catalog = loadCatalog();
  const defaults = catalog.supplierInputFromBody(fullInput);
  const input = catalog.supplierInputFromBody({ name: "Nombre nuevo" }, defaults);
  assert.deepEqual(input, { ...defaults, name: "Nombre nuevo" });
});

function supplierRow() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    display_name: "Anterior",
    legal_name: "Anterior SAS",
    contact_name: "Ana",
    tax_id: "30711478022",
    fiscal_condition: "RI",
    rubric: "Descartables",
    phone: "351",
    email: "a@a.com",
    address: "Calle 1",
    locality: "Córdoba",
    province: "Córdoba",
    notes: "Nota",
    payment_term_days: 7,
    delivery_lead_days: 1,
    minimum_order_amount: "1000",
    shipping_method: "Reparto",
    bank_name: "Banco",
    bank_account_type: "CC",
    bank_account_holder: "Anterior SAS",
    bank_account_identifier: "0000003100030821892599",
    bank_alias: "anterior",
    created_at: "2026-01-01T00:00:00Z",
  };
}

test("updateSupplier scopes the row, updates all master fields, and audits old and new data atomically", async () => {
  const statements = [];
  const current = supplierRow();
  const client = {
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (/SELECT[\s\S]+FROM suppliers/.test(sql)) return { rows: [current] };
      if (/UPDATE suppliers/.test(sql)) return { rows: [{ id: current.id }] };
      return { rows: [] };
    },
  };
  let cacheClears = 0;
  const catalog = loadCatalog({
    clearReadQueryCache: () => { cacheClears += 1; },
    withCompanyContext: async (companyId, callback) => {
      assert.equal(companyId, 9);
      return callback(client);
    },
    queryWithCompanyContext: async () => ({ rows: [current] }),
  });
  const input = catalog.supplierInputFromBody(fullInput);

  await catalog.updateSupplier({ companyId: 9, userId: "employee-1" }, current.id, input);

  const select = statements.find(({ sql }) => /SELECT[\s\S]+FROM suppliers/.test(sql));
  assert.match(select.sql, /id = \$1::uuid AND empresa_id = \$2 AND active = true/);
  const update = statements.find(({ sql }) => /UPDATE suppliers/.test(sql));
  for (const column of ["contact_name", "fiscal_condition", "locality", "province", "delivery_lead_days", "minimum_order_amount", "shipping_method", "bank_name", "bank_account_type", "bank_account_holder", "bank_account_identifier", "bank_alias"]) {
    assert.match(update.sql, new RegExp(`${column} = \\$\\d+`));
  }
  assert.match(update.sql, /empresa_id = \$\d+ AND active = true/);
  const audits = statements.filter(({ sql }) => /INSERT INTO audit_log/.test(sql));
  assert.equal(audits.length, 1);
  assert.equal(audits[0].params[1], "supplier.updated");
  assert.equal(audits[0].params[2], "suppliers");
  assert.equal(JSON.parse(audits[0].params[4]).name, "Anterior");
  assert.deepEqual(JSON.parse(audits[0].params[5]), input);
  assert.equal(cacheClears, 1);
});

test("updateSupplier does not audit a missing or cross-company supplier", async () => {
  const statements = [];
  const catalog = loadCatalog({
    withCompanyContext: async (_companyId, callback) => callback({
      async query(sql, params = []) {
        statements.push({ sql, params });
        return { rows: [] };
      },
    }),
  });

  await assert.rejects(
    () => catalog.updateSupplier({ companyId: 9, userId: "employee-1" }, supplierRow().id, catalog.supplierInputFromBody(fullInput)),
    (error) => error instanceof ApiError && error.status === 404,
  );
  assert.equal(statements.filter(({ sql }) => /INSERT INTO audit_log/.test(sql)).length, 0);
});
