import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const aliasSources = new Map([
  ["@/lib/api-response", "export const ApiError = Error;"],
  ["@/lib/db", "export const getDbPool = () => globalThis.wsaaTicketCacheTestPool;"],
]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    const source = aliasSources.get(specifier);
    return source ? { shortCircuit: true, url: "data:text/javascript," + encodeURIComponent(source) } :
      nextResolve(specifier, context);
  },
});

const { getSharedWsaaTicket } = await import("../src/lib/arca/wsaa-ticket-cache.ts");

const signingKey = Buffer.from("test-signing-key");

function fakeSharedPool() {
  const rows = new Map();
  const locks = new Map();
  return {
    rows,
    async connect() {
      let unlock;
      return {
        async query(sql, values = []) {
          const [key, payload, expiresAt] = values;
          if (sql.includes("pg_advisory_xact_lock")) {
            const previous = locks.get(key);
            locks.set(key, new Promise((resolve) => { unlock = resolve; }));
            await previous;
          } else if (sql.startsWith("SELECT encrypted_ticket")) {
            const stored = rows.get(key);
            return { rows: stored?.expiresAt.getTime() > Date.now() ? [{ encrypted_ticket: stored.payload }] : [] };
          } else if (sql.startsWith("INSERT INTO")) {
            rows.set(key, { payload, expiresAt });
          } else if (sql === "COMMIT" || sql === "ROLLBACK") {
            unlock?.();
          }
        },
        release() {},
      };
    },
  };
}

function newTicket(token = "test-ticket-token") {
  return { token, sign: "test-ticket-sign", expiresAt: Date.now() + 60_000 };
}

test("las instancias comparten un único ticket vigente y lo guardan cifrado", async () => {
  const pool = fakeSharedPool();
  globalThis.wsaaTicketCacheTestPool = pool;
  const ticket = newTicket();
  let requests = 0;
  const issueTicket = async () => {
    requests += 1;
    return ticket;
  };
  const results = await Promise.all([
    getSharedWsaaTicket("issuer-A", signingKey, issueTicket),
    getSharedWsaaTicket("issuer-A", signingKey, issueTicket),
  ]);
  assert.deepEqual(results, [ticket, ticket]);
  assert.equal(requests, 1);
  assert.equal(pool.rows.get("issuer-A").payload.includes(Buffer.from(ticket.token)), false);
  assert.equal(pool.rows.get("issuer-A").payload.includes(Buffer.from(ticket.sign)), false);
});

test("renueva un ticket vencido y deja el cache disponible después de fallar", async () => {
  const pool = fakeSharedPool();
  globalThis.wsaaTicketCacheTestPool = pool;
  const issueTicket = async () => newTicket("new-token");
  await getSharedWsaaTicket("issuer-A", signingKey, issueTicket);
  pool.rows.get("issuer-A").expiresAt = new Date(0);
  await assert.rejects(getSharedWsaaTicket("issuer-A", signingKey, async () => { throw new Error("WSAA falló"); }), /WSAA falló/);
  assert.equal((await getSharedWsaaTicket("issuer-A", signingKey, issueTicket)).token, "new-token");
});

test("un ticket cifrado para otro certificado se rechaza sin pedir un segundo ticket", async () => {
  const pool = fakeSharedPool();
  globalThis.wsaaTicketCacheTestPool = pool;
  await getSharedWsaaTicket("issuer-A", signingKey, async () => newTicket());
  pool.rows.set("issuer-B", pool.rows.get("issuer-A"));
  let issuance = 0;
  await assert.rejects(getSharedWsaaTicket("issuer-B", signingKey, async () => {
    issuance += 1;
    return newTicket();
  }));
  assert.equal(issuance, 0);
});
