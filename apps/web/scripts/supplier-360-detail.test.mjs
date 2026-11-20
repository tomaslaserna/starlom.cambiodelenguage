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

const supplier = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Proveedor",
  legalName: "Proveedor SAS",
  contactName: "Ana",
  taxId: "30711478022",
  fiscalCondition: "RI",
  rubric: "Papel",
  phone: "351",
  email: "ventas@proveedor.com",
  address: "Calle 1",
  locality: "Córdoba",
  province: "Córdoba",
  notes: "",
  paymentTermDays: 15,
  deliveryLeadDays: 2,
  minimumOrderAmount: 100000,
  shippingMethod: "Reparto",
  bankName: "Banco",
  bankAccountType: "CC",
  bankAccountHolder: "Proveedor SAS",
  bankAccountIdentifier: "0000003100030821892599",
  bankAlias: "proveedor",
  createdAt: "2026-01-01T00:00:00Z",
};

function loadDetail(queryWithCompanyContext, getSupplier = async () => supplier) {
  return loadTypeScriptModule("../src/lib/supplier-detail.ts", {
    "@/lib/catalog-management": { getSupplier },
    "@/lib/db": { queryWithCompanyContext },
  });
}

test("supplier detail maps received metrics, active products, and traceable mixed purchase states", async () => {
  const queries = [];
  const detail = loadDetail(async (companyId, sql, params) => {
    queries.push({ companyId, sql, params });
    if (/received_purchase_count/.test(sql)) {
      return { rows: [{ total_purchased: "3000", received_purchase_count: "2", last_purchase_date: "2026-11-10", outstanding_balance: "400", active_product_count: "1" }] };
    }
    if (/FROM products/.test(sql)) {
      return { rows: [{ id: "p1", sku: "PAP-1", name: "Papel", category: "Papelería", cost: "120", presentation_units: 6 }] };
    }
    return {
      rows: [
        { id: "r3", purchase_number: "OC-R3", purchase_date: null, description: "Pendiente", total_amount: "500", paid_amount: "0", balance: "500", due_date: null, status: "pendiente", tax_mode: "con_iva", vat_rate: "21", package_status: "pendiente" },
        { id: "r2", purchase_number: "C-002", purchase_date: "2026-11-10", description: "Sobrepagada", total_amount: "1000", paid_amount: "1200", balance: "0", due_date: "2026-11-25", status: "recibida", tax_mode: "con_iva", vat_rate: "21", package_status: "revisado" },
        { id: "r1", purchase_number: "C-001", purchase_date: "2026-11-01", description: "Parcial", total_amount: "2000", paid_amount: "1600", balance: "400", due_date: "2026-11-16", status: "recibida", tax_mode: "sin_iva", vat_rate: "0", package_status: "revisado" },
        { id: "r0", purchase_number: "C-000", purchase_date: "2026-10-01", description: "Cancelada", total_amount: "700", paid_amount: "0", balance: "700", due_date: null, status: "cancelada", tax_mode: "con_iva", vat_rate: "10.5", package_status: "pendiente" },
      ],
    };
  });

  const result = await detail.getSupplierDetail360(7, supplier.id);

  assert.deepEqual(result.summary, {
    totalPurchased: 3000,
    receivedPurchaseCount: 2,
    lastPurchaseDate: "2026-11-10",
    outstandingBalance: 400,
    paymentTermDays: 15,
    activeProductCount: 1,
  });
  assert.deepEqual(result.products, [{ id: "p1", sku: "PAP-1", name: "Papel", category: "Papelería", cost: 120, presentationUnits: 6 }]);
  assert.deepEqual(result.purchases.map((purchase) => purchase.status), ["pendiente", "recibida", "recibida", "cancelada"]);
  assert.equal(result.purchases[1].balance, 0);
  assert.ok(queries.every((query) => query.companyId === 7 && query.params.includes(7) && query.params.includes(supplier.id)));
});

test("supplier detail SQL scopes the company and encodes metric and ordering rules", () => {
  const source = readFileSync(new URL("../src/lib/supplier-detail.ts", import.meta.url), "utf8");
  assert.match(source, /empresa_id = \$1/);
  assert.match(source, /supplier_id = \$2::uuid/);
  assert.match(source, /FILTER \(WHERE status = 'recibida'\)/);
  assert.match(source, /GREATEST\(total_amount - paid_amount, 0\)/);
  assert.match(source, /FROM products[\s\S]*active = true/);
  assert.match(source, /ORDER BY name ASC/);
  assert.match(source, /ORDER BY COALESCE\(purchase_date, created_at::date\) DESC/);
  assert.match(source, /'OC-'\s*\|\|\s*upper\(left\(id::text, 8\)\) AS purchase_number/);
  assert.doesNotMatch(source, /SELECT id::text AS id, purchase_number,/);
});

test("supplier detail returns stable empty values and does not query activity after a 404", async () => {
  let queryCount = 0;
  const emptyDetail = loadDetail(async () => {
    queryCount += 1;
    if (queryCount === 1) return { rows: [{ total_purchased: "0", received_purchase_count: "0", last_purchase_date: null, outstanding_balance: "0", active_product_count: "0" }] };
    return { rows: [] };
  });
  const empty = await emptyDetail.getSupplierDetail360(7, supplier.id);
  assert.equal(empty.summary.totalPurchased, 0);
  assert.equal(empty.summary.receivedPurchaseCount, 0);
  assert.equal(empty.summary.lastPurchaseDate, null);
  assert.equal(empty.summary.outstandingBalance, 0);
  assert.deepEqual(empty.products, []);
  assert.deepEqual(empty.purchases, []);

  let leakedQueries = 0;
  const forbidden = loadDetail(
    async () => { leakedQueries += 1; return { rows: [] }; },
    async () => { throw Object.assign(new Error("Proveedor no encontrado"), { status: 404 }); },
  );
  await assert.rejects(() => forbidden.getSupplierDetail360(7, supplier.id), /Proveedor no encontrado/);
  assert.equal(leakedQueries, 0);
});
