import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [ordersPage, orderFields, deliveryConfirmation, ordersLib, migration] = await Promise.all([
  readFile(new URL("../src/app/orders/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/orders/new/order-entry-fields.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/orders/delivery-confirmation.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/orders.ts", import.meta.url), "utf8"),
  readFile(new URL("../../../supabase/migrations/20261006123230_add_order_priority.sql", import.meta.url), "utf8"),
]);

test("gestion de pedidos no muestra una vista Confirmados", () => {
  assert.doesNotMatch(ordersPage, />\s*Confirmados\s*</);
  assert.doesNotMatch(ordersPage, /href="\/orders\?status=confirmado"/);
});

test("el alta responde cinco preguntas antes de habilitar productos", () => {
  assert.match(orderFields, /1\. ¿Para qué cliente es el pedido\?/);
  assert.match(orderFields, /2\. ¿Qué precio corresponde\?/);
  assert.match(orderFields, /3\. ¿Qué comprobante lleva\?/);
  assert.match(orderFields, /4\. ¿Cuál es la fecha estimada de entrega\?/);
  assert.match(orderFields, /5\. ¿Cuál es la urgencia del pedido\?/);
  assert.match(orderFields, /setupComplete \? <>/);
  assert.match(orderFields, /Habilitar productos/);
});

test("la entrega exige revisar un resumen operativo", () => {
  assert.match(ordersPage, /<DeliveryConfirmation/);
  assert.match(deliveryConfirmation, /Confirmar entrega/);
  assert.match(deliveryConfirmation, /Operador/);
  assert.match(deliveryConfirmation, /Cliente/);
  assert.match(deliveryConfirmation, /Comprobante/);
  assert.match(deliveryConfirmation, /Factura automática/);
  assert.match(deliveryConfirmation, /Monto/);
});

test("la urgencia es obligatoria y queda persistida", () => {
  assert.match(ordersLib, /Selecciona la urgencia del pedido/);
  assert.match(ordersLib, /order_priority/);
  assert.match(migration, /CHECK \(order_priority IN \('baja', 'media', 'alta'\)\)/);
});
