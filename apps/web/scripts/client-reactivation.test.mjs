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

const { reactivateClientIfInactive } = loadTypeScriptModule("../src/lib/client-reactivation.ts");

function recordingClient() {
  const writes = [];
  return {
    writes,
    async query(sql, params) {
      writes.push({ sql, params });
      return { rowCount: 0, rows: [] };
    },
  };
}

test("reactivateClientIfInactive issues a guarded UPDATE scoped to client and company", async () => {
  const client = recordingClient();
  await reactivateClientIfInactive(client, 1, "069aeca6-cf91-4605-b813-a8d5f906d736");

  assert.equal(client.writes.length, 1);
  const { sql, params } = client.writes[0];
  assert.match(sql, /UPDATE clients/);
  assert.match(sql, /SET active = true/);
  assert.match(sql, /updated_at = now\(\)/);
  assert.match(sql, /active = false/); // el guard hace no-op si ya está activo
  assert.deepEqual(params, ["069aeca6-cf91-4605-b813-a8d5f906d736", 1]);
});
