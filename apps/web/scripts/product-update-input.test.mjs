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
const catalog = loadTypeScriptModule("../src/lib/catalog-management.ts", {
  "@/lib/api-response": { ApiError },
  "@/lib/customer-segments": loadTypeScriptModule("../src/lib/customer-segments.ts"),
  "@/lib/customer-receipt-types": loadTypeScriptModule("../src/lib/customer-receipt-types.ts"),
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

const currentProduct = {
  id: "009e2bee-4049-4ef7-9564-993fc1d6d2da",
  productId: "009e2bee-4049-4ef7-9564-993fc1d6d2da",
  category: "DESCARTABLES",
  code: "DES",
  supplierId: "11111111-1111-1111-1111-111111111111",
  supplier: "Proveedor anterior",
  brand: "Flexal",
  name: "BANDEJA ALUMINIO BAL 5 FLEXAL",
  cost: 201.09,
  stock: 200,
  description: "",
  presentationUnits: 1,
};

test("editar un producto sin proveedor normaliza la selección vacía a null", () => {
  const input = catalog.productUpdateInputFromBody({
    name: "BANDEJA ALUMINIO RAL 3 FLEXAL (11,5 X 9 X 4,5) X U",
    cost: "133.53",
    code: "DES",
    presentationUnits: "1",
    supplierId: "",
    justification: "Corrección de artículo duplicado",
  }, currentProduct);

  assert.equal(input.supplierId, null);
  assert.equal(input.cost, 133.53);
});
