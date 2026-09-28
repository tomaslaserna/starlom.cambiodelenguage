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

const searchOptions = loadTypeScriptModule("../src/lib/search-options.ts");
const inventorySearch = loadTypeScriptModule("../src/lib/inventory-search.ts", {
  "@/lib/search-options": searchOptions,
});

let inventoryQueries = [];
const inventory = loadTypeScriptModule("../src/lib/inventory.ts", {
  "@/lib/api-response": { ApiError: class ApiError extends Error {} },
  "@/lib/auth": {},
  "@/lib/db": {
    clearReadQueryCache() {},
    withCompanyContext() {},
    async queryWithCompanyContext(_companyId, sql, params) {
      inventoryQueries.push({ sql, params });
      if (sql.includes('p.category_code AS "categoryCode"')) {
        return { rows: products };
      }
      return {
        rows: products
          .filter((product) => !Array.isArray(params[1]) || params[1].includes(product.id))
          .map((product) => ({
            id: product.id,
            sku: product.sku,
            category_code: product.categoryCode,
            category: product.category,
            supplier: product.supplier,
            name: product.name,
            cost: "100",
            stock: "6",
          })),
      };
    },
  },
  "@/lib/inventory-search": inventorySearch,
  "@/lib/request-body": { textField() {}, uuidParam() {} },
  "@/lib/stock-import": {},
});

const products = [
  { id: "1", name: "GUANTE LATEX OFERTA X 100", sku: "GL100", categoryCode: "GUA", category: "Guantes", supplier: "Magnum" },
  { id: "2", name: "DESODORANTE PARA PISOS LIMÓN", sku: "DP5", categoryCode: "LIQ", category: "Líquidos", supplier: "AFASON" },
  { id: "3", name: "BOBINA INDUSTRIAL BLANCA", sku: "BOB25", categoryCode: "PAP", category: "Papelería", supplier: null },
  { id: "4", name: "MOPA PROFESIONAL 100 CM", sku: "MOPA100", categoryCode: "TXT", category: "Textiles", supplier: "Magnum" },
  { id: "5", name: "MOPA PROFESIONAL 80 CM", sku: "MOPA80", categoryCode: "TXT", category: "Textiles", supplier: "Magnum" },
  { id: "6", name: "REPUESTO 100 CM PARA MOPA", sku: "REP100", categoryCode: "TXT", category: "Textiles", supplier: "Magnum" },
  { id: "7", name: "CABO METÁLICO 100 CM", sku: "MOPA-CABO", categoryCode: "TXT", category: "Textiles", supplier: "Magnum" },
];

test("inventory search matches a word anywhere in the product name", () => {
  const matches = inventorySearch.rankInventoryProductMatches(products, "oferta", 40);
  assert.deepEqual(matches.map((product) => product.id), ["1"]);
});

test("inventory search requires every typed word in the product name regardless of order", () => {
  const matches = inventorySearch.rankInventoryProductMatches(products, "mopa 100", 40);
  assert.deepEqual(matches.map((product) => product.id), ["4", "6"]);
});

test("inventory search ignores accents and supports approximate spelling", () => {
  assert.deepEqual(
    inventorySearch.rankInventoryProductMatches(products, "limon", 40).map((product) => product.id),
    ["2"],
  );
  assert.deepEqual(
    inventorySearch.rankInventoryProductMatches(products, "ofreta", 40).map((product) => product.id),
    ["1"],
  );
});

test("inventory search matches code, category and supplier", () => {
  assert.deepEqual(
    inventorySearch.rankInventoryProductMatches(products, "magnum gua", 40).map((product) => product.id),
    ["1"],
  );
  assert.deepEqual(
    inventorySearch.rankInventoryProductMatches(products, "BOB25", 40).map((product) => product.id),
    ["3"],
  );
});

test("inventory query ranks the full active catalog before loading stock details", async () => {
  inventoryQueries = [];
  const matches = await inventory.listInventoryProducts(1, "oferta", 40);

  assert.deepEqual(matches.map((product) => product.id), ["1"]);
  assert.equal(inventoryQueries.length, 2);
  assert.match(inventoryQueries[0].sql, /WHERE p\.empresa_id = \$1/);
  assert.doesNotMatch(inventoryQueries[0].sql, /ILIKE/);
  assert.deepEqual(inventoryQueries[1].params, [1, ["1"]]);
});

test("inventory search parses stock keywords and keeps the remaining text", () => {
  assert.deepEqual(inventory.parseInventorySearchQuery("mopa #sinstock 100"), {
    searchQuery: "mopa 100",
    stockFilter: "zero",
  });
  assert.deepEqual(inventory.parseInventorySearchQuery("#stock-"), {
    searchQuery: "",
    stockFilter: "negative",
  });
});

test("stock-only keywords filter the full catalog without a result limit", async () => {
  inventoryQueries = [];
  await inventory.listInventoryProducts(1, "#sinstock", 40);
  assert.equal(inventoryQueries.length, 1);
  assert.match(inventoryQueries[0].sql, /COALESCE\(stock\.current_stock, 0\) = 0/);
  assert.doesNotMatch(inventoryQueries[0].sql, /LIMIT \$2/);

  inventoryQueries = [];
  await inventory.listInventoryProducts(1, "#stock-", 40);
  assert.equal(inventoryQueries.length, 1);
  assert.match(inventoryQueries[0].sql, /COALESCE\(stock\.current_stock, 0\) < 0/);
  assert.doesNotMatch(inventoryQueries[0].sql, /LIMIT \$2/);
});
