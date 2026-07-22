import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(scriptDir, "..");
const repoRoot = join(webRoot, "..", "..");

loadEnvFile(join(repoRoot, ".env.smoke"));
loadEnvFile(join(webRoot, ".env.smoke"));

const baseUrl = process.env.STARLIM_SMOKE_BASE_URL
  ? normalizeBaseUrl(process.env.STARLIM_SMOKE_BASE_URL)
  : "";
const adminUser = process.env.STARLIM_TEST_ADMIN_USER || "";
const adminPass = process.env.STARLIM_TEST_ADMIN_PASS || "";
const limitedUser = process.env.STARLIM_TEST_LIMITED_USER || "";
const limitedPass = process.env.STARLIM_TEST_LIMITED_PASS || "";
const defaultMaxLatencyMs = positiveInteger(process.env.STARLIM_SMOKE_MAX_LATENCY_MS, 5_000);
const heavyMaxLatencyMs = positiveInteger(process.env.STARLIM_SMOKE_HEAVY_MAX_LATENCY_MS, 8_000);
const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

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

function positiveInteger(value, fallback) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
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
  const method = options.method || "GET";
  const headers = {
    accept: "application/json",
    ...(options.body ? { "content-type": "application/json" } : {}),
    ...(mutatingMethods.has(method) ? { origin: baseUrl } : {}),
    ...(options.cookie ? { cookie: options.cookie } : {}),
    ...(options.headers || {}),
  };

  const startedAt = performance.now();
  const response = await fetch(endpoint(path), {
    method,
    headers,
    redirect: "manual",
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const latencyMs = Math.round(performance.now() - startedAt);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    throw new Error(`${path} did not return JSON: ${text.slice(0, 180)}`, { cause: error });
  }
  return { response, data, cookie: cookieHeader(response), latencyMs };
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

function assertLatency(path, latencyMs, maxLatencyMs = defaultMaxLatencyMs) {
  assert.ok(
    latencyMs <= maxLatencyMs,
    `${path} took ${latencyMs}ms, over budget ${maxLatencyMs}ms`,
  );
}

async function assertOkEndpoint(cookie, check) {
  const { response, data, latencyMs } = await jsonRequest(check.path, { cookie });
  assert.equal(response.status, 200, `${check.flow}: ${check.path} returned ${response.status}`);
  assert.equal(data.ok, true, `${check.flow}: ${check.path} did not return ok=true`);
  assertLatency(check.path, latencyMs, check.maxLatencyMs);
  check.assertData(data);
  return { path: check.path, latencyMs };
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

test("admin read smoke covers every documented project flow within latency budgets", { skip: !baseUrl || !adminUser || !adminPass }, async () => {
  const { cookie } = await login(adminUser, adminPass);

  const flowChecks = [
    {
      flow: "auth/session",
      path: "/api/auth/me",
      assertData: (data) => {
        assert.ok(data.user.userId);
        assert.ok(data.user.companyId > 0);
      },
    },
    {
      flow: "health/database",
      path: "/api/health",
      assertData: (data) => {
        assert.equal(data.database.ok, true);
        assert.ok(data.database.latencyMs >= 0);
      },
    },
    {
      flow: "shell/indicators",
      path: "/api/admin/metrics",
      maxLatencyMs: heavyMaxLatencyMs,
      assertData: (data) => {
        assert.ok(data.data.sales);
        assert.ok(data.data.receivables);
      },
    },
    {
      flow: "commercial/orders",
      path: "/api/orders?pageSize=1",
      assertData: (data) => {
        assert.ok(Array.isArray(data.data));
        assert.ok(data.meta);
      },
    },
    {
      flow: "commercial/delivered-sales",
      path: "/api/orders?pageSize=1&status=entregado",
      assertData: (data) => {
        assert.ok(Array.isArray(data.data));
        assert.ok(data.meta);
      },
    },
    {
      flow: "commercial/quotes",
      path: "/api/quotes?status=pendiente",
      assertData: (data) => assert.ok(Array.isArray(data.data)),
    },
    {
      flow: "master-data/customers",
      path: "/api/customers?pageSize=1",
      assertData: (data) => {
        assert.ok(Array.isArray(data.data));
        assert.ok(data.meta);
      },
    },
    {
      flow: "master-data/products",
      path: "/api/products?pageSize=1",
      assertData: (data) => {
        assert.ok(Array.isArray(data.data));
        assert.ok(data.meta);
      },
    },
    {
      flow: "master-data/suppliers",
      path: "/api/suppliers",
      assertData: (data) => assert.ok(Array.isArray(data.data)),
    },
    {
      flow: "pricing/price-lists",
      path: "/api/pricing/price-lists",
      assertData: (data) => assert.ok(Array.isArray(data.data)),
    },
    {
      flow: "purchases/register",
      path: "/api/purchases",
      maxLatencyMs: heavyMaxLatencyMs,
      assertData: (data) => assert.ok(Array.isArray(data.data)),
    },
    {
      flow: "purchases/accounts-payable",
      path: "/api/admin/accounts-payable",
      maxLatencyMs: heavyMaxLatencyMs,
      assertData: (data) => assert.ok(data.data),
    },
    {
      flow: "collections/pending-approval",
      path: "/api/collections/pending",
      assertData: (data) => assert.ok(Array.isArray(data.data)),
    },
    {
      flow: "finance/cashflow",
      path: "/api/admin/cashflow",
      maxLatencyMs: heavyMaxLatencyMs,
      assertData: (data) => assert.ok(data.data),
    },
    {
      flow: "support/messages",
      path: "/api/messages",
      assertData: (data) => {
        assert.ok(Array.isArray(data.data.inbox));
        assert.ok(Array.isArray(data.data.sent));
      },
    },
    {
      flow: "support/tasks",
      path: "/api/tasks",
      assertData: (data) => {
        assert.ok(Array.isArray(data.data.personal));
        assert.ok(Array.isArray(data.data.assigned));
      },
    },
    {
      flow: "support/customer-follow-up",
      path: "/api/customers/follow-up",
      maxLatencyMs: heavyMaxLatencyMs,
      assertData: (data) => {
        assert.ok(data.data.groups);
        assert.ok(data.data.counts);
      },
    },
  ];

  const timings = [];
  for (const check of flowChecks) {
    timings.push(await assertOkEndpoint(cookie, check));
  }

  timings.sort((left, right) => right.latencyMs - left.latencyMs);
  console.log("Slowest smoke flow endpoints:");
  for (const timing of timings.slice(0, 5)) {
    console.log(`- ${timing.path}: ${timing.latencyMs}ms`);
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
