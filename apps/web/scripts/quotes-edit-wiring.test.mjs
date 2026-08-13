import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("actions expone updateQuoteAction y deleteQuoteAction con permisos correctos", () => {
  const src = read("../src/app/quotes/actions.ts");
  assert.match(src, /export async function updateQuoteAction/);
  assert.match(src, /export async function deleteQuoteAction/);
  assert.match(src, /updateQuote\(/);
  assert.match(src, /deleteQuote\(/);
  assert.match(src, /resource: "presupuestos", action: "editar"/);
  assert.match(src, /resource: "presupuestos", action: "cancelar"/);
  assert.match(src, /redirect\("\/quotes\?updated=1"\)/);
  assert.match(src, /redirect\("\/quotes\?deleted=1"\)/);
});

test("el rol jefe puede cancelar presupuestos", () => {
  const src = read("../src/lib/route-auth.ts");
  const jefeBlock = src.slice(src.indexOf("jefe: ["), src.indexOf("deposito:"));
  assert.match(jefeBlock, /"presupuestos\.cancelar"/);
});
