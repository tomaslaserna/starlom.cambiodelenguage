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

const { isSearchOptionOutOfStock, rankSearchOptions, resolveSearchOptions } = loadTypeScriptModule("../src/lib/search-options.ts");

test("identifica cero y negativos como sin stock sin afectar opciones genericas", () => {
  assert.equal(isSearchOptionOutOfStock({ label: "Cero", availableStock: 0 }), true);
  assert.equal(isSearchOptionOutOfStock({ label: "Negativo", availableStock: -1 }), true);
  assert.equal(isSearchOptionOutOfStock({ label: "Disponible", availableStock: 1 }), false);
  assert.equal(isSearchOptionOutOfStock({ label: "Cliente" }), false);
});

test("muestra primero los productos con stock entre todas las coincidencias", () => {
  const options = [
    { value: "exacto-agotado", label: "BOBINA", availableStock: 0 },
    { value: "disponible", label: "BOBINA INDUSTRIAL 20 CM", availableStock: 5 },
    { value: "negativo", label: "BOBINA ECO", availableStock: -3 },
  ];

  assert.deepEqual(
    rankSearchOptions(options, "bobina").map((option) => option.value),
    ["disponible", "exacto-agotado", "negativo"],
  );
});

test("ordena por calidad de busqueda dentro del mismo grupo de disponibilidad", () => {
  const options = [
    { value: "contiene", label: "PAPEL BOBINA ECO", availableStock: 2 },
    { value: "empieza", label: "BOBINA INDUSTRIAL", availableStock: 4 },
    { value: "exacto", label: "BOBINA", availableStock: 1 },
  ];

  assert.deepEqual(
    rankSearchOptions(options, "bobina").map((option) => option.value),
    ["exacto", "empieza", "contiene"],
  );
});

test("mantiene el comportamiento de opciones que no representan productos", () => {
  const options = [
    { value: "contiene", label: "CLIENTE BOBINA" },
    { value: "exacto", label: "BOBINA" },
  ];

  assert.deepEqual(
    rankSearchOptions(options, "bobina").map((option) => option.value),
    ["exacto", "contiene"],
  );
});

test("agrupa por disponibilidad antes de aplicar el limite incluso en resultados remotos", () => {
  const options = [
    ...Array.from({ length: 40 }, (_, index) => ({
      value: `agotado-${index}`,
      label: `BOBINA AGOTADA ${index}`,
      availableStock: 0,
    })),
    { value: "disponible", label: "BOBINA DISPONIBLE", availableStock: 1 },
  ];

  assert.deepEqual(resolveSearchOptions(options, "", 1, true).map((option) => option.value), ["disponible"]);
  assert.deepEqual(resolveSearchOptions(options, "bobina", 1, false).map((option) => option.value), ["disponible"]);
});
