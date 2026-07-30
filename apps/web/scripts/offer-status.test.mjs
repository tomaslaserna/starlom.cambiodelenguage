import assert from "node:assert/strict";
import { test } from "node:test";
import { computeOfferPrice, computeOfferStatus } from "../src/lib/offer-status.ts";

const today = "2026-07-28";

test("inactiva cuando active=false", () => {
  assert.equal(computeOfferStatus(false, null, null, today), "inactiva");
});

test("programada cuando valid_from es futuro", () => {
  assert.equal(computeOfferStatus(true, "2026-08-01", null, today), "programada");
});

test("vencida cuando valid_to ya pasó", () => {
  assert.equal(computeOfferStatus(true, null, "2026-07-27", today), "vencida");
});

test("vigente dentro de la ventana o sin fechas", () => {
  assert.equal(computeOfferStatus(true, null, null, today), "vigente");
  assert.equal(computeOfferStatus(true, "2026-07-01", "2026-12-31", today), "vigente");
  assert.equal(computeOfferStatus(true, "2026-07-28", "2026-07-28", today), "vigente");
});

test("precio fijo devuelve el monto fijo", () => {
  assert.equal(computeOfferPrice(9999, { priceMode: "fijo", fixedPrice: 10000 }), 10000);
});

test("precio con descuento aplica el % sobre la base", () => {
  assert.equal(computeOfferPrice(1000, { priceMode: "descuento", discountPercent: 20 }), 800);
});

test("el mínimo pisa el descuento", () => {
  assert.equal(computeOfferPrice(1000, { priceMode: "descuento", discountPercent: 50, minPrice: 700 }), 700);
});

test("sin mínimo, el descuento manda", () => {
  assert.equal(computeOfferPrice(1000, { priceMode: "descuento", discountPercent: 50 }), 500);
});
