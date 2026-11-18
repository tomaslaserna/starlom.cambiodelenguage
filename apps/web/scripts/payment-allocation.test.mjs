import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadTypeScriptModule(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  Function("require", "module", "exports", compiled)(require, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

test("un remito mayor al cobro propone solamente el importe disponible", () => {
  const allocation = loadTypeScriptModule("../src/lib/payment-allocation.ts");

  assert.equal(allocation.suggestPaymentAllocation(261_813, 0, 523_626.55), 261_813);
});

test("un segundo remito propone únicamente el remanente del cobro", () => {
  const allocation = loadTypeScriptModule("../src/lib/payment-allocation.ts");

  assert.equal(allocation.suggestPaymentAllocation(300_000, 261_813, 100_000), 38_187);
});

test("la sugerencia nunca supera el saldo pendiente del remito", () => {
  const allocation = loadTypeScriptModule("../src/lib/payment-allocation.ts");

  assert.equal(allocation.suggestPaymentAllocation(300_000, 0, 75_000.25), 75_000.25);
});
