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

const rhythm = loadTypeScriptModule("../src/lib/customer-rhythm.ts");
const { summarizePurchases } = loadTypeScriptModule("../src/lib/customer-purchase-summary.ts", {
  "@/lib/customer-rhythm": rhythm,
});

test("sin compras: todo en cero / null", () => {
  assert.deepEqual(summarizePurchases([]), {
    totalAmount: 0, count: 0, lastPurchase: null, averageDays: 0, expectedNext: null,
  });
});

test("una compra: total y última, sin ritmo", () => {
  const s = summarizePurchases([{ date: "2026-08-01", amount: 100 }]);
  assert.equal(s.count, 1);
  assert.equal(s.totalAmount, 100);
  assert.equal(s.lastPurchase, "2026-08-01");
  assert.equal(s.averageDays, 0);
  assert.equal(s.expectedNext, null);
});

test("varias compras: promedio de días y próxima esperada", () => {
  const s = summarizePurchases([
    { date: "2026-08-01", amount: 100 },
    { date: "2026-08-11", amount: 50 },
    { date: "2026-08-21", amount: 30 },
  ]);
  assert.equal(s.count, 3);
  assert.equal(s.totalAmount, 180);
  assert.equal(s.lastPurchase, "2026-08-21");
  assert.equal(s.averageDays, 10);
  assert.equal(s.expectedNext, "2026-08-31");
});

test("ignora fechas nulas para el ritmo pero cuenta el monto", () => {
  const s = summarizePurchases([
    { date: null, amount: 20 },
    { date: "2026-08-01", amount: 100 },
    { date: "2026-08-11", amount: 50 },
  ]);
  assert.equal(s.count, 3);
  assert.equal(s.totalAmount, 170);
  assert.equal(s.lastPurchase, "2026-08-11");
  assert.equal(s.averageDays, 10);
});
