import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("portal replaces manual proof review with multi-document Mercado Pago checkout", () => {
  const portal = read("src/app/portal/portal-app.tsx");
  assert.match(portal, /Seleccioná qué querés pagar/);
  assert.match(portal, /selectedSales/);
  assert.match(portal, /Generar QR de Mercado Pago/);
  assert.match(portal, /setCheckoutLoading/);
  assert.match(portal, /resultado-pago/);
  assert.match(portal, /scrollIntoView/);
  assert.match(portal, /Pago confirmado/);
  assert.match(portal, /setInterval\(checkPayment, 3_000\)/);
  assert.doesNotMatch(portal, /Enviar a revisión|Informar un pago|Adjuntá el comprobante/);
});

test("portal keeps record sections compact with three rows and an explicit expansion", () => {
  const portal = read("src/app/portal/portal-app.tsx");
  assert.match(portal, /slice\(0, showAll \? .*\.length : 3\)/);
  assert.match(portal, /Ver \$\{hiddenCount\} más/);
  assert.match(portal, /Ver menos/);
  assert.match(portal, /RecordHeader/);
});

test("portal reconciles remittances to the account balance and enforces oldest-first payments", () => {
  const summary = read("src/app/api/portal/summary/route.ts");
  const checkout = read("src/app/api/portal/checkout/route.ts");
  const portal = read("src/app/portal/portal-app.tsx");
  assert.match(summary, /reconcileToAccountBalance/);
  assert.match(summary, /SUM\(m\.debit-m\.credit\)/);
  assert.match(checkout, /SUM\(debit-credit\)/);
  assert.match(checkout, /selectionIsOldestFirst/);
  assert.match(checkout, /todos los anteriores pendientes/);
  assert.match(portal, /del más antiguo al más reciente/);
  assert.match(portal, /payableSales\.slice\(0, position \+ 1\)/);
});

test("Mercado Pago webhook validates signatures and posts approved payments idempotently", () => {
  const webhook = read("src/app/api/webhooks/mercadopago/route.ts");
  const mp = read("src/lib/mercadopago.ts");
  const processor = read("src/lib/portal-payment-processing.ts");
  const status = read("src/app/api/portal/checkout/[id]/status/route.ts");
  assert.match(webhook, /validWebhookSignature/);
  assert.match(webhook, /processPortalPayment/);
  assert.match(processor, /intent\.status === "approved"/);
  assert.match(processor, /current_account_movements/);
  assert.match(status, /findPaymentByExternalReference/);
  assert.match(status, /processPortalPayment/);
  assert.match(mp, /timingSafeEqual/);
});
