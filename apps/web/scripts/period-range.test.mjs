import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePeriod, periodBounds, periodLabel, availablePeriods } from "../src/lib/period-range.ts";

test("parsePeriod distingue mes, año y fallback", () => {
  assert.deepEqual(parsePeriod("2026-03", "2026-08"), { kind: "month", key: "2026-03" });
  assert.deepEqual(parsePeriod("2026", "2026-08"), { kind: "year", key: "2026" });
  assert.deepEqual(parsePeriod("", "2026-08"), { kind: "month", key: "2026-08" });
  assert.deepEqual(parsePeriod("basura", "2026-08"), { kind: "month", key: "2026-08" });
});

test("periodBounds de un mes", () => {
  assert.deepEqual(periodBounds({ kind: "month", key: "2026-03" }), {
    previousStart: "2026-02-01", currentStart: "2026-03-01", nextStart: "2026-04-01",
  });
  assert.deepEqual(periodBounds({ kind: "month", key: "2026-01" }), {
    previousStart: "2025-12-01", currentStart: "2026-01-01", nextStart: "2026-02-01",
  });
  assert.deepEqual(periodBounds({ kind: "month", key: "2026-12" }), {
    previousStart: "2026-11-01", currentStart: "2026-12-01", nextStart: "2027-01-01",
  });
});

test("periodBounds de un año", () => {
  assert.deepEqual(periodBounds({ kind: "year", key: "2026" }), {
    previousStart: "2025-01-01", currentStart: "2026-01-01", nextStart: "2027-01-01",
  });
});

test("periodLabel", () => {
  assert.equal(periodLabel({ kind: "month", key: "2026-03" }), "Marzo 2026");
  assert.equal(periodLabel({ kind: "year", key: "2026" }), "Año 2026");
});

test("availablePeriods: meses desc + años", () => {
  const list = availablePeriods("2026-01", "2026-03");
  assert.deepEqual(list, [
    { kind: "month", key: "2026-03" },
    { kind: "month", key: "2026-02" },
    { kind: "month", key: "2026-01" },
    { kind: "year", key: "2026" },
  ]);
});
