import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const repoRoot = join(import.meta.dirname, "../../..");
const webRoot = join(repoRoot, "apps/web");

function read(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function filesUnder(dir, predicate = () => true) {
  const root = join(repoRoot, dir);
  const result = [];
  const stack = [root];

  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      const rel = relative(repoRoot, full).replaceAll("\\", "/");
      if (["node_modules", ".next", "tmp"].some((part) => rel.split("/").includes(part))) continue;
      if (statSync(full).isDirectory()) {
        stack.push(full);
      } else if (predicate(rel)) {
        result.push(rel);
      }
    }
  }

  return result.sort();
}

function assertNoPattern(paths, pattern, label) {
  const hits = [];
  for (const path of paths) {
    const content = read(path);
    if (pattern.test(content)) hits.push(path);
  }
  assert.deepEqual(hits, [], label);
}

test("removed API key integration is not referenced by active code or examples", () => {
  const paths = filesUnder(".", (path) =>
    path.endsWith(".ts") ||
    path.endsWith(".tsx") ||
    path.endsWith(".mjs") ||
    path.endsWith(".md") ||
    path.endsWith(".example"),
  ).filter((path) => !path.endsWith("static.test.mjs") && !path.endsWith("check-env.mjs"));

  assertNoPattern(
    paths,
    /STARLIM_API_KEY|STARLIM_WEBHOOK_URL|x-starlim-company-id|requireApiAccess|companyIdFromRequest/,
    "obsolete integration residue found",
  );
});

test("removed UI routes and warmup component stay removed", () => {
  assert.equal(existsSync(join(webRoot, "src/components/route-warmup.tsx")), false);
  assert.equal(existsSync(join(webRoot, "src/app/balance/income-statement/page.tsx")), false);

  const sourcePaths = filesUnder("apps/web/src", (path) => path.endsWith(".ts") || path.endsWith(".tsx"));
  assertNoPattern(sourcePaths, /RouteWarmup|route-warmup|income-statement|Estado de resultados/, "removed UI residue found");
});

test("product image upload residue is not present in active source", () => {
  const sourcePaths = filesUnder("apps/web/src", (path) => path.endsWith(".ts") || path.endsWith(".tsx"));
  assertNoPattern(
    sourcePaths,
    /folder:\s*"productos"|productos.*foto|foto.*producto|imagen.*producto|product.*image|product.*photo|image_url|photo_url/i,
    "product image residue found",
  );
});

test("legacy role permission shortcuts do not grant old sensitive access", () => {
  const routeAuth = read("apps/web/src/lib/route-auth.ts");
  assert.equal(/Jefe1|Empleado_1|Empleado_2/.test(routeAuth), false);
  assert.equal(/reportes\.exportar|compras\.aprobar|cobranzas\.aprobar/.test(routeAuth), false);
  assert.match(routeAuth, /JOIN app_permissions ap ON ap\.key = pp\.permission_key AND ap\.sensitive = FALSE/);
  assert.match(routeAuth, /JOIN app_permissions ap ON ap\.key = rp\.permission_key AND ap\.sensitive = FALSE/);
});

