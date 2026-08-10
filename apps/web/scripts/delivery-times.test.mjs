import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeDurations, formatDuration } from "../src/lib/delivery-times.ts";

const H = 3_600_000;

test("summarizeDurations: promedio/mediana y descarte de negativos; lista vacía", () => {
  assert.deepEqual(summarizeDurations([]), { count: 0, avgMs: null, medianMs: null });
  const r = summarizeDurations([1 * H, 3 * H, 5 * H, -1]); // -1 se descarta
  assert.equal(r.count, 3);
  assert.equal(r.avgMs, 3 * H);
  assert.equal(r.medianMs, 3 * H);
});

test("formatDuration: min / h min / d h", () => {
  assert.equal(formatDuration(45 * 60_000), "45 min");
  assert.equal(formatDuration((5 * 60 + 20) * 60_000), "5 h 20 min");
  assert.equal(formatDuration(26 * 60 * 60_000), "1 d 2 h");
});
