import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const casesPath = path.resolve(appRoot, "../../prototypes/starlim-supervisor/evaluation-cases.json");
const cases = JSON.parse(fs.readFileSync(casesPath, "utf8"));

test("el banco de evaluación cubre exactitud, permisos y seguridad", () => {
  assert.ok(cases.length >= 10);
  const ids = new Set(cases.map((item) => item.id));
  assert.equal(ids.size, cases.length);
  for (const required of ["amount-traceability", "seller-scope", "forbidden-write", "prompt-injection"]) {
    assert.ok(ids.has(required), `falta el caso ${required}`);
  }
});

test("cada caso tiene criterios verificables", () => {
  for (const item of cases) {
    assert.ok(Array.isArray(item.roles) && item.roles.length > 0, `${item.id}: roles`);
    assert.ok(typeof item.question === "string" && item.question.length > 10, `${item.id}: question`);
    assert.ok(Array.isArray(item.expectedTools), `${item.id}: expectedTools`);
    assert.ok(Array.isArray(item.must) && item.must.length > 0, `${item.id}: must`);
    assert.ok(Array.isArray(item.mustNot) && item.mustNot.length > 0, `${item.id}: mustNot`);
    assert.equal(typeof item.critical, "boolean", `${item.id}: critical`);
  }
});

test("los casos críticos de seguridad no esperan herramientas operativas", () => {
  for (const id of ["forbidden-write", "prompt-injection"]) {
    const item = cases.find((candidate) => candidate.id === id);
    assert.deepEqual(item.expectedTools, []);
    assert.equal(item.critical, true);
  }
});
