import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/customer-statement-presentation.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
Function("exports", compiled)(module.exports);
const { statementSinceLastZero } = module.exports;

function statement(deltas, dates = []) {
  let balance = 0;
  const lines = deltas.map((delta, index) => {
    balance = Math.round((balance + delta) * 100) / 100;
    return { id: String(index), date: dates[index] ?? "2026-10-21", description: delta > 0 ? "Remito #1" : "Cobro", debit: Math.max(0, delta), credit: Math.max(0, -delta), kind: "movimiento", balance };
  });
  return { openingBalance: 0, lines, finalBalance: balance };
}

test("último cero: conserva sólo el ciclo abierto y sus saldos originales", () => {
  const full = statement([100, -100, 200, -50]);
  const snapshot = structuredClone(full);
  const view = statementSinceLastZero(full);
  assert.equal(view.hiddenCount, 2);
  assert.deepEqual(view.statement.lines.map((line) => line.id), ["2", "3"]);
  assert.deepEqual(view.statement.lines.map((line) => line.balance), [200, 150]);
  assert.equal(view.statement.openingBalance, 0);
  assert.equal(view.statement.finalBalance, full.finalBalance);
  assert.deepEqual(full, snapshot);
});

test("varios cierres: elige el último, incluso con movimientos del mismo día", () => {
  const full = statement([100, -100, 200, -200, 30]);
  const view = statementSinceLastZero(full);
  assert.equal(view.hiddenCount, 4);
  assert.equal(view.lastZeroDate, "2026-10-21");
  assert.deepEqual(view.statement.lines.map((line) => line.id), ["4"]);
  assert.equal(view.statement.finalBalance, 30);
});

test("sin cierres: no oculta deuda antigua ni aplica un límite de 60 días", () => {
  const full = statement([100, -20, 30], ["2025-01-01", "2025-02-01", "2026-10-21"]);
  const view = statementSinceLastZero(full);
  assert.equal(view.statement, full);
  assert.equal(view.hiddenCount, 0);
  assert.equal(view.lastZeroDate, null);
});

test("cuenta saldada: sin filas abiertas, conserva historial íntegro y saldo cero", () => {
  const full = statement([100, -40, -60]);
  const view = statementSinceLastZero(full);
  assert.deepEqual(view.statement, { openingBalance: 0, lines: [], finalBalance: 0 });
  assert.equal(view.hiddenCount, 3);
  assert.equal(full.lines.length, 3);
});

test("saldo a favor y centavos no se confunden con una cuenta cerrada", () => {
  for (const delta of [-20, -0.01, 0.01]) {
    const full = statement([100, -100, delta]);
    const view = statementSinceLastZero(full);
    assert.equal(view.statement.lines.length, 1);
    assert.equal(view.statement.finalBalance, delta);
  }
});

test("cuenta sin movimientos y saldo inicial no cero permanecen intactos", () => {
  assert.deepEqual(statementSinceLastZero(statement([])).statement, statement([]));
  const full = { openingBalance: 50, lines: [], finalBalance: 50 };
  assert.equal(statementSinceLastZero(full).statement, full);
});

test("devolución que cierra y crédito posterior permanecen trazables", () => {
  const full = statement([100, -100, -15, 25]);
  full.lines[1].kind = "nota_credito";
  const view = statementSinceLastZero(full);
  assert.equal(view.statement.lines[0].credit, 15);
  assert.equal(view.statement.lines[0].balance, -15);
  assert.equal(view.statement.finalBalance, 10);
});

test("invariantes: el resumen compacto reconstruye exactamente el saldo final", () => {
  for (let n = 1; n <= 100; n++) {
    const full = statement([n * 0.13, -n * 0.13, n * 1.07, -n * 0.29]);
    const { statement: view } = statementSinceLastZero(full);
    const reconstructed = Math.round((view.openingBalance + view.lines.reduce((sum, line) => sum + line.debit - line.credit, 0)) * 100) / 100;
    assert.equal(reconstructed, full.finalBalance);
    assert.equal(view.finalBalance, full.finalBalance);
    assert.equal(full.lines.length, 4);
  }
});

