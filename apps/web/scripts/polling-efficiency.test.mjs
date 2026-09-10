import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("staff presence shares one request source across desktop and mobile views", () => {
  const modulePage = read("src/components/module-page.tsx");
  const presence = read("src/components/presence-indicator.tsx");

  assert.equal((modulePage.match(/<PresenceProvider>/g) ?? []).length, 1);
  assert.equal((modulePage.match(/<PresenceIndicator/g) ?? []).length, 2);
  assert.match(presence, /HEARTBEAT_MS = 60_000/);
  assert.match(presence, /useVisibilityAwarePolling/);
  assert.doesNotMatch(presence, /setInterval/);
});

test("shared polling pauses hidden tabs and refreshes immediately on return", () => {
  const polling = read("src/components/use-visibility-aware-polling.ts");

  assert.match(polling, /document\.visibilityState !== "visible"/);
  assert.match(polling, /document\.addEventListener\("visibilitychange"/);
  assert.match(polling, /void run\(\)/);
  assert.match(polling, /window\.setTimeout/);
  assert.doesNotMatch(polling, /setInterval/);
});

test("session and portal payments use visibility-aware polling", () => {
  const session = read("src/components/session-keep-alive.tsx");
  const portal = read("src/app/portal/portal-app.tsx");
  const orderBuilder = read("src/app/portal/pedido/portal-order-builder.tsx");

  assert.match(session, /useVisibilityAwarePolling\(refresh/);
  for (const source of [portal, orderBuilder]) {
    assert.match(source, /PAYMENT_FAST_POLL_MS = 3_000/);
    assert.match(source, /PAYMENT_FAST_WINDOW_MS = 60_000/);
    assert.match(source, /PAYMENT_SLOW_POLL_MS = 10_000/);
    assert.match(source, /useVisibilityAwarePolling\(checkPayment/);
    assert.doesNotMatch(source, /setInterval/);
  }
});
