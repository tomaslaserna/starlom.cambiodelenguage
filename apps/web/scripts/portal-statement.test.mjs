import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(path, aliases = {}) {
  const js = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const mod = { exports: {} }; Function("require", "module", "exports", js)((name) => aliases[name] ?? require(name), mod, mod.exports); return mod.exports;
}
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
const id = "2c425a04-f47a-4e55-b6bf-5c25a38cac75";
const other = "5b6906f2-8723-4234-862a-67668dc5e4b6";
const presentation = load("../src/lib/customer-statement-presentation.ts");
const format = load("../src/lib/format.ts");
const renderer = load("../src/lib/pdf/renderer.ts", { "../format": format });
function setup({ authStatus, members = [id], settled = false } = {}) {
  const queries = []; let pdfCalls = 0;
  let balance = 0;
  const lines = [100, -100, 200, settled ? -200 : -50].map((delta, n) => {
    balance += delta;
    return { id: String(n), date: "2026-10-21", description: `${delta > 0 ? "Remito" : "Cobro"} #${n}`, debit: Math.max(0, delta), credit: Math.max(0, -delta), balance, kind: "movimiento" };
  });
  const full = { customer: { id, name: "Cliente de prueba", taxId: "", sellerName: "" }, statement: { openingBalance: 0, lines, finalBalance: balance }, unappliedPayments: [{ id: "private-unapplied" }] };
  const aliases = {
    "@/lib/api-response": { ApiError, ok: (value) => Response.json(value), handleApiError: (e) => Response.json({ error: e.message }, { status: e.status ?? 500 }) },
    "@/lib/portal-auth": { requirePortalIdentity: async (request) => {
      assert.equal(request.headers.get("authorization"), "Bearer test-only");
      if (authStatus) throw new ApiError(authStatus, "Acceso denegado");
      return { companyId: 7, clientIds: members };
    } },
    "@/lib/request-body": { uuidParam: (value) => { if (!/^[a-f0-9-]{36}$/.test(value)) throw new ApiError(400, "Cliente inválido"); return value; } },
    "@/lib/customer-accounts": { getCustomerStatement: async (company, client, options) => {
      queries.push({ company, client, options }); assert.equal(company, 7); assert.equal(client, id); assert.deepEqual(options, {}); return full;
    } },
    "@/lib/customer-statement-presentation": presentation,
    "@/lib/pdf/renderer": renderer,
    "@/lib/timezone": { localDateIso: () => "2026-10-21" },
  };
  aliases["@/lib/portal-statement-access"] = load("../src/lib/portal-statement-access.ts", aliases);
  const builder = load("../src/lib/pdf/customer-statement.ts", aliases);
  aliases["@/lib/pdf/customer-statement"] = { buildCustomerStatementPdf: async (...args) => { pdfCalls++; return builder.buildCustomerStatementPdf(...args); } };
  const json = load("../src/app/api/portal/accounts/[id]/route.ts", aliases);
  const pdf = load("../src/app/api/portal/documents/accounts/[id]/route.ts", aliases);
  const call = (kind, client = id, query = "") => ({ json, pdf })[kind].GET(new Request(`https://starlim.test/api/portal/accounts/${client}${query}`, { headers: { authorization: "Bearer test-only" } }), { params: Promise.resolve({ id: client }) });
  return { call, full, queries, pdfCalls: () => pdfCalls };
}
for (const kind of ["json", "pdf"]) {
  for (const authStatus of [401, 403]) test(`portal ${kind}: deniega sesión inválida ${authStatus} antes de consultar`, async () => {
    const s = setup({ authStatus }); assert.equal((await s.call(kind)).status, authStatus); assert.equal(s.queries.length, 0); assert.equal(s.pdfCalls(), 0);
  });
  for (const query of ["", "?history=completo", `?history=completo&clientId=${id}&companyId=7`]) test(`portal ${kind}: bloquea cliente ajeno incluso con consultas manipuladas ${query}`, async () => {
    const s = setup(); assert.equal((await s.call(kind, other, query)).status, 404); assert.equal(s.queries.length, 0); assert.equal(s.pdfCalls(), 0);
  });
  test(`portal ${kind}: membresía vacía y UUID inválido no consultan datos`, async () => {
    const s = setup({ members: [] }); assert.equal((await s.call(kind)).status, 404); assert.equal((await s.call(kind, "invalid")).status, 400); assert.equal(s.queries.length, 0);
  });
}
for (const history of [false, true]) test(`portal JSON ${history ? "completo" : "actual"}: conserva saldo, corte por índice y datos sólo del cliente`, async () => {
  const s = setup(); const before = structuredClone(s.full);
  const response = await s.call("json", id, history ? "?history=completo" : "");
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
  const payload = await response.json();
  assert.equal(payload.data.clientId, id); assert.equal(payload.data.currentBalance, 150); assert.equal(payload.data.statement.finalBalance, 150);
  assert.equal(payload.data.statement.lines.length, history ? 4 : 2);
  assert.equal(payload.data.hiddenCount, history ? 0 : 2);
  assert.equal(payload.data.completeHistory, history);
  assert.equal(JSON.stringify(payload).includes("private-unapplied"), false);
  assert.deepEqual(s.full, before);
});
test("portal cuenta saldada: cero filas actuales pero historial disponible", async () => {
  const s = setup({ settled: true });
  const current = (await (await s.call("json")).json()).data;
  assert.equal(current.currentBalance, 0); assert.equal(current.statement.lines.length, 0);
  assert.equal((await (await s.call("json", id, "?history=completo")).json()).data.statement.lines.length, 4);
});
for (const history of [false, true]) test(`portal PDF ${history ? "completo" : "actual"}: usa exactamente el generador tradicional y entrega adjunto privado`, async () => {
  const s = setup(); const query = history ? "?history=completo" : "";
  const response = await s.call("pdf", id, query);
  assert.equal(response.status, 200); assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.match(response.headers.get("content-disposition"), /^attachment;/);
  assert.match(response.headers.get("cache-control"), /private, no-store/);
  const actual = Buffer.from(await response.arrayBuffer());
  assert.equal(actual.subarray(0, 5).toString(), "%PDF-");
  // PDF dates may change metadata bytes; the real renderer and ledger are shared, not a parallel design.
  assert.equal(s.pdfCalls(), 1); assert.equal(s.queries.length, 1);
  assert.match(response.headers.get("content-disposition"), history ? /_completo_/ : /_actual_/);
  if (process.argv.includes("--write-fixtures")) {
    const dir = new URL("../.next/portal-statement-fixtures/", import.meta.url); mkdirSync(dir, { recursive: true });
    writeFileSync(new URL(history ? "completo.pdf" : "actual.pdf", dir), actual);
  }
});
test("portal UI: tokens sólo en cabecera, cambio de sucursal remonta y cancela peticiones; no toca pagos", () => {
  const ui = readFileSync(new URL("../src/app/portal/portal-account-statement.tsx", import.meta.url), "utf8");
  const parent = readFileSync(new URL("../src/app/portal/portal-app.tsx", import.meta.url), "utf8");
  assert.match(parent, /PortalAccountStatement key=\{`\$\{session.user.id\}:\$\{branch\}`\}/);
  assert.match(ui, /result\?\.key === key/); assert.match(ui, /return \(\) => controller.abort\(\)/);
  assert.match(ui, /headers: \{ authorization: `Bearer \$\{accessToken\}` \}/);
  assert.match(ui, /Historial completo/); assert.match(ui, /Último período/); assert.match(ui, /PDF historial completo/);
  assert.doesNotMatch(ui, /method: ["']POST|registerCustomerPayment|\/api\/portal\/checkout|access_token=/);
});

test("portal UI real: inicia consulta privada, descarta respuesta tardía y cambia de vista sin mutaciones", async () => {
  const effects = [], writes = []; let stateIndex = 0;
  const state = [false, null, "", false];
  const ui = load("../src/app/portal/portal-account-statement.tsx", {
    react: {
      useState: (initial) => { const i = stateIndex++; return [state[i] ?? initial, (value) => { state[i] = typeof value === "function" ? value(state[i]) : value; writes.push(value); }]; },
      useRef: () => ({ current: null }), useEffect: (effect) => effects.push(effect),
    },
    "@/lib/customer-statement-presentation": presentation, "@/lib/format": format,
  });
  const before = globalThis.fetch; let finish, signal, requestUrl;
  globalThis.fetch = (url, options) => {
    requestUrl = url; signal = options.signal; assert.equal(options.headers.authorization, "Bearer test-only"); assert.equal(options.cache, "no-store");
    return new Promise((resolve) => { finish = resolve; });
  };
  try {
    const tree = ui.PortalAccountStatement({ clientId: id, accessToken: "test-only", updatedAt: "now" });
    const cleanup = effects[0](); assert.equal(requestUrl, `/api/portal/accounts/${id}`);
    cleanup(); assert.equal(signal.aborted, true);
    finish(Response.json({ data: { clientId: id, secret: "old-branch" } }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(writes.length, 0);
    const nodes = [];
    function walk(node) { if (Array.isArray(node)) return node.forEach(walk); if (node && typeof node === "object") { nodes.push(node); walk(node.props?.children); } }
    walk(tree);
    nodes.find((node) => node.type === "button" && node.props.children === "Historial completo").props.onClick();
    assert.equal(state[0], true);
    stateIndex = 0; effects.length = 0;
    ui.PortalAccountStatement({ clientId: id, accessToken: "test-only", updatedAt: "now" });
    const end = effects[0](); assert.equal(requestUrl, `/api/portal/accounts/${id}?history=completo`); end();
  } finally { globalThis.fetch = before; }
});
