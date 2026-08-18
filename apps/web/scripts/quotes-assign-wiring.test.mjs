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

test("la pagina de alta pasa vendors a QuoteEntryFields", () => {
  const src = read("../src/app/quotes/page.tsx");
  assert.match(src, /listVendors/);
  assert.match(src, /vendors=\{/);
});

test("la pagina de edicion pasa vendors y precarga assignedSellerId", () => {
  const src = read("../src/app/quotes/[id]/edit/page.tsx");
  assert.match(src, /listVendors/);
  assert.match(src, /vendors=\{/);
  assert.match(src, /assignedSellerId/);
});

test("la lista muestra el vendedor asignado o Todos", () => {
  const src = read("../src/app/quotes/page.tsx");
  assert.match(src, /visibleToAll/);
  assert.match(src, /Todos/);
});
