import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("el listado general separa la carga en una ruta nueva", () => {
  const list = read("../src/app/quotes/page.tsx");
  const create = read("../src/app/quotes/new/page.tsx");

  assert.match(list, /href="\/quotes\/new"/);
  assert.doesNotMatch(list, /<QuoteEntryForm/);
  assert.match(create, /<QuoteEntryForm/);
  assert.match(create, /returnTo.*\/quotes\?created=1/);
});

test("CRM ofrece buscador y una ruta propia para crear presupuestos", () => {
  const list = read("../src/app/crm/presupuestos/page.tsx");
  const create = read("../src/app/crm/presupuestos/nuevo/page.tsx");

  assert.match(list, /name="q"/);
  assert.match(list, /href="\/crm\/presupuestos\/nuevo"/);
  assert.match(create, /<QuoteEntryForm/);
  assert.match(create, /returnTo.*\/crm\/presupuestos\?created=1/);
});
