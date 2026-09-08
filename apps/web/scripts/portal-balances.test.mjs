import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/portal-balances.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
Function("module", "exports", compiled)(mod, mod.exports);
const { reconcileToAccountBalance, selectionIsOldestFirst } = mod.exports;

test("the current-account balance remains assigned to the newest remittances", () => {
  const sales = [
    { id: "old", client_id: "c1", date: "2026-01-01", outstanding: "100" },
    { id: "middle", client_id: "c1", date: "2026-02-01", outstanding: "80" },
    { id: "new", client_id: "c1", date: "2026-03-01", outstanding: "50" },
  ];
  assert.deepEqual(reconcileToAccountBalance(sales, new Map([["c1", 70]])).map((sale) => Number(sale.outstanding)), [0, 20, 50]);
});

test("a payment selection must be a prefix of oldest open remittances", () => {
  assert.equal(selectionIsOldestFirst(["old", "middle", "new"], ["old"]), true);
  assert.equal(selectionIsOldestFirst(["old", "middle", "new"], ["old", "middle"]), true);
  assert.equal(selectionIsOldestFirst(["old", "middle", "new"], ["middle"]), false);
  assert.equal(selectionIsOldestFirst(["old", "middle", "new"], ["old", "new"]), false);
});
