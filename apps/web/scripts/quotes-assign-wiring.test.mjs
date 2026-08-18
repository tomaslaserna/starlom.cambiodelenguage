import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("QuoteEntryFields tiene el selector Asignar a", () => {
  const src = read("../src/app/quotes/quote-entry-fields.tsx");
  assert.match(src, /vendors/);
  assert.match(src, /name="assignedSellerId"/);
  assert.match(src, /Todos los vendedores/);
});
