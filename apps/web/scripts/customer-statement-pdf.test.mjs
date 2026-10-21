import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(path, aliases = {}) {
  const js = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  Function("require", "module", "exports", js)((name) => aliases[name] ?? require(name), mod, mod.exports);
  return mod.exports;
}
const presentation = load("../src/lib/customer-statement-presentation.ts");
const format = load("../src/lib/format.ts");
const renderer = load("../src/lib/pdf/renderer.ts", { "../format": format });
const clientId = "2c425a04-f47a-4e55-b6bf-5c25a38cac75";
function fixture(settled = false) {
  let balance = 0;
  const deltas = [100, -100, 200, settled ? -200 : -50];
  const lines = deltas.map((delta, index) => {
    balance += delta;
    return { id: String(index), date: index < 2 ? "2026-07-01" : "2026-10-21", description: `${delta > 0 ? "Remito" : "Cobro"} de prueba ${index}`, debit: Math.max(0, delta), credit: Math.max(0, -delta), balance, kind: "movimiento" };
  });
  return { openingBalance: 0, lines, finalBalance: balance };
}
function route(full = fixture(), options = {}) {
  const observed = { queries: [], rows: null, totals: null, header: null, notes: [] };
  const pdf = { doc: { y: 0 }, drawHeader: (value) => { observed.header = value; }, section() {}, title() {},
    muted: (value) => observed.notes.push(value), table: (_cols, rows) => { observed.rows = rows; },
    totals: (...args) => { observed.totals = args; }, note: (value) => observed.notes.push(value) };
  const mod = load("../src/app/api/pdfs/accounts/statement/[id]/route.ts", {
    "@/lib/api-response": { handleApiError: (error) => Response.json({ error: error.message }, { status: error.status ?? 500 }) },
    "@/lib/customer-accounts": { getCustomerStatement: async (company, id, dates) => {
      assert.equal(company, 1); assert.equal(id, clientId); observed.queries.push(dates);
      const lines = full.lines.filter((line) => (!dates.from || line.date >= dates.from) && (!dates.to || line.date <= dates.to));
      return { customer: { name: "Cliente de prueba", taxId: "", sellerName: "Operador" }, statement: { ...full, lines } };
    } },
    "@/lib/customer-statement-presentation": presentation,
    "@/lib/pdf/renderer": options.realPdf ? renderer : { ...renderer, createPdfFile: async (filename, build) => { build({ pdf }); return { filename, buffer: Buffer.from("%PDF-TEST") }; } },
    "@/lib/request-body": { uuidParam: (id) => { assert.equal(id, clientId); return id; } },
    "@/lib/route-auth": { COLLECTIONS_READ_PERMISSION: {}, requireApiSession: async () => {
      if (options.unauthorized) throw Object.assign(new Error("Ingresá"), { status: 401 });
      return { companyId: 1 };
    } },
    "@/lib/timezone": { localDateIso: () => "2026-10-21" },
  });
  return { observed, get: (query = "") => mod.GET({ nextUrl: new URL(`https://starlim.test/api/pdfs/accounts/statement/${clientId}${query}`) }, { params: Promise.resolve({ id: clientId }) }) };
}

test("PDF por defecto: mismo corte por movimiento que pantalla y mismo saldo final", async () => {
  const full = fixture(); const snapshot = structuredClone(full);
  const { observed, get } = route(full); const response = await get();
  assert.equal(response.status, 200);
  assert.equal(observed.rows.length, 3); // opening + two current movements, despite same-day closing
  assert.equal(observed.rows[1][1], "Remito de prueba 2");
  assert.equal(observed.totals[2], format.formatCurrency(150));
  assert.match(observed.header.extra.join(" "), /ultimo saldo cero/);
  assert.match(response.headers.get("content-disposition"), /_actual_/);
  assert.match(response.headers.get("cache-control"), /private, no-store/);
  assert.deepEqual(full, snapshot);
});
test("PDF completo: incluye todos los movimientos y permite descarga directa", async () => {
  const { observed, get } = route(); const response = await get("?history=completo&download=1");
  assert.equal(observed.rows.length, 5);
  assert.equal(observed.rows[1][1], "Remito de prueba 0");
  assert.equal(observed.totals[2], format.formatCurrency(150));
  assert.match(response.headers.get("content-disposition"), /^attachment;.*_completo_/);
  assert.ok(observed.header.extra.includes("Periodo: Completo"));
});
for (const query of ["?from=2026-10-21", "?to=2026-07-01", "?from=2026-07-01&to=2026-10-21&history=completo"]) {
  test(`PDF fechas: no recorta otra vez por saldo cero ${query}`, async () => {
    const { observed, get } = route(); const response = await get(query);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-disposition"), /_periodo_/);
    assert.equal(observed.rows.length, query.includes("&to=") ? 5 : 3);
    assert.doesNotMatch(observed.header.extra.join(" "), /ultimo saldo cero/);
    assert.equal(observed.queries.length, 1);
  });
}
test("PDF cuenta saldada: muestra cierre y cero, no reabre deuda histórica", async () => {
  const { observed, get } = route(fixture(true)); await get();
  assert.equal(observed.rows.length, 1);
  assert.equal(observed.totals[1], "Cuenta saldada");
  assert.equal(observed.totals[2], format.formatCurrency(0));
  assert.match(observed.notes.join(" "), /Cuenta al dia/);
});
test("PDF sin cierres: conserva todos los movimientos y saldo a favor", async () => {
  const full = fixture(); full.lines = [full.lines[0], { ...full.lines[1], credit: 120, balance: -20 }]; full.finalBalance = -20;
  const { observed, get } = route(full); await get();
  assert.equal(observed.rows.length, 3); assert.equal(observed.totals[1], "Saldo a favor");
  assert.equal(observed.totals[2], format.formatCurrency(-20));
});
test("PDF: requiere autenticación antes de consultar datos", async () => {
  const { observed, get } = route(fixture(), { unauthorized: true });
  assert.equal((await get()).status, 401); assert.equal(observed.queries.length, 0);
});
test("PDF real: genera resumen y completo con el renderizador de producción", async () => {
  for (const [name, query] of [["actual", ""], ["completo", "?history=completo&download=1"]]) {
    const response = await route(fixture(), { realPdf: true }).get(query);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200); assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    assert.ok(bytes.length > 2000);
    if (process.argv.includes("--write-fixtures")) {
      const dir = new URL("../.next/statement-pdf-fixtures/", import.meta.url);
      mkdirSync(dir, { recursive: true }); writeFileSync(new URL(`${name}.pdf`, dir), bytes);
    }
  }
});
