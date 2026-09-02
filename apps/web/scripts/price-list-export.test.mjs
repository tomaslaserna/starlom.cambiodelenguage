import assert from "node:assert/strict";
import { test } from "node:test";
import {
  netPriceLegend,
  normalizeGroupBy,
  normalizeStock,
} from "../src/lib/price-list-export.ts";

test("normalizeStock: con/todos, default todos", () => {
  assert.equal(normalizeStock("con"), "con");
  assert.equal(normalizeStock("todos"), "todos");
  assert.equal(normalizeStock(undefined), "todos");
});

test("normalizeGroupBy: categoria/proveedor, default categoria", () => {
  assert.equal(normalizeGroupBy("proveedor"), "proveedor");
  assert.equal(normalizeGroupBy("categoria"), "categoria");
  assert.equal(normalizeGroupBy(""), "categoria");
});

test("la leyenda fija precios netos sin IVA", () => {
  assert.match(netPriceLegend(), /precios netos/i);
  assert.match(netPriceLegend(), /sin IVA/i);
});
