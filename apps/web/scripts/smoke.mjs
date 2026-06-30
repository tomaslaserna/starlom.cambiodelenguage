import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

loadEnvFile("../../.env.smoke");
loadEnvFile(".env.smoke");

const baseUrl = process.env.STARLIM_SMOKE_BASE_URL
  ? normalizeBaseUrl(process.env.STARLIM_SMOKE_BASE_URL)
  : "";
const adminUser = process.env.STARLIM_TEST_ADMIN_USER || "";
const adminPass = process.env.STARLIM_TEST_ADMIN_PASS || "";
const limitedUser = process.env.STARLIM_TEST_LIMITED_USER || "";
const limitedPass = process.env.STARLIM_TEST_LIMITED_PASS || "";

function loadEnvFile(path) {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2]
      .replace(/\s+#.*$/, "")
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function endpoint(path) {
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function setCookieHeaders(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const combined = headers.get("set-cookie");
  if (!combined) return [];
  return combined.split(/,(?=\s*[^;,]+=)/);
}

function cookieHeader(response) {
  return setCookieHeaders(response.headers)
    .map((cookie) => cookie.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

async function jsonRequest(path, options = {}) {
  const headers = {
    accept: "application/json",
    ...(options.body ? { "content-type": "application/json" } : {}),
    ...(options.cookie ? { cookie: options.cookie } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(endpoint(path), {
    method: options.method || "GET",
    headers,
    redirect: "manual",
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  return { response, data, cookie: cookieHeader(response) };
}

async function login(identifier, password) {
  const result = await jsonRequest("/api/auth/login", {
    method: "POST",
    body: { identifier, password },
  });

  assert.equal(result.response.status, 200, `login failed with status ${result.response.status}`);
  assert.equal(result.data?.ok, true);
  assert.ok(result.cookie.includes("starlim_node_session="), "login response did not set session cookie");
  return result;
}

test("health endpoint can reach the database", { skip: !baseUrl }, async () => {
  const { response, data } = await jsonRequest("/api/health");
  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.database.ok, true);
});

test("public register endpoint is disabled", { skip: !baseUrl }, async () => {
  const { response, data } = await jsonRequest("/api/auth/register", {
    method: "POST",
    body: { identifier: "smoke@example.invalid", password: "not-used" },
  });
  assert.equal(response.status, 403);
  assert.equal(data.ok, false);
});

test("private read endpoints reject unauthenticated requests", { skip: !baseUrl }, async () => {
  for (const path of ["/api/auth/me", "/api/orders?pageSize=1", "/api/admin/metrics"]) {
    const { response, data } = await jsonRequest(path);
    assert.equal(response.status, 401, `${path} should require a session`);
    assert.equal(data.ok, false);
  }
});

test("invalid login returns 401 without redirecting JSON clients", { skip: !baseUrl }, async () => {
  const identifier = `smoke-${Date.now()}@example.invalid`;
  const { response, data } = await jsonRequest("/api/auth/login", {
    method: "POST",
    body: { identifier, password: "wrong-password" },
  });
  assert.equal(response.status, 401);
  assert.equal(data.ok, false);
});

test("admin can authenticate and read critical dashboards", { skip: !baseUrl || !adminUser || !adminPass }, async () => {
  const { cookie, data: loginData } = await login(adminUser, adminPass);
  assert.ok(["administrador", "Admin"].includes(loginData.user.role));

  const me = await jsonRequest("/api/auth/me", { cookie });
  assert.equal(me.response.status, 200);
  assert.equal(me.data.ok, true);
  assert.equal(me.data.user.userId, loginData.user.userId);

  const checks = [
    [
      "/api/admin/metrics",
      (data) => {
        assert.ok(data.data);
        assert.ok(data.data.sales.current > 0, "admin metrics should expose current-month sales");
        assert.ok(data.data.receivables.openTotal > 0, "admin metrics should expose open receivables");
      },
    ],
    ["/api/orders?pageSize=1", (data) => assert.ok(data.meta)],
    [
      "/api/customers?pageSize=1",
      (data) => {
        assert.ok(data.meta);
        assert.ok(data.meta.total > 0, "customers endpoint should expose imported clients");
        assert.ok(data.data.length > 0, "customers endpoint should return at least one row");
      },
    ],
    ["/api/products?pageSize=1", (data) => assert.ok(data.meta)],
    ["/api/purchases", (data) => assert.ok(Array.isArray(data.data))],
  ];

  for (const [path, assertData] of checks) {
    const { response, data } = await jsonRequest(path, { cookie });
    assert.equal(response.status, 200, `${path} returned ${response.status}`);
    assert.equal(data.ok, true, `${path} did not return ok=true`);
    assertData(data);
  }
});

test(
  "limited user cannot read admin metrics",
  { skip: !baseUrl || !limitedUser || !limitedPass },
  async () => {
    const { cookie } = await login(limitedUser, limitedPass);
    const { response, data } = await jsonRequest("/api/admin/metrics", { cookie });
    assert.equal(response.status, 403);
    assert.equal(data.ok, false);
  },
);
