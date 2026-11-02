import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { ToolLoopAgent, stepCountIs, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import { summarizeCustomerOrders } from "../src/lib/supervisor-lab/customer-orders.ts";
import { prepareSupervisorStep, SUPERVISOR_MAX_STEPS } from "../src/lib/supervisor-lab/loop-policy.ts";

const order = (id, date, total, status = "entregado", createdDate = date) => ({ id, number: `P-${id}`, date, createdDate, status, total });
const universita = [
  order("1064", "2026-07-09", 18293.44), order("1127", "2026-08-03", 43639.98),
  order("0080", "2026-08-31", 50403.75), order("0162", "2026-09-25", 60137.19),
  order("0261", "2026-11-02", 43092.08, "cargado", "2026-10-30"),
];

test("Universita: conserva el pedido pendiente y octubre sin ventas comerciales", () => {
  const summary = summarizeCustomerOrders(universita, "2026-10");
  assert.equal(summary.frequency.averageDays, 26);
  assert.equal(summary.frequency.purchaseDays, 4);
  assert.equal(summary.latestOrder.number, "P-0261");
  assert.equal(summary.latestOrder.status, "cargado");
  assert.equal(summary.latestDeliveredOrder.number, "P-0162");
  assert.deepEqual(summary.byOrderDate, { count: 0, total: 0 });
  assert.deepEqual(summary.byCreationDate, { count: 1, total: 43092.08 });
  assert.equal(summary.spending.count, 4);
  assert.equal(summary.spending.averageOrderAmount, 43118.59);
});

test("no cambia el mes vacío por el último mes con actividad", () => {
  assert.deepEqual(summarizeCustomerOrders(universita, "2026-10").period, {
    month: "2026-10", start: "2026-10-01", endExclusive: "2026-11-01",
  });
});

test("Torre del Carmen: los dos pedidos de octubre se suman una sola vez", () => {
  const summary = summarizeCustomerOrders([
    order("0186", "2026-10-07", 61786.54, "entregado", "2026-10-01"),
    order("0259", "2026-10-29", 48552.24),
  ], "2026-10");
  assert.deepEqual(summary.byOrderDate, { count: 2, total: 110338.78 });
  assert.equal(summary.spending.averageOrderAmount, 55169.39);
  assert.equal(summary.latestOrder.number, "P-0259");
});

test("mes cerrado: límites, cancelados, centavos y dos pedidos en el mismo día", () => {
  const summary = summarizeCustomerOrders([
    order("1", "2026-09-30", 99), order("2", "2026-10-01", 0.1),
    order("3", "2026-10-01", 0.2), order("4", "2026-10-31", 8, "confirmado"),
    order("5", "2026-10-31", 100, "cancelado"), order("6", "2026-11-01", 20),
  ], "2026-10");
  assert.deepEqual(summary.byOrderDate, { count: 3, total: 8.3 });
  assert.deepEqual(summary.deliveredInPeriod, { count: 2, total: 0.3 });
  assert.equal(summary.frequency.purchaseDays, 3);
});

test("sin compras o con una sola fecha no inventa una frecuencia", () => {
  assert.equal(summarizeCustomerOrders([], "2026-10").frequency.averageDays, null);
  assert.equal(summarizeCustomerOrders([order("1", "2026-10-01", 10)], "2026-10").frequency.averageDays, null);
  assert.throws(() => summarizeCustomerOrders([], "2026-13"), /Mes inválido/);
});

// Exercise the production read model with a bounded database double, retaining
// its real SQL, scope builder, status normalization and amount expressions.
async function loadReadModel({ role = "admin", rows = [] } = {}) {
  const calls = [];
  const source = fs.readFileSync(new URL("../src/lib/supervisor-lab/read-model.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  const dependencies = {
    "@/lib/auth": { isStaffRole: () => role !== "cliente", normalizeRole: (value) => value },
    "@/lib/crm": { hasAllCustomerAccess: async () => false, sellerCandidates: () => ["VENDEDOR"] },
    "@/lib/db": { queryWithCompanyContext: async (...args) => { calls.push(args); return { rows }; } },
    "@/lib/order-status": await import("../src/lib/order-status.ts"),
    "@/lib/sales-source-sql": await import("../src/lib/sales-source-sql.ts"),
    "@/lib/month-range": await import("../src/lib/month-range.ts"),
    "@/lib/sales-vat": await import("../src/lib/sales-vat.ts"),
    "@/lib/accounts": {},
    "@/lib/supervisor-lab/customer-orders": { summarizeCustomerOrders },
  };
  new Function("require", "exports", compiled)((name) => {
    assert.ok(name in dependencies, name); return dependencies[name];
  }, exports);
  return { read: exports.getSupervisorCustomerOrderSummary, documents: exports.getSupervisorCustomerDocuments, calls, session: { role, companyId: 1 } };
}

test("últimos dos comprobantes: usa documentos emitidos, límite y filtros de empresa/vendedor", async () => {
  const { documents, calls, session } = await loadReadModel({ role: "vendedor", rows: [
    { kind: "factura", document_id: "s2", sale_id: "s2", issue_date: "2026-10-29", receipt_type: 1, point_of_sale: 2, number: "123", total: "48552.24" },
    { kind: "remito", document_id: "r1", sale_id: "s1", issue_date: "2026-10-07", number: "186", total: "61786.54" },
  ] });
  const result = await documents(session, "torre", 2);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((doc) => [doc.type, doc.number, doc.amount]), [
    ["Factura A", "0002-00000123", 48552.24], ["Remito", "00000186", 61786.54],
  ]);
  assert.equal(result[0].pdfHref, "/api/pdfs/fiscal/sales/s2");
  assert.equal(result[1].pdfHref, "/api/pdfs/deliveries/r1");
  const [, sql, params] = calls[0];
  assert.deepEqual(params, [1, "torre", 2, ["VENDEDOR"]]);
  assert.match(sql, /FROM delivery_documents r/);
  assert.match(sql, /s.fiscal_status = 'aprobado'/);
  assert.match(sql, /r.empresa_id = \$1/);
  assert.match(sql, /LIMIT \$3/);
  assert.match(sql, /ORDER BY issue_date DESC NULLS LAST/);
  assert.match(sql, /assigned_seller/);
});

test("no fabrica comprobantes cuando no hay emitidos y acota el límite", async () => {
  const { documents, calls, session } = await loadReadModel();
  assert.deepEqual(await documents(session, "torre", 200), []);
  assert.equal(calls[0][2][2], 10);
});

test("la consulta queda limitada a empresa y vendedor, sin filtrar pendientes ni multiplicar por ítems", async () => {
  const { read, calls, session } = await loadReadModel({ role: "vendedor" });
  assert.equal(await read(session, "customer-id", "2026-10"), null);
  const [, sql, params] = calls[0];
  assert.match(sql, /c.id = \$1::uuid AND c.empresa_id = \$2/);
  assert.match(sql, /s.empresa_id = c.empresa_id/);
  assert.match(sql, /assigned_seller/);
  assert.match(sql, /AT TIME ZONE 'America\/Argentina\/Buenos_Aires'/);
  assert.match(sql, /sales_internal_documents/);
  assert.doesNotMatch(sql, /JOIN sale_items|= 'entregado'/);
  assert.deepEqual(params, ["customer-id", 1, ["VENDEDOR"]]);
});

test("cliente sin permisos no ejecuta ninguna consulta", async () => {
  const { read, calls, session } = await loadReadModel({ role: "cliente" });
  await assert.rejects(read(session, "customer-id"), /SUPERVISOR_FORBIDDEN/);
  assert.equal(calls.length, 0);
});

test("cliente sin pedidos no se interpreta como cliente inexistente", async () => {
  const { read, session } = await loadReadModel({ rows: [{ customer_name: "TORRE DEL CARMEN", id: null }] });
  const summary = await read(session, "torre", "2026-10");
  assert.equal(summary.customerName, "TORRE DEL CARMEN");
  assert.deepEqual(summary.byOrderDate, { count: 0, total: 0 });
});

test("la herramienta resuelve Universita y luego Torre sin reutilizar el cliente anterior", async () => {
  const { selectUnambiguousCustomerMatch, summarizeCustomerProductPatterns } = await import("../src/lib/supervisor-lab/product-pattern.ts");
  const calls = [];
  const source = fs.readFileSync(new URL("../src/lib/supervisor-lab/tools.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  const customers = { universita: [{ customerId: "universita", customerName: "UNIVERSITA IT" }], torre: [{ customerId: "torre", customerName: "TORRE DEL CARMEN" }], ambiguo: [{ customerId: "1", customerName: "A" }, { customerId: "2", customerName: "B" }] };
  const dependencies = {
    "server-only": {}, "ai": { tool }, "zod": { z }, "@/lib/auth": {}, "@/lib/db": {},
    "@/lib/supervisor-lab/read-model": {
      searchSupervisorCustomers: async (_session, search) => customers[search] ?? [],
      getSupervisorCustomerOrderSummary: async (_session, id, period) => { calls.push({ id, period }); return { customerId: id, ...summarizeCustomerOrders(universita, period) }; },
      getSupervisorCustomerHistory: async () => ({ customerId: "universita", customerName: "UNIVERSITA IT", seller: "TEST", purchases: [
        { saleId: "1", date: "2026-08-31", items: [{ productId: "p1", name: "Producto de prueba", quantity: 2 }] },
        { saleId: "2", date: "2026-09-25", items: [{ productId: "p1", name: "Producto de prueba", quantity: 4 }] },
      ] }),
      getSupervisorCustomerDocuments: async (_session, id, limit) => [{ documentId: `${id}-doc`, type: "Remito", number: "00000001" }].slice(0, limit),
    },
    "@/lib/supervisor-lab/product-pattern": { selectUnambiguousCustomerMatch, summarizeCustomerProductPatterns },
    "@/lib/supervisor-lab/landing-summary": {}, "@/lib/supervisor-lab/system-guide": {},
    "@/lib/supervisor-lab/company-manual": {}, "@/lib/supervisor-lab/cleaning-knowledge": {},
  };
  new Function("require", "exports", compiled)((name) => { assert.ok(name in dependencies, name); return dependencies[name]; }, exports);
  const tools = exports.createSupervisorTools({ companyId: 1 });
  const summaryTool = tools.getCustomerOrderSummary;
  const run = (search) => summaryTool.execute({ search, period: "2026-10" }, {});
  assert.equal((await run("universita")).summary.customerId, "universita");
  assert.equal((await run("torre")).summary.customerId, "torre");
  assert.equal((await run("ambiguo")).summary, null);
  assert.equal((await run("inexistente")).summary, null);
  assert.deepEqual(calls, [{ id: "universita", period: "2026-10" }, { id: "torre", period: "2026-10" }]);
  const commercial = await tools.getCustomerCommercialBrief.execute({ search: "universita" }, {});
  assert.equal(commercial.brief.summary.spending.averageOrderAmount, 43118.59);
  assert.equal(commercial.brief.usualProducts[0].averageQuantity, 3);
  assert.equal(commercial.brief.productHistoryPurchaseCount, 2);
  assert.equal(commercial.brief.documents[0].documentId, "universita-doc");
  assert.equal((await tools.getCustomerCommercialBrief.execute({ search: "ambiguo" }, {})).brief, null);
  const documents = await tools.getCustomerDocuments.execute({ search: "torre", limit: 2 }, {});
  assert.equal(documents.customerName, "TORRE DEL CARMEN");
  assert.equal(documents.documents[0].documentId, "torre-doc");
});

test("el SDK puede buscar, consultar historial y redactar en una misma consulta", async () => {
  const usage = { inputTokens: { total: 1 }, outputTokens: { total: 1 } };
  const result = (content, reason) => ({ content, finishReason: { unified: reason, raw: reason }, usage, warnings: [] });
  const model = new MockLanguageModelV4({ doGenerate: [
    result([{ type: "tool-call", toolCallId: "s", toolName: "searchCustomers", input: '{"search":"UNIVERSITA IT"}' }], "tool-calls"),
    result([{ type: "tool-call", toolCallId: "h", toolName: "getCustomerHistory", input: '{"customerId":"universita"}' }], "tool-calls"),
    result([{ type: "text", text: "Compra cada 26 días." }], "stop"),
  ] });
  const agent = new ToolLoopAgent({ model, stopWhen: stepCountIs(SUPERVISOR_MAX_STEPS), prepareStep: prepareSupervisorStep, tools: {
    searchCustomers: tool({ inputSchema: z.object({ search: z.string() }), execute: async () => ({ customerId: "universita" }) }),
    getCustomerHistory: tool({ inputSchema: z.object({ customerId: z.string() }), execute: async () => ({ averageDays: 26 }) }),
  } });
  const response = await agent.generate({ prompt: "Cada cuánto compra Universita IT" });
  assert.equal(response.text, "Compra cada 26 días.");
  assert.equal(model.doGenerateCalls.length, 3);
  assert.notEqual(model.doGenerateCalls[1].toolChoice?.type, "none");
  assert.deepEqual(prepareSupervisorStep({ stepNumber: 4 }), { toolChoice: "none" });
});
