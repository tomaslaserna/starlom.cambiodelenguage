import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const profitabilitySource = await readFile(new URL("../src/lib/profitability.ts", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../src/app/rentabilidad/page.tsx", import.meta.url), "utf8");

test("profitability uses complete sale totals and exposes missing cost coverage", () => {
  assert.match(profitabilitySource, /s\.total_amount AS gross_amount/);
  assert.match(profitabilitySource, /netSalesAmountSql\("s\.total_amount", "s"\)/);
  assert.match(profitabilitySource, /COALESCE\(s\.source_net_amount/);
  assert.doesNotMatch(profitabilitySource, /netSalesAmountSql\("si\.total_amount"/);
  assert.match(profitabilitySource, /canonicalSalesSourceSql\("s"\)/);
  assert.match(profitabilitySource, /missing_cost_sales/);
  assert.match(profitabilitySource, /complete: boolean/);
  assert.match(profitabilitySource, /reached: complete && accumulatedMargin >= fixedCosts/);
});

test("profitability UI distinguishes VAT and refuses to present incomplete costs as final profit", () => {
  assert.match(pageSource, /Ventas con IVA/);
  assert.match(pageSource, /Ventas netas/);
  assert.match(pageSource, /Margen comprobable/);
  assert.match(pageSource, /No calculable/);
  assert.match(pageSource, /Faltan costos en/);
});
