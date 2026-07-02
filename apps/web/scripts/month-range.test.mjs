import assert from "node:assert/strict";
import { test } from "node:test";
import { currentMonth, monthRange } from "../src/lib/month-range.ts";

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
