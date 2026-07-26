import assert from "node:assert/strict";
import { test } from "node:test";
import { PRESENCE_WINDOW_MS, buildSnapshot, isOnline } from "../src/lib/presence.ts";

const now = new Date("2026-07-26T12:00:00.000Z");

test("isOnline: activo dentro de la ventana cuenta como online", () => {
  const seen = new Date(now.getTime() - 30_000); // hace 30 s
  assert.equal(isOnline(seen, now), true);
});

test("isOnline: justo en el borde de la ventana sigue online", () => {
  const seen = new Date(now.getTime() - PRESENCE_WINDOW_MS);
  assert.equal(isOnline(seen, now), true);
});

test("isOnline: mas viejo que la ventana queda offline", () => {
  const seen = new Date(now.getTime() - (PRESENCE_WINDOW_MS + 1_000));
  assert.equal(isOnline(seen, now), false);
});

test("isOnline: acepta timestamps como string", () => {
  const seen = new Date(now.getTime() - 10_000).toISOString();
  assert.equal(isOnline(seen, now), true);
});

test("buildSnapshot: cuenta solo online e incluye al propio usuario", () => {
  const rows = [
    { username: "augusto", displayName: "Augusto", lastSeen: new Date(now.getTime() - 5_000) },
    { username: "tomas", displayName: "Tomás", lastSeen: new Date(now.getTime() - 20_000) },
    { username: "vieja", displayName: "Vieja Sesion", lastSeen: new Date(now.getTime() - 600_000) },
  ];
  const snap = buildSnapshot(rows, "augusto", now);
  assert.equal(snap.count, 2);
  assert.deepEqual(snap.online.map((u) => u.username), ["augusto", "tomas"]);
});

test("buildSnapshot: marca isSelf y lo ordena primero", () => {
  const rows = [
    { username: "tomas", displayName: "Tomás", lastSeen: now },
    { username: "augusto", displayName: "Augusto", lastSeen: now },
  ];
  const snap = buildSnapshot(rows, "augusto", now);
  assert.equal(snap.online[0].username, "augusto");
  assert.equal(snap.online[0].isSelf, true);
  assert.equal(snap.online[1].isSelf, false);
});

test("buildSnapshot: usa el username si falta el display_name", () => {
  const rows = [{ username: "sinnombre", displayName: null, lastSeen: now }];
  const snap = buildSnapshot(rows, "otro", now);
  assert.equal(snap.online[0].displayName, "sinnombre");
});
