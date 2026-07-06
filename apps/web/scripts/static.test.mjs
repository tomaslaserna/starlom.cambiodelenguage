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

test("collection registration is off the orders register but still guarded", () => {
  const ordersPage = read("apps/web/src/app/orders/page.tsx");
  assert.doesNotMatch(ordersPage, /Registrar cobro|registerOrderCollectionAction|name="amount"/);

  const ordersActions = read("apps/web/src/app/orders/actions.ts");
  assert.doesNotMatch(ordersActions, /registerOrderCollectionAction|registerCollection/);

  const routeAuth = read("apps/web/src/lib/route-auth.ts");
  assert.match(routeAuth, /COLLECTIONS_CREATE_PERMISSION/);
  assert.match(routeAuth, /resource: "cobranzas"[\s\S]*action: "crear"/);

  const collections = read("apps/web/src/lib/collections.ts");
  assert.match(collections, /El pedido debe estar entregado para registrar un cobro/);
  assert.match(collections, /El pedido debe estar entregado para resolver el cobro/);
  assert.match(collections, /normalizedOrderStatusSql\("v"\)\} = 'entregado'/);
});

test("collections screen lists delivered sales to collect with due dates", () => {
  const collections = read("apps/web/src/lib/collections.ts");
  assert.match(collections, /export async function listSalesToCollect\(companyId: number\)/);
  assert.match(collections, /payment_term_days/);
  assert.match(collections, /IN \('pendiente','vencido','pendiente_aprobacion','en_proceso'\)/);
  assert.match(collections, /fecha_vencimiento/);
  assert.match(collections, /vencida/);

  const collectionsActions = read("apps/web/src/app/collections/actions.ts");
  assert.match(collectionsActions, /registerCollectionAction/);
  assert.match(collectionsActions, /COLLECTIONS_CREATE_PERMISSION/);
  assert.doesNotMatch(collectionsActions, /approveCollectionAction|rejectCollectionAction/);

  const approvalsPage = read("apps/web/src/app/admin/approvals/page.tsx");
  assert.match(approvalsPage, /approveApprovalAction/);

  const collectionsPage = read("apps/web/src/app/collections/page.tsx");
  assert.match(collectionsPage, /listSalesToCollect/);
  assert.match(collectionsPage, /registerCollectionAction/);
  assert.match(collectionsPage, /RegisterCollectionDialog/);
  assert.match(collectionsPage, /Emitir orden de cobro/);
  assert.match(collectionsPage, /Sin telefono/);
  assert.match(collectionsPage, /buildCollectionOrderMessage/);
  assert.match(collectionsPage, /normalizePhoneForWhatsapp/);
  assert.match(collectionsPage, /desiredDocumentLabel/);
  assert.match(collectionsPage, /Vencimiento/);
  assert.match(collectionsPage, /En aprobacion/);
  assert.match(collectionsPage, /Monto vencido/);
  assert.match(collectionsPage, /item\.hasFiscalPdf/);
  assert.match(collectionsPage, /\/api\/pdfs\/fiscal\/sales\/\$\{item\.id\}/);
  assert.match(collectionsPage, /\/api\/pdfs\/deliveries\/\$\{item\.deliveryDocumentId\}/);
  assert.match(collectionsPage, /\/api\/pdfs\/orders\/\$\{item\.id\}\/request/);
  assert.doesNotMatch(collectionsPage, /listPendingCollections|approveCollectionAction|rejectCollectionAction/);

  assert.match(collections, /tiene_pdf_fiscal/);
  assert.match(collections, /hasFiscalPdf/);
  assert.match(collections, /nota de debito%/);
  assert.match(collections, /delivery_documents/);
  assert.match(collections, /overdueDays/);
  assert.match(collections, /phone/);

  const collectionOrder = read("apps/web/src/lib/collection-order.ts");
  assert.match(collectionOrder, /export function buildCollectionOrderMessage/);
  assert.match(collectionOrder, /overdueDays/);
  assert.match(collectionOrder, /vencido hace/);
  assert.match(collectionOrder, /vencimiento/);

  const registerDialog = read("apps/web/src/app/collections/register-collection-dialog.tsx");
  assert.match(registerDialog, /"use client"/);
  assert.match(registerDialog, /Registrar pago/);
  assert.match(registerDialog, /fixed inset-0/);
  assert.match(registerDialog, /action=\{action\}/);
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
  assert.match(orders, /Solo se pueden modificar pedidos cargados o confirmados/);
  assert.match(orders, /order_status = 'cargado'/);
  assert.match(orders, /"pedido\.cargado"/);
  assert.match(orders, /"pedido\.modificado"/);
  assert.match(orders, /Solo los pedidos cargados pueden confirmarse/);
  assert.match(orders, /confirmsAsSale = nextStatus === "entregado" && currentStatus === "cargado"/);
  assert.match(orders, /confirmationDocument/);
  assert.match(orders, /normalizeOrderConfirmationDocument/);
  assert.match(orders, /nextStatus === "entregado" \? "pendiente"/);
  assert.match(orders, /"pedido\.confirmado_stock"/);
  assert.match(orders, /stock_pendiente_impresion/);
  assert.match(orders, /cobro_habilitado/);

  const editPage = read("apps/web/src/app/orders/[id]/edit/page.tsx");
  assert.match(editPage, /OrderEntryFields/);
  assert.match(editPage, /initialValue/);
  assert.match(editPage, /order\.orderStatus !== "cargado" && order\.orderStatus !== "confirmado"/);
  assert.match(editPage, /order\.orderStatus === "confirmado"/);

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
  assert.match(navigation, /href: "\/quotes",\s*label: "Presupuestos"/);
  assert.match(
    navigation,
    /label: "Comercial"[\s\S]*groupByLabel\("Pedidos"\)[\s\S]*groupByLabel\("Registro de ventas"\)[\s\S]*groupByLabel\("Presupuestos"\)[\s\S]*groupByLabel\("Facturacion"\)/,
  );
  assert.match(navigation, /href: "\/billing",\s*label: "Facturacion"/);
  assert.match(navigation, /href: "\/metrics", label: "Metricas"/);
  assert.match(navigation, /href: "\/rentabilidad", label: "Rentabilidad"/);
  assert.match(navigation, /href: "\/balance",\s*label: "Balance",\s*active: "balance"/);
  assert.match(navigation, /href: "\/balance\/salaries",\s*label: "Sueldos",\s*active: "balance-salaries"/);
  assert.match(navigation, /href: "\/balance\/dividends",\s*label: "Dividendos",\s*active: "balance-dividends"/);
  assert.match(read("apps/web/src/app/balance/page.tsx"), /active="balance"/);
  assert.match(read("apps/web/src/app/balance/salaries/page.tsx"), /active="balance-salaries"/);
  assert.match(read("apps/web/src/app/balance/dividends/page.tsx"), /active="balance-dividends"/);
  assert.doesNotMatch(navigation, /label: "Panel admin"/);
  assert.match(navigation, /label: "Compras"[\s\S]*groups: \[groupByLabel\("Compras"\)\]/);
  assert.match(navigation, /href: "\/purchases\?view=nueva", label: "Nueva compra"/);
  assert.match(navigation, /href: "\/purchases",\s*label: "Registro de compras"/);
  assert.doesNotMatch(navigation, /label: "Urgentes"|label: "Anticipadas"|label: "Solicitudes de compra"/);
  assert.match(navigation, /href: "\/sales",\s*label: "Registro de ventas",\s*active: "sales"/);
  assert.doesNotMatch(navigation, /label: "RR\.HH"[\s\S]*label: "Registro de movimientos"/);
  assert.doesNotMatch(navigation, /href: "\/database", label: "Resumen"/);
  assert.doesNotMatch(navigation, /href: "\/employees", label: "Empleados", active: "database"/);
  assert.doesNotMatch(navigation, /ordersReceived|ordersInProcess|ordersPendingDelivery/);

  const purchasesPage = read("apps/web/src/app/purchases/page.tsx");
  assert.match(purchasesPage, /PurchaseEntryFields products=\{products\}/);
  assert.match(purchasesPage, /purchaseViews[\s\S]*registro/);
  assert.match(purchasesPage, /redirect\("\/admin\/approvals"\)/);
  assert.match(purchasesPage, /<details className="rounded-\[8px\][\s\S]*Acciones[\s\S]*OC PDF[\s\S]*Devol\./);
  assert.doesNotMatch(purchasesPage, /label="Tipo"|label="Estado inicial"|Cantidad opcional|title: "Solicitudes de compra"|purchase\.description \|\| purchase\.type|xl:grid-cols-\[minmax\(260px,1fr\)_minmax\(120px,150px\)_minmax\(140px,180px\)\]/);

  const purchaseEntryFields = read("apps/web/src/app/purchases/purchase-entry-fields.tsx");
  assert.match(purchaseEntryFields, /name="productsJson"/);
  assert.match(purchaseEntryFields, /Agregar producto/);
  assert.match(purchaseEntryFields, /label="Cantidad"/);
  assert.match(purchaseEntryFields, /Quitar/);

  const purchaseActions = read("apps/web/src/app/purchases/actions.ts");
  assert.match(purchaseActions, /productsJson: formData\.get\("productsJson"\)/);
  assert.doesNotMatch(purchaseActions, /formData\.get\("productId"\)|formData\.get\("quantity"\)/);

  const purchases = read("apps/web/src/lib/purchases.ts");
  assert.match(purchases, /body\.productsJson/);
  assert.match(purchases, /Detalle de compra invalido/);

  const approvals = read("apps/web/src/lib/approvals.ts");
  assert.match(approvals, /ApprovalSource = "collection" \| "request" \| "purchase" \| "fiscal"/);
  assert.match(approvals, /listPendingPurchaseApprovals/);
  assert.match(approvals, /resolvePurchaseApproval/);

  const databasePage = read("apps/web/src/app/database/page.tsx");
  assert.doesNotMatch(databasePage, /EMPLOYEES_READ_PERMISSION|label: "Empleados"|href: "\/employees"|Empleados/);

  const ordersPage = read("apps/web/src/app/orders/page.tsx");
  assert.match(ordersPage, /Ver PDF solicitud/);
  assert.match(ordersPage, /Modificar/);
  assert.match(ordersPage, /value="entregado"/);
  assert.match(ordersPage, /value="cancelado"/);
  assert.doesNotMatch(ordersPage, /Factura|Remito sin factura|name="confirmationDocument"/);
  assert.doesNotMatch(ordersPage, /StatCard|getOrdersDashboard|Cargar pedido/);

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
  assert.match(collectionsPage, /outstandingAmount/);
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

test("current accounts use only active account movements and a business-correct balance sign", () => {
  const accounts = read("apps/web/src/lib/accounts.ts");
  assert.match(accounts, /activeAccountMovementWhereSql/);
  assert.match(accounts, /normalizedOrderStatusSql\(salesAlias\)/);
  assert.match(accounts, /= 'entregado'/);
  assert.match(accounts, /canonicalSalesSourceSql\(salesAlias\)/);
  assert.match(accounts, /accountBalanceExpressionSql/);
  assert.match(accounts, /proveedor' THEN \$\{alias\}\.credit - \$\{alias\}\.debit ELSE \$\{alias\}\.debit - \$\{alias\}\.credit/);
  assert.match(accounts, /balance: Number\(summary\.total_balance\)/);

  const accountPdf = read("apps/web/src/lib/pdf/documents.ts");
  assert.match(accountPdf, /accountBalanceExpressionSql/);
  assert.match(accountPdf, /activeAccountMovementWhereSql/);
  assert.match(accountPdf, /type === "proveedor" \? credit - debit : debit - credit/);
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
  assert.match(orderEntryFields, /priceLists/);
  assert.doesNotMatch(orderEntryFields, /PRECIO 1/);

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
  assert.match(quoteEntryFields, /priceLists/);
  assert.doesNotMatch(quoteEntryFields, /PRECIO 1/);
  assert.match(quoteEntryFields, /WhatsApp rapido/);
  assert.match(quoteEntryFields, /quickQuoteHref/);
  assert.match(quoteEntryFields, /<ButtonLink href=\{quickQuoteHref\}/);
  assert.match(quoteEntryFields, /Crear presupuesto formal/);
  assert.doesNotMatch(quoteEntryFields, /window\.open/);

  const quotes = read("apps/web/src/lib/quotes.ts");
  assert.match(quotes, /resolveQuoteProductsFromCatalog/);
  assert.match(quotes, /dynamicPriceSqlExpression/);
  assert.match(quotes, /price_list_name/);

  const catalogManagement = read("apps/web/src/lib/catalog-management.ts");
  assert.match(catalogManagement, /resolveCustomerPriceList/);
  assert.match(catalogManagement, /resolvePriceListName/);

  const imports = read("apps/web/src/lib/imports.ts");
  assert.match(imports, /resolvePriceListName\(value\(row, 10\), activePriceLists\)/);

  const billingPage = read("apps/web/src/app/billing/page.tsx");
  assert.match(billingPage, /<option value="c">Factura C<\/option>/);

  const salesAdmin = read("apps/web/src/lib/sales-admin.ts");
  assert.match(salesAdmin, /TYPE_CODES = new Set\(\[1, 2, 3, 6, 7, 8, 11, 12, 13\]\)/);
  assert.match(salesAdmin, /FROM sales_internal_documents sid/);
  assert.match(salesAdmin, /sid\.class_name = 'NC'/);
  assert.match(salesAdmin, /sid\.class_name = 'ND'/);
});

test("informal commercial documents keep final unit prices and do not split VAT", () => {
  const orderEntryFields = read("apps/web/src/app/orders/new/order-entry-fields.tsx");
  assert.doesNotMatch(orderEntryFields, /receiptAddsVat|name="includeVat"|>\s*IVA\s*<|>\s*Neto\s*</);
  assert.match(orderEntryFields, /Subtotal productos/);

  const quoteEntryFields = read("apps/web/src/app/quotes/quote-entry-fields.tsx");
  assert.doesNotMatch(quoteEntryFields, /receiptAddsVat|name="includeVat"|IVA:|Neto:|>\s*IVA\s*</);
  assert.match(quoteEntryFields, /Precios unitarios finales/);
  assert.match(quoteEntryFields, /Subtotal productos/);

  const quotesPage = read("apps/web/src/app/quotes/page.tsx");
  assert.doesNotMatch(quotesPage, /DataTableHead align="right">IVA|quote\.vatAmount/);
  assert.match(quotesPage, /DataTableHead align="right">Subtotal/);

  const orders = read("apps/web/src/lib/orders.ts");
  assert.doesNotMatch(orders, /receiptAddsVat|money\(netAmount \* 0\.21\)|money\(subtotal \* 0\.21\)/);
  assert.match(orders, /0::text AS monto_iva/);
  assert.match(orders, /confirmationTotalAmount = netAmount/);

  const quotes = read("apps/web/src/lib/quotes.ts");
  assert.doesNotMatch(quotes, /receiptAddsVat|optionalBooleanField|body\.includeVat|money\(subtotal \* 0\.21\)/);
  assert.match(quotes, /const total = subtotal/);

  const receiptTypes = read("apps/web/src/lib/receipt-types.ts");
  assert.doesNotMatch(receiptTypes, /receiptAddsVat/);

  const pdfDocuments = read("apps/web/src/lib/pdf/documents.ts");
  assert.doesNotMatch(pdfDocuments, /Subtotal neto|Base imponible|quote\.includeVat|quote\.vatAmount/);
  assert.match(pdfDocuments, /Documento no fiscal\. Precios unitarios finales/);
  assert.match(pdfDocuments, /\["IVA 21%"/);
});

test("pricing lists use the L0-L3 normalized names and L2 as default anchor", () => {
  const orderPricing = read("apps/web/src/lib/order-pricing.ts");
  assert.match(orderPricing, /DEFAULT_PRICE_LIST_NAME = "L2 - ANCLA"/);
  assert.match(orderPricing, /PRICE_LIST_DEFAULT: PriceListKey = "2"/);
  assert.match(orderPricing, /compact\.startsWith\("l0"\)[\s\S]*"L0 - agresivo"/);
  assert.match(orderPricing, /compact\.startsWith\("l1"\)[\s\S]*"L1 - suave"/);
  assert.match(orderPricing, /compact\.startsWith\("l2"\)[\s\S]*"L2 - ANCLA"/);
  assert.match(orderPricing, /compact\.startsWith\("l3"\)[\s\S]*"L3 - caro"/);
  assert.match(orderPricing, /compact\.includes\("mayorista"\)[\s\S]*"L1 - suave"/);
  assert.match(orderPricing, /explicit\[1\] === "4" \? "rev"/);

  const pricing = read("apps/web/src/lib/pricing.ts");
  assert.match(pricing, /precio_0: "L0 - agresivo"/);
  assert.match(pricing, /precio_1: "L1 - suave"/);
  assert.match(pricing, /precio_2: "L2 - ANCLA"/);
  assert.match(pricing, /precio_3: "L3 - caro"/);
  assert.match(pricing, /margen_minorista: "Minorista"/);
  assert.match(pricing, /value < 0\.01 \|\| value > 9\.99/);

  const pricingPage = read("apps/web/src/app/pricing/page.tsx");
  assert.match(pricingPage, /price-list\?list=2/);

  const productPricingSql = read("apps/web/src/lib/product-pricing-sql.ts");
  assert.doesNotMatch(productPricingSql, /NULLIF\(\$\{selectedMarginAlias\}\.multiplicador, 1\)/);
  assert.match(productPricingSql, /COALESCE\(\$\{selectedMarginAlias\}\.multiplicador, 0\)/);
  assert.doesNotMatch(productPricingSql, /precio_3, 1\) \* 1\.10/);
  assert.match(productPricingSql, /case "4":[\s\S]*m\.margen_minorista/);

  const quotes = read("apps/web/src/lib/quotes.ts");
  assert.match(quotes, /value === 2\) return "L2 - ANCLA"/);
  assert.match(quotes, /value === 5\) return "Minorista"/);

  const pdfDocuments = read("apps/web/src/lib/pdf/documents.ts");
  assert.match(pdfDocuments, /label: "L0 - agresivo"/);
  assert.match(pdfDocuments, /label: "L2 - ANCLA"/);
  assert.doesNotMatch(pdfDocuments, /Lista 4 \(\+10%\)/);
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
  assert.match(salesSourceSql, /2026-06-29/);
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

  const vendorsManagement = read("apps/web/src/lib/vendors-management.ts");
  assert.doesNotMatch(vendorsManagement, /LEFT JOIN clients c ON c\.id = s\.client_id/);
  assert.match(vendorsManagement, /BTRIM\(s\.seller_name\) AS vendor/);
});

test("Escritorio is listed first in the Inicio menu and links to the home page", () => {
  const navigation = read("apps/web/src/lib/navigation.ts");
  assert.match(navigation, /href: "\/",\s*label: "Escritorio",\s*active: "home",/);
  assert.match(
    navigation,
    /label: "Inicio"[\s\S]*groups: \[groupByLabel\("Escritorio"\), groupByLabel\("Calendario"\), groupByLabel\("Mensajes"\)\]/,
  );
});

test("Caja has its own route and does not open Tesoreria", () => {
  const navigation = read("apps/web/src/lib/navigation.ts");
  assert.match(navigation, /href: "\/cash",\s*label: "Caja",\s*active: "cash"/);
  assert.doesNotMatch(navigation, /href: "\/treasury",\s*label: "Caja"/);

  const cashPage = read("apps/web/src/app/cash/page.tsx");
  assert.match(cashPage, /title="Caja"/);
  assert.match(cashPage, /active="cash"/);
  assert.match(cashPage, /getTreasuryBalances/);
});

test("Escritorio previews up to 5 unread messages alongside pending tasks", () => {
  const home = read("apps/web/src/app/page.tsx");
  assert.match(home, /listMessageCenter/);
  assert.match(home, /unreadMessages/);
  assert.match(home, /\.filter\(\(message\) => !message\.read\)/);
  assert.match(home, /\.slice\(0, 5\)/);
  assert.match(home, /Mensajes sin leer/);
  assert.match(home, /href="\/messages"/);
});

test("shared button variants stay blue for a consistent action system", () => {
  const button = read("apps/web/src/components/ui/button.tsx");
  assert.match(button, /const primaryButtonClass =[\s\S]*bg-\[color:var\(--accent\)\]/);
  assert.match(button, /const secondaryButtonClass =[\s\S]*bg-\[#1d4ed8\]/);
  assert.match(button, /const outlineButtonClass =[\s\S]*bg-\[#dbeafe\]/);
  assert.match(button, /const ghostButtonClass =[\s\S]*bg-\[#eff6ff\]/);
  assert.match(button, /const dangerButtonClass =[\s\S]*bg-\[#073f94\]/);
  assert.match(button, /const buttonSizeClass = "erp-text-body-sm min-h-\[var\(--control-height-md\)\] px-4"/);
  assert.match(button, /primary: primaryButtonClass/);
  assert.match(button, /secondary: secondaryButtonClass/);
  assert.match(button, /ghost: ghostButtonClass/);
  assert.match(button, /outline: outlineButtonClass/);
  assert.match(button, /danger: dangerButtonClass/);
  assert.match(button, /sm: buttonSizeClass/);
  assert.match(button, /md: buttonSizeClass/);
  assert.match(button, /lg: buttonSizeClass/);
  assert.doesNotMatch(button, /bg-\[color:var\(--panel\)\]|bg-transparent|bg-\[color:var\(--danger\)\]/);
  assert.doesNotMatch(button, /control-height-sm|control-height-lg|erp-text-caption|erp-text-body"/);

  const sourcePaths = filesUnder("apps/web/src", (path) => path.endsWith(".tsx"));
  const whiteButtonHits = [];
  const whiteButtonPattern = /bg-white|bg-\[color:var\(--panel\)\]|bg-transparent|border border-\[color:var\(--border\)\]/;
  const sizeOverrideHits = [];
  const componentButtonPattern = /<Button(?:Link)?[\s\S]*?>/g;
  const forbiddenSizeOverridePattern = /className=(?:"[^"]*(?:min-h-|px-[235]|text-xs|text-sm|text-\[)|\{`[^`]*(?:min-h-|px-[235]|text-xs|text-sm|text-\[))/;

  for (const path of sourcePaths) {
    const source = read(path);
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!/<button|<Button|<ButtonLink/.test(line)) return;
      if (whiteButtonPattern.test(line)) whiteButtonHits.push(`${path}:${index + 1}`);
    });
    let match;
    while ((match = componentButtonPattern.exec(source))) {
      const tag = match[0].replace(/\s+/g, " ");
      if (forbiddenSizeOverridePattern.test(tag)) {
        const line = source.slice(0, match.index).split(/\r?\n/).length;
        sizeOverrideHits.push(`${path}:${line}`);
      }
    }
  }
  assert.deepEqual(whiteButtonHits, [], "white, panel, or transparent button styling found");
  assert.deepEqual(sizeOverrideHits, [], "button size override found");
});

test("billing uses real ARCA authorization state for invoices and fiscal notes", () => {
  assert.equal(existsSync(join(repoRoot, "migrations/035_sales_fiscal_authorization_state.sql")), true);
  assert.equal(existsSync(join(repoRoot, "migrations/036_sales_fiscal_receipt_identity.sql")), true);
  assert.equal(existsSync(join(repoRoot, "migrations/037_sales_internal_documents_fiscal_identity.sql")), true);

  const fiscal = read("apps/web/src/lib/fiscal.ts");
  assert.match(fiscal, /export async function authorizeSaleFiscalDocument/);
  assert.match(fiscal, /export async function authorizeSaleCreditNote/);
  assert.match(fiscal, /export async function authorizeSaleDebitNote/);
  assert.match(fiscal, /export async function getSaleCreditNotePreview/);
  assert.match(fiscal, /export async function getSaleDebitNotePreview/);
  assert.match(fiscal, /class ArcaFiscalProvider/);
  assert.doesNotMatch(fiscal, /PendingArcaFiscalProvider/);
  assert.match(fiscal, /associatedReceipt/);
  assert.match(fiscal, /findLastArcaAuthorizedReceipt/);
  assert.match(fiscal, /recoverSaleFiscalNoteApproval/);
  assert.match(fiscal, /No reemito para evitar duplicados/);
  assert.ok((fiscal.match(/fiscal_receipt_number = \$3::integer/g) ?? []).length >= 2);
  assert.ok((fiscal.match(/receipt_number = \$9::bigint/g) ?? []).length >= 2);
  assert.doesNotMatch(fiscal, /fiscal_receipt_number = \$3,\s*receipt_type = \$2,\s*receipt_number = \$3/);

  const arcaWsaa = read("apps/web/src/lib/arca/wsaa.ts");
  assert.match(arcaWsaa, /loginTicketRequest/);
  assert.match(arcaWsaa, /forge\.pkcs7\.createSignedData/);

  const arcaXml = read("apps/web/src/lib/arca/xml.ts");
  assert.match(arcaXml, /ERR_SSL_DH_KEY_TOO_SMALL/);
  assert.match(arcaXml, /legacyTlsPostSoapXml/);

  const arcaWsfe = read("apps/web/src/lib/arca/wsfe.ts");
  assert.match(arcaWsfe, /FECompUltimoAutorizado/);
  assert.match(arcaWsfe, /FECompConsultar/);
  assert.match(arcaWsfe, /FECAESolicitar/);
  assert.match(arcaWsfe, /CondicionIVAReceptorId/);
  assert.match(arcaWsfe, /CbtesAsoc/);
  assert.match(arcaWsfe, /export async function findLastArcaAuthorizedReceipt/);
  assert.match(arcaWsfe, /export async function consultArcaAuthorizedReceipt/);

  const billingPage = read("apps/web/src/app/billing/page.tsx");
  assert.match(billingPage, /Registro de facturas/);
  assert.doesNotMatch(billingPage, /getSalesSummary/);
  assert.doesNotMatch(billingPage, /getFiscalStatus/);
  assert.doesNotMatch(billingPage, /label="Comprobantes"|label="Monto total"|label="Facturado"|label="Sin factura"/);
  assert.doesNotMatch(billingPage, /Estado fiscal|Proveedor|Modo|Listo|ARCA configurado/);
  assert.match(billingPage, /\/billing\/credit-note\/\$\{item\.saleId\}/);
  assert.match(billingPage, /\/billing\/debit-note\/\$\{item\.saleId\}/);
  assert.match(billingPage, /<details className="rounded-\[8px\][\s\S]*Acciones[\s\S]*Factura PDF[\s\S]*Nota credito[\s\S]*Nota debito/);
  assert.match(billingPage, /\/api\/pdfs\/fiscal\/sales\/\$\{item\.saleId\}/);
  assert.match(billingPage, /\/api\/pdfs\/fiscal\/notes\/\$\{item\.creditNoteId\}/);
  assert.match(billingPage, /\/api\/pdfs\/fiscal\/notes\/\$\{item\.debitNoteId\}/);
  assert.match(billingPage, /hasFiscalIdentity/);
  assert.doesNotMatch(billingPage, /CAE \{item\.cae\}/);
  assert.doesNotMatch(billingPage, /CAE \{item\.creditNoteCae\}/);
  assert.doesNotMatch(billingPage, /CAE \{item\.debitNoteCae\}/);

  const navigation = read("apps/web/src/lib/navigation.ts");
  assert.match(navigation, /href: "\/billing",\s*label: "Facturacion"/);

  const billingActions = read("apps/web/src/app/billing/actions.ts");
  assert.match(billingActions, /issueCreditNoteAction/);
  assert.match(billingActions, /issueDebitNoteAction/);
  assert.match(billingActions, /Solo Administrador o Jefe/);

  const fiscalNotePage = read("apps/web/src/app/billing/fiscal-note-page.tsx");
  assert.match(fiscalNotePage, /Emitir NC en ARCA/);
  assert.match(fiscalNotePage, /Emitir ND en ARCA/);
  assert.match(fiscalNotePage, /No modifica ni borra el CAE/);

  const fiscalPdfSalesRoute = read("apps/web/src/app/api/pdfs/fiscal/sales/[id]/route.ts");
  assert.match(fiscalPdfSalesRoute, /buildFiscalSalePdf/);
  const fiscalPdfNotesRoute = read("apps/web/src/app/api/pdfs/fiscal/notes/[id]/route.ts");
  assert.match(fiscalPdfNotesRoute, /buildFiscalSalesNotePdf/);
  const pdfDocuments = read("apps/web/src/lib/pdf/documents.ts");
  assert.match(pdfDocuments, /export async function buildFiscalSalePdf/);
  assert.match(pdfDocuments, /export async function buildFiscalSalesNotePdf/);
  assert.match(pdfDocuments, /variant: "fiscal"/);
  assert.match(pdfDocuments, /fiscalCode: receipt\.afipCode/);
  assert.match(pdfDocuments, /pdf\.fiscalClientBox/);
  assert.match(pdfDocuments, /pdf\.fiscalItemsTable/);
  assert.match(pdfDocuments, /pdf\.fiscalSummary/);
  assert.match(pdfDocuments, /pdf\.fiscalAuthorizationBox/);
  assert.match(pdfDocuments, /QRCode\.toBuffer/);
  assert.match(pdfDocuments, /https:\/\/www\.arca\.gob\.ar\/fe\/qr\/\?p=/);
  assert.match(pdfDocuments, /tipoCodAut: "E"/);

  const pdfRenderer = read("apps/web/src/lib/pdf/renderer.ts");
  assert.match(pdfRenderer, /size: "LETTER"/);
  assert.match(pdfRenderer, /drawFiscalHeader/);
  assert.match(pdfRenderer, /ORIGINAL/);
  assert.match(pdfRenderer, /COD\. \$\{input\.fiscalCode/);
  assert.match(pdfRenderer, /fiscalClientBox/);
  assert.match(pdfRenderer, /fiscalItemsTable/);
  assert.match(pdfRenderer, /qrImage/);
  assert.doesNotMatch(pdfRenderer, /Starlim - documento operativo/);
});

test("order confirmation message supports optional prices and iva", () => {
  const oc = read("apps/web/src/lib/order-confirmation.ts");
  assert.match(oc, /export type IvaRate = 0 \| 21 \| 10\.5/);
  assert.match(oc, /export function ivaAmount/);
  assert.match(oc, /export type ConfirmationPricedLine/);
  assert.match(oc, /showPrices/);
  assert.match(oc, /pricedLines/);
  assert.match(oc, /ivaRate/);
});

test("cargar pedido exposes price message toggle with iva in the confirmation panel", () => {
  const fields = read("apps/web/src/app/orders/new/order-entry-fields.tsx");
  assert.match(fields, /pricedLines/);

  const preview = read("apps/web/src/app/orders/new/order-confirmation-preview.tsx");
  assert.match(preview, /Mostrar precios/);
  assert.match(preview, /showPrices/);
  assert.match(preview, /ivaRate/);
  assert.match(preview, /Sin IVA/);
  assert.match(preview, /value="10.5"/);
});

test("Registro de ventas shows only the delivered-sales listing, without duplicate navigation to other menu sections", () => {
  const salesPage = read("apps/web/src/app/sales/page.tsx");

  assert.doesNotMatch(salesPage, /href="\/orders\/new"/, "Cargar pedido link is redundant with the Pedidos menu group");
  assert.doesNotMatch(salesPage, /href="\/quotes"/, "Presupuestos link is redundant with the Presupuestos menu group");
  assert.doesNotMatch(salesPage, /href="\/orders"[^/]/, "generic /orders listing link is redundant with Registro de pedidos");
  assert.doesNotMatch(salesPage, /Cargar pedido|Crear pedido/);
  assert.doesNotMatch(salesPage, /Ver presupuestos/);

  assert.match(salesPage, /listOrders\(/, "sales page must render its own delivered-sales listing");
  assert.match(salesPage, /status:\s*"entregado"/, "listing must be filtered to delivered orders only");
});
