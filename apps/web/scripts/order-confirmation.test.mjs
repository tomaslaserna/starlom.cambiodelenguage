import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildWhatsappConfirmation,
  formatConfirmationQuantity,
  formatDeliveryDate,
  normalizePhoneForWhatsapp,
} from "../src/lib/order-confirmation.ts";

const baseInput = {
  businessName: "EL HORNITO SANTIAGUEÑO – POETA",
  lines: [
    { quantity: 1, name: "HIPOCLORITO DE SODIO 33GR/L X 5 LTS" },
    { quantity: 3, name: "DESOD. P/PISOS ARPEGE X 5 LTS" },
  ],
  deliveryLocation: "Poeta",
  deliveryDate: "2026-06-30",
};

test("encabezado, cliente y una linea por producto", () => {
  const text = buildWhatsappConfirmation(baseInput);
  assert.match(text, /^\*CONFIRMACIÓN DE TU PEDIDO – STARLIM\* ✅/);
  assert.ok(text.includes("*EL HORNITO SANTIAGUEÑO – POETA*, te confirmamos antes de preparar:"));
  assert.ok(text.includes("• 1 x HIPOCLORITO DE SODIO 33GR/L X 5 LTS"));
  assert.ok(text.includes("• 3 x DESOD. P/PISOS ARPEGE X 5 LTS"));
  assert.ok(text.includes("🚚 *Entrega:* Poeta"));
  assert.ok(text.includes("📅 *Entrega estimada:* 30.06.26 (Martes)"));
  assert.ok(text.includes("Respondé *SÍ* para confirmar"));
});

test("sin offerText no agrega linea de oferta", () => {
  assert.ok(!buildWhatsappConfirmation(baseInput).includes("💡"));
});

test("con offerText agrega la linea de oferta", () => {
  const text = buildWhatsappConfirmation({ ...baseInput, offerText: "2da unidad 50% OFF" });
  assert.ok(text.includes("💡 2da unidad 50% OFF"));
});

test("formatDeliveryDate: DD.MM.YY con dia en espanol", () => {
  assert.equal(formatDeliveryDate("2026-06-30"), "30.06.26 (Martes)");
  assert.equal(formatDeliveryDate(""), "");
});

test("normalizePhoneForWhatsapp normaliza y valida", () => {
  assert.equal(normalizePhoneForWhatsapp("3855 123-456"), "543855123456");
  assert.equal(normalizePhoneForWhatsapp("+54 385 5123456"), "543855123456");
  assert.equal(normalizePhoneForWhatsapp("123"), null);
  assert.equal(normalizePhoneForWhatsapp(""), null);
});

test("formatConfirmationQuantity: entero sin decimales, decimal con decimales, no-finito a 0", () => {
  assert.equal(formatConfirmationQuantity(3), "3");
  assert.equal(formatConfirmationQuantity(2.5), "2.5");
  assert.equal(formatConfirmationQuantity(Number.NaN), "0");
});

test("normalizePhoneForWhatsapp rechaza numeros demasiado cortos aunque empiecen con 54", () => {
  assert.equal(normalizePhoneForWhatsapp("54 385 12"), null);
});
