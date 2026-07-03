import assert from "node:assert/strict";
import { test } from "node:test";
import { currentMonth, monthRange, shiftMonthKey } from "../src/lib/month-range.ts";

test("monthRange mes normal", () => {
  assert.deepEqual(monthRange("2026-03"), {
    month: "2026-03",
    start: "2026-03-01",
    endExclusive: "2026-04-01",
  });
});

test("monthRange diciembre rota el anio", () => {
  assert.deepEqual(monthRange("2026-12"), {
    month: "2026-12",
    start: "2026-12-01",
    endExclusive: "2027-01-01",
  });
});

test("monthRange invalido usa el mes actual", () => {
  const cur = currentMonth();
  const r = monthRange("nope");
  assert.equal(r.month, cur);
  assert.match(r.start, /^\d{4}-\d{2}-01$/);
});

test("currentMonth formatea YYYY-MM", () => {
  assert.equal(currentMonth(new Date(2026, 0, 15)), "2026-01");
});

test("currentMonth no cruza de mes por el UTC de fin de mes", () => {
  // 2026-06-30 23:30 en Argentina (UTC-3) ya es 2026-07-01 en UTC.
  const lateNightArgentina = new Date("2026-07-01T02:30:00Z");
  assert.equal(currentMonth(lateNightArgentina), "2026-06");
});

test("shiftMonthKey suma y resta meses respetando el rollover de anio", () => {
  assert.equal(shiftMonthKey("2026-07", 1), "2026-08");
  assert.equal(shiftMonthKey("2026-01", -1), "2025-12");
  assert.equal(shiftMonthKey("2026-12", 1), "2027-01");
  assert.equal(shiftMonthKey("2026-07", 0), "2026-07");
});
