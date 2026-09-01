import assert from "node:assert/strict";
import test from "node:test";
import { grossMarginPercent, marginRisk } from "../src/lib/sale-margin.ts";

test("clasifica el margen sin bloquear la venta", () => {
  assert.equal(marginRisk(40), "none");
  assert.equal(marginRisk(31.99), "low");
  assert.equal(marginRisk(24.99), "critical");
});

test("calcula margen bruto sobre el ingreso neto después de descuentos", () => {
  assert.equal(grossMarginPercent(100, 68), 32);
  assert.equal(grossMarginPercent(80, 68), 15);
});
