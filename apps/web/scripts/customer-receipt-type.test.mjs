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
const receiptTypes = loadTypeScriptModule("../src/lib/receipt-types.ts");
const customers = loadTypeScriptModule("../src/lib/catalog-management.ts", {
  "@/lib/api-response": { ApiError },
  "@/lib/db": {
    clearReadQueryCache: () => undefined,
    queryWithCompanyContext: async () => ({ rows: [] }),
    withCompanyContext: async () => undefined,
  },
  "@/lib/order-pricing": { resolvePriceListName: (value) => value },
  "@/lib/pagination": { parsePagination: () => ({ page: 1, pageSize: 25, offset: 0 }) },
  "@/lib/receipt-types": receiptTypes,
  "@/lib/request-body": requestBody,
});

test("customer receipt type accepts only the supported document subset and normalizes aliases", () => {
  assert.deepEqual(customers.CUSTOMER_RECEIPT_OPTIONS, ["Remito", "Factura A", "Factura B"]);
  assert.equal(customers.normalizeCustomerReceiptType("remito"), "Remito");
  assert.equal(customers.normalizeCustomerReceiptType("Factura A"), "Factura A");
  assert.equal(customers.normalizeCustomerReceiptType("factura_a"), "Factura A");
  assert.equal(customers.normalizeCustomerReceiptType("A"), "Factura A");
  assert.equal(customers.normalizeCustomerReceiptType("B"), "Factura B");

  for (const invalid of ["", "Factura C", "Nota de credito A", "otro"]) {
    assert.throws(
      () => customers.normalizeCustomerReceiptType(invalid),
      (error) =>
        error instanceof ApiError &&
        error.status === 400 &&
        /Remito, Factura A o Factura B/.test(error.message),
    );
  }
});

test("new customers require a receipt type while PATCH defaults preserve historical values", () => {
  assert.equal(
    customers.customerInputFromBody({ name: "Cliente de prueba", receiptType: "Remito" }).receiptType,
    "Remito",
  );
  assert.equal(
    customers.customerInputFromBody({ name: "Cliente", tipo_comprobante: "facturab" }).receiptType,
    "Factura B",
  );
  assert.throws(() => customers.customerInputFromBody({ name: "Cliente" }), /comprobante asociado/);
  assert.throws(
    () => customers.customerInputFromBody({ name: "Cliente", receiptType: "" }),
    /comprobante asociado/,
  );

  assert.equal(
    customers.customerInputFromBody({ name: "Cliente editado" }, { receiptType: "" }).receiptType,
    "",
  );
  assert.equal(
    customers.customerInputFromBody(
      { name: "Cliente editado" },
      { receiptType: "Factura C" },
    ).receiptType,
    "Factura C",
  );
  assert.throws(
    () =>
      customers.customerInputFromBody(
        { name: "Cliente", receiptType: "Factura C" },
        { receiptType: "Remito" },
      ),
    /Remito, Factura A o Factura B/,
  );
});

