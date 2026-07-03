import assert from "node:assert/strict";
import { test } from "node:test";
import { priceSqlExpression } from "../src/lib/product-pricing-sql.ts";

test("priceSqlExpression: lista 4 es precio_3 + 10%, no un duplicado de precio_3", () => {
  const expr3 = priceSqlExpression("3");
  const expr4 = priceSqlExpression("4");
  assert.match(expr3, /m\.precio_3/);
  assert.match(expr4, /m\.precio_3/);
  assert.match(expr4, /\* 1\.10/);
  assert.notEqual(expr4, expr3);
});

test("priceSqlExpression: listas 0, 1, 2 y revendedor siguen usando su propia columna", () => {
  assert.match(priceSqlExpression("0"), /m\.precio_0/);
  assert.match(priceSqlExpression("1"), /m\.precio_1/);
  assert.match(priceSqlExpression("2"), /m\.precio_2/);
  assert.match(priceSqlExpression("rev"), /m\.margen_minorista/);
});
