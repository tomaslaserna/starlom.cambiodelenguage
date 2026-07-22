import assert from "node:assert/strict";
import { test } from "node:test";
import { priceSqlExpression } from "../src/lib/product-pricing-sql.ts";
import { calculateProductProfit } from "../src/lib/product-profit.ts";

test("priceSqlExpression: lista 4 heredada usa Minorista", () => {
  const expr3 = priceSqlExpression("3");
  const expr4 = priceSqlExpression("4");
  assert.match(expr3, /m\.precio_3/);
  assert.match(expr4, /m\.margen_minorista/);
  assert.notEqual(expr4, expr3);
});

test("priceSqlExpression: listas 0, 1, 2 y revendedor siguen usando su propia columna", () => {
  assert.match(priceSqlExpression("0"), /m\.precio_0/);
  assert.match(priceSqlExpression("1"), /m\.precio_1/);
  assert.match(priceSqlExpression("2"), /m\.precio_2/);
  assert.match(priceSqlExpression("rev"), /m\.margen_minorista/);
});

test("calculateProductProfit: calcula ganancia y porcentaje sobre costo", () => {
  assert.deepEqual(calculateProductProfit(100, 135), {
    amount: 35,
    percentOnCost: 35,
  });
});

test("calculateProductProfit: conserva perdidas y evita dividir por costo cero", () => {
  assert.deepEqual(calculateProductProfit(100, 80), {
    amount: -20,
    percentOnCost: -20,
  });
  assert.deepEqual(calculateProductProfit(0, 80), {
    amount: 80,
    percentOnCost: null,
  });
});
