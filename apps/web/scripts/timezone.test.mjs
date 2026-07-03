import assert from "node:assert/strict";
import { test } from "node:test";
import { localDateIso } from "../src/lib/timezone.ts";

test("localDateIso usa el dia calendario de Argentina, no el de UTC", () => {
  // 2026-07-02 22:09 en Argentina (UTC-3) es ya 2026-07-03 01:09 en UTC.
  const lateNightArgentina = new Date("2026-07-03T01:09:00Z");
  assert.equal(localDateIso(lateNightArgentina), "2026-07-02");
});

test("localDateIso coincide con UTC cuando ambos comparten el mismo dia", () => {
  // 2026-07-02 12:00 en Argentina es 2026-07-02 15:00 en UTC.
  const middayArgentina = new Date("2026-07-02T15:00:00Z");
  assert.equal(localDateIso(middayArgentina), "2026-07-02");
});

test("localDateIso sin argumento devuelve el formato YYYY-MM-DD", () => {
  assert.match(localDateIso(), /^\d{4}-\d{2}-\d{2}$/);
});