test("customer persistence and UI carry receipt type without replacing remote customer tools", () => {
  const management = readFileSync(new URL("../src/lib/catalog-management.ts", import.meta.url), "utf8");
  const catalog = readFileSync(new URL("../src/lib/catalog.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/app/customers/page.tsx", import.meta.url), "utf8");
  const actions = readFileSync(new URL("../src/app/customers/actions.ts", import.meta.url), "utf8");
  const detailPage = readFileSync(new URL("../src/app/customers/[id]/page.tsx", import.meta.url), "utf8");
  const rowActions = readFileSync(
    new URL("../src/app/customers/customer-row-actions.tsx", import.meta.url),
    "utf8",
  );
  const patchRoute = readFileSync(
    new URL("../src/app/api/customers/[id]/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(management, /price_list_name, receipt_type/);
  assert.match(management, /seller_name,[\s\S]*receipt_type, notes, empresa_id/);
  assert.match(
    management,
    /SET display_name[\s\S]*receipt_type = COALESCE\(NULLIF\(\$12, ''\), receipt_type\)/,
  );
  assert.match(management, /export async function updateCustomerReceiptType[\s\S]*SET receipt_type = \$1/);
  assert.match(
    management,
    /export async function createCustomer[\s\S]*clearReadQueryCache\(\);\s*return getCustomer/,
  );
  assert.match(
    management,
    /export async function updateCustomer[\s\S]*clearReadQueryCache\(\);\s*return getCustomer/,
  );
  assert.match(management, /export async function updateCustomerReceiptType[\s\S]*clearReadQueryCache\(\)/);
  assert.match(catalog, /price_list_name, receipt_type/);
  assert.match(catalog, /receiptType: row\.receipt_type \?\? ""/);
  assert.match(page, /<Select defaultValue=""[^>]*name="receiptType"[^>]*required>/);
  assert.match(page, /<option disabled value="">\s*Seleccionar comprobante\s*<\/option>/);
  assert.doesNotMatch(page, /<Select defaultValue="Remito"[^>]*name="receiptType"/);
  assert.match(page, /href={`\/customers\/\$\{customer\.id\}`}/);
  assert.match(page, /canEditCustomers/);
  assert.match(actions, /deleteCustomerAction/);
  assert.match(actions, /mergeCustomersAction/);
  assert.match(actions, /resource: "clientes", action: "editar"/);
  assert.match(actions, /revalidatePath\("\/orders"\)/);
  assert.match(detailPage, /CustomerRowActions/);
  assert.match(rowActions, /Vendedor a cargo/);
  assert.match(rowActions, /Fusionar/);
  assert.match(patchRoute, /receiptType: current\.receiptType/);
  assert.match(patchRoute, /assignedSeller: current\.assignedSeller/);
});

test("customer CSV import rejects missing, unknown, and unsupported receipt types per row", async () => {
  const insertedRows = [];
  const imports = loadTypeScriptModule("../src/lib/imports.ts", {
    "@/lib/api-response": { ApiError },
    "@/lib/catalog-management": {
      normalizeCustomerReceiptType: customers.normalizeCustomerReceiptType,
    },
    "@/lib/db": {
      clearReadQueryCache: () => undefined,
      queryWithCompanyContext: async () => ({ rows: [] }),
      withCompanyContext: async (_companyId, callback) =>
        callback({
          query: async (sql, params = []) => {
            if (/FROM listas_precio/.test(sql)) return { rows: [{ nombre: "Lista 1" }] };
            if (/SELECT id FROM clients/.test(sql)) return { rows: [] };
            if (/INSERT INTO clients/.test(sql)) insertedRows.push(params);
            return { rows: [], rowCount: 0 };
          },
        }),
    },
    "@/lib/order-pricing": { resolvePriceListName: (value) => value || "Lista 1" },
    "@/lib/request-body": requestBody,
  });

  assert.equal(imports.parseReceiptType("Remito"), "Remito");
  assert.equal(imports.parseReceiptType("Factura A"), "Factura A");
  assert.equal(imports.parseReceiptType("B"), "Factura B");
  assert.throws(() => imports.parseReceiptType(""), /comprobante asociado/);
  assert.throws(() => imports.parseReceiptType("Factura C"), /Remito, Factura A o Factura B/);
  assert.throws(() => imports.parseReceiptType("Ticket"), /Remito, Factura A o Factura B/);

  const header = Array.from({ length: 14 }, (_, index) => `columna_${index}`);
  const customerRow = (code, receiptType) => {
    const row = Array(14).fill("");
    row[0] = code;
    row[1] = `Cliente ${code}`;
    row[10] = "Lista 1";
    row[13] = receiptType;
    return row;
  };
  const csv = [
    header,
    customerRow("SIN-COMPROBANTE", ""),
    customerRow("FACTURA-C", "Factura C"),
    customerRow("DESCONOCIDO", "Ticket"),
    customerRow("VALIDO", "Factura B"),
  ]
    .map((row) => row.join(";"))
    .join("\n");
  const formData = new FormData();
  formData.set("csv_file", new File([csv], "clientes.csv", { type: "text/csv" }));

  const result = await imports.importCustomersFromCsv(
    new Request("http://localhost/api/imports/customers", { method: "POST", body: formData }),
    1,
  );

  assert.equal(result.processed, 4);
  assert.equal(result.inserted, 1);
  assert.equal(result.skipped, 3);
  assert.equal(insertedRows.length, 1);
  assert.equal(insertedRows[0][12], "Factura B");
  assert.ok(result.errors.some((error) => /Fila 2:.*comprobante asociado/.test(error)));
  assert.ok(result.errors.some((error) => /Fila 3:.*comprobante asociado/.test(error)));
  assert.ok(result.errors.some((error) => /Fila 4:.*comprobante asociado/.test(error)));
});