test("business data screens do not mask database loads with empty fallbacks", () => {
  const pagePaths = filesUnder("apps/web/src/app", (path) => path.endsWith("page.tsx"));
  assertNoPattern(
    pagePaths,
    /fastOr\(\s*(?:list|get(?!NavigationAuthorization))/,
    "business data page still uses an empty fallback",
  );

  const adminMetrics = read("apps/web/src/lib/admin-metrics.ts");
  assert.equal(/ADMIN_METRICS_FAST_TIMEOUT_MS|emptyAdminMetrics/.test(adminMetrics), false);
  assert.match(adminMetrics, /payments_summary/);
  assert.match(adminMetrics, /normalizedOrderStatusSql/);
});

test("cacheable reads retry transient database connection failures once", () => {
  const db = read("apps/web/src/lib/db.ts");
  assert.match(db, /READ_QUERY_RETRY_DELAY_MS/);
  assert.match(db, /function isTransientDbError/);
  assert.match(db, /if \(!cacheable \|\| !isTransientDbError\(error\)\) throw error/);
  assert.match(db, /queryPromise = executeQuery\(\)/);
  assert.match(db, /ROLLBACK"\)\.catch\(\(\) => undefined\)/);
});

test("orders page exposes collection registration only after delivery", () => {
  const ordersPage = read("apps/web/src/app/orders/page.tsx");
  assert.match(ordersPage, /registerOrderCollectionAction/);
  assert.match(ordersPage, /COLLECTIONS_CREATE_PERMISSION/);
  assert.match(ordersPage, /order\.orderStatus === "entregado"/);
  assert.match(ordersPage, /Registrar cobro/);
  assert.match(ordersPage, /name="amount"/);
  assert.match(ordersPage, /name="method"/);
  assert.match(ordersPage, /name="destination"/);
  assert.match(ordersPage, /name="operation"/);
  assert.match(ordersPage, /defaultCollectionAmount/);
  assert.match(ordersPage, /order\.outstandingAmount/);
  assert.match(ordersPage, /max=\{defaultCollectionAmount\.toFixed\(2\)\}/);
  assert.match(ordersPage, /se envia a aprobacion/);

  const ordersActions = read("apps/web/src/app/orders/actions.ts");
  assert.match(ordersActions, /registerOrderCollectionAction/);
  assert.match(ordersActions, /collectionRegistrationFromBody/);
  assert.match(ordersActions, /registerCollection/);
  assert.match(ordersActions, /revalidatePath\("\/collections"\)/);
  assert.match(ordersActions, /revalidatePath\("\/admin\/approvals"\)/);

  const routeAuth = read("apps/web/src/lib/route-auth.ts");
  assert.match(routeAuth, /COLLECTIONS_CREATE_PERMISSION/);
  assert.match(routeAuth, /resource: "cobranzas"[\s\S]*action: "crear"/);

  const collections = read("apps/web/src/lib/collections.ts");
  assert.match(collections, /El pedido debe estar entregado para registrar un cobro/);
  assert.match(collections, /El pedido debe estar entregado para resolver el cobro/);
  assert.match(collections, /normalizedOrderStatusSql\("v"\)\} = 'entregado'/);
});

test("orders lifecycle follows cargado-confirmado-entregado and opens collection only on delivery", () => {
  const orderStatus = read("apps/web/src/lib/order-status.ts");
  assert.match(orderStatus, /"cargado"/);
  assert.match(orderStatus, /"confirmado"/);
  assert.match(orderStatus, /"entregado"/);
  assert.match(orderStatus, /"cancelado"/);
  assert.match(orderStatus, /recibido[\s\S]*return "cargado"/);
  assert.match(orderStatus, /pendiente_entrega[\s\S]*return "confirmado"/);

  const orders = read("apps/web/src/lib/orders.ts");
  assert.match(orders, /'no_aplica', 'cargado'/);
  assert.match(orders, /export async function updateBasicOrder/);
  assert.match(orders, /Solo se pueden modificar pedidos cargados antes de confirmarlos/);
  assert.match(orders, /"pedido\.cargado"/);
  assert.match(orders, /"pedido\.modificado"/);
  assert.match(orders, /Solo los pedidos cargados pueden confirmarse/);
  assert.match(orders, /Solo los pedidos confirmados pueden marcarse como entregados/);
  assert.match(orders, /confirmationDocument/);
  assert.match(orders, /normalizeOrderConfirmationDocument/);
  assert.match(orders, /nextStatus === "entregado" \? "pendiente"/);
  assert.match(orders, /"pedido\.confirmado_stock"/);
  assert.match(orders, /stock_pendiente_impresion/);
  assert.match(orders, /cobro_habilitado/);

  const editPage = read("apps/web/src/app/orders/[id]/edit/page.tsx");
  assert.match(editPage, /OrderEntryFields/);
  assert.match(editPage, /initialValue/);
  assert.match(editPage, /order\.orderStatus !== "cargado"/);

  const editActions = read("apps/web/src/app/orders/[id]/edit/actions.ts");
  assert.match(editActions, /updateBasicOrder/);
  assert.match(editActions, /redirect\("\/orders\?status=cargado"\)/);

  const orderEntryFields = read("apps/web/src/app/orders/new/order-entry-fields.tsx");
  assert.match(orderEntryFields, /OrderEntryInitialValue/);
  assert.match(orderEntryFields, /initialValue\?\.lines/);

  const orderActions = read("apps/web/src/app/orders/new/actions.ts");
  assert.match(orderActions, /redirect\("\/orders\?status=cargado"\)/);

  const quotes = read("apps/web/src/lib/quotes.ts");
  assert.match(quotes, /collection_status, order_status, desired_document, notes,[\s\S]*stock_discounted, status, empresa_id/);
  assert.match(quotes, /'no_aplica', 'cargado'[\s\S]*false, 'cargado'/);

  const navigation = read("apps/web/src/lib/navigation.ts");
  assert.match(navigation, /ordersLoaded/);
  assert.match(navigation, /ordersConfirmed/);
  assert.match(navigation, /label: "Presupuestador"/);
  assert.match(navigation, /label: "Operaciones"[\s\S]*groups: \[groupByLabel\("Pedidos"\), groupByLabel\("Registro de ventas"\), groupByLabel\("Presupuestador"\)\]/);
  assert.match(navigation, /label: "Administrador"[\s\S]*href: "\/metrics", label: "Metricas"/);
  assert.match(navigation, /label: "Compras"[\s\S]*groups: \[groupByLabel\("Compras"\)\]/);
  assert.doesNotMatch(navigation, /label: "Ventas"/);
  assert.doesNotMatch(navigation, /label: "Facturacion"/);
  assert.doesNotMatch(navigation, /href: "\/database", label: "Resumen"/);
  assert.doesNotMatch(navigation, /href: "\/employees", label: "Empleados", active: "database"/);
  assert.doesNotMatch(navigation, /ordersReceived|ordersInProcess|ordersPendingDelivery/);

  const databasePage = read("apps/web/src/app/database/page.tsx");
  assert.doesNotMatch(databasePage, /EMPLOYEES_READ_PERMISSION|label: "Empleados"|href: "\/employees"|Empleados/);

  const ordersPage = read("apps/web/src/app/orders/page.tsx");
  assert.match(ordersPage, /Modificar/);
  assert.match(ordersPage, /Factura/);
  assert.match(ordersPage, /Remito sin factura/);
  assert.match(ordersPage, /name="confirmationDocument"/);

  const homePage = read("apps/web/src/app/page.tsx");
  assert.match(homePage, /listTasks/);
  assert.match(homePage, /Recordatorios y tareas/);
  assert.match(homePage, /Pendientes para vos/);
  assert.doesNotMatch(homePage, /getAdminMetrics|ShortcutList|Panel ERP|commercialShortcuts|financeShortcuts|dataShortcuts/);

  const receiptTypes = read("apps/web/src/lib/receipt-types.ts");
  assert.match(receiptTypes, /ORDER_CONFIRMATION_RECEIPT_OPTIONS/);
  assert.match(receiptTypes, /invoiceDocumentForFiscalCondition/);
});

test("collection approval enforces outstanding balance and refreshes related screens", () => {
  const collections = read("apps/web/src/lib/collections.ts");
  assert.match(collections, /function assertCollectionAmountWithinBalance/);
  assert.match(collections, /El cobro supera el saldo pendiente/);
  assert.match(collections, /saleOutstandingBalance/);
  assert.match(collections, /saldo_pendiente/);
  assert.match(collections, /Cobro parcial aprobado/);
  assert.match(collections, /outstandingAfterApproval/);

  const orders = read("apps/web/src/lib/orders.ts");
  assert.match(orders, /collectedAmount/);
  assert.match(orders, /outstandingAmount/);
  assert.match(orders, /current_account_movements cam/);
  assert.match(orders, /saldo_pendiente/);

  const collectionsPage = read("apps/web/src/app/collections/page.tsx");
  assert.match(collectionsPage, /Saldo actual/);
  assert.match(collectionsPage, /outstandingAfterApproval/);
  assert.match(collectionsPage, /tableProps=\{\{ className: "table-fixed" \}\}/);

  for (const path of [
    "apps/web/src/app/collections/actions.ts",
    "apps/web/src/app/admin/approvals/actions.ts",
  ]) {
    const source = read(path);
    assert.match(source, /revalidateCollectionFlow/);
    assert.match(source, /revalidatePath\("\/orders"\)/);
    assert.match(source, /revalidatePath\("\/treasury\/current-accounts"\)/);
    assert.match(source, /revalidatePath\("\/metrics"\)/);
  }
});

test("order creation exposes the full legacy receipt type set", () => {
  const receiptTypes = read("apps/web/src/lib/receipt-types.ts");
  for (const value of [
    "remito",
    "factura_a",
    "factura_b",
    "factura_c",
    "nota_debito_a",
    "nota_debito_b",
    "nota_debito_c",
    "nota_credito_a",
    "nota_credito_b",
    "nota_credito_c",
  ]) {
    assert.match(receiptTypes, new RegExp(`value: "${value}"`));
  }
  assert.match(receiptTypes, /ORDER_RECEIPT_OPTIONS\.map\(\(option\) => option\.value\)/);
  assert.match(receiptTypes, /export const ORDER_CREATION_RECEIPT_OPTIONS = ORDER_RECEIPT_OPTIONS\.filter/);

  const newOrderPage = read("apps/web/src/app/orders/new/page.tsx");
  assert.match(newOrderPage, /OrderEntryFields/);
  assert.equal(/<option value="factura">Factura<\/option>/.test(newOrderPage), false);
  assert.equal(/name="amount"/.test(newOrderPage), false);
  assert.equal(/name="desiredDocument"/.test(newOrderPage), false);

  const orders = read("apps/web/src/lib/orders.ts");
  assert.match(orders, /normalizeOrderCreationDocument/);
  assert.match(orders, /INSERT INTO sale_items/);

  const orderEntryFields = read("apps/web/src/app/orders/new/order-entry-fields.tsx");
  assert.match(orderEntryFields, /name="productsJson"/);
  assert.match(orderEntryFields, /name="priceListOverride"/);
  assert.match(orderEntryFields, /name="desiredDocumentOverride"/);
  assert.match(orderEntryFields, /ORDER_CREATION_RECEIPT_OPTIONS/);
  assert.match(orderEntryFields, /priceForList/);

  assert.match(orders, /priceListOverride/);
  assert.match(orders, /desiredDocumentOverride/);

  const quotesPage = read("apps/web/src/app/quotes/page.tsx");
  assert.match(quotesPage, /QuoteEntryFields/);
  assert.match(quotesPage, /acceptQuoteAndRemitAction/);
  assert.match(quotesPage, /quoteWhatsappHref/);
  assert.equal(/name="customerName"/.test(quotesPage), false);
  assert.equal(/name="unitPrice"/.test(quotesPage), false);

  const quoteEntryFields = read("apps/web/src/app/quotes/quote-entry-fields.tsx");
  assert.match(quoteEntryFields, /name="customerId"/);
  assert.match(quoteEntryFields, /name="productsJson"/);
  assert.match(quoteEntryFields, /priceForList/);
  assert.match(quoteEntryFields, /WhatsApp rapido/);
  assert.match(quoteEntryFields, /quickQuoteHref/);
  assert.match(quoteEntryFields, /<ButtonLink href=\{quickQuoteHref\}/);
  assert.match(quoteEntryFields, /Crear presupuesto formal/);
  assert.doesNotMatch(quoteEntryFields, /window\.open/);

  const quotes = read("apps/web/src/lib/quotes.ts");
  assert.match(quotes, /resolveQuoteProductsFromCatalog/);
  assert.match(quotes, /priceSqlExpression/);

  const billingPage = read("apps/web/src/app/billing/page.tsx");
  assert.match(billingPage, /<option value="c">Factura C<\/option>/);

  const salesAdmin = read("apps/web/src/lib/sales-admin.ts");
  assert.match(salesAdmin, /TYPE_CODES = new Set\(\[1, 2, 3, 6, 7, 8, 11, 12, 13\]\)/);
  assert.match(salesAdmin, /receipt_type IN \(3,8,13\)/);
  assert.match(salesAdmin, /receipt_type IN \(2,7,12\)/);
});

test("admin sales edits cannot bypass the order lifecycle", () => {
  const salesAdmin = read("apps/web/src/lib/sales-admin.ts");
  assert.match(salesAdmin, /function assertSaleOrderTransition/);
  assert.match(salesAdmin, /applySaleOrderStatusTransition/);
  assert.match(salesAdmin, /No se puede volver un pedido a cargado/);
  assert.match(salesAdmin, /Solo los pedidos cargados pueden confirmarse/);
  assert.match(salesAdmin, /Solo los pedidos confirmados pueden marcarse como entregados/);
  assert.match(salesAdmin, /collectionStatusForOrderStatus/);
  assert.match(salesAdmin, /orderIntegrationEventType/);
  assert.doesNotMatch(salesAdmin, /input\.target === "sale" && input\.field === "estado_pedido" && input\.value === "entregado"[\s\S]*UPDATE sales SET collection_status/);
});

test("sales reporting uses the canonical imported sales source", () => {
  const salesSourceSql = read("apps/web/src/lib/sales-source-sql.ts");
  assert.match(salesSourceSql, /ENTREGAS MACRO/);
  assert.match(salesSourceSql, /VENTAS ANUAL/);
  assert.match(salesSourceSql, /2026-06-01/);
  assert.match(salesSourceSql, /2026-07-01/);

  for (const path of [
    "apps/web/src/lib/admin-metrics.ts",
    "apps/web/src/lib/orders.ts",
    "apps/web/src/lib/sales-admin.ts",
    "apps/web/src/lib/vendors-management.ts",
    "apps/web/src/lib/collections.ts",
    "apps/web/src/lib/deliveries.ts",
    "apps/web/src/lib/sales-documents.ts",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /sale-total-sql|saleEffectiveTotalSql|saleItemsTotalLateralSql/);
  }

  for (const path of [
    "apps/web/src/lib/admin-metrics.ts",
    "apps/web/src/lib/orders.ts",
    "apps/web/src/lib/sales-admin.ts",
    "apps/web/src/lib/vendors-management.ts",
  ]) {
    assert.match(read(path), /canonicalSalesSourceSql/);
  }
});
