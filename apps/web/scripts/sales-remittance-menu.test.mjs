import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(path, aliases = {}) {
  const js = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const mod = { exports: {} };
  Function("require", "module", "exports", js)((name) => name in aliases ? aliases[name] : require(name), mod, mod.exports);
  return mod.exports;
}
const receipts = load("../src/lib/receipt-types.ts");
async function linksFor(overrides = {}) {
  const readCalls = [];
  const sale = { id: "sale-239", desiredDocument: "remito", fiscalStatus: "no_enviado", deliveryNumber: 660, saleNumber: "P-0239", associatedDocuments: [], ...overrides };
  const aliases = {
    "@/components/module-page": {}, "@/components/metric-icon": {}, "@/components/pagination-links": {}, "@/components/ui": {},
    "@/lib/format": { formatCurrency: String, formatDate: String },
    "@/lib/orders": { listOrders: async (input) => { readCalls.push(input); return { data: [sale], meta: {} }; } },
    "@/lib/sale-commercial-code": { formatSaleCommercialCode: () => "0239" },
    "@/lib/sales-admin": { getSalesSummary: async () => ({}) },
    "@/lib/month-range": { currentMonth: () => "2026-10" },
    "@/lib/auth": { requireStaffSession: async () => ({ companyId: 7 }) },
    "@/lib/page-auth": { requirePagePermission: async () => {} },
    "@/lib/route-auth": { sessionCanDeleteOperationalRecords: async () => false, sessionAllows: async () => false },
    "@/components/confirm-delete-button": {}, "@/app/sales/actions": {}, "@/lib/receipt-types": receipts,
  };
  const tree = await load("../src/app/sales/page.tsx", aliases).default({ searchParams: Promise.resolve({}) });
  const nodes = [];
  function walk(node) { if (!node || typeof node !== "object") return; nodes.push(node); for (const child of [node.props?.children].flat(Infinity)) walk(child); }
  walk(tree);
  assert.equal(readCalls[0].companyId, 7); assert.equal(readCalls[0].status, "entregado");
  assert.ok(!nodes.some((node) => node.type === "a" && /\/remito$/.test(node.props.href)), "Registro de ventas nunca ofrece remito sin precios");
  return nodes.filter((node) => node.type === "a").map((node) => node.props);
}
for (const desiredDocument of ["remito", "", null]) test(`non-fiscal sale ${desiredDocument}: only the priced remittance`, async () => {
  const links = await linksFor({ desiredDocument });
  const priced = links.find((link) => link.href === "/api/pdfs/orders/sale-239/remito?precios=si");
  assert.ok(priced); assert.equal(priced["aria-label"], "Remito con precios de la venta 0239");
  assert.ok(!links.some((link) => link.href.endsWith("/document")));
});
for (const desiredDocument of ["factura_a", "factura_b"]) test(`fiscal sale ${desiredDocument}: invoice only, no control remittance`, async () => {
  const links = await linksFor({ desiredDocument, fiscalStatus: "aprobado" });
  assert.ok(links.some((link) => link.href.endsWith("/document")));
  assert.ok(!links.some((link) => link.href.includes("precios=si")));
});
test("pending fiscal invoice remains in Fiscal; no unrelated pending-order policy changes", async () => {
  const links = await linksFor({ desiredDocument: "factura_a" });
  assert.ok(links.some((link) => link.href === "/billing"));
  assert.ok(!links.some((link) => link.href.includes("precios=si")));
});
test("existing approved invoice wins over legacy remito preference", async () => {
  assert.ok(!(await linksFor({ fiscalStatus: "aprobado" })).some((link) => link.href.includes("precios=si")));
});
test("no delivery document keeps the existing missing-remittance state", async () => {
  assert.ok(!(await linksFor({ deliveryNumber: null })).some((link) => link.href.includes("/remito")));
});
test("the price-free control copy remains available in Pedidos, not Registro de ventas", () => {
  const sales = readFileSync(new URL("../src/app/sales/page.tsx", import.meta.url), "utf8");
  const orders = readFileSync(new URL("../src/app/orders/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(sales, /Remito sin precios/);
  assert.match(orders, /Remito sin precios/);
  assert.match(orders, /href=\{`\/api\/pdfs\/orders\/\$\{order.id\}\/remito`\}/);
});
