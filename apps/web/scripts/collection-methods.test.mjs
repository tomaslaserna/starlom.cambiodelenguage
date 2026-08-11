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

const { collectionMethodRequiresOperation, COLLECTION_METHODS } = loadTypeScriptModule(
  "../src/lib/collection-methods.ts",
);

test("efectivo no requiere operación; transferencia y echeck sí", () => {
  assert.equal(collectionMethodRequiresOperation("efectivo"), false);
  assert.equal(collectionMethodRequiresOperation("transferencia"), true);
  assert.equal(collectionMethodRequiresOperation("echeck"), true);
});

test("la regla es case-insensitive y tolera espacios", () => {
  assert.equal(collectionMethodRequiresOperation("EFECTIVO"), false);
  assert.equal(collectionMethodRequiresOperation("  Efectivo  "), false);
  assert.equal(collectionMethodRequiresOperation("Transferencia"), true);
});

test("COLLECTION_METHODS expone los tres métodos soportados", () => {
  assert.deepEqual([...COLLECTION_METHODS], ["efectivo", "transferencia", "echeck"]);
});
