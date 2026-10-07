import assert from "node:assert/strict";
import test from "node:test";
import {
  monthDistance,
  normalizeMonthKey,
  operatingCostAppliesToMonth,
  parseDurationMonths,
  parseOperatingCostKind,
} from "../src/lib/operating-cost-schedule.ts";

test("normaliza meses y calcula distancias", () => {
  assert.equal(normalizeMonthKey("2026-10-18"), "2026-10");
  assert.equal(monthDistance("2026-10", "2027-01"), 3);
});

test("un costo por plazo se incluye solamente durante su vigencia", () => {
  const schedule = { startMonth: "2026-10", durationMonths: 3 };
  assert.equal(operatingCostAppliesToMonth(schedule, "2026-09"), false);
  assert.equal(operatingCostAppliesToMonth(schedule, "2026-10"), true);
  assert.equal(operatingCostAppliesToMonth(schedule, "2026-12"), true);
  assert.equal(operatingCostAppliesToMonth(schedule, "2027-01"), false);
});

test("un costo indefinido queda suspendido al cambiar de mes hasta confirmarlo", () => {
  const schedule = { startMonth: "2026-10", durationMonths: null };
  assert.equal(operatingCostAppliesToMonth(schedule, "2026-10"), true);
  assert.equal(operatingCostAppliesToMonth(schedule, "2026-11"), false);
  assert.equal(operatingCostAppliesToMonth({ ...schedule, overrideIncluded: true }, "2026-11"), true);
  assert.equal(operatingCostAppliesToMonth({ ...schedule, overrideIncluded: false }, "2026-10"), false);
});

test("valida etiquetas y duración", () => {
  assert.equal(parseOperatingCostKind("Único"), "unico");
  assert.equal(parseDurationMonths("indefinite", "fijo"), null);
  assert.equal(parseDurationMonths("12", "variable"), 12);
  assert.equal(parseDurationMonths("12", "unico"), 1);
  assert.throws(() => parseDurationMonths("0", "fijo"), /duración/i);
});
