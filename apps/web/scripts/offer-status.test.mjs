import assert from "node:assert/strict";
import { test } from "node:test";
import { computeOfferPrice, computeOfferStatus, offerLineDiscount } from "../src/lib/offer-status.ts";

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

test("offerLineDiscount: precio fijo → descuento equivalente", () => {
  assert.equal(offerLineDiscount({ priceMode: "fijo", fixedPrice: 800 }, 1000), 20);
});

test("offerLineDiscount: descuento % pasa directo", () => {
  assert.equal(offerLineDiscount({ priceMode: "descuento", discountPercent: 20 }, 1000), 20);
});

test("offerLineDiscount: el mínimo reduce el descuento", () => {
  assert.equal(offerLineDiscount({ priceMode: "descuento", discountPercent: 50, minPrice: 700 }, 1000), 30);
});

test("offerLineDiscount: base 0 → 0", () => {
  assert.equal(offerLineDiscount({ priceMode: "fijo", fixedPrice: 800 }, 0), 0);
});

test("offerLineDiscount: precio fijo mayor a la base no genera recargo", () => {
  assert.equal(offerLineDiscount({ priceMode: "fijo", fixedPrice: 2000 }, 1000), 0);
});
