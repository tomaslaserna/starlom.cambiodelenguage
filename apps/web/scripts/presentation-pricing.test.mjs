import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
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

const orderPricing = loadTypeScriptModule("../src/lib/order-pricing.ts");
const { presentationPriceForLine, presentationSuggestion } = loadTypeScriptModule(
  "../src/lib/presentation-pricing.ts",
  { "@/lib/order-pricing": orderPricing },
);

const prices = { "L1 - suave": 80, "L2 - ANCLA": 100 };

test("12 unidades de un cliente L2 reciben L1 en el bloque completo", () => {
  const result = presentationPriceForLine({ prices, priceListName: "L2 - ANCLA", presentationUnits: 12, quantity: 12 });
  assert.equal(result.improvedQuantity, 12);
  assert.equal(result.regularQuantity, 0);
  assert.equal(result.subtotal, 960);
  assert.equal(result.effectiveUnitPrice, 80);
});

test("13 unidades separan 12 a L1 y el excedente a L2", () => {
  const result = presentationPriceForLine({ prices, priceListName: "L2 - ANCLA", presentationUnits: 12, quantity: 13 });
  assert.equal(result.improvedQuantity, 12);
  assert.equal(result.regularQuantity, 1);
  assert.equal(result.subtotal, 1060);
  assert.equal(result.effectiveUnitPrice, 81.54);
});

test("10 unidades sugieren agregar 2 para alcanzar la presentación", () => {
  const result = presentationPriceForLine({ prices, priceListName: "2", presentationUnits: 12, quantity: 10 });
  assert.equal(result.subtotal, 1000);
  assert.equal(result.unitsToNextPresentation, 2);
  assert.match(presentationSuggestion("Rejilla auto semipesada", result), /Agregando 2 unidades/);
});

test("la regla no cambia clientes que no usan L2", () => {
  const result = presentationPriceForLine({ prices, priceListName: "L1 - suave", presentationUnits: 12, quantity: 13 });
  assert.equal(result.subtotal, 1040);
  assert.equal(result.unitsToNextPresentation, null);
});
