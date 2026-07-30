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

test("jefe is a full-access role while legacy employee shortcuts stay removed", () => {
  const routeAuth = read("apps/web/src/lib/route-auth.ts");
  assert.equal(/Jefe1|Empleado_1|Empleado_2/.test(routeAuth), false);
  assert.match(routeAuth, /export function isFullAccessRole\(role: string\)/);
  assert.match(routeAuth, /normalized === "administrador" \|\| normalized === "jefe"/);
  assert.match(routeAuth, /if \(isFullAccessRole\(role\)\) return true/);
  assert.match(routeAuth, /if \(!isFullAccessRole\(session\.role\)\) throw new ApiError\(403, "Solo Administrador o Jefe"\)/);
  assert.match(routeAuth, /JOIN app_permissions ap ON ap\.key = pp\.permission_key AND ap\.sensitive = FALSE/);
  assert.match(routeAuth, /JOIN app_permissions ap ON ap\.key = rp\.permission_key AND ap\.sensitive = FALSE/);
});

test("jefe can edit employee profiles and see all profile permissions", () => {
  const employeesLib = read("apps/web/src/lib/employees.ts");
  assert.match(employeesLib, /if \(role === "jefe"\) return APP_ROLES\.filter\(\(assignableRole\) => assignableRole !== "administrador"\)/);
  assert.match(employeesLib, /if \(role === "administrador" \|\| role === "jefe"\) return result\.rows\.map\(\(row\) => row\.key\)/);
  assert.match(employeesLib, /function activeFromBody\(body: RequestBody\)/);
  assert.match(employeesLib, /export async function deleteEmployeeAccess/);
  assert.match(employeesLib, /DELETE FROM profile_permissions WHERE profile_id = \$1::uuid AND empresa_id = \$2/);
  assert.match(employeesLib, /DELETE FROM usuario_empresa WHERE id_usuario = \$1::uuid AND empresa_id = \$2/);

  const employeesActions = read("apps/web/src/app/employees/actions.ts");
  assert.match(employeesActions, /export async function updateEmployeeAction/);
  assert.match(employeesActions, /export async function toggleEmployeeStatusAction/);
  assert.match(employeesActions, /export async function deleteEmployeeAction/);
  assert.match(employeesActions, /formData\.get\("confirmDelete"\) !== "yes"/);
  assert.match(employeesActions, /resource: "empleados", action: "editar"/);

  const employeesPage = read("apps/web/src/app/employees/page.tsx");
  assert.match(employeesPage, /function canEditEmployee\(actorRole: string, targetRole: string\)/);
  assert.match(employeesPage, /currentRole === "administrador" \|\| currentRole === "jefe"/);
  assert.match(employeesPage, /defaultChecked=\{employee\.permissionIds\.includes\(permission\.key\)\}/);
  assert.match(employeesPage, /Modificar/);
  assert.match(employeesPage, /Accesos y permisos/);
  assert.match(employeesPage, /Borrar acceso/);
  assert.match(employeesPage, /name="confirmDelete"/);
  assert.doesNotMatch(employeesPage, /DataTableCell colSpan=\{9\}/);
  assert.doesNotMatch(employeesPage, /Los permisos sensibles no se muestran para jefes/);

  const employeeApi = read("apps/web/src/app/api/employees/[id]/route.ts");
  assert.match(employeeApi, /export async function DELETE/);
  assert.match(employeeApi, /deleteEmployeeAccess\(session, id\)/);
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
  assert.match(collections, /ORDER BY v\.sale_date DESC NULLS LAST, v\.created_at DESC, v\.id DESC/);

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

test("quote creation uses an action-state form compatible with server-action results", () => {
  const quotesPage = read("apps/web/src/app/quotes/page.tsx");
  const quoteEntryForm = read("apps/web/src/app/quotes/quote-entry-form.tsx");

  assert.match(quotesPage, /<QuoteEntryForm action=\{createQuoteAction\}/);
  assert.doesNotMatch(quotesPage, /<form action=\{createQuoteAction\}/);
  assert.match(quoteEntryForm, /useActionState\(action, initialCreateQuoteState\)/);
  assert.match(quoteEntryForm, /previousState: CreateQuoteState, formData: FormData/);
});

test("table action menu is available through the shared UI entry point", () => {
  const uiIndex = read("apps/web/src/components/ui/index.ts");
  const saleRowActions = read("apps/web/src/app/sales/sale-row-actions.tsx");

  assert.match(uiIndex, /export \{ TableActionMenu, tableActionItemClass \} from "\.\/table-action-menu"/);
  assert.match(saleRowActions, /TableActionMenu, tableActionItemClass/);
});

test("orders lifecycle delivers loaded orders directly and opens collection only on delivery", () => {
  const orderStatus = read("apps/web/src/lib/order-status.ts");
  assert.match(orderStatus, /"cargado"/);
  assert.match(orderStatus, /"confirmado"/);
  assert.match(orderStatus, /"entregado"/);
  assert.match(orderStatus, /"cancelado"/);
  assert.match(orderStatus, /recibido[\s\S]*return "cargado"/);
  assert.match(orderStatus, /pendiente_entrega[\s\S]*return "confirmado"/);
  assert.match(orderStatus, /export function orderStatusTransitionError/);
  assert.match(orderStatus, /currentStatus !== "cargado" && currentStatus !== "confirmado"/);

  const orders = read("apps/web/src/lib/orders.ts");
  assert.match(orders, /'no_aplica', 'cargado'/);
  assert.match(orders, /export async function updateBasicOrder/);
  assert.match(orders, /Solo se pueden modificar pedidos cargados o confirmados/);
  assert.match(orders, /order_status = 'cargado'/);
  assert.match(orders, /"pedido\.cargado"/);
  assert.match(orders, /"pedido\.modificado"/);
  assert.match(orders, /orderStatusTransitionError/);
  assert.match(orders, /assertSaleStockAvailableForConfirmation/);
  assert.match(orders, /const confirmsAsSale = nextStatus === "entregado" && currentStatus === "cargado"/);
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
  assert.match(editPage, /OrderEntryForm/);
  assert.match(editPage, /excludeReservedSaleId: id/);
  assert.match(editPage, /offersEnabled=\{breakEven\.reached\}/);
  assert.match(editPage, /submitLabel="Guardar cambios"/);

  const editActions = read("apps/web/src/app/orders/[id]/edit/actions.ts");
  assert.match(editActions, /updateBasicOrder/);
  assert.match(editActions, /redirect\("\/orders\?status=cargado"\)/);
  assert.match(editActions, /error instanceof ApiError/);
  assert.match(editActions, /return \{ error: error\.message\.slice\(0, 500\) \}/);

  const orderEntryFields = read("apps/web/src/app/orders/new/order-entry-fields.tsx");
  assert.match(orderEntryFields, /OrderEntryInitialValue/);
  assert.match(orderEntryFields, /initialValue\?\.lines/);
  assert.match(orderEntryFields, /addDraftLineOnEnter/);
  assert.match(orderEntryFields, /event\.preventDefault\(\)/);
  assert.match(orderEntryFields, /disabled=\{!canSubmit\}/);
  assert.match(orderEntryFields, /Enter en cantidad o descuento agrega el producto/);

  const orderActions = read("apps/web/src/app/orders/new/actions.ts");
  assert.match(orderActions, /redirect\("\/orders\?status=cargado"\)/);
  assert.match(orderActions, /ORDERS_CREATE_PERMISSION/);
  assert.match(orderActions, /error instanceof ApiError/);
  assert.match(orderActions, /return \{ error: error\.message\.slice\(0, 500\) \}/);
  assert.doesNotMatch(orderActions, /resource: "ventas", action: "crear"/);

  const orderStatusActions = read("apps/web/src/app/orders/actions.ts");
  assert.match(orderStatusActions, /error instanceof ApiError/);
  assert.match(orderStatusActions, /\/orders\?error=1&message=/);
  assert.match(orderStatusActions, /deleteOrderAction[\s\S]*error instanceof ApiError/);
  assert.match(orderStatusActions, /revalidateOrderFlow/);

  const newOrderPage = read("apps/web/src/app/orders/new/page.tsx");
  assert.match(newOrderPage, /active="orders"/);
  assert.match(newOrderPage, /OrderEntryForm/);
  assert.match(newOrderPage, /submitLabel="Crear pedido"/);
  assert.match(newOrderPage, /Luego se entrega o cancela desde el registro/);
  assert.doesNotMatch(newOrderPage, /Despues se confirma para stock/);
  assert.doesNotMatch(newOrderPage, /active="sales"/);

  const orderStatusPage = read("apps/web/src/app/orders/page.tsx");
  assert.match(orderStatusPage, /sessionAllows/);
  assert.match(orderStatusPage, /const \[result, canEditOrders\] = await Promise\.all/);
  assert.match(orderStatusPage, /isOpenOrder && canEditOrders/);
  assert.match(orderStatusPage, /params\.error/);
  assert.match(orderStatusPage, /No se pudo actualizar el estado del pedido/);
  assert.match(orderStatusPage, /Revisar stock/);
  assert.match(orderStatusPage, /value="entregado"[\s\S]*Entregado/);
  assert.match(orderStatusPage, />\s*Cancelar\s*</);
  assert.match(orderStatusPage, />\s*Modificar\s*</);
  assert.match(orderStatusPage, />\s*Ver PDF\s*</);
  assert.doesNotMatch(orderStatusPage, /value="confirmado"|Confirmar stock|ConfirmDeleteButton|Borrar pedido/);
  assert.match(orderStatusPage, /key=\{`orders-status-\$\{result\.meta\.status \|\| "all"\}`\}/);

  const stock = read("apps/web/src/lib/stock.ts");
  assert.match(stock, /export async function assertSaleStockAvailableForConfirmation/);
  assert.match(stock, /export async function discountSaleStockOnDelivery/);
  assert.match(stock, /la entrega no se frena por saldo/);
  assert.match(stock, /reserved_stock/);
  assert.match(stock, /s\.id <> \$3::uuid/);

  const quotes = read("apps/web/src/lib/quotes.ts");
  assert.match(quotes, /collection_status, order_status, desired_document, notes,[\s\S]*stock_discounted, status, empresa_id/);
  assert.match(quotes, /'no_aplica', 'cargado'[\s\S]*false, 'cargado'/);

  const navigation = read("apps/web/src/lib/navigation.ts");
  assert.match(navigation, /ordersLoaded/);
  assert.match(navigation, /ordersConfirmed/);
  assert.match(navigation, /href: "\/quotes",\s*label: "Presupuestos"/);
  assert.match(
    navigation,
    /label: "Operaciones"[\s\S]*groupByLabel\("Pedidos"\)[\s\S]*groupByLabel\("Registro de ventas"\)[\s\S]*groupByLabel\("Presupuestos"\)[\s\S]*groupByLabel\("Fiscal"\)/,
  );
  assert.match(navigation, /href: "\/billing",\s*label: "Fiscal"/);
  assert.match(navigation, /href: "\/metrics", label: "Metricas"/);
  assert.match(navigation, /href: "\/rentabilidad", label: "Rentabilidad"/);
  assert.match(navigation, /href: "\/balance",\s*label: "Balance",\s*active: "balance"/);
  assert.match(
    navigation,
    /href: "\/balance\/remunerations",\s*label: "Sueldos y dividendos",\s*active: "balance-remunerations"/,
  );
  assert.match(read("apps/web/src/app/balance/page.tsx"), /active="balance"/);
  assert.match(read("apps/web/src/app/balance/remunerations/page.tsx"), /active="balance-remunerations"/);
  assert.match(read("apps/web/src/app/balance/salaries/page.tsx"), /redirect\("\/balance\/remunerations"\)/);
  assert.match(read("apps/web/src/app/balance/dividends/page.tsx"), /redirect\("\/balance\/remunerations"\)/);
  assert.doesNotMatch(navigation, /label: "Panel admin"/);
  assert.match(navigation, /label: "Compras"[\s\S]*groups: \[groupByLabel\("Compras"\)\]/);
  assert.match(navigation, /href: "\/purchases\?view=nueva", label: "Nueva compra"/);
  assert.match(navigation, /href: "\/purchases\/replenishment",\s*label: "Recompra MRP"/);
  assert.match(navigation, /href: "\/purchases",\s*label: "Registro de compras"/);
  assert.doesNotMatch(navigation, /label: "Urgentes"|label: "Anticipadas"|label: "Solicitudes de compra"/);
  assert.match(navigation, /href: "\/sales",\s*label: "Registro de ventas",\s*active: "sales"/);
  assert.doesNotMatch(navigation, /label: "RR\.HH"[\s\S]*label: "Registro de movimientos"/);
  assert.doesNotMatch(navigation, /href: "\/database", label: "Resumen"/);
  assert.doesNotMatch(navigation, /href: "\/employees", label: "Empleados", active: "database"/);
  assert.doesNotMatch(navigation, /ordersReceived|ordersInProcess|ordersPendingDelivery/);

  const purchasesPage = read("apps/web/src/app/purchases/page.tsx");
  assert.match(purchasesPage, /const today = localDateIso\(\)/);
  assert.match(purchasesPage, /PurchaseEntryFields defaultDate=\{today\}/);
  assert.match(purchasesPage, /showRegistry \? listPurchases\(session\.companyId\) : Promise\.resolve\(\[\]\)/);
  assert.doesNotMatch(purchasesPage, /showCreateForm \? listPurchaseFormProducts/);
  assert.match(read("apps/web/src/app/purchases/purchase-entry-fields.tsx"), /api\/purchases\/form-products\?supplierId=/);
  assert.match(read("apps/web/src/app/purchases/purchase-entry-fields.tsx"), /api\/purchases\/form-suppliers/);
  assert.match(read("apps/web/src/app/api/purchases/form-products/route.ts"), /requireApiSession\(\[\{ resource: "compras", action: "ver" \}\]\)/);
  assert.match(read("apps/web/src/app/api/purchases/form-suppliers/route.ts"), /requireApiSession\(\[\{ resource: "compras", action: "ver" \}\]\)/);
  assert.match(purchasesPage, /purchaseViews[\s\S]*registro/);
  assert.match(purchasesPage, /redirect\("\/admin\/approvals"\)/);
  assert.match(purchasesPage, /purchaseActionItemClass/);
  assert.match(purchasesPage, /<details className="erp-action-menu"[\s\S]*Acciones[\s\S]*Orden de compra PDF[\s\S]*Solicitud de devolucion/);
  assert.match(purchasesPage, /purchase\.id\.slice\(0, 8\)\.toUpperCase\(\)/);
  assert.match(purchasesPage, /href=\{purchase\.receiptPhoto\}/);
  assert.match(purchasesPage, /xl:grid-cols-12 xl:items-end/);
  assert.match(purchasesPage, /xl:col-span-2/);
  assert.match(purchasesPage, /PurchaseReceiptUpload purchaseId=\{purchase\.id\}/);
  assert.match(purchasesPage, /Acreditar compra/);
  assert.match(purchasesPage, /canDeleteRecords[\s\S]*deletePurchaseAction/);
  assert.doesNotMatch(purchasesPage, /Marcar revisado|type="file"/);
  assert.doesNotMatch(purchasesPage, /label="Tipo"|label="Estado inicial"|Cantidad opcional|title: "Solicitudes de compra"|purchase\.description \|\| purchase\.type|xl:grid-cols-\[minmax\(260px,1fr\)_minmax\(120px,150px\)_minmax\(140px,180px\)\]/);

  const purchaseReceiptUpload = read("apps/web/src/app/purchases/purchase-receipt-upload.tsx");
  assert.match(purchaseReceiptUpload, /event\.currentTarget\.form\?\.requestSubmit\(\)/);
  assert.match(purchaseReceiptUpload, /Subir recibo/);

  const purchaseEntryFields = read("apps/web/src/app/purchases/purchase-entry-fields.tsx");
  assert.match(purchaseEntryFields, /name="productsJson"/);
  assert.match(purchaseEntryFields, /name="supplierId"/);
  assert.match(purchaseEntryFields, /supplierId \? products\.filter\(\(product\) => product\.supplierId === supplierId\) : \[\]/);
  assert.match(purchaseEntryFields, /setLines\(\[\]\)/);
  assert.match(purchaseEntryFields, /xl:grid-cols-12/);
  assert.match(purchaseEntryFields, /xl:col-span-10/);
  assert.match(purchaseEntryFields, /xl:col-span-8/);
  assert.match(purchaseEntryFields, /className="w-full min-w-0"/);
  assert.match(purchaseEntryFields, /Este proveedor no tiene productos asociados/);
  assert.match(purchaseEntryFields, /Agregar producto/);
  assert.match(purchaseEntryFields, /label="Cantidad"/);
  assert.match(purchaseEntryFields, /Quitar/);

  const purchaseActions = read("apps/web/src/app/purchases/actions.ts");
  assert.match(purchaseActions, /productsJson: formData\.get\("productsJson"\)/);
  assert.doesNotMatch(purchaseActions, /formData\.get\("productId"\)|formData\.get\("quantity"\)/);

  const purchases = read("apps/web/src/lib/purchases.ts");
  assert.match(purchases, /body\.productsJson/);
  assert.match(purchases, /Detalle de compra invalido/);
  assert.match(purchases, /SELECT id, sku, name, supplier_id::text/);
  assert.match(purchases, /supplierId: row\.supplier_id/);
  assert.match(purchases, /Proveedor invalido o inactivo/);
  assert.match(purchases, /product\.supplier_id !== input\.supplierId/);
  assert.match(purchases, /no corresponde al proveedor seleccionado/);

  const salesSource = read("apps/web/src/lib/sales-source-sql.ts");
  assert.match(salesSource, /DRIVE_SALES_SOURCE/);
  assert.match(salesSource, /sale_date < DATE '\$\{DRIVE_SALES_CUTOFF\}'/);
  assert.match(salesSource, /ENTREGAS MACRO/);

  const replenishment = read("apps/web/src/lib/replenishment.ts");
  assert.match(replenishment, /export async function getReplenishmentSuggestions/);
  assert.match(replenishment, /INTERVAL '90 days'/);
  assert.match(replenishment, /suggestedQuantity/);
  assert.match(replenishment, /supplierId/);
  assert.match(replenishment, /unitCost/);
  assert.match(replenishment, /TARGET_COVER_DAYS = 30/);

  const replenishmentPage = read("apps/web/src/app/purchases/replenishment/page.tsx");
  assert.match(replenishmentPage, /title="Recompra MRP"/);
  assert.match(replenishmentPage, /getReplenishmentSuggestions/);
  assert.match(replenishmentPage, /cubrir \$\{replenishment\.meta\.targetDays\} dias/);
  assert.match(replenishmentPage, /createReplenishmentPurchaseRequestAction/);
  assert.match(replenishmentPage, /Solicitar/);
  assert.match(replenishmentPage, /Solicitud de compra MRP enviada/);
  assert.match(replenishmentPage, /minWidth="1180px"/);
  assert.match(replenishmentPage, /align="center" className="w-\[10%\] px-2">Accion/);
  assert.match(replenishmentPage, /className="min-w-\[106px\] whitespace-nowrap"/);

  const accountsPayablePage = read("apps/web/src/app/treasury/accounts-payable/page.tsx");
  assert.match(accountsPayablePage, /minWidth="1120px"/);
  assert.match(accountsPayablePage, /align="center" className="w-\[15%\] px-2">Acciones/);
  assert.match(accountsPayablePage, /defaultValue=\{Math\.round\(item\.balance - item\.scheduledAmount\)\}/);
  assert.match(accountsPayablePage, /step="1"/);
  assert.match(accountsPayablePage, /webkit-inner-spin-button/);

  const replenishmentActions = read("apps/web/src/app/purchases/replenishment/actions.ts");
  assert.match(replenishmentActions, /createReplenishmentPurchaseRequestAction/);
  assert.match(replenishmentActions, /type: "solicitud_compra"/);
  assert.match(replenishmentActions, /revalidatePath\("\/admin\/approvals"\)/);
  assert.match(replenishmentActions, /redirect\("\/purchases\/replenishment\?created=1"\)/);

  const approvals = read("apps/web/src/lib/approvals.ts");
  assert.match(approvals, /ApprovalSource = "collection" \| "request" \| "purchase"/);
  assert.doesNotMatch(approvals, /listPendingFiscalApprovals|Factura fiscal pendiente|source: "fiscal"/);
  assert.match(approvals, /listPendingPurchaseApprovals/);
  assert.match(approvals, /resolvePurchaseApproval/);
  assert.match(approvals, /metadata\.action === "supplier_payment"/);
  assert.match(approvals, /"request\.approved"/);
  assert.match(approvals, /"request\.rejected"/);

  assert.match(purchaseActions, /requestSupplierPaymentAction/);
  assert.match(purchaseActions, /requestSupplierPaymentApproval/);
  assert.match(purchasesPage, /Solicitar pago/);
  assert.match(purchasesPage, /Enviar a aprobacion/);

  const databasePage = read("apps/web/src/app/database/page.tsx");
  assert.doesNotMatch(databasePage, /EMPLOYEES_READ_PERMISSION|label: "Empleados"|href: "\/employees"|Empleados/);

  const ordersPage = read("apps/web/src/app/orders/page.tsx");
  assert.match(ordersPage, /Ver PDF/);
  assert.match(ordersPage, /\/api\/pdfs\/orders\/\$\{order\.id\}\/document/);
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
  assert.match(collections, /"collection\.approved"/);
  assert.match(collections, /"collection\.rejected"/);

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
  assert.match(orderEntryFields, /Precio: \$\{formatCurrency\(priceForList\(product\.prices, activePriceList\)\)\}/);
  assert.doesNotMatch(orderEntryFields, /if \(!product \|\| !selectedClient\) return null/);
  assert.doesNotMatch(orderEntryFields, /draftProduct && selectedClient \? priceForList/);
  assert.match(orderEntryFields, /El producto no tiene precio para la lista/);
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
  assert.match(quoteEntryFields, /Cliente ocasional/);
  assert.match(quoteEntryFields, /name="customerName"/);
  assert.match(quoteEntryFields, /name="productsJson"/);
  assert.match(quoteEntryFields, /priceForList/);
  assert.match(quoteEntryFields, /priceLists/);
  assert.doesNotMatch(quoteEntryFields, /PRECIO 1/);
  assert.match(quoteEntryFields, /WhatsApp rapido/);
  assert.match(quoteEntryFields, /quickQuoteHref/);
  assert.match(quoteEntryFields, /<ButtonLink href=\{quickQuoteHref\}/);
  assert.match(quoteEntryFields, /Editar mensaje/);
  assert.match(quoteEntryFields, /quick-quote-whatsapp-editor/);
  assert.match(quoteEntryFields, /Restablecer mensaje automatico/);
  assert.match(quoteEntryFields, /setQuickQuoteMessageOverride/);
  assert.match(quoteEntryFields, /Crear presupuesto formal/);
  assert.match(quoteEntryFields, /name="vatRate"/);
  assert.match(quoteEntryFields, /Sumar IVA 21%/);
  assert.match(quoteEntryFields, /Sumar IVA 10,5%/);
  assert.doesNotMatch(quoteEntryFields, /window\.open/);

  const quotes = read("apps/web/src/lib/quotes.ts");
  assert.match(quotes, /resolveQuoteProductsFromCatalog/);
  assert.match(quotes, /dynamicPriceSqlExpression/);
  assert.match(quotes, /price_list_name/);
  assert.match(quotes, /client_legal_name/);
  assert.match(quotes, /calculateQuoteTotals/);
  assert.match(quotes, /if \(!clientId\)[\s\S]*INSERT INTO clients/);
  assert.match(quotes, /UPDATE quotes[\s\S]*client_id = \$4::uuid/);

  const catalogManagement = read("apps/web/src/lib/catalog-management.ts");
  assert.match(catalogManagement, /resolveCustomerPriceList/);
  assert.match(catalogManagement, /resolvePriceListName/);

  const imports = read("apps/web/src/lib/imports.ts");
  assert.match(imports, /resolvePriceListName\(value\(row, 10\), activePriceLists\)/);

  const billingPage = read("apps/web/src/app/billing/page.tsx");
  assert.match(billingPage, /<option value="c">Factura C<\/option>/);
  assert.match(billingPage, /LiveBillingSearch/);
  assert.doesNotMatch(billingPage, /htmlFor="billing-customer"|htmlFor="billing-tax-id"|htmlFor="billing-receipt"/);

  const liveBillingSearch = read("apps/web/src/app/billing/live-billing-search.tsx");
  assert.match(liveBillingSearch, /placeholder="Cliente, CUIT\/DNI o comprobante"/);
  assert.match(liveBillingSearch, /SEARCH_DELAY_MS = 250/);
  assert.match(liveBillingSearch, /router\.replace/);

  const salesAdmin = read("apps/web/src/lib/sales-admin.ts");
  assert.match(salesAdmin, /TYPE_CODES = new Set\(\[1, 2, 3, 6, 7, 8, 11, 12, 13\]\)/);
  assert.match(salesAdmin, /FROM sales_internal_documents sid/);
  assert.match(salesAdmin, /sid\.class_name = 'NC'/);
  assert.match(salesAdmin, /sid\.class_name = 'ND'/);
  assert.match(salesAdmin, /filters\.customerName/);
  assert.match(salesAdmin, /filters\.query/);
  assert.match(salesAdmin, /client_name[\s\S]*client_document[\s\S]*(?:fiscal_receipt_number|delivery_number)/);
});

test("dashboard visual refinements keep semantic icons and remove duplicated or noisy presentation", () => {
  const homePage = read("apps/web/src/app/page.tsx");
  const actionMenuStyles = read("apps/web/src/app/globals.css");
  const stockPage = read("apps/web/src/app/stock/page.tsx");

  assert.doesNotMatch(homePage, /title="Recordatorios y tareas"/);
  assert.match(actionMenuStyles, /\.erp-action-menu \{\s*min-width: 9rem;\s*position: relative;\s*\}/);
  assert.doesNotMatch(stockPage, /timeStyle:/);
  assert.doesNotMatch(stockPage, /movement\.productCode/);

  for (const page of [
    "apps/web/src/app/sales/page.tsx",
    "apps/web/src/app/quotes/page.tsx",
    "apps/web/src/app/billing/page.tsx",
    "apps/web/src/app/stock/page.tsx",
    "apps/web/src/app/purchases/page.tsx",
  ]) {
    assert.match(read(page), /icon=\{<MetricIcon name="/, `${page} must use semantic metric icons`);
  }
});

test("orders keep final prices while quotes can add optional VAT", () => {
  const orderEntryFields = read("apps/web/src/app/orders/new/order-entry-fields.tsx");
  assert.doesNotMatch(orderEntryFields, /receiptAddsVat|name="includeVat"|>\s*IVA\s*<|>\s*Neto\s*</);
  assert.match(orderEntryFields, /Subtotal productos/);

  const quoteEntryFields = read("apps/web/src/app/quotes/quote-entry-fields.tsx");
  assert.match(quoteEntryFields, /name="includeVat"/);
  assert.match(quoteEntryFields, /calculateQuoteTotals/);
  assert.match(quoteEntryFields, /IVA \{String\(vatRate\)/);
  assert.match(quoteEntryFields, /Subtotal productos/);

  const quotesPage = read("apps/web/src/app/quotes/page.tsx");
  assert.match(quotesPage, /quote\.quoteNumber/);
  assert.doesNotMatch(quotesPage, />#\{quote\.id\}</);
  assert.doesNotMatch(quotesPage, /DataTableHead align="right">IVA/);
  assert.doesNotMatch(quotesPage, /DataTableHead align="right">Subtotal/);
  assert.match(quotesPage, /<details[\s\S]*Acciones[\s\S]*PDF[\s\S]*WhatsApp[\s\S]*Aceptar[\s\S]*Aprobar y remitar/);

  const orders = read("apps/web/src/lib/orders.ts");
  assert.doesNotMatch(orders, /receiptAddsVat|money\(netAmount \* 0\.21\)|money\(subtotal \* 0\.21\)/);
  assert.match(orders, /0::text AS monto_iva/);
  assert.match(orders, /confirmationTotalAmount = money\(Number\(order\.total_amount\)\)/);
  assert.match(orders, /normalizeStoredVatRate/);

  const quotes = read("apps/web/src/lib/quotes.ts");
  assert.match(quotes, /booleanValue\(body\.includeVat/);
  assert.match(quotes, /calculateQuoteTotals/);
  assert.match(quotes, /vat_rate/);

  const receiptTypes = read("apps/web/src/lib/receipt-types.ts");
  assert.doesNotMatch(receiptTypes, /receiptAddsVat/);

  const pdfDocuments = read("apps/web/src/lib/pdf/documents.ts");
  assert.match(pdfDocuments, /quote\.includeVat/);
  assert.match(pdfDocuments, /quote\.vatAmount/);
  assert.match(pdfDocuments, /quote\.quoteNumber/);
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
  assert.match(salesAdmin, /orderStatusTransitionError/);
  assert.match(salesAdmin, /assertSaleStockAvailableForConfirmation/);
  assert.match(salesAdmin, /applySaleOrderStatusTransition/);
  assert.match(salesAdmin, /collectionStatusForOrderStatus/);
  assert.match(salesAdmin, /orderIntegrationEventType/);
  assert.doesNotMatch(salesAdmin, /input\.target === "sale" && input\.field === "estado_pedido" && input\.value === "entregado"[\s\S]*UPDATE sales SET collection_status/);
});

test("sales reporting uses the canonical imported sales source", () => {
  const salesSourceSql = read("apps/web/src/lib/sales-source-sql.ts");
  assert.match(salesSourceSql, /ENTREGAS MACRO/);
  assert.match(salesSourceSql, /VENTAS ANUAL/);
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
    /label: "Inicio"[\s\S]*groups: \[groupByLabel\("Escritorio"\), groupByLabel\("Calendario"\), groupByLabel\("Mensajes"\), groupByLabel\("Banco"\)\]/,
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

test("Cash flow exposes 7/15/30 horizons and a calendar view", () => {
  const adminMetrics = read("apps/web/src/lib/admin-metrics.ts");
  assert.match(adminMetrics, /const horizons = \[7, 15, 30\]/);
  assert.match(adminMetrics, /calendar = Array\.from/);
  assert.match(adminMetrics, /daysUntil/);
  assert.match(adminMetrics, /scheduledSupplierPayments/);
  assert.match(adminMetrics, /metadata->>'action' = 'supplier_payment'/);
  assert.match(adminMetrics, /COALESCE\(scheduled\.scheduled_amount, 0\)/);

  const cashFlowPage = read("apps/web/src/app/treasury/cash-flow/page.tsx");
  assert.match(cashFlowPage, /cashflow\.meta\.horizons\.map/);
  assert.match(cashFlowPage, /Calendario de caja/);
  assert.match(cashFlowPage, /cashflow\.calendar\.map/);

  const accountsPayableActions = read("apps/web/src/app/treasury/accounts-payable/actions.ts");
  assert.match(accountsPayableActions, /programSupplierPaymentAction/);
  assert.match(accountsPayableActions, /requestSupplierPaymentApproval/);
  assert.match(accountsPayableActions, /revalidatePath\("\/treasury\/cash-flow"\)/);

  const accountsPayablePage = read("apps/web/src/app/treasury/accounts-payable/page.tsx");
  assert.match(accountsPayablePage, /createManualPayableAction/);
  assert.match(accountsPayablePage, /programSupplierPaymentAction/);
  assert.match(accountsPayablePage, /Pago programado y enviado a solicitudes/);
  assert.match(accountsPayablePage, /item\.scheduledAmount/);
  assert.match(accountsPayablePage, /Programar/);
});

test("customer follow-up can create reminders from recommerce risk rows", () => {
  const messages = read("apps/web/src/lib/messages.ts");
  assert.match(messages, /export async function getCustomerFollowUp/);
  assert.match(messages, /customerId: customer\.id/);
  assert.match(messages, /expectedNextPurchase/);
  assert.match(messages, /groups\.riesgo/);
  assert.match(messages, /groups\.perdido/);

  const followUpActions = read("apps/web/src/app/customers/follow-up/actions.ts");
  assert.match(followUpActions, /createCustomerFollowUpTaskAction/);
  assert.match(followUpActions, /createTask\(session, formBody\(formData\)\)/);
  assert.match(followUpActions, /revalidatePath\("\/"\)/);
  assert.match(followUpActions, /redirect\("\/customers\/follow-up\?task=1"\)/);

  const followUpPage = read("apps/web/src/app/customers/follow-up/page.tsx");
  assert.match(followUpPage, /createCustomerFollowUpTaskAction/);
  assert.match(followUpPage, /Recordatorio creado en Inicio y Calendario/);
  assert.match(followUpPage, /reminderPriority/);
  assert.match(followUpPage, /reminderDeadline/);
  assert.match(followUpPage, /Recordar/);
  assert.match(followUpPage, /tableProps=\{\{ className: "table-fixed" \}\}/);
});

test("form controls tolerate browser extension attributes during hydration", () => {
  for (const path of [
    "apps/web/src/components/ui/button.tsx",
    "apps/web/src/components/ui/input.tsx",
    "apps/web/src/components/ui/select.tsx",
    "apps/web/src/components/ui/textarea.tsx",
  ]) {
    assert.match(read(path), /suppressHydrationWarning/, `${path} must suppress extension-injected attributes`);
  }

  for (const path of [
    "apps/web/src/app/calendar/page.tsx",
    "apps/web/src/app/collections/register-collection-dialog.tsx",
    "apps/web/src/app/employees/page.tsx",
    "apps/web/src/app/messages/messages-client.tsx",
    "apps/web/src/app/orders/page.tsx",
    "apps/web/src/app/orders/new/order-confirmation-preview.tsx",
    "apps/web/src/app/orders/new/order-entry-fields.tsx",
    "apps/web/src/app/page.tsx",
    "apps/web/src/app/pricing/offers/page.tsx",
    "apps/web/src/app/purchases/page.tsx",
    "apps/web/src/app/treasury/movements/page.tsx",
  ]) {
    assert.match(read(path), /suppressHydrationWarning/, `${path} has visible raw form controls`);
  }
});

test("Escritorio previews up to 5 unread messages alongside pending tasks", () => {
  const home = read("apps/web/src/app/page.tsx");
  assert.match(home, /listMessageCenter/);
  assert.match(home, /unreadMessages/);
  assert.match(home, /\.filter\(\(message\) => !message\.read\)/);
  assert.match(home, /\.slice\(0, 5\)/);
  assert.match(home, /Mensajes sin leer/);
  assert.match(home, /href=\{`\/messages\?message=\$\{message\.id\}`\}/);
  assert.match(home, /Tareas delegadas/);
  assert.match(home, /Delegada a \$\{task\.assignedTo\}/);
  assert.match(home, /max-h-\[680px\].*overflow-y-auto/);
});

test("Mensajes is a single navigation entry without obsolete inbox or sent menus", () => {
  const navigation = read("apps/web/src/lib/navigation.ts");
  assert.match(
    navigation,
    /href: "\/messages",\s*label: "Mensajes",\s*active: "messages",\s*badge: "messages"/,
  );
  assert.doesNotMatch(navigation, /label: "Recibidos"/);
  assert.doesNotMatch(navigation, /label: "Enviados"/);
  assert.doesNotMatch(navigation, /messages\?box=/);
});

test("desktop sidebar contains wheel scrolling without moving the page", () => {
  const modulePage = read("apps/web/src/components/module-page.tsx");
  assert.match(modulePage, /lg:overflow-hidden lg:overscroll-none/);
  assert.match(modulePage, /<aside className="[^"]*overflow-hidden overscroll-none/);
  assert.match(modulePage, /min-h-0 flex-1 overflow-y-auto overscroll-none/);
});

test("route transitions respond immediately and server rendering stays close to the database", () => {
  const layout = read("apps/web/src/app/layout.tsx");
  const modulePage = read("apps/web/src/components/module-page.tsx");
  const navigationProgress = read("apps/web/src/components/navigation-progress.tsx");

  assert.match(layout, /export const preferredRegion = "gru1"/);
  assert.match(layout, /<NavigationProgress \/>/);
  assert.doesNotMatch(modulePage, /Cargando información/);
  assert.doesNotMatch(modulePage, /getMessageNotificationPreview\(session\)/);
  assert.match(modulePage, /const authorization = navigationAuthorization/);
  assert.match(modulePage, /const indicators = emptyNavigationIndicators\(\)/);
  assert.match(navigationProgress, /document\.addEventListener\("click", handleClick, true\)/);
  assert.match(navigationProgress, /window\.addEventListener\("popstate", beginNavigation\)/);
  assert.match(navigationProgress, /role="progressbar"/);
});

test("performance guardrails prevent global waits and unbounded stock catalogs", () => {
  const guardrails = read("docs/performance-guardrails.md");
  const modulePage = read("apps/web/src/components/module-page.tsx");
  const inventory = read("apps/web/src/lib/inventory.ts");
  const workspace = read("apps/web/src/app/stock/stock-product-workspace.tsx");
  const indicatorsProvider = read("apps/web/src/components/navigation-indicators-provider.tsx");

  assert.match(guardrails, /Nunca descargar un catálogo completo para un selector/);
  assert.match(guardrails, /Promise\.all/);
  assert.match(guardrails, /permisos, empresa y RLS/);
  assert.doesNotMatch(modulePage, /getNavigationIndicators\(session\)/);
  assert.doesNotMatch(modulePage, /getMessageNotificationPreview\(session\)/);
  assert.match(indicatorsProvider, /fetch\("\/api\/navigation\/indicators"/);
  assert.match(inventory, /listInventoryProducts\(companyId: number, query = "", limit = 40\)/);
  assert.doesNotMatch(inventory, /LIMIT 10000/);
  assert.match(workspace, /query\.length < 2/);
  assert.match(workspace, /\/api\/stock\/products\?q=/);
});

test("reported ERP controls keep consistent spacing, dates, menus, and whole quantities", () => {
  const home = read("apps/web/src/app/page.tsx");
  const calendar = read("apps/web/src/app/calendar/page.tsx");
  const format = read("apps/web/src/lib/format.ts");
  const modulePage = read("apps/web/src/components/module-page.tsx");
  const presence = read("apps/web/src/components/presence-indicator.tsx");
  const messages = read("apps/web/src/app/messages/messages-client.tsx");
  const orderFields = read("apps/web/src/app/orders/new/order-entry-fields.tsx");
  const orders = read("apps/web/src/lib/orders.ts");
  const ordersPage = read("apps/web/src/app/orders/page.tsx");
  const salesPage = read("apps/web/src/app/sales/page.tsx");

  assert.doesNotMatch(home, /eyebrow="Inicio"/);
  assert.match(home, /formatDateTime\(task\.deadline\)/);
  assert.match(calendar, /formatDateTime\(task\.deadline\)/);
  assert.doesNotMatch(calendar, /min-w-\[820px\]/);
  assert.match(format, /export function formatDateTime/);
  assert.match(format, /America\/Argentina\/Buenos_Aires/);

  assert.match(modulePage, /flex h-\[var\(--control-height-md\)\] max-w-\[360px\] items-center/);
  assert.match(modulePage, /<LogoutButton className="h-\[var\(--control-height-md\)\] min-h-\[var\(--control-height-md\)\] px-4"/);
  assert.match(presence, /flex h-\[var\(--control-height-md\)\] items-center/);
  assert.match(messages, /\[&>span\]:items-center \[&>span\]:justify-center/);
  assert.match(messages, /style=\{\{ paddingInline: 0 \}\}/);
  assert.match(messages, /block h-5 w-5 -translate-x-px/);

  const globals = read("apps/web/src/app/globals.css");
  assert.doesNotMatch(globals, /button,[\s\S]*summary \{\s*font: inherit;/);
  assert.match(globals, /summary \{\s*font-family: inherit;\s*font-size: inherit;\s*line-height: inherit;/);

  assert.match(orderFields, /<Card className="overflow-visible shadow-none">/);
  assert.match(orderFields, /placeholder="Seleccionar producto"[\s\S]*compactOptions/);
  assert.match(orderFields, /xl:grid-cols-\[minmax\(280px,1fr\)_120px_120px\]/);
  assert.match(orderFields, /2xl:grid-cols-\[minmax\(320px,1fr\)_120px_120px_130px_130px_auto\]/);
  assert.match(orderFields, /isWholeQuantityInput/);
  assert.ok((orderFields.match(/step="1"/g) ?? []).length >= 2);
  assert.doesNotMatch(orderFields, /min="0\.001"|step="0\.001"/);
  assert.match(orders, /Number\.isInteger\(line\.quantity\)/);
  assert.match(orders, /cantidad de cada producto debe ser un numero entero/);

  assert.match(ordersPage, /appearance-none[\s\S]*text-sm font-semibold leading-5/);
  assert.ok((ordersPage.match(/min-w-28 font-extrabold/g) ?? []).length >= 2);
  assert.match(salesPage, /DataTableHead align="center"[^>]*>Comprobante<\/DataTableHead>/);
  assert.match(salesPage, /DataTableCell align="center"[\s\S]*Ver PDF/);
});

test("message center groups messages into WhatsApp-style contact conversations with private attachments", () => {
  const db = read("apps/web/src/lib/db.ts");
  const page = read("apps/web/src/app/messages/page.tsx");
  const client = read("apps/web/src/app/messages/messages-client.tsx");
  const messages = read("apps/web/src/lib/messages.ts");
  const attachments = read("apps/web/src/lib/message-attachments.ts");
  const signRoute = read("apps/web/src/app/api/messages/attachments/sign/route.ts");
  const downloadRoute = read("apps/web/src/app/api/messages/[messageId]/attachments/[attachmentId]/route.ts");
  const migration = read("supabase/migrations/20260720212657_messaging_attachments.sql");

  assert.match(page, /MessagesClient/);
  assert.match(page, /initialContact/);
  assert.match(page, /initialRevision=\{center\.meta\.revision\}/);
  assert.match(page, /\.\.\.center\.inbox, \.\.\.center\.sent/);
  assert.match(client, /Buscar o iniciar un chat/);
  assert.match(client, /message-contact-search/);
  assert.match(client, /selectedConversation/);
  assert.match(client, /Chat con/);
  assert.match(client, /markConversationReadAction/);
  assert.match(client, /MESSAGE_REFRESH_INTERVAL_MS = 3_000/);
  assert.match(client, /\/api\/messages\?mode=revision/);
  assert.match(client, /revision !== revisionRef\.current/);
  assert.match(client, /await refreshMessages\(signal\)/);
  assert.match(client, /refreshWhenAvailable\(\)/);
  assert.match(client, /visibilitychange/);
  assert.match(client, /window\.addEventListener\("online"/);
  assert.match(client, /refreshInFlightRef/);
  assert.match(client, /Reconectando mensajes/);
  assert.match(client, /credentials: "same-origin"/);
  assert.match(client, /shiftKey/);
  assert.match(client, /whitespace-pre-wrap break-words/);
  assert.match(client, /aria-label="Adjuntar archivos"/);
  assert.match(client, /aria-label=\{sending \? "Enviando mensaje" : "Enviar mensaje"\}/);
  assert.match(client, /rounded-\[22px\][\s\S]*focus-within:ring-2/);
  assert.doesNotMatch(client, /name="importance"/);
  assert.doesNotMatch(client, />\s*Adjuntar\s*</);
  assert.doesNotMatch(client, />\s*Enviar\s*</);
  assert.match(client, /uploadToSignedUrl/);
  assert.match(client, /MESSAGE_ATTACHMENT_MAX_FILES/);
  assert.match(client, /attachment\.downloadUrl/);
  assert.match(messages, /WITH inbox AS/);
  assert.match(messages, /LEFT JOIN mensaje_adjuntos ma/);
  assert.match(messages, /json_agg\(/);
  assert.match(messages, /attachPreparedMessageUploads/);
  assert.match(messages, /AND \(\$3::bigint IS NULL OR id = \$3\)/);
  assert.match(messages, /export async function markConversationRead/);
  assert.match(messages, /export async function getMessageCenterRevision/);
  assert.ok((messages.match(/\{ cache: false \}/g) ?? []).length >= 2);
  assert.match(db, /options: \{ cache\?: boolean \} = \{\}/);
  assert.match(db, /const readOnly = isCacheableRead\(sql\)/);
  assert.match(db, /options\.cache !== false && readOnly/);
  assert.match(db, /else if \(!readOnly\)/);
  assert.match(messages, /AND de = \$3/);
  assert.match(attachments, /AND \(m\.de = \$4 OR m\.para = \$4\)/);
  assert.match(attachments, /storageObjectInfo/);
  assert.match(signRoute, /requireApiSession/);
  assert.match(downloadRoute, /getMessageAttachment/);
  assert.match(downloadRoute, /createSignedStorageUrl/);
  const messagesRoute = read("apps/web/src/app/api/messages/route.ts");
  assert.match(messagesRoute, /private, no-store, max-age=0/);
  assert.match(messagesRoute, /messages\.read\.completed/);
  assert.match(messagesRoute, /messages\.send\.completed/);
  assert.match(messagesRoute, /Server-Timing/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.mensaje_adjuntos/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.mensaje_cargas/);
  assert.match(migration, /public = false/);
  assert.match(migration, /20971520/);
});

test("shared button variants keep a consistent action hierarchy", () => {
  const button = read("apps/web/src/components/ui/button.tsx");
  assert.match(button, /const primaryButtonClass =[\s\S]*bg-\[color:var\(--accent\)\]/);
  assert.match(button, /const secondaryButtonClass =[\s\S]*bg-\[#1d4ed8\]/);
  assert.match(button, /const outlineButtonClass =[\s\S]*bg-white[\s\S]*text-\[#1755b8\]/);
  assert.match(button, /const ghostButtonClass =[\s\S]*bg-transparent[\s\S]*text-\[#334155\]/);
  assert.match(button, /const dangerButtonClass =[\s\S]*bg-\[#b91c1c\]/);
  assert.match(button, /primary: primaryButtonClass/);
  assert.match(button, /secondary: secondaryButtonClass/);
  assert.match(button, /ghost: ghostButtonClass/);
  assert.match(button, /outline: outlineButtonClass/);
  assert.match(button, /danger: dangerButtonClass/);
  assert.match(button, /sm: "erp-text-body-sm min-h-\[var\(--control-height-sm\)\] px-3\.5"/);
  assert.match(button, /md: "erp-text-body-sm min-h-\[var\(--control-height-md\)\] px-4"/);
  assert.match(button, /lg: "erp-text-body min-h-\[var\(--control-height-lg\)\] px-5"/);

});

test("shared tables stay compact, aligned and free of page-level HTML tables", () => {
  const dataTable = read("apps/web/src/components/ui/data-table.tsx");
  const toolbar = read("apps/web/src/components/ui/toolbar.tsx");
  const pagination = read("apps/web/src/components/pagination-links.tsx");

  assert.match(dataTable, /tabular-nums/);
  assert.match(dataTable, /DataTableFilters/);
  assert.match(dataTable, /data-data-table/);
  const dataTableFilters = read("apps/web/src/components/ui/data-table-filters.tsx");
  assert.match(dataTableFilters, /Buscar/);
  assert.match(dataTableFilters, /Valor exacto/);
  assert.match(dataTableFilters, /Desde/);
  assert.match(dataTableFilters, /Hasta/);
  assert.match(dataTableFilters, /type="date"/);
  assert.match(dataTable, /\[&>tr\]:h-\[var\(--table-header-height\)\]/);
  assert.match(dataTable, /\[&>tr\]:h-\[var\(--table-row-height\)\]/);
  assert.match(dataTable, /first:pl-5 last:pr-5/);
  assert.match(toolbar, /items-(?:start|center)/);
  assert.match(pagination, /Mostrando/);
  assert.match(pagination, /por pagina/);

  for (const path of filesUnder("apps/web/src/app", (path) => path.endsWith(".tsx"))) {
    assert.doesNotMatch(read(path), /<table\b|<thead\b|<tbody\b/, `${path} must use the shared DataTable`);
  }
});

test("billing uses real ARCA authorization state for invoices and fiscal notes", () => {
  assert.equal(existsSync(join(repoRoot, "migrations/035_sales_fiscal_authorization_state.sql")), true);
  assert.equal(existsSync(join(repoRoot, "migrations/036_sales_fiscal_receipt_identity.sql")), true);
  assert.equal(existsSync(join(repoRoot, "migrations/037_sales_internal_documents_fiscal_identity.sql")), true);
  assert.equal(existsSync(join(repoRoot, "migrations/20260713220000_fiscal_issue_date_and_recent_sale_items.sql")), true);
  assert.equal(existsSync(join(repoRoot, "migrations/040_structured_supplier_purchase_tax_fields.sql")), true);

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
  assert.match(fiscal, /"fiscal\.invoice_approved"/);
  assert.match(fiscal, /"fiscal\.invoice_rejected"/);
  assert.match(fiscal, /"fiscal\.credit_note_approved"/);
  assert.match(fiscal, /"fiscal\.debit_note_approved"/);
  assert.ok((fiscal.match(/fiscal_receipt_number = \$3::integer/g) ?? []).length >= 2);
  assert.ok((fiscal.match(/receipt_number = \$9::bigint/g) ?? []).length >= 2);
  assert.doesNotMatch(fiscal, /fiscal_receipt_number = \$3,\s*receipt_type = \$2,\s*receipt_number = \$3/);
  assert.match(fiscal, /AS has_item_detail/);
  assert.match(fiscal, /EXISTS \([\s\S]*COALESCE\(si\.quantity, 0\) > 0/);
  assert.match(fiscal, /NOT EXISTS \([\s\S]*COALESCE\(si\.quantity, 0\) <= 0/);
  assert.match(fiscal, /!sale\.hasItemDetail/);
  assert.match(fiscal, /La venta no tiene un detalle de productos valido/);
  assert.ok((fiscal.match(/fiscal_issue_date = COALESCE/g) ?? []).length >= 2);

  const arcaWsaa = read("apps/web/src/lib/arca/wsaa.ts");
  assert.match(arcaWsaa, /loginTicketRequest/);
  assert.match(arcaWsaa, /forge\.pkcs7\.createSignedData/);
  assert.match(arcaWsaa, /credentialPem/);

  const arcaConfig = read("apps/web/src/lib/arca/config.ts");
  assert.match(arcaConfig, /STARLIM_ARCA_CERT_BASE64/);
  assert.match(arcaConfig, /STARLIM_ARCA_KEY_BASE64/);
  assert.match(arcaConfig, /STARLIM_ARCA_CERT_PEM/);
  assert.match(arcaConfig, /STARLIM_ARCA_KEY_PEM/);
  assert.match(arcaConfig, /STARLIM_ARCA_CERT_PATH/);
  assert.match(arcaConfig, /STARLIM_ARCA_KEY_PATH/);

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
  assert.match(arcaWsfe, /issueDate: arcaDateToIso\(invoiceDate\)/);
  assert.match(arcaWsfe, /issueDate: arcaDateToIso\(tagContent\(detail, "CbteFch"\)\)/);

  const billingPage = read("apps/web/src/app/billing/page.tsx");
  assert.match(billingPage, /Registro de facturas/);
  assert.match(billingPage, /getFiscalVatSummary/);
  assert.match(billingPage, /IVA ventas/);
  assert.match(billingPage, /IVA compras/);
  assert.match(billingPage, /Saldo IVA/);
  assert.doesNotMatch(billingPage, /getSalesSummary/);
  assert.doesNotMatch(billingPage, /getFiscalStatus/);
  assert.doesNotMatch(billingPage, /label="Comprobantes"|label="Monto total"|label="Facturado"|label="Sin factura"/);
  assert.doesNotMatch(billingPage, /Estado fiscal|Proveedor|Modo|Listo|ARCA configurado/);
  assert.match(billingPage, /\/billing\/credit-note\/\$\{item\.saleId\}/);
  assert.match(billingPage, /\/billing\/debit-note\/\$\{item\.saleId\}/);
  assert.match(billingPage, /<details className="erp-action-menu"[\s\S]*Acciones[\s\S]*Factura PDF[\s\S]*Nota credito[\s\S]*Nota debito/);
  assert.match(billingPage, /\/api\/pdfs\/fiscal\/sales\/\$\{item\.saleId\}/);
  assert.match(billingPage, /\/api\/pdfs\/fiscal\/notes\/\$\{item\.creditNoteId\}/);
  assert.match(billingPage, /\/api\/pdfs\/fiscal\/notes\/\$\{item\.debitNoteId\}/);
  assert.match(billingPage, /hasFiscalIdentity/);
  assert.doesNotMatch(billingPage, /CAE \{item\.cae\}/);
  assert.doesNotMatch(billingPage, /CAE \{item\.creditNoteCae\}/);
  assert.doesNotMatch(billingPage, /CAE \{item\.debitNoteCae\}/);

  const navigation = read("apps/web/src/lib/navigation.ts");
  assert.match(navigation, /href: "\/billing",\s*label: "Fiscal"/);

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
  const fiscalLedger = read("apps/web/src/lib/fiscal-ledger.ts");
  assert.match(fiscalLedger, /export async function getFiscalVatSummary/);
  assert.match(fiscalLedger, /COALESCE\(s\.fiscal_status, 'no_enviado'\) = 'aprobado'/);
  assert.match(fiscalLedger, /COALESCE\(s\.cae, ''\) NOT IN \('', 'manual'\)/);
  assert.match(fiscalLedger, /p\.tax_mode/);
  assert.match(fiscalLedger, /p\.vat_rate/);
  assert.match(fiscalLedger, /p\.total_amount - \(p\.total_amount \/ \(1 \+ \(p\.vat_rate \/ 100\)\)\)/);
  assert.doesNotMatch(fiscalLedger, /IVA compra:%Con IVA/);
  assert.match(fiscalLedger, /netVatBalance/);
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
  assert.match(pdfDocuments, /issueDate: sale\.fiscal_issue_date/);
  assert.match(pdfDocuments, /date: pdfDate\(sale\.fiscal_issue_date\)/);
  assert.match(pdfDocuments, /Periodo: \$\{pdfDate\(sale\.sale_date\)\}/);
  assert.match(pdfDocuments, /detail\.rows\.length === 0/);

  const fiscalIntegrityMigration = read("migrations/20260713220000_fiscal_issue_date_and_recent_sale_items.sql");
  assert.match(fiscalIntegrityMigration, /ADD COLUMN IF NOT EXISTS fiscal_issue_date date/);
  assert.match(fiscalIntegrityMigration, /REM-2026-1069/);
  assert.match(fiscalIntegrityMigration, /complete_sales/);
  assert.match(fiscalIntegrityMigration, /drive\.sale_items_backfilled/);

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

test("balance metrics align numeric values and use meaningful icons", () => {
  const balancePage = read("apps/web/src/app/balance/page.tsx");
  const statCard = read("apps/web/src/components/ui/stat-card.tsx");
  const metricIcon = read("apps/web/src/components/metric-icon.tsx");

  assert.match(statCard, /icon\?: ReactNode/);
  assert.match(statCard, /grid-cols-\[48px_minmax\(0,1fr\)\]/);
  assert.match(statCard, /erp-text-caption truncate font-semibold/);
  assert.match(statCard, /font-mono[\s\S]*tabular-nums/);
  assert.match(statCard, /detail \?\? "\\u00a0"/);
  assert.match(balancePage, /<MetricIcon name="sales" \/>/);
  assert.match(balancePage, /<MetricIcon name="result" \/>/);
  assert.match(balancePage, /<MetricIcon name="costs" \/>/);
  assert.match(balancePage, /<MetricIcon name="stock" \/>/);
  for (const iconName of ["sales", "result", "costs", "stock"]) {
    assert.match(metricIcon, new RegExp(`\\\\| "${iconName}"`));
  }
});

test("metrics uses real financial comparisons instead of generated chart history", () => {
  const metricsPage = read("apps/web/src/app/metrics/page.tsx");

  assert.match(metricsPage, /Pulso financiero/);
  assert.match(metricsPage, /Qué deja cada peso vendido/);
  assert.match(metricsPage, /Liquidez bajo control/);
  assert.match(metricsPage, /Alertas para decidir hoy/);
  assert.match(metricsPage, /metrics\.receivables\.openTotal - metrics\.purchases\.openTotal/);
  assert.match(metricsPage, /metrics\.margin\.operatingResult/);
  assert.match(metricsPage, /lockDesktopScroll/);
  assert.match(metricsPage, /grid-rows-\[auto_auto_auto_minmax\(0,1fr\)\]/);
  assert.match(metricsPage, /<Toolbar/);
  assert.match(metricsPage, /<StatCard/);
  assert.match(metricsPage, /<StatusBadge/);
  assert.match(metricsPage, /grid-cols-2 gap-3 p-4/);
  assert.doesNotMatch(metricsPage, /content-end gap-2/);
  const modulePage = read("apps/web/src/components/module-page.tsx");
  assert.match(modulePage, /lockDesktopScroll/);
  assert.match(modulePage, /lg:h-\[calc\(100vh-4\.75rem\)\]/);
  assert.doesNotMatch(metricsPage, /function trendSeries/);
  assert.doesNotMatch(metricsPage, /function RevenueBars/);
});

test("rentabilidad keeps its workflows while applying the visual dashboard treatment", () => {
  const page = read("apps/web/src/app/rentabilidad/page.tsx");

  assert.match(page, /getBreakEvenStatus\(session\.companyId, month\)/);
  assert.match(page, /listOperatingCosts\(session\.companyId, month\)/);
  assert.match(page, /action=\{createOperatingCostAction\}/);
  assert.match(page, /action=\{deleteOperatingCostAction\}/);
  assert.match(page, /name="month"/);
  assert.match(page, /name="concept"/);
  assert.match(page, /name="amount"/);
  assert.match(page, /name="category"/);
  assert.match(page, /name="date"/);
  assert.match(page, /icon=\{<RentabilidadIcon name="costs" \/>\}/);
  assert.match(page, /icon=\{<RentabilidadIcon name="margin" \/>\}/);
  assert.match(page, /icon=\{<RentabilidadIcon name="target" \/>\}/);
  assert.match(page, /icon=\{<RentabilidadIcon name="loss" \/>\}/);
  assert.match(page, /Nuevo costo operativo/);
  assert.match(page, /PE no alcanzado/);
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

test("security hardening stays enabled at the HTTP edge", () => {
  const nextConfig = read("apps/web/next.config.ts");
  assert.match(nextConfig, /Content-Security-Policy/);
  assert.match(nextConfig, /frame-ancestors 'none'/);
  assert.match(nextConfig, /object-src 'none'/);
  assert.match(nextConfig, /process\.env\.NODE_ENV === "development"/);
  assert.match(nextConfig, /isDevelopment \? \["'unsafe-eval'"\] : \[\]/);
  assert.match(nextConfig, /Strict-Transport-Security/);
  assert.match(nextConfig, /X-Content-Type-Options/);
  assert.match(nextConfig, /Permissions-Policy/);

  const proxy = read("apps/web/src/proxy.ts");
  assert.match(proxy, /MUTATING_METHODS/);
  assert.match(proxy, /isSameOrigin/);
  assert.match(proxy, /sec-fetch-site/);
  assert.match(proxy, /STARLIM_ALLOWED_ORIGINS/);
  assert.match(proxy, /API_RATE_LIMIT/);
  assert.match(proxy, /MUTATION_RATE_LIMIT/);
  assert.match(proxy, /status: 429/);
  assert.match(proxy, /Origen no permitido/);
});

test("private storage references replace public receipt URLs", () => {
  const storage = read("apps/web/src/lib/storage.ts");
  assert.match(storage, /starlim-storage:\/\//);
  assert.match(storage, /storageDownloadUrl/);
  assert.match(storage, /assertCompanyStoragePath/);
  assert.match(storage, /createSignedStorageUrl/);
  assert.doesNotMatch(storage, /\/storage\/v1\/object\/public/);

  const purchases = read("apps/web/src/lib/purchases.ts");
  assert.match(purchases, /storageDownloadUrl\(row\.receipt_photo\)/);

  const storageRoute = read("apps/web/src/app/api/storage/[bucket]/[...path]/route.ts");
  assert.match(storageRoute, /requireApiSession\(\[PURCHASES_READ_PERMISSION\]\)/);
  assert.match(storageRoute, /assertCompanyStoragePath/);
  assert.match(storageRoute, /assertPurchaseReceiptStorageAccess/);
  assert.match(storageRoute, /createSignedStorageUrl/);
  assert.match(storageRoute, /Cache-Control", "private, no-store, max-age=0"/);
  assert.doesNotMatch(storageRoute, /requireApiSession\(\)/);

  assert.match(purchases, /export async function assertPurchaseReceiptStorageAccess/);
  assert.match(purchases, /storageObjectReference\(bucket, objectPath\)/);
  assert.match(purchases, /receipt_photo = \$2/);
  assert.match(purchases, /Recibo no encontrado o no autorizado/);
});

test("supabase migrations close Data API defaults and exposed helpers", () => {
  const hardening = read("migrations/041_lock_down_supabase_advisor_warnings.sql");
  assert.match(hardening, /ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public/);
  assert.match(hardening, /REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated, service_role/);
  assert.match(hardening, /REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, service_role, PUBLIC/);
  assert.match(hardening, /security_invoker = true/);
  assert.match(hardening, /NULLIF\(current_setting\(''app\.current_empresa_id'', true\), ''''\)::BIGINT/);
  assert.doesNotMatch(hardening, /COALESCE\(.*current_empresa_id.*,\s*1\)/);

  const helpers = read("migrations/042_move_role_helpers_out_of_public_api.sql");
  assert.match(helpers, /CREATE SCHEMA IF NOT EXISTS app_private/);
  assert.match(helpers, /REVOKE ALL ON SCHEMA app_private FROM anon, PUBLIC/);
  assert.match(helpers, /DROP FUNCTION IF EXISTS public\.is_admin/);
  assert.match(helpers, /DROP FUNCTION IF EXISTS public\.current_user_role/);

  const storageMigration = read("migrations/20260709133100_harden_storage_private.sql");
  assert.match(storageMigration, /storage\.buckets/);
  assert.match(storageMigration, /public,\s*file_size_limit,\s*allowed_mime_types/);
  assert.match(storageMigration, /REVOKE ALL ON TABLE storage\.objects FROM anon, authenticated/);
  assert.match(storageMigration, /TO service_role/);
});

test("postgres runtime role stays least-privilege and RLS-bound", () => {
  const runtimeRole = read("migrations/20260709135632_create_app_runtime_role.sql");
  const runtimeRoleSql = runtimeRole.replace(/^--.*$/gm, "");
  assert.match(runtimeRole, /CREATE ROLE starlim_app/);
  assert.match(runtimeRole, /NOBYPASSRLS/);
  assert.match(runtimeRole, /ALTER ROLE starlim_app SET row_security TO on/);
  assert.match(runtimeRole, /GRANT CONNECT ON DATABASE/);
  assert.match(runtimeRole, /GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO starlim_app/);
  assert.match(runtimeRole, /GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO starlim_app/);
  assert.match(runtimeRole, /GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app_private TO starlim_app/);
  assert.match(runtimeRole, /ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public/);
  assert.match(runtimeRole, /profiles_starlim_app_identity_read/);
  assert.match(runtimeRole, /usuario_empresa_starlim_app_identity_read/);
  assert.match(runtimeRole, /empresas_starlim_app_identity_read/);
  assert.match(runtimeRole, /app_permissions_starlim_app_read/);
  assert.match(runtimeRole, /role_permissions_starlim_app_read/);
  assert.doesNotMatch(runtimeRoleSql, /WITH PASSWORD|PASSWORD '/);

  const routeAuth = read("apps/web/src/lib/route-auth.ts");
  assert.match(routeAuth, /queryWithCompanyContext<\{ allowed: number \}>/);
  assert.doesNotMatch(routeAuth, /getDbPool\(\)\.query/);

  const auth = read("apps/web/src/lib/auth.ts");
  assert.match(auth, /!user\.company_id \|\| !user\.company_name/);
  assert.doesNotMatch(auth, /company_id \?\? 1|companyName: user\.company_name \|\| "Starlim"/);

  const appPrivateAccess = read("migrations/20260709140925_restrict_app_private_runtime_access.sql");
  assert.match(appPrivateAccess, /REVOKE ALL ON SCHEMA app_private FROM anon, authenticated, PUBLIC/);
  assert.match(appPrivateAccess, /GRANT USAGE ON SCHEMA app_private TO starlim_app/);
  assert.match(appPrivateAccess, /REVOKE ALL ON FUNCTION %s FROM anon, authenticated, PUBLIC/);
  assert.match(appPrivateAccess, /GRANT EXECUTE ON FUNCTION %s TO starlim_app/);
  assert.match(appPrivateAccess, /ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app_private/);
});

test("request parsing, sessions and CI keep security guardrails", () => {
  const requestBody = read("apps/web/src/lib/request-body.ts");
  assert.match(requestBody, /DEFAULT_BODY_LIMIT_BYTES = 256 \* 1024/);
  assert.match(requestBody, /export function assertRequestSize/);
  assert.match(requestBody, /throw new ApiError\(413/);
  assert.match(requestBody, /Buffer\.byteLength\(raw, "utf8"\) > maxBytes/);

  const loginRoute = read("apps/web/src/app/api/auth/login/route.ts");
  assert.match(loginRoute, /LOGIN_BODY_LIMIT_BYTES = 16 \* 1024/);
  assert.match(loginRoute, /assertRequestSize\(request, LOGIN_BODY_LIMIT_BYTES/);
  assert.match(loginRoute, /Content-Type no soportado/);

  const imports = read("apps/web/src/lib/imports.ts");
  assert.match(imports, /assertRequestSize\(request, MAX_CSV_BYTES \+ 256 \* 1024, "El CSV"\)/);

  const receiptUpload = read("apps/web/src/app/api/purchases/[id]/receipt-photo/route.ts");
  assert.match(receiptUpload, /RECEIPT_UPLOAD_BODY_LIMIT_BYTES = 9 \* 1024 \* 1024/);
  assert.match(receiptUpload, /assertRequestSize\(request, RECEIPT_UPLOAD_BODY_LIMIT_BYTES, "La imagen"\)/);

  const sessionToken = read("apps/web/src/lib/session-token.ts");
  assert.match(sessionToken, /function isValidSessionShape/);
  assert.match(sessionToken, /UUID_PATTERN\.test/);
  assert.match(sessionToken, /companyId > 0/);
  assert.match(sessionToken, /priority: "high"/);

  const proxy = read("apps/web/src/proxy.ts");
  assert.match(proxy, /X-Request-Id/);
  assert.doesNotMatch(proxy, /api\/auth\/logout/);

  const nextConfig = read("apps/web/next.config.ts");
  assert.match(nextConfig, /proxyClientMaxBodySize: "10mb"/);

  const checkEnv = read("apps/web/scripts/check-env.mjs");
  assert.match(checkEnv, /SUPABASE_DB_USER must use the least-privilege starlim_app role/);
  assert.match(checkEnv, /url\.protocol !== "https:"/);

  const packageJson = read("apps/web/package.json");
  assert.match(packageJson, /"security:scan": "node scripts\/security-scan\.mjs"/);
  const securityScan = read("apps/web/scripts/security-scan.mjs");
  assert.match(securityScan, /git", \["ls-files", "--cached", "--others", "--exclude-standard"\]/);
  assert.match(securityScan, /sb_secret_/);
  assert.match(securityScan, /PRIVATE KEY/);

  const workflow = read(".github/workflows/security.yml");
  assert.match(workflow, /npm run security:scan/);
  assert.match(workflow, /npm audit signatures/);
  assert.match(workflow, /npm audit --omit=dev --audit-level=moderate/);
  assert.match(workflow, /npm run build/);
  assert.doesNotMatch(workflow, /github\/codeql-action/);
});

test("password recovery is visible, generic and backed by Supabase recovery tokens", () => {
  const loginPage = read("apps/web/src/app/login/page.tsx");
  const forgotPage = read("apps/web/src/app/forgot-password/page.tsx");
  const resetPage = read("apps/web/src/app/reset-password/reset-password-form.tsx");
  const recoveryRoute = read("apps/web/src/app/api/auth/password-recovery/route.ts");
  const auth = read("apps/web/src/lib/auth.ts");

  assert.match(loginPage, /href="\/forgot-password"/);
  assert.match(forgotPage, /action="\/api\/auth\/password-recovery"/);
  assert.match(forgotPage, /Si el correo está registrado/);
  assert.match(recoveryRoute, /PASSWORD_RECOVERY_BODY_LIMIT_BYTES = 8 \* 1024/);
  assert.match(recoveryRoute, /Si el correo esta registrado/);
  assert.doesNotMatch(recoveryRoute, /profiles|usuario_empresa/);
  assert.match(auth, /resetPasswordForEmail\(email, \{ redirectTo \}\)/);
  assert.match(auth, /flowType: "implicit"/);
  assert.match(resetPage, /window\.history\.replaceState/);
  assert.match(resetPage, /supabase\.auth[\s\S]*\.setSession/);
  assert.match(resetPage, /supabase\.auth\.updateUser\(\{ password \}\)/);
  assert.match(resetPage, /signOut\(\{ scope: "global" \}\)/);
  assert.match(resetPage, /MIN_PASSWORD_LENGTH = 8/);
});

test("catalog creation and stock operations stay on separate audited paths", () => {
  const productsPage = read("apps/web/src/app/products/page.tsx");
  const pricingPage = read("apps/web/src/app/pricing/page.tsx");
  const inventory = read("apps/web/src/lib/inventory.ts");
  const quoteMigration = read("supabase/migrations/20260722121546_quote_customers_vat_and_commercial_numbers.sql");
  assert.match(quoteMigration, /client_legal_name text not null default ''/);
  assert.match(quoteMigration, /vat_rate numeric\(4, 1\)/);
  assert.match(quoteMigration, /add column if not exists commercial_number bigint/);
  assert.match(quoteMigration, /P-' \|\| lpad/);
  assert.match(quoteMigration, /ux_sales_empresa_commercial_number_not_null/);
  assert.match(quoteMigration, /on public\.sales \(empresa_id, commercial_number\)/);
  assert.match(quoteMigration, /sales_commercial_number_check/);
  assert.match(quoteMigration, /quotes_customer_reference_check/);

  const orders = read("apps/web/src/lib/orders.ts");
  const quotes = read("apps/web/src/lib/quotes.ts");
  assert.match(orders, /MAX\(commercial_number\)/);
  assert.match(orders, /INSERT INTO sales \([\s\S]*sale_number, commercial_number/);
  assert.match(orders, /COALESCE\(lpad\(s\.commercial_number::text, GREATEST\(4, length\(s\.commercial_number::text\)\)/);
  assert.match(quotes, /MAX\(commercial_number\)/);
  assert.match(quotes, /INSERT INTO sales \([\s\S]*sale_number, commercial_number/);

  const catalogManagement = read("apps/web/src/lib/catalog-management.ts");

  assert.doesNotMatch(productsPage, /createProductAction|Crear producto|Stock inicial/);
  assert.match(pricingPage, /Nuevo producto/);
  assert.match(pricingPage, /La existencia se administra por separado/);
  assert.match(inventory, /INSERT INTO stock_movements/);
  assert.match(inventory, /idempotency_key/);
  assert.match(catalogManagement, /se modifica desde Entradas y salidas/);
});

test("stock exposes separate modification and information windows", () => {
  const stockPage = read("apps/web/src/app/stock/page.tsx");
  const stockWorkspace = read("apps/web/src/app/stock/stock-product-workspace.tsx");
  const stockAdjustmentDialog = read("apps/web/src/app/stock/stock-adjustment-dialog.tsx");
  const stockMovementForm = read("apps/web/src/app/stock/stock-movement-form.tsx");
  const productsPage = read("apps/web/src/app/products/page.tsx");
  const priceDetails = read("apps/web/src/app/products/product-price-details.tsx");
  const catalog = read("apps/web/src/lib/catalog.ts");
  const inventory = read("apps/web/src/lib/inventory.ts");

  assert.match(stockPage, /Modificación de producto/);
  assert.doesNotMatch(stockPage, /ButtonLink/);
  assert.match(stockWorkspace, /Modificar stock/);
  assert.match(stockWorkspace, /Ver detalle/);
  assert.match(stockWorkspace, /Proveedor/);
  assert.match(stockWorkspace, /compactOptions/);
  assert.match(stockWorkspace, /Card className="overflow-visible"/);
  assert.match(stockWorkspace, /aria-label="Acción del producto"/);
  assert.match(stockWorkspace, /aria-haspopup="dialog"/);
  assert.match(stockWorkspace, /setDialogOpen\(canEdit && Boolean\(nextProductId\)\)/);
  assert.match(stockWorkspace, /lg:grid-cols-2/);
  assert.match(stockWorkspace, /Disponible al elegir un producto/);
  assert.doesNotMatch(stockWorkspace, /Seleccionar una opción|<Select/);
  assert.doesNotMatch(stockWorkspace, /description: `\$\{product\.code/);
  assert.match(stockAdjustmentDialog, /aria-modal="true"/);
  assert.match(stockAdjustmentDialog, /role="dialog"/);
  assert.match(stockAdjustmentDialog, /event\.key === "Escape"/);
  assert.match(stockAdjustmentDialog, /quantityInput\.select\(\)/);
  assert.match(stockMovementForm, /Agregar/);
  assert.match(stockMovementForm, /Quitar/);
  assert.match(stockMovementForm, /Corregir total/);
  assert.match(stockMovementForm, /Nuevo stock final/);
  assert.match(stockMovementForm, /Restar una unidad/);
  assert.match(stockMovementForm, /Sumar una unidad/);
  assert.match(stockMovementForm, /focus-within:border-\[color:var\(--border-strong\)\]/);
  assert.match(stockMovementForm, /focus-visible:outline-none/);
  assert.match(stockMovementForm, /style=\{\{ boxShadow: "none", outline: "none" \}\}/);
  assert.doesNotMatch(stockMovementForm, /focus:border-\[color:var\(--accent\)\]/);
  assert.match(stockMovementForm, /<fieldset[\s\S]*<legend[^>]*>Tipo de ajuste<\/legend>/);
  assert.match(stockMovementForm, /aria-pressed=\{mode === stockMode\.value\}/);
  assert.match(stockMovementForm, /grid-cols-3/);
  assert.match(stockMovementForm, /sm:grid-cols-2/);
  assert.match(stockMovementForm, /className="w-full" disabled=/);
  assert.match(stockMovementForm, /Number\.isInteger\(parsedQuantity\)/);
  assert.match(stockMovementForm, /step="1"/);
  assert.doesNotMatch(stockMovementForm, /0\.001|step="0\.001"|inputMode="decimal"/);
  assert.match(stockMovementForm, /Motivo del ajuste/);
  assert.match(stockMovementForm, /Observaciones/);
  assert.match(stockMovementForm, /maxLength=\{300\}/);
  assert.match(stockMovementForm, /className="content-start"/);
  assert.doesNotMatch(stockMovementForm, /Seleccionar una opción/);
  assert.doesNotMatch(`${stockAdjustmentDialog}\n${stockMovementForm}`, /precio actual|nuevo precio|actualizar precio/i);
  assert.match(inventory, /Number\.isInteger\(quantity\)/);
  assert.match(inventory, /La cantidad debe ser un numero entero/);
  assert.match(read("apps/web/src/lib/stock-import.ts"), /la cantidad debe ser un numero entero/);
  assert.match(productsPage, /Información de stock/);
  assert.doesNotMatch(productsPage, /href="\/stock(?:\?|\")/);
  assert.match(productsPage, /Cantidad/);
  assert.match(priceDetails, /Ganancia/);
  assert.match(priceDetails, /% sobre costo/);
  assert.match(catalog, /jsonb_agg/);
  assert.match(catalog, /margenes_listas/);
  assert.doesNotMatch(inventory, /p\.description/);
});

test("operational record deletion is restricted to explicitly granted profiles", () => {
  const routeAuth = read("apps/web/src/lib/route-auth.ts");
  assert.match(routeAuth, /OPERATIONAL_RECORDS_DELETE_PERMISSION/);
  assert.match(routeAuth, /ap\.sensitive = TRUE/);
  assert.match(routeAuth, /sessionCanDeleteOperationalRecords/);
  assert.match(routeAuth, /requireOperationalRecordDeletePermission/);
  assert.match(routeAuth, /permiso sensible registros\.borrar/);
  assert.doesNotMatch(routeAuth, /Tomi Laserna|Augusto Finocchietti/);

  const purchases = read("apps/web/src/lib/purchases.ts");
  assert.match(purchases, /export async function deletePurchase\(session: AuthSession/);
  assert.match(purchases, /withCompanyContext\(session\.companyId/);
  assert.match(purchases, /purchase\.deleted/);
  assert.match(purchases, /pago conciliado y no puede borrarse/);

  const purchaseApi = read("apps/web/src/app/api/purchases/[id]/route.ts");
  const purchaseDeleteRoute = purchaseApi.slice(purchaseApi.indexOf("export async function DELETE"));
  assert.match(purchaseDeleteRoute, /const session = await requireApiSession\(\);/);
  assert.doesNotMatch(purchaseDeleteRoute, /resource: "compras", action: "cancelar"/);

  const sales = read("apps/web/src/lib/sales-admin.ts");
  assert.match(sales, /export async function deleteSale\(session: AuthSession/);
  assert.match(sales, /withCompanyContext\(session\.companyId/);
  assert.match(sales, /comprobante fiscal autorizado y no puede borrarse/);
  assert.match(sales, /cobro conciliado y no puede borrarse/);
  assert.match(sales, /sale\.deleted/);

  for (const path of ["apps/web/src/app/sales/page.tsx", "apps/web/src/app/purchases/page.tsx"]) {
    const page = read(path);
    assert.match(page, /ConfirmDeleteButton/);
    assert.match(page, /canDeleteRecords/);
  }

  const ordersPage = read("apps/web/src/app/orders/page.tsx");
  assert.doesNotMatch(ordersPage, /ConfirmDeleteButton|canDeleteRecords|Borrar pedido/);

  const salesActions = read("apps/web/src/app/sales/actions.ts");
  assert.match(salesActions, /deleteSaleAction[\s\S]*error instanceof ApiError/);
  assert.match(salesActions, /\/sales\?error=1&message=/);
  assert.match(read("apps/web/src/app/sales/page.tsx"), /No se pudo borrar la venta/);

  const purchaseActions = read("apps/web/src/app/purchases/actions.ts");
  assert.match(purchaseActions, /deletePurchaseAction[\s\S]*error instanceof ApiError/);
  assert.match(purchaseActions, /\/purchases\?error=1&message=/);
  assert.match(read("apps/web/src/app/purchases/page.tsx"), /No se pudo borrar la compra/);

  const confirmDelete = read("apps/web/src/components/confirm-delete-button.tsx");
  assert.match(confirmDelete, /useFormStatus/);
  assert.match(confirmDelete, /isLoading=\{isLoading \|\| pending\}/);

  const db = read("apps/web/src/lib/db.ts");
  assert.match(db, /await originalQuery\("BEGIN"\)/);
  assert.match(db, /await originalQuery\("COMMIT"\)/);
  assert.match(db, /await originalQuery\("ROLLBACK"\)/);
  assert.equal(existsSync(join(repoRoot, "docs/operational-record-deletion.md")), true);
});

test("order forms preserve client state when a server validation fails", () => {
  const form = read("apps/web/src/app/orders/order-entry-form.tsx");
  const createAction = read("apps/web/src/app/orders/new/actions.ts");
  const editAction = read("apps/web/src/app/orders/[id]/edit/actions.ts");
  const fields = read("apps/web/src/app/orders/new/order-entry-fields.tsx");
  const newPage = read("apps/web/src/app/orders/new/page.tsx");
  const editPage = read("apps/web/src/app/orders/[id]/edit/page.tsx");

  assert.match(form, /useActionState/);
  assert.match(form, /role="alert"/);
  assert.match(createAction, /return \{ error: error\.message\.slice\(0, 500\) \}/);
  assert.match(editAction, /return \{ error: error\.message\.slice\(0, 500\) \}/);
  assert.doesNotMatch(createAction, /\/orders\/new\?status=error/);
  assert.doesNotMatch(editAction, /\?status=error&message=/);
  assert.match(newPage, /<OrderEntryForm/);
  assert.match(editPage, /<OrderEntryForm/);
  assert.match(fields, /useFormStatus/);
  assert.match(fields, /loadingLabel="Guardando pedido"/);
});

test("product availability reserves only confirmed orders whose stock was not discounted", () => {
  const catalog = read("apps/web/src/lib/catalog.ts");
  const orderStatus = read("apps/web/src/lib/order-status.ts");

  assert.match(orderStatus, /export function saleReservesStockSql/);
  assert.match(orderStatus, /normalizedOrderStatusSql\(alias\)/);
  assert.match(orderStatus, /COALESCE\(\$\{alias\}\.stock_discounted, false\) = false/);
  assert.match(catalog, /\$\{saleReservesStockSql\("sale"\)\}/);
  assert.match(
    catalog,
    /\(COALESCE\(stock\.stock_real, 0\) - COALESCE\(reserved\.reserved, 0\)\)::text AS available/,
  );
  assert.doesNotMatch(catalog, /0::text AS reserved/);
});

test("project flow diagram stays aligned with active ERP flows and smoke coverage", () => {
  const diagram = read("docs/project-flow.md");
  assert.ok((diagram.match(/```mermaid/g) ?? []).length >= 8);
  assert.match(diagram, /Arquitectura general/);
  assert.match(diagram, /Flujo de autenticacion y autorizacion/);
  assert.match(diagram, /Flujo operativo comercial/);
  assert.match(diagram, /Flujo operativo de compras, stock y pagos proveedor/);
  assert.match(diagram, /Flujo de datos multiempresa/);
  assert.match(diagram, /Flujo de APIs privadas/);
  assert.match(diagram, /mensajes, tareas y seguimiento/);

  const sourceByLabel = {
    "auth.ts": "apps/web/src/lib/auth.ts",
    "session-token.ts": "apps/web/src/lib/session-token.ts",
    "proxy.ts": "apps/web/src/proxy.ts",
    "navigation.ts": "apps/web/src/lib/navigation.ts",
    "route-auth.ts": "apps/web/src/lib/route-auth.ts",
    "db.ts": "apps/web/src/lib/db.ts",
    "orders": "apps/web/src/lib/orders.ts",
    "quotes": "apps/web/src/lib/quotes.ts",
    "purchases": "apps/web/src/lib/purchases.ts",
    "collections": "apps/web/src/lib/collections.ts",
    "messages": "apps/web/src/lib/messages.ts",
    "storage.ts": "apps/web/src/lib/storage.ts",
  };

  for (const [label, path] of Object.entries(sourceByLabel)) {
    assert.equal(existsSync(join(repoRoot, path)), true, `${label} source file is missing`);
    assert.match(diagram, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${label} missing from diagram`);
  }

  for (const table of [
    "profiles",
    "usuario_empresa",
    "empresas",
    "clients",
    "products",
    "quotes",
    "quote_items",
    "sales",
    "sale_items",
    "purchases",
    "purchase_items",
    "payments",
    "current_account_movements",
    "stock_movements",
    "mensajes",
    "recordatorios",
    "tareas_asignadas",
  ]) {
    assert.match(diagram, new RegExp(`\\b${table}\\b`), `${table} missing from flow diagram`);
  }

  const smoke = read("apps/web/scripts/smoke.mjs");
  for (const endpoint of [
    "/api/health",
    "/api/auth/me",
    "/api/admin/metrics",
    "/api/orders?pageSize=1",
    "/api/quotes?status=pendiente",
    "/api/customers?pageSize=1",
    "/api/products?pageSize=1",
    "/api/suppliers",
    "/api/pricing/price-lists",
    "/api/purchases",
    "/api/admin/accounts-payable",
    "/api/collections/pending",
    "/api/admin/cashflow",
    "/api/messages",
    "/api/tasks",
    "/api/customers/follow-up",
  ]) {
    assert.match(smoke, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${endpoint} missing from smoke flow coverage`);
  }

  assert.match(smoke, /STARLIM_SMOKE_MAX_LATENCY_MS/);
  assert.match(smoke, /admin read smoke covers every documented project flow within latency budgets/);
});

test("local products preview is development-only and isolated from real data", () => {
  const previewPage = read("apps/web/src/app/preview/products/page.tsx");
  const previewClient = read("apps/web/src/app/preview/products/products-preview.tsx");

  assert.match(previewPage, /process\.env\.NODE_ENV !== "development"/);
  assert.match(previewPage, /notFound\(\)/);
  assert.match(previewPage, /force-dynamic/);
  assert.match(previewPage, /index: false/);
  assert.match(previewClient, /Datos ficticios/);
  assert.match(previewClient, /SAMPLE_PRODUCTS/);
  assert.doesNotMatch(previewClient, /@\/lib\/(?:auth|catalog|db|inventory|stock)/);
  assert.doesNotMatch(previewClient, /\/api\//);
  assert.doesNotMatch(previewClient, /<form|action=/);
});

test("new messages show a floating preview from every authenticated page", () => {
  const notifications = read("apps/web/src/components/message-notifications.tsx");
  const modulePage = read("apps/web/src/components/module-page.tsx");
  const navigation = read("apps/web/src/lib/navigation.ts");
  const shellNavigation = read("apps/web/src/components/shell-navigation.tsx");
  const indicatorsProvider = read("apps/web/src/components/navigation-indicators-provider.tsx");

  assert.match(modulePage, /initialUnread=\{0\}/);
  assert.match(modulePage, /initialRevision=""/);
  assert.match(navigation, /sessionAllowedPermissionKeys\(session, collectRequiredNavigationPermissions\(\)\)/);
  assert.doesNotMatch(modulePage, /getMessageNotificationPreview\(session\)/);
  assert.match(notifications, /fetch\("\/api\/messages\?mode=revision"/);
  assert.match(notifications, /MESSAGE_NOTIFICATION_INTERVAL_MS = 3_000/);
  assert.match(notifications, /fixed bottom-5 right-5 z-50/);
  assert.match(notifications, /group-hover:opacity-100/);
  assert.match(notifications, /latestMessage\.from/);
  assert.match(notifications, /initialLatestMessage/);
  assert.match(notifications, /useRef\(initialRevision\)/);
  assert.match(notifications, /void refreshWhenChanged\(controller\.signal\)/);
  assert.match(notifications, /href="\/messages"/);
  assert.match(shellNavigation, /router\.prefetch\(item\.href\)/);
  assert.match(shellNavigation, /router\.prefetch\(group\.href!\)/);
  assert.match(indicatorsProvider, /fetch\("\/api\/navigation\/indicators"/);
  assert.match(indicatorsProvider, /NAVIGATION_INDICATORS_INTERVAL_MS = 20_000/);
  assert.match(modulePage, /<NavigationIndicatorsProvider initialIndicators=\{indicators\}>/);
  assert.equal(existsSync(join(repoRoot, "apps/web/src/app/api/navigation/indicators/route.ts")), true);
});
