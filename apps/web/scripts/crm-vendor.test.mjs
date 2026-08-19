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

const parsePagination = loadTypeScriptModule("../src/lib/pagination.ts");

// Mock de @/lib/db que registra cada query y responde por regex.
const dbCalls = [];
let collectionsCall = null;
function makeCrm(queryImpl) {
  dbCalls.length = 0;
  collectionsCall = null;
  return loadTypeScriptModule("../src/lib/crm.ts", {
    "@/lib/api-response": { ApiError },
    "@/lib/crm-quotes": { classifyQuote: () => null, topQuoteClients: () => [] },
    "@/lib/customer-accounts": { listOpenCustomerAccounts: async () => ({ accounts: [], totals: { debit: 0, credit: 0 } }) },
    "@/lib/db": {
      queryWithCompanyContext: async (companyId, sql, params) => {
        dbCalls.push({ sql, params });
        return queryImpl(sql, params);
      },
    },
    "@/lib/messages": { getCustomerFollowUp: async () => ({ groups: {} }) },
    "@/lib/order-status": { normalizedOrderStatusSql: () => "estado" },
    "@/lib/pricing": { listPriceListParameters: async () => [] },
    "@/lib/sales-source-sql": { canonicalSalesSourceSql: () => "true" },
    "@/lib/pagination": parsePagination,
    "@/lib/collections": {
      listSalesToCollectWhere: async (companyId, extraWhere, extraParams) => {
        collectionsCall = { companyId, extraWhere, extraParams };
        return [];
      },
    },
  });
}

const session = { companyId: 1, userId: "u1", username: "juan", displayName: "Juan Perez" };

test("getVendorCustomers filtra por vendedor (propio/a cargo), busca y pagina", async () => {
  const crm = makeCrm((sql) => {
    if (/COUNT\(\*\)/i.test(sql)) return { rows: [{ total: "2" }] };
    return {
      rows: [
        { id: "c1", display_name: "ACME", legal_name: "ACME SA", tax_id: "30111111118",
          fiscal_condition: "RI", phone: "11", locality: "CABA", province: "BA",
          price_list_name: "L2 - ANCLA", active: true, relation: "propio" },
        { id: "c2", display_name: "Beta", legal_name: "", tax_id: "", fiscal_condition: "",
          phone: "", locality: "", province: "", price_list_name: "", active: false, relation: "a cargo" },
      ],
    };
  });
  const result = await crm.getVendorCustomers(session, { query: "ac", page: "1" });
  // SQL de filas incluye filtro de vendedor + busqueda + LIMIT/OFFSET
  const rowsCall = dbCalls.find((c) => /CASE WHEN/i.test(c.sql));
  assert.match(rowsCall.sql, /assigned_seller/i);
  assert.match(rowsCall.sql, /seller_name/i);
  assert.match(rowsCall.sql, /ILIKE/i);
  assert.match(rowsCall.sql, /LIMIT \$\d+ OFFSET \$\d+/i);
  // names van como $2 (array en MAYUSCULAS)
  assert.ok(rowsCall.params[1].includes("JUAN"));
  // mapea relation y estado
  assert.equal(result.data[0].relation, "propio");
  assert.equal(result.data[0].status, "Activo");
  assert.equal(result.data[1].relation, "a cargo");
  assert.equal(result.data[1].status, "Inactivo");
  assert.equal(result.meta.total, 2);
});

test("assertVendorOwnsClient lanza 403 si el cliente no es del vendedor", async () => {
  const crm = makeCrm(() => ({ rows: [] }));
  await assert.rejects(
    () => crm.assertVendorOwnsClient(session, "22222222-2222-2222-2222-222222222222"),
    (e) => e.status === 403,
  );
});

test("assertVendorOwnsClient pasa y consulta clients por seller_name/assigned_seller", async () => {
  const crm = makeCrm(() => ({ rows: [{ ok: 1 }] }));
  await crm.assertVendorOwnsClient(session, "22222222-2222-2222-2222-222222222222");
  const call = dbCalls.find((c) => /FROM clients c/i.test(c.sql));
  assert.match(call.sql, /seller_name/i);
  assert.match(call.sql, /assigned_seller/i);
  assert.ok(call.params[2].includes("JUAN"));
});
