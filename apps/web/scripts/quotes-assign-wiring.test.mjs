import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("todo empleado activo puede ser responsable comercial sin cambiar su rol principal", () => {
  const imports = read("../src/lib/imports.ts");
  const quotes = read("../src/lib/quotes.ts");
  const management = read("../src/lib/vendors-management.ts");
  const vendorListing = imports.slice(imports.indexOf("export async function listVendors"));
  const assignment = quotes.slice(quotes.indexOf("export async function resolveQuoteAssignment"));

  assert.match(vendorListing, /ue\.activo = TRUE/);
  assert.doesNotMatch(vendorListing, /ue\.role::text = 'vendedor'/);
  assert.match(assignment, /ue\.activo = TRUE/);
  assert.doesNotMatch(assignment, /ue\.role::text = 'vendedor'/);
  assert.doesNotMatch(management, /ue\.role::text = 'vendedor'/);
});

test("QuoteEntryFields tiene el selector Asignar a", () => {
  const src = read("../src/app/quotes/quote-entry-fields.tsx");
  assert.match(src, /vendors/);
  assert.match(src, /name="assignedSellerId"/);
  assert.match(src, /Todos los vendedores/);
});

test("la pagina de alta pasa vendors a QuoteEntryFields", () => {
  const src = read("../src/app/quotes/new/page.tsx");
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
