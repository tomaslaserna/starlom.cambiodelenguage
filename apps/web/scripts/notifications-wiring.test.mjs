import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [shell, bell, source, route] = await Promise.all([
  readFile(new URL("../src/components/module-page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/notification-bell.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/operational-notifications.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/notifications/route.ts", import.meta.url), "utf8"),
]);

test("the notification center is mounted beside presence on desktop and mobile", () => {
  assert.match(shell, /<PresenceIndicator\s*\/>\s*<NotificationBell/);
  assert.match(shell, /<NotificationBell compact initialSnapshot=\{notifications\}/);
});

test("notifications refresh without reloading the ERP", () => {
  assert.match(bell, /fetch\("\/api\/notifications"/);
  assert.match(bell, /POLL_INTERVAL_MS = 60_000/);
  assert.match(route, /Cache-Control", "private, no-store/);
});

test("all requested operational sources have a destination", () => {
  for (const category of ["missions", "collections", "deliveries", "fiscal", "purchases", "tasks"]) {
    assert.match(source, new RegExp(`category: \\"${category}\\"`));
  }
  for (const href of ["/sales-engine", "/payments/accounts", "/orders", "/billing", "/purchases/replenishment", "/calendar"]) {
    assert.match(source, new RegExp(href.replaceAll("/", "\\/")));
  }
});

test("permission checks prevent irrelevant operational alerts", () => {
  for (const permission of ["crm.ver", "cobranzas.ver", "pedidos.ver", "ventas.ver", "compras.ver"]) {
    assert.match(source, new RegExp(permission.replace(".", "\\.")));
  }
});

test("the bell only surfaces current work instead of historical backlogs", () => {
  assert.match(source, /lead\.nextFollowup === today/);
  assert.match(source, /signal\.followUpOn === today/);
  assert.match(source, /sale\.dueDate === today/);
  assert.match(source, /sale\.overdueDays === 1/);
  assert.match(source, /= CURRENT_DATE - 3/);
  assert.match(source, /today_delivery\.created_at::date = CURRENT_DATE/);
  assert.match(source, /pendingCount: actionable\.length/);
});
