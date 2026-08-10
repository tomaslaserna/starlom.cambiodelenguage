import assert from "node:assert/strict";
import { test } from "node:test";
import { marginPercent, fillYearMonths } from "../src/lib/metrics-series.ts";

test("marginPercent", () => {
  assert.equal(marginPercent(40, 100), 40);
  assert.equal(marginPercent(0, 0), null);
  assert.equal(marginPercent(50, 0), null);
});

test("fillYearMonths completa 12 meses con ceros y calcula margen", () => {
  const byKey = new Map([
    ["2026-01", { facturacion: 100, gananciaBruta: 40 }],
    ["2026-03", { facturacion: 0, gananciaBruta: 0 }],
  ]);
  const rows = fillYearMonths("2026", byKey);
  assert.equal(rows.length, 12);
  assert.deepEqual(rows[0], { monthKey: "2026-01", facturacion: 100, gananciaBruta: 40, margenPct: 40 });
  assert.deepEqual(rows[1], { monthKey: "2026-02", facturacion: 0, gananciaBruta: 0, margenPct: null });
});
