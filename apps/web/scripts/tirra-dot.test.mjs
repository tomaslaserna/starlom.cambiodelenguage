import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createHmac } from "node:crypto";
import ts from "typescript";
import * as protocol from "../src/lib/supervisor-lab/dot-protocol.mjs";
import { compileDotQuery } from "../src/lib/supervisor-lab/dot-query.mjs";

const require = createRequire(import.meta.url);
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function load(relative, aliases) {
  const source = readFileSync(new URL(relative, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  Function(
    "require",
    "module",
    "exports",
    compiled,
  )(
    (name) => (Object.hasOwn(aliases, name) ? aliases[name] : require(name)),
    module,
    module.exports,
  );
  return module.exports;
}
const owner = {
  userId: "11111111-1111-4111-8111-111111111111",
  companyId: 1,
  displayName: "Prueba",
  role: "administrador",
};
function oauthHarness() {
  let active = true;
  const clients = new Map(),
    grants = [];
  const client = {
    query: async (sql, p = []) => {
      if (sql.startsWith("INSERT INTO starlim_dot.oauth_clients")) {
        clients.set(p[0], JSON.parse(p[1]));
        return { rows: [] };
      }
      if (sql.startsWith("SELECT redirect_uris"))
        return {
          rows: clients.has(p[0]) ? [{ redirect_uris: clients.get(p[0]) }] : [],
        };
      if (sql.startsWith("INSERT INTO starlim_dot.oauth_grants")) {
        grants.push({
          id: protocol.nonce(),
          client_id: p[0],
          code_hash: p[1],
          challenge: p[2],
          redirect_uri: p[3],
          principal: JSON.parse(p[4]),
        });
        return { rows: [] };
      }
      if (sql.startsWith("SELECT id,challenge"))
        return {
          rows: grants.filter(
            (row) =>
              row.client_id === p[0] &&
              row[
                sql.includes("refresh_hash") ? "refresh_hash" : "code_hash"
              ] === p[1],
          ),
        };
      if (sql.startsWith("UPDATE starlim_dot.oauth_grants")) {
        Object.assign(
          grants.find((row) => row.id === p[0]),
          {
            code_hash: null,
            access_hash: p[1],
            refresh_hash: p[2],
            principal: JSON.parse(p[3]),
          },
        );
        return { rows: [] };
      }
      if (sql.startsWith("SELECT principal"))
        return { rows: grants.filter((row) => row.access_hash === p[0]) };
      return { rows: [] };
    },
    release: () => {},
  };
  const auth = load("../src/lib/supervisor-lab/dot-auth.ts", {
    "server-only": {},
    "@/lib/api-response": { ApiError },
    "@/lib/db": {
      getDbPool: () => ({ ...client, connect: async () => client }),
    },
    "@/lib/auth": {
      isAdminRole: (role) => role === "administrador",
      validateSessionIdentity: async (principal) => (active ? principal : null),
    },
    "@/lib/env": {
      envValue: (key) =>
        key === "STARLIM_SESSION_SECRET" ? "test-session-secret" : undefined,
    },
    "./dot-protocol.mjs": protocol,
  });
  return {
    auth,
    disable: () => {
      active = false;
    },
  };
}
test("OAuth requires exact OpenAI redirects, resource and PKCE; codes and refresh tokens cannot be reused", async () => {
  const { auth } = oauthHarness();
  await assert.rejects(
    auth.registerDotClient({
      redirect_uris: ["https://evil.example/callback"],
    }),
  );
  const redirect = "https://chatgpt.com/connector_platform_oauth_redirect";
  const { client_id } = await auth.registerDotClient({
    redirect_uris: [redirect],
  });
  const verifier = protocol.nonce();
  const authorize = new URLSearchParams({
    client_id,
    redirect_uri: redirect,
    response_type: "code",
    code_challenge: protocol.pkce(verifier),
    code_challenge_method: "S256",
    resource: auth.dotResource(),
    state: "123",
  });
  await assert.rejects(
    auth.authorizeDot({ ...owner, role: "vendedor" }, authorize),
  );
  const callback = await auth.authorizeDot(owner, authorize);
  assert.equal(callback.searchParams.get("state"), "123");
  assert.equal(callback.searchParams.get("iss"), auth.dotOrigin());
  const tokenParams = new URLSearchParams({
    client_id,
    redirect_uri: redirect,
    grant_type: "authorization_code",
    code: callback.searchParams.get("code"),
    code_verifier: verifier,
    resource: auth.dotResource(),
  });
  const wrong = new URLSearchParams(tokenParams);
  wrong.set("code_verifier", protocol.nonce());
  await assert.rejects(auth.exchangeDotToken(wrong));
  const token = await auth.exchangeDotToken(tokenParams);
  await assert.rejects(auth.exchangeDotToken(tokenParams));
  assert.equal(
    (
      await auth.dotPrincipal(
        new Request("https://starlim.vercel.app", {
          headers: { Authorization: `Bearer ${token.access_token}` },
        }),
      )
    ).companyId,
    1,
  );
  const refresh = new URLSearchParams({
    client_id,
    grant_type: "refresh_token",
    refresh_token: token.refresh_token,
    resource: auth.dotResource(),
  });
  const rotated = await auth.exchangeDotToken(refresh);
  assert.notEqual(rotated.access_token, token.access_token);
  await assert.rejects(auth.exchangeDotToken(refresh));
  await assert.rejects(
    auth.dotPrincipal(
      new Request("https://starlim.vercel.app", {
        headers: { Authorization: `Bearer ${token.access_token}` },
      }),
    ),
  );
});
test("revoked StarLim identities immediately lose MCP access; encrypted secrets reject tampering", async () => {
  const { auth, disable } = oauthHarness();
  const cipher = auth.encryptDotSecret("private signing key");
  assert.equal(auth.decryptDotSecret(cipher), "private signing key");
  assert.ok(!cipher.includes("private"));
  const buffer = Buffer.from(cipher, "base64");
  buffer[13] ^= 1;
  assert.throws(() => auth.decryptDotSecret(buffer.toString("base64")));
  disable();
  await assert.rejects(
    auth.dotPrincipal(new Request("https://starlim.vercel.app")),
  );
});
test("signed events preserve ids across retries and implement Standard Webhooks exactly", () => {
  const secret = `whsec_${Buffer.alloc(32, 7).toString("base64")}`,
    subscription = { id: "sub_1", secret };
  const event = protocol.questionEvent({
    id: "a",
    created_at: "2026-10-05T00:00:00Z",
    question: "¿Precio?",
  });
  assert.deepEqual(
    event,
    protocol.questionEvent({
      id: "a",
      created_at: "2026-10-05T00:00:00Z",
      question: "¿Precio?",
    }),
  );
  const body = JSON.stringify(event),
    headers = protocol.signedHeaders(subscription, event.eventId, body, 100);
  assert.equal(
    headers["webhook-signature"],
    `v1,${createHmac("sha256", Buffer.alloc(32, 7)).update(`${event.eventId}.100.${body}`).digest("base64")}`,
  );
  assert.throws(() => protocol.signingKey("whsec_YWJj"));
  assert.equal(protocol.terminalDelivery(410), true);
  assert.equal(protocol.terminalDelivery(503), false);
});
test("callback verification rejects redirects and wrong challenges; private DNS destinations never receive payloads", async () => {
  const sub = {
    id: "sub",
    url: "https://callback.example/hook",
    secret: `whsec_${Buffer.alloc(32, 3).toString("base64")}`,
  };
  await protocol.verifyCallback(sub, async (_url, body) => ({
    status: 200,
    body: JSON.stringify({ challenge: JSON.parse(body).challenge }),
  }));
  await assert.rejects(
    protocol.verifyCallback(sub, async () => ({
      status: 200,
      body: '{"challenge":"wrong"}',
    })),
  );
  await assert.rejects(
    protocol.verifyCallback(sub, async (_url, body) => ({
      status: 302,
      body: JSON.stringify({ challenge: JSON.parse(body).challenge }),
    })),
  );
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "100.64.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "2001:db8::1",
  ])
    assert.equal(protocol.publicAddress(ip), false, ip);
  assert.equal(protocol.publicAddress("8.8.8.8"), true);
  await assert.rejects(
    protocol.postWebhook(sub.url, "{}", {}, async () => [
      { address: "127.0.0.1", family: 4 },
    ]),
  );
  await assert.rejects(
    protocol.postWebhook("http://callback.example", "{}", {}),
  );
});
test("structured queries bind hostile values, enforce company filters and reject SQL identifiers and mutations", () => {
  const q = compileDotQuery(
    "products",
    ["id", "name", "sale_price", "empresa_id"],
    {
      filters: [{ column: "name", op: "eq", value: "';DELETE FROM sales;--" }],
      aggregate: { function: "sum", column: "sale_price" },
    },
    7,
  );
  assert.ok(q.sql.startsWith("SELECT"));
  assert.ok(q.sql.includes("t.empresa_id=$1"));
  assert.deepEqual(q.params, [7, "';DELETE FROM sales;--"]);
  assert.ok(!q.sql.includes("DELETE"));
  assert.ok(q.countSql.includes('sum(t."sale_price")'));
  for (const input of [
    { columns: ["name); DROP TABLE sales;--"] },
    { filters: [{ column: "name", op: "delete", value: "x" }] },
    { limit: 1000 },
    { offset: -1 },
    { aggregate: { function: "pg_sleep", column: "name" } },
  ])
    assert.throws(() => compileDotQuery("products", ["id", "name"], input, 7));
});
test("chat path has no paid inference fallback and MCP exceptions do not exempt the consent endpoint from CSRF", () => {
  const read = (name) =>
    readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8");
  assert.doesNotMatch(
    read("app/api/supervisor-lab/chat/route.ts"),
    /createAgentUIStreamResponse|createStarlimSupervisorAgent|gateway|openai|gemini/i,
  );
  assert.match(read("lib/supervisor-lab/dot-data.ts"), /BEGIN READ ONLY/);
  const proxy = read("proxy.ts"),
    exceptions = proxy.match(
      /const DOT_PROTOCOL_ENDPOINTS = new Set\(\[([\s\S]*?)\]\)/,
    )[1];
  assert.ok(!exceptions.includes("authorize"));
  assert.ok(exceptions.includes("/api/supervisor-lab/mcp"));
});
test("full assistant replies survive storage compaction", () => {
  const compact = load(
    "../src/lib/supervisor-lab/message-compact.ts",
    {},
  ).compactSupervisorMessages;
  const answer = "Detalle ".repeat(1000).trim();
  assert.equal(
    compact(
      [{ id: "a", role: "assistant", parts: [{ type: "text", text: answer }] }],
      200,
      16000,
    )[0].parts[0].text,
    answer,
  );
});

