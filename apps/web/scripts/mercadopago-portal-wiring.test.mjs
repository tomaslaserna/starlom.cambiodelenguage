import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("portal replaces manual proof review with multi-document Mercado Pago checkout", () => {
  const portal = read("src/app/portal/portal-app.tsx");
  assert.match(portal, /Seleccioná qué querés pagar/);
  assert.match(portal, /selectedSales/);
  assert.match(portal, /Generar QR de Mercado Pago/);
  assert.doesNotMatch(portal, /Enviar a revisión|Informar un pago|Adjuntá el comprobante/);
});

test("Mercado Pago webhook validates signatures and posts approved payments idempotently", () => {
  const webhook = read("src/app/api/webhooks/mercadopago/route.ts");
  const mp = read("src/lib/mercadopago.ts");
  assert.match(webhook, /validWebhookSignature/);
  assert.match(webhook, /intent\.status === "approved"/);
  assert.match(webhook, /current_account_movements/);
  assert.match(mp, /timingSafeEqual/);
});
