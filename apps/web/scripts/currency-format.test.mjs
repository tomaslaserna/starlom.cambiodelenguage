import assert from "node:assert/strict";
import test from "node:test";
import { formatCurrency, normalizeCurrencyInput } from "../src/lib/format.ts";

test("los pesos se muestran siempre con separador argentino y dos decimales", () => {
  assert.equal(formatCurrency(0), "$ 0,00");
  assert.equal(formatCurrency(1234567.8), "$ 1.234.567,80");
  assert.equal(formatCurrency(-1234.56), "-$ 1.234,56");
});

test("la máscara monetaria separa miles y conserva un valor decimal seguro para formularios", () => {
  assert.deepEqual(normalizeCurrencyInput("1234567,8"), {
    display: "1.234.567,8",
    raw: "1234567.8",
  });
  assert.deepEqual(normalizeCurrencyInput("$ 1.234.567,8", true), {
    display: "1.234.567,80",
    raw: "1234567.8",
  });
});