test("página: fechas e historial completo omiten el recorte; saldo real no cambia", () => {
  const page = readFileSync(new URL("../src/app/payments/accounts/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /compactView = !filteredPeriod && !completeHistory/);
  assert.match(page, /statement = compactView \? currentPeriod.statement : periodResult.statement/);
  assert.match(page, /currentBalance = fullResult.statement.finalBalance/);
  assert.match(page, /history=completo/);
  assert.match(page, />Historial completo</);
  assert.match(page, />Último período</);
  assert.match(page, /PDF historial completo/);
  assert.doesNotMatch(source, /\b(?:INSERT|UPDATE|DELETE)\b|queryWithCompanyContext/);
});

for (const query of [{}, { history: "completo" }, { from: "2026-10-21" }, { to: "2026-10-21", history: "completo" }]) {
  test(`render del servidor: selecciona la vista correcta ${JSON.stringify(query)}`, async () => {
    const require = createRequire(import.meta.url);
    const full = statement([100, -100, 200, -50]);
    const period = { openingBalance: 100, lines: full.lines.slice(1), finalBalance: 150 };
    const calls = [];
    function Movements() {}
    function ButtonLink() {}
    function Placeholder() {}
    const aliases = {
      "next/link": Placeholder,
      "next/navigation": { notFound: () => assert.fail("Cliente válido") },
      "@/components/module-page": { ModulePage: Placeholder },
      "@/components/ui": { ButtonLink, cn: () => "" },
      "@/lib/api-response": { ApiError: class extends Error {} },
      "@/lib/auth": { requireStaffSession: async () => ({ companyId: 1 }) },
      "@/lib/page-auth": { requirePagePermission: async () => {} },
      "@/lib/route-auth": { COLLECTIONS_READ_PERMISSION: {} },
      "@/lib/customer-accounts": {
        getCustomerStatement: async (company, id, options) => {
          assert.equal(company, 1); calls.push(options);
          return { customer: { name: "Prueba" }, statement: options.from || options.to ? period : full, unappliedPayments: [] };
        },
        listCustomerOptions: async () => [],
        getCustomerPaymentContext: async () => ({ reconciliation: { pendingRemittances: 150, needsReview: false } }),
      },
      "@/lib/customer-statement-presentation": module.exports,
      "@/lib/format": { formatCurrency: String, formatDate: String },
      "@/lib/finance": { getTreasuryAccountOptions: async () => [] },
      "@/lib/timezone": { localDateIso: () => "2026-10-21" },
      "@/app/payments/actions": { registerCustomerPaymentAction: async () => assert.fail("No registrar dinero") },
      "@/app/payments/register-payment-dialog": { RegisterPaymentDialog: Placeholder },
      "./statement-movements": { StatementDateFilter: Placeholder, StatementMovements: Movements },
    };
    const pageSource = readFileSync(new URL("../src/app/payments/accounts/[id]/page.tsx", import.meta.url), "utf8");
    const js = ts.transpileModule(pageSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const pageModule = { exports: {} };
    Function("require", "module", "exports", js)((name) => aliases[name] ?? require(name), pageModule, pageModule.exports);
    const tree = await pageModule.exports.default({ params: Promise.resolve({ id: "3d96a8fa-7fb2-4024-bbc0-df4768b3abe3" }), searchParams: Promise.resolve(query) });
    const nodes = [];
    function walk(node) {
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (!node || typeof node !== "object") return;
      nodes.push(node); walk(node.props?.children);
    }
    walk(tree);
    const movements = nodes.find((node) => node.type === Movements).props;
    const dated = Boolean(query.from || query.to);
    const compact = !dated && query.history !== "completo";
    assert.equal(movements.compactView, compact);
    assert.deepEqual(movements.statement, compact ? statementSinceLastZero(full).statement : dated ? period : full);
    const links = nodes.filter((node) => node.type === ButtonLink);
    assert.equal(links.some((node) => node.props.children === "Historial completo"), query.history !== "completo" || dated);
    assert.equal(links.some((node) => node.props.children === "Último período"), !compact);
    const pdf = links.find((node) => node.props.children === "Exportar PDF");
    const pdfQuery = new URL(pdf.props.href, "https://starlim.test").searchParams;
    assert.equal(pdfQuery.get("history"), !dated && !compact ? "completo" : null);
    assert.equal(pdfQuery.get("from"), query.from ?? null);
    assert.equal(pdfQuery.get("to"), query.to ?? null);
    const fullDownload = links.find((node) => node.props.children === "PDF historial completo");
    assert.equal(Boolean(fullDownload), compact || dated);
    if (fullDownload) assert.ok(fullDownload.props.href.endsWith("?history=completo&download=1"));
    assert.equal(full.lines.length, 4);
    assert.equal(full.finalBalance, 150);
    assert.equal(calls.length, dated ? 2 : 1);
  });
}
