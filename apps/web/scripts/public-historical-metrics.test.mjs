import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const metricsSource = await readFile(new URL("../src/lib/public-metrics.ts", import.meta.url), "utf8");
const routeSource = await readFile(
  new URL("../src/app/api/public/metrics/route.ts", import.meta.url),
  "utf8",
);

test("public metric adds the audited pre-ERP history once", () => {
  assert.match(metricsSource, /LEGACY_CLOSED_SALES_COUNT = 1_564/);
  assert.match(metricsSource, /HISTORICAL_SALES_START_DATE = "2023-04-12"/);
  assert.match(metricsSource, /LEGACY_CLOSED_SALES_COUNT \+ erpTotal/);
  assert.match(routeSource, /LEGACY_CLOSED_SALES_COUNT \+ erpClosedSales/);
  assert.match(routeSource, /historicalFrom: HISTORICAL_SALES_START_DATE/);
});
