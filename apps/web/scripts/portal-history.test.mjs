import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(path, aliases = {}) {
  const js = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const mod = { exports: {} }; Function("require", "module", "exports", js)((name) => aliases[name] ?? require(name), mod, mod.exports); return mod.exports;
}
const presentation = load("../src/lib/customer-statement-presentation.ts");
const { portalHistoryScope, portalCurrentOrders, portalCurrentPayments } = load("../src/lib/portal-history.ts", { "./customer-statement-presentation": presentation });
const date = "2026-10-21";
const statement = { openingBalance: 0, finalBalance: 50, lines: [
  { id: "old", saleId: "old", date, description: "Remito #1", debit: 100, credit: 0, balance: 100 },
  { id: `payment:paid:${date}:credit`, saleId: "old", date, description: "Cobro", debit: 0, credit: 100, balance: 0 },
  { id: "new", saleId: "new", date, description: "Remito #2", debit: 70, credit: 0, balance: 70 },
  { id: `payment:partial:${date}:credit`, saleId: "new", date, description: "Cobro", debit: 0, credit: 20, balance: 50 },
] };
test("uses exact ledger position, keeping same-day new orders and payments without mutation", () => {
  const before = structuredClone(statement), scope = portalHistoryScope(statement);
  assert.equal(scope.lastZeroDate, date);
  assert.deepEqual(scope.closedSaleIds, ["old"]);
  assert.deepEqual(scope.currentSaleIds, ["new"]);
  const orders = [{ id: "old", date, status: "entregado" }, { id: "new", date, status: "entregado" }];
  assert.deepEqual(portalCurrentOrders(orders, scope).map((r) => r.id), ["new"]);
  const payments = [{ id: "allocation1", payment_id: "paid", date }, { id: "allocation2", payment_id: "paid", date }, { id: "allocation3", payment_id: "partial", date }];
  assert.deepEqual(portalCurrentPayments(payments, scope).map((r) => r.id), ["allocation3"]);
  assert.deepEqual(statement, before); assert.equal(orders.length, 2); assert.equal(payments.length, 3);
});
test("keeps pending orders regardless of age; hides closed legacy delivered orders", () => {
  const scope = portalHistoryScope(statement);
  const rows = [{ id: "pending", date: "2026-01-01", status: "pendiente" }, { id: "legacy", date: "2026-01-01", status: "entregado" }, { id: "ambiguous", date, status: "entregado" }];
  assert.deepEqual(portalCurrentOrders(rows, scope).map((r) => r.id), ["pending", "ambiguous"]);
});
test("no zero means full history, zero balance means no closed rows shown", () => {
  const noZero = portalHistoryScope({ ...statement, lines: [statement.lines[0]] });
  const orders = [{ id: "old", date, status: "entregado" }];
  assert.equal(portalCurrentOrders(orders, noZero), orders);
  const settled = portalHistoryScope({ ...statement, finalBalance: 0, lines: statement.lines.slice(0, 2) });
  assert.deepEqual(portalCurrentOrders(orders, settled), []);
  assert.deepEqual(portalCurrentPayments([{ id: "row", payment_id: "paid", date }], settled), []);
});
test("only debit/remittance sale IDs affect order cutoff, never linked payment sale IDs", () => {
  const scope = portalHistoryScope({ ...statement, lines: [{ ...statement.lines[1], saleId: "unrelated" }] });
  assert.deepEqual(scope.closedSaleIds, []);
});
test("negative credit and one cent are not a zero closure", () => {
  for (const balance of [-0.01, 0.01]) assert.equal(portalHistoryScope({ ...statement, lines: [{ ...statement.lines[0], balance }] }).lastZeroDate, null);
});
test("payment cutoff uses the ledger payment identity even with a nonstandard description", () => {
  const scope = portalHistoryScope({ ...statement, lines: statement.lines.slice(0, 2).map((line) => ({ ...line, description: "Conciliación administrativa" })) });
  assert.deepEqual(portalCurrentPayments([{ id: "allocation", payment_id: "paid", date }], scope), []);
});
test("history controls default current and toggle independently without mutations", () => {
  const state = [false];
  const { PortalHistorySection } = load("../src/app/portal/portal-history-section.tsx", { react: { useState: () => [state[0], (fn) => state[0] = fn(state[0])] }, "@/lib/format": { formatDate: (d) => d } });
  const scope = portalHistoryScope(statement);
  const walk = (node, result = []) => { if (!node || typeof node !== "object") return result; result.push(node); for (const child of [node.props?.children].flat(Infinity)) walk(child, result); return result; };
  const render = () => PortalHistorySection({ id: "pedidos", scope, children: (complete) => complete ? "all rows" : "current rows" });
  let nodes = walk(render());
  let button = nodes.find((n) => n.type === "button"); assert.equal(button.props.children, "Ver todo el historial"); assert.equal(button.props["aria-expanded"], false);
  button.props.onClick(); nodes = walk(render()); button = nodes.find((n) => n.type === "button"); assert.equal(button.props.children, "Último período"); assert.equal(button.props["aria-expanded"], true);
  button.props.onClick(); assert.equal(state[0], false);
});
test("complete source histories are not silently limited and checkout uses unfiltered sales", () => {
  const source = readFileSync(new URL("../src/app/api/portal/summary/route.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../src/app/portal/portal-app.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /sales\.rows\.reverse\(\)\.slice/);
  const paymentQuery = source.split("payment_id::text")[1].split("queryWithCompanyContext")[0];
  assert.doesNotMatch(paymentQuery, /LIMIT/);
  assert.match(ui, /const payableSales = sales\.filter/);
  assert.match(ui, /complete \? sales : currentOrders/); assert.match(ui, /complete \? payments : currentPayments/);
  assert.match(ui, /historyResult\?\.key === historyKey/);
  assert.match(ui, /key=\{`orders:\$\{historyKey\}`\}/);
});
