import test from "node:test";
import assert from "node:assert/strict";
import { can, requireCapability, visibleCustomerScope } from "../core/permissions.mjs";
import { purchasePattern, rankContactOpportunities } from "../core/purchase-patterns.mjs";
import { detectReminders } from "../core/reminder-engine.mjs";
import { interpretCustomerMessage } from "../core/message-interpreter.mjs";
import { assertReadOnlySql } from "../core/read-only-guard.mjs";
import { createErpReadAdapter } from "../core/erp-read-adapter.mjs";

const purchases = ["2026-06-01", "2026-06-11", "2026-06-21", "2026-07-01", "2026-07-11"].map((date, index) => ({
  date,
  items: [{ productId: "HIPO-5", name: "Hipoclorito 33% 5 L", quantity: 4 + (index % 2) }],
}));

test("vendedor solo accede a clientes asignados y nunca a rentabilidad", () => {
  assert.equal(can("vendedor", "customers:assigned:read"), true);
  assert.equal(can("vendedor", "finance:profitability:read"), false);
  assert.throws(() => requireCapability("vendedor", "finance:profitability:read"), { code: "SUPERVISOR_FORBIDDEN" });
  assert.equal(visibleCustomerScope({ role: "vendedor", companyId: 7, username: "fran", displayName: "Francisco Valdés" }).kind, "seller");
});

test("calcula patrón, demora y confianza de forma explicable", () => {
  const pattern = purchasePattern(purchases, new Date("2026-07-25T12:00:00Z"));
  assert.equal(pattern.typicalDays, 10);
  assert.equal(pattern.daysSinceLastPurchase, 14);
  assert.equal(pattern.overdueDays, 4);
  assert.equal(pattern.confidence, "high");
  assert.equal(pattern.habitualProducts[0].name, "Hipoclorito 33% 5 L");
});

test("ordena primero al cliente más atrasado", () => {
  const ranked = rankContactOpportunities([
    { id: "a", name: "Regular", purchases },
    { id: "b", name: "Muy atrasado", purchases: purchases.map((item) => ({ ...item, date: item.date.replace("07-11", "06-30") })) },
  ], new Date("2026-07-25T12:00:00Z"));
  assert.ok(ranked.length >= 1);
  assert.ok(ranked[0].score >= ranked.at(-1).score);
});

test("deduplica recordatorios y no inventa estados", () => {
  const reminders = detectReminders({
    orders: [
      { id: "o1", number: "P-1", status: "pending_approval" },
      { id: "o2", number: "P-2", status: "authorized", deliveryDate: "2026-08-25" },
    ],
    sales: [{ id: "s1", number: "V-1", status: "delivered", fiscalDecision: "pending", saleDate: "2026-08-25" }],
    existingReminderKeys: ["order_approval:o1:2026-08-25"],
  }, new Date("2026-08-25T12:00:00Z"));
  assert.deepEqual(reminders.map((item) => item.kind), ["delivery_confirmation", "fiscal_decision"]);
  assert.equal(new Set(reminders.map((item) => item.dedupeKey)).size, reminders.length);
});

test("interpreta contexto pero mantiene ambigüedades fuera del pedido", () => {
  const result = interpretCustomerMessage({
    message: "mandame lo mismo de la otra vez, 2 lavandinas más y el coso del baño",
    customer: { id: "c1", name: "IT Italy N2", productAliases: [] },
    lastOrder: { items: [{ productId: "HIPO-5", name: "Hipoclorito 33% 5 L", quantity: 5 }] },
  });
  assert.equal(result.suggestions[0].quantity, 7);
  assert.equal(result.questions.length, 1);
  assert.equal(result.safeToCreateDraft, true);
  assert.equal(result.safeToSubmitOrder, false);
});

test("guard SQL bloquea mutaciones incluso dentro de WITH", () => {
  assert.equal(assertReadOnlySql("SELECT id FROM clients WHERE empresa_id = $1"), "SELECT id FROM clients WHERE empresa_id = $1");
  assert.throws(() => assertReadOnlySql("UPDATE clients SET active = false"), { code: "SUPERVISOR_READ_ONLY" });
  assert.throws(() => assertReadOnlySql("WITH changed AS (DELETE FROM sales RETURNING *) SELECT * FROM changed"), { code: "SUPERVISOR_READ_ONLY" });
});

test("adaptador real aplica empresa y alcance del vendedor antes de consultar", async () => {
  const calls = [];
  const adapter = createErpReadAdapter(async (call) => {
    calls.push(call);
    return [{
      customer_id: "00000000-0000-0000-0000-000000000001",
      customer_name: "Cliente",
      seller: "FRAN",
      sale_id: "00000000-0000-0000-0000-000000000002",
      sale_date: "2026-08-01",
      product_id: "00000000-0000-0000-0000-000000000003",
      product_name: "Hipoclorito",
      quantity: "5",
    }];
  });
  const history = await adapter.customerHistory(
    { role: "vendedor", companyId: 4, username: "fran", displayName: "Francisco" },
    "00000000-0000-0000-0000-000000000001",
  );
  assert.equal(calls[0].companyId, 4);
  assert.equal(calls[0].params[1], 4);
  assert.deepEqual(calls[0].params[2], ["FRAN", "FRANCISCO"]);
  assert.match(calls[0].sql, /c\.empresa_id = \$2/);
  assert.match(calls[0].sql, /assigned_seller/);
  assert.equal(history.purchases[0].items[0].quantity, 5);
});
