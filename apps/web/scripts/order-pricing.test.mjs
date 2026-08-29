import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePriceListKey,
  resolvePriceListName,
  samePriceListName,
} from "../src/lib/order-pricing.ts";

const activeLists = ["L0 - EXCLUSIVO", "L1 - VOLUMEN", "L2 - ANCLA", "L3 - 30 DÍAS", "MINORISTA"];

test("una lista histórica L1 respeta la lista L1 activa del cliente", () => {
  assert.equal(resolvePriceListName("L1 - suave", activeLists), "L1 - VOLUMEN");
  assert.equal(samePriceListName("L1 - suave", "L1 - VOLUMEN"), true);
  assert.equal(normalizePriceListKey("L1 - VOLUMEN"), "1");
});

test("una lista desconocida no se confunde con L2 al comparar acuerdos", () => {
  assert.equal(samePriceListName("Acuerdo especial sin número", "L2 - ANCLA"), false);
});

test("sin lista configurada se conserva L2 como respaldo técnico", () => {
  assert.equal(resolvePriceListName("", activeLists), "L2 - ANCLA");
});
