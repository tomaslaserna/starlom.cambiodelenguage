import assert from "node:assert/strict";
import { test } from "node:test";
import { customerMetrics, classifyChurn } from "../src/lib/customer-rhythm.ts";

const D = (iso) => Date.parse(`${iso}T00:00:00-03:00`);

test("customerMetrics: gaps regulares y caso sin gaps", () => {
  // 3 compras separadas 30 días -> promedio 30
  const ts = [D("2025-11-26"), D("2025-12-26"), D("2026-01-25")];
  assert.equal(customerMetrics(ts).average, 30);
  assert.equal(customerMetrics(ts).intervals, 2);
  // 1 compra -> sin gaps
  assert.deepEqual(customerMetrics([D("2026-01-01")]), { average: 1, deviation: 0, intervals: 0 });
});

test("classifyChurn: alta = primera compra dentro del período", () => {
  const start = D("2026-03-01");
  const next = D("2026-04-01");
  assert.equal(classifyChurn([D("2026-03-10")], start, next).alta, true);
  assert.equal(classifyChurn([D("2026-02-10")], start, next).alta, false);
});

test("classifyChurn: baja = última + 2×promedio cae en el período; requiere >=2 compras", () => {
  const start = D("2026-03-01");
  const next = D("2026-04-01");
  // promedio 30, última 2026-01-25 -> baja = +60d = 2026-03-26 (dentro)
  const ts = [D("2025-11-26"), D("2025-12-26"), D("2026-01-25")];
  const r = classifyChurn(ts, start, next);
  assert.equal(r.baja, true);
  assert.equal(r.alta, false);
  // 1 sola compra -> nunca baja
  assert.equal(classifyChurn([D("2026-01-01")], start, next).baja, false);
  // recompra que mueve la última fuera del umbral del período -> no baja
  const reactivado = [...ts, D("2026-05-01")];
  assert.equal(classifyChurn(reactivado, start, next).baja, false);
});
