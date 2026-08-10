import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyVat,
  normalizeGroupBy,
  normalizeStock,
  normalizeVat,
  vatLegend,
} from "../src/lib/price-list-export.ts";

test("applyVat suma 21% y redondea", () => {
  assert.equal(applyVat(1000, 21), 1210);
  assert.equal(applyVat(35000, 21), 42350);
});

test("applyVat suma 10,5% (no 0%)", () => {
  assert.equal(applyVat(1000, 10.5), 1105);
  assert.equal(applyVat(2899, 10.5), 3203.4);
});

test("normalizeVat: acepta 21 y 10.5, default 21", () => {
  assert.equal(normalizeVat("21"), 21);
  assert.equal(normalizeVat("10.5"), 10.5);
  assert.equal(normalizeVat(""), 21);
  assert.equal(normalizeVat("cualquiera"), 21);
});

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

test("vatLegend refleja la tasa", () => {
  assert.match(vatLegend(21), /21/);
  assert.match(vatLegend(21), /incluido/i);
  assert.match(vatLegend(10.5), /10,5/);
});