test("OAuth consent posts to an explicit same-origin action and allows only approved ChatGPT callback redirects", async () => {
  const config = load("../next.config.ts", {}).default;
  const rules = await config.headers();
  const normal = rules.find((rule) => rule.source === "/:path*");
  const oauth = rules.find((rule) => rule.source === "/api/supervisor-lab/oauth/authorize");
  const csp = (rule) => rule.headers.find((header) => header.key === "Content-Security-Policy").value;
  assert.match(csp(normal), /form-action 'self';/);
  assert.match(csp(oauth), /form-action 'self' https:\/\/chatgpt\.com\/connector_platform_oauth_redirect https:\/\/chatgpt\.com\/connector\/oauth\//);
  assert.doesNotMatch(csp(oauth), /form-action[^;]*\*/);
  const route = load("../src/app/api/supervisor-lab/oauth/authorize/route.ts", {
    "@/lib/auth": { isAdminRole: () => true },
    "@/lib/api-response": { ApiError, handleApiError: (error) => { throw error; } },
    "@/lib/route-auth": { requireApiSession: async () => ({ userId: "owner", companyId: 1, displayName: "Test", companyName: "StarLim" }) },
    "@/lib/supervisor-lab/dot-auth": { validateAuthorization: async () => {}, encryptDotSecret: () => "test-consent" },
  });
  const response = await route.GET(new Request("https://starlim.vercel.app/api/supervisor-lab/oauth/authorize?state=test"));
  assert.match(await response.text(), /<form method="post" action="\/api\/supervisor-lab\/oauth\/authorize">/);
  assert.match(response.headers.get("content-security-policy"), /https:\/\/chatgpt\.com\/connector_platform_oauth_redirect/);
  assert.match(response.headers.get("content-security-policy"), /script-src 'nonce-[A-Za-z0-9+/=]+'; connect-src 'self'/);
});

test("OAuth JSON submission validates origin, consent identity and expiry before returning the callback", async () => {
  const session = { userId: "owner", companyId: 1 };
  let grantCalls = 0;
  const route = load("../src/app/api/supervisor-lab/oauth/authorize/route.ts", {
    "@/lib/auth": {},
    "@/lib/api-response": { ApiError, handleApiError: (error) => Response.json({ error: error.message }, { status: error.status }) },
    "@/lib/route-auth": { requireApiSession: async () => session },
    "@/lib/supervisor-lab/dot-auth": { decryptDotSecret: (value) => value, authorizeDot: async () => { grantCalls++; return new URL("https://chatgpt.com/connector_platform_oauth_redirect?code=test"); } },
  });
  const submit = (consent, origin = "https://starlim.vercel.app") => route.POST(new Request("https://starlim.vercel.app/api/supervisor-lab/oauth/authorize", {
    method: "POST", headers: { Origin: origin, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ consent: JSON.stringify(consent) }),
  }));
  const valid = { ...session, expires: Date.now() + 300000, query: "state=test" };
  assert.equal((await submit(valid, "https://untrusted.example")).status, 403);
  assert.equal((await submit({ ...valid, userId: "other" })).status, 403);
  assert.equal((await submit({ ...valid, expires: Date.now() - 1 })).status, 403);
  assert.equal(grantCalls, 0);
  const response = await submit(valid);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).redirect, "https://chatgpt.com/connector_platform_oauth_redirect?code=test");
  assert.equal(grantCalls, 1);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
