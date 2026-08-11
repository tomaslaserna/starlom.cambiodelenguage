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

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function recordingClient(historyCount) {
  const writes = [];
  return {
    writes,
    async query(sql, params) {
      writes.push({ sql, params });
      if (/SELECT 1 FROM clients/.test(sql)) return { rows: [{ ok: 1 }] };
      if (/count\(\*\)/.test(sql)) return { rows: [{ n: String(historyCount) }] };
      return { rows: [] };
    },
  };
}

function loadWith(client) {
  return loadTypeScriptModule("../src/lib/customer-admin.ts", {
    "@/lib/api-response": { ApiError },
    "@/lib/db": { withCompanyContext: async (_companyId, cb) => cb(client) },
  });
}

test("deleteCustomer bloquea (409) cuando el cliente tiene historial y no borra", async () => {
  const client = recordingClient(3);
  const mod = loadWith(client);
  await assert.rejects(() => mod.deleteCustomer(1, "11111111-1111-1111-1111-111111111111"), (e) => e.status === 409);
  assert.ok(!client.writes.some((w) => /DELETE FROM clients/.test(w.sql)));
});

test("deleteCustomer borra cuando no hay historial", async () => {
  const client = recordingClient(0);
  const mod = loadWith(client);
  await mod.deleteCustomer(1, "11111111-1111-1111-1111-111111111111");
  assert.ok(client.writes.some((w) => /DELETE FROM clients WHERE id = \$1::uuid/.test(w.sql)));
});

test("mergeCustomers rechaza fusionar un cliente consigo mismo", async () => {
  const client = recordingClient(0);
  const mod = loadWith(client);
  await assert.rejects(() => mod.mergeCustomers(1, "A", "A"), (e) => e.status === 400);
});

test("mergeCustomers reasigna las 6 tablas y borra el duplicado", async () => {
  const client = recordingClient(0);
  const mod = loadWith(client);
  await mod.mergeCustomers(1, "22222222-2222-2222-2222-222222222222", "33333333-3333-3333-3333-333333333333");
  const updates = client.writes.filter((w) => /UPDATE \w+ SET client_id/.test(w.sql));
  assert.equal(updates.length, 6);
  assert.ok(client.writes.some((w) => /DELETE FROM clients WHERE id = \$1::uuid/.test(w.sql)));
});
