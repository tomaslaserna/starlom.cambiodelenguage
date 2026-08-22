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

test("product images live on their own catalog path with a bucket-scoped public URL", () => {
  const storage = read("apps/web/src/lib/storage.ts");
  assert.match(storage, /PRODUCT_IMAGES_BUCKET = "product-images"/);
  assert.match(storage, /export function publicProductImageUrl/);

  const imageStore = read("apps/web/src/lib/product-image-store.ts");
  assert.match(imageStore, /PRODUCT_IMAGES_BUCKET/);

  const imageSignRoute = read("apps/web/src/app/api/products/image/sign/route.ts");
  assert.match(imageSignRoute, /requireApiSession/);

  const imageRoute = read("apps/web/src/app/api/products/[id]/image/route.ts");
  assert.match(imageRoute, /requireApiSession/);

  const imports = read("apps/web/src/lib/imports.ts");
  assert.match(imports, /image_path/, "catalog creation must persist the uploaded image path");
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
  assert.match(collectionsPage, /grid justify-items-start gap-1\.5/);
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
  assert.match(orders, /hasConsistentOrderVatSnapshot/);
  assert.doesNotMatch(orders, /confirmationDocument|normalizeOrderConfirmationDocument/);
  assert.match(orders, /comprobante: order\.desired_document/);
  assert.match(orders, /nextStatus === "entregado" \? "pendiente"/);
  assert.match(orders, /"pedido\.confirmado_stock"/);
  assert.match(orders, /stock_pendiente_impresion/);
  assert.match(orders, /cobro_habilitado/);

  const editPage = read("apps/web/src/app/orders/[id]/edit/page.tsx");
  assert.match(editPage, /OrderEntryFields/);
  assert.match(editPage, /initialValue/);
  assert.match(editPage, /order\.orderStatus !== "cargado" && order\.orderStatus !== "confirmado"/);
  assert.match(editPage, /order\.orderStatus === "confirmado"/);
  assert.match(editPage, /query\.status === "error"/);
  assert.match(editPage, /excludeReservedSaleId: id/);
  assert.match(editPage, /offersEnabled=\{breakEven\.reached\}/);
  assert.match(editPage, /submitLabel="Guardar cambios"/);

  const editActions = read("apps/web/src/app/orders/[id]/edit/actions.ts");
  assert.match(editActions, /updateBasicOrder/);
  assert.match(editActions, /redirect\("\/orders\?status=cargado"\)/);
  assert.match(editActions, /error instanceof ApiError/);
  assert.match(editActions, /status=error&message=/);

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
  assert.match(orderActions, /\/orders\/new\?status=error&message=/);
  assert.doesNotMatch(orderActions, /resource: "ventas", action: "crear"/);

  const orderStatusActions = read("apps/web/src/app/orders/actions.ts");
  assert.match(orderStatusActions, /error instanceof ApiError/);
  assert.match(orderStatusActions, /\/orders\?error=1&message=/);
  assert.match(orderStatusActions, /deleteOrderAction[\s\S]*error instanceof ApiError/);
  assert.match(orderStatusActions, /revalidateOrderFlow/);

  const newOrderPage = read("apps/web/src/app/orders/new/page.tsx");
  assert.match(newOrderPage, /active="orders"/);
  assert.match(newOrderPage, /params\.status === "error"/);
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
  assert.match(orderStatusPage, />\s*Remito sin precios\s*</);
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
  assert.match(
    navigation,
    /label: "Administracion"[\s\S]*groupByLabel\("Balance"\)[\s\S]*groupByLabel\("RR\.HH"\)/,
    "Balance must live under the Administracion menu section",
  );
  assert.doesNotMatch(
    navigation,
    /label: "Finanzas"[\s\S]*groupByLabel\("Balance"\)/,
    "Balance must no longer be listed under Finanzas",
  );
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
  assert.match(purchasesPage, /PurchaseEntryFields[\s\S]*?products=\{products\}[\s\S]*?suppliers=\{suppliers\}/);
  assert.match(purchasesPage, /purchaseViews[\s\S]*registro/);
  assert.match(purchasesPage, /redirect\("\/admin\/approvals"\)/);
  assert.match(purchasesPage, /<details className="rounded-\[8px\][\s\S]*Acciones[\s\S]*OC PDF[\s\S]*Devol\./);
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
  assert.match(replenishmentPage, /Mandar a nueva compra/);
  assert.match(replenishmentPage, /\/purchases\?view=nueva&mrpSupplier=/);
  assert.match(replenishmentPage, /createReplenishmentPurchaseRequestAction/);
  assert.match(
    read("apps/web/src/app/purchases/replenishment/actions.ts"),
    /export async function createReplenishmentPurchaseRequestAction/,
  );

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
  assert.match(ordersPage, /Remito sin precios/);
  assert.match(ordersPage, /\/api\/pdfs\/orders\/\$\{order\.id\}\/document/);
  assert.match(ordersPage, /Modificar/);
  assert.match(ordersPage, /value="entregado"/);
  assert.match(ordersPage, /value="cancelado"/);
  // El registro ofrece un link de impresión "Factura" (gateado por datos fiscales), pero
  // no los viejos controles inline de confirmación de comprobante.
  assert.doesNotMatch(ordersPage, /Remito sin factura|name="confirmationDocument"/);
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

test("future orders use the registered receipt as a suggestion and allow an explicit invoice or remito", () => {
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
  assert.match(receiptTypes, /export function saleOrderDocument/);
  assert.match(receiptTypes, /export function saleVatRateForDocument/);

  const orders = read("apps/web/src/lib/orders.ts");
  assert.match(orders, /habitualDocument = saleOrderDocument\(customer\.receipt_type\)/);
  assert.match(orders, /requestedDocument === "factura"/);
  assert.match(orders, /invoiceSaleOrderDocument/);
  assert.match(orders, /saleVatRateForDocument\(desiredDocument\)/);
  assert.match(orders, /INSERT INTO sale_items/);

  const orderEntryFields = read("apps/web/src/app/orders/new/order-entry-fields.tsx");
  assert.match(orderEntryFields, /name="productsJson"/);
  assert.match(orderEntryFields, /name="priceListOverride"/);
  assert.match(orderEntryFields, /name="requestedDocument"/);
  assert.match(orderEntryFields, /Comprobante de este pedido/);
  assert.doesNotMatch(orderEntryFields, /name="desiredDocumentOverride"|name="vatRate"/);
  assert.match(orderEntryFields, /saleVatRateForDocument/);
  assert.match(orderEntryFields, /priceForList/);
  assert.match(orderEntryFields, /priceLists/);
  assert.match(orderEntryFields, /Precio neto: \$\{formatCurrency\(priceForList\(product\.prices, activePriceList\)\)\}/);
  assert.doesNotMatch(orderEntryFields, /if \(!product \|\| !selectedClient\) return null/);
  assert.doesNotMatch(orderEntryFields, /draftProduct && selectedClient \? priceForList/);
  assert.match(orderEntryFields, /El producto no tiene precio para la lista/);
  assert.doesNotMatch(orderEntryFields, /PRECIO 1/);

  assert.match(orders, /priceListOverride/);
  assert.doesNotMatch(orders, /desiredDocumentOverride/);

  const quoteEntryFields = read("apps/web/src/app/quotes/quote-entry-fields.tsx");
  assert.match(quoteEntryFields, /name="customerId"/);
  assert.doesNotMatch(quoteEntryFields, /Cliente ocasional|name="customerName"/);
  assert.match(quoteEntryFields, /name="productsJson"/);
  assert.match(quoteEntryFields, /priceForList/);
  assert.match(quoteEntryFields, /priceLists/);
  assert.doesNotMatch(quoteEntryFields, /PRECIO 1/);
  assert.doesNotMatch(quoteEntryFields, /name="vatRate"|name="includeVat"/);
  assert.match(quoteEntryFields, /saleVatRateForDocument/);
  assert.doesNotMatch(quoteEntryFields, /window\.open/);

  const quotes = read("apps/web/src/lib/quotes.ts");
  assert.match(quotes, /resolveQuoteProductsFromCatalog/);
  assert.match(quotes, /dynamicPriceSqlExpression/);
  assert.match(quotes, /price_list_name/);
  assert.match(quotes, /client_legal_name/);
  assert.match(quotes, /vatAmountsFromNet/);
  assert.match(quotes, /Selecciona un cliente registrado/);
  assert.doesNotMatch(quotes, /if \(!clientId\)[\s\S]*INSERT INTO clients/);
});

test("price lists and sale items stay net while orders and quotes store final VAT totals", () => {
  const orderEntryFields = read("apps/web/src/app/orders/new/order-entry-fields.tsx");
  assert.doesNotMatch(orderEntryFields, /receiptAddsVat|name="includeVat"|name="vatRate"/);
  assert.match(orderEntryFields, /Subtotal neto/);
  assert.match(orderEntryFields, /Total final/);
  assert.match(orderEntryFields, /vatAmountsFromNet/);

  const quoteEntryFields = read("apps/web/src/app/quotes/quote-entry-fields.tsx");
  assert.doesNotMatch(quoteEntryFields, /name="includeVat"|name="vatRate"/);
  assert.match(quoteEntryFields, /vatAmountsFromNet/);
  assert.match(quoteEntryFields, /IVA \$\{String\(vatRate/);
  assert.match(quoteEntryFields, /Subtotal neto/);

  const quotesPage = read("apps/web/src/app/quotes/page.tsx");
  assert.doesNotMatch(quotesPage, /DataTableHead[^>]*>IVA/);
  assert.doesNotMatch(quotesPage, /quote\.vatAmount/);
  assert.doesNotMatch(quotesPage, /quote\.subtotal/);
  assert.match(quotesPage, /quote\.quoteNumber/);
  assert.doesNotMatch(quotesPage, />#\{quote\.id\}</);
  assert.doesNotMatch(quotesPage, /DataTableHead[^>]*>Subtotal/);
  const orders = read("apps/web/src/lib/orders.ts");
  assert.doesNotMatch(orders, /receiptAddsVat|money\(netAmount \* 0\.21\)|money\(subtotal \* 0\.21\)/);
  assert.match(orders, /SUM\(si\.total_amount\)/);
  assert.match(orders, /calculateOrderTotals/);
  assert.match(orders, /normalizeStoredVatRate/);

  const quotes = read("apps/web/src/lib/quotes.ts");
  assert.doesNotMatch(quotes, /booleanValue\(body\.includeVat/);
  assert.match(quotes, /vatAmountsFromNet/);
  assert.match(quotes, /vat_rate/);

  const receiptTypes = read("apps/web/src/lib/receipt-types.ts");
  assert.doesNotMatch(receiptTypes, /receiptAddsVat/);

  const pdfDocuments = read("apps/web/src/lib/pdf/documents.ts");
  assert.match(pdfDocuments, /quote\.includeVat/);
  assert.match(pdfDocuments, /quote\.vatAmount/);
  assert.match(pdfDocuments, /quote\.quoteNumber/);
  assert.match(pdfDocuments, /quote\.vatRate/);

  const pricesPage = read("apps/web/src/app/prices/page.tsx");
  assert.match(pricesPage, /precios netos, sin IVA/);
  assert.match(pricesPage, /Sumar IVA 10,5%/);
  assert.match(pricesPage, /Sumar IVA 21%/);
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

  // La ruta /pricing quedó como redirección al submenú /prices; el ancla L2 se
  // garantiza arriba en order-pricing.ts (DEFAULT_PRICE_LIST_NAME / PRICE_LIST_DEFAULT).

  const productPricingSql = read("apps/web/src/lib/product-pricing-sql.ts");
  assert.doesNotMatch(productPricingSql, /NULLIF\(\$\{selectedMarginAlias\}\.multiplicador, 1\)/);
  assert.match(productPricingSql, /COALESCE\(\$\{selectedMarginAlias\}\.multiplicador, 0\)/);
  assert.doesNotMatch(productPricingSql, /precio_3, 1\) \* 1\.10/);
  assert.match(productPricingSql, /case "4":[\s\S]*m\.margen_minorista/);

  const quotes = read("apps/web/src/lib/quotes.ts");
  assert.match(quotes, /value === 2\) return "L2 - ANCLA"/);
  assert.match(quotes, /value === 5\) return "Minorista"/);

  const pdfDocuments = read("apps/web/src/lib/pdf/documents.ts");
  // El PDF de listas ahora toma los nombres desde la tabla listas_precio (que pricing.ts
  // siembra con L0-L3), en vez de hardcodearlos. La vieja "Lista 4 (+10%)" no debe reaparecer.
  assert.match(pdfDocuments, /export async function buildPriceListPdf/);
  assert.match(pdfDocuments, /FROM listas_precio WHERE empresa_id/);
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
  // El inbox del Escritorio se organiza en pestañas (Para vos / Delegadas / Mensajes / Pizarrón).
  assert.match(home, /InicioTabs/);
  assert.match(home, /label: "Delegadas"/);
  assert.match(home, /label: "Mensajes"/);
  assert.match(home, /Delegada a \$\{task\.assignedTo\}/);
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
  const saleRowActions = read("apps/web/src/app/sales/sale-row-actions.tsx");

  assert.doesNotMatch(home, /eyebrow="Inicio"/);
  assert.match(home, /formatDateTime\(task\.deadline\)/);
  assert.match(calendar, /formatDateTime\(task\.deadline\)/);
  assert.doesNotMatch(calendar, /min-w-\[820px\]/);
  assert.match(format, /export function formatDateTime/);
  assert.match(format, /America\/Argentina\/Buenos_Aires/);

  assert.match(modulePage, /flex h-10 max-w-\[360px\] items-center/);
  assert.match(modulePage, /<LogoutButton className="h-10 min-h-10 px-4"/);
  assert.match(presence, /flex h-10 items-center/);
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

  assert.match(ordersPage, /TableActionMenu/);
  assert.ok((ordersPage.match(/min-w-28 font-extrabold/g) ?? []).length >= 2);
  assert.match(ordersPage, /SearchInput/);
  assert.match(ordersPage, /leadingIcon=\{<AppIcon name="filter" \/>\}/);
  assert.doesNotMatch(salesPage, /DataTableHead[^>]*>Comprobante<\/DataTableHead>/);
  assert.doesNotMatch(salesPage, /DataTableCell align="center"[\s\S]*Ver PDF/);
  assert.match(saleRowActions, /TableActionMenu[\s\S]*Ver PDF/);
  assert.match(salesPage, /<TrashIcon \/>/);
  assert.match(salesPage, /h-10 min-h-10 w-10 min-w-10 p-0/);
  assert.match(salesPage, /height="20"[\s\S]*width="20"/);
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
  assert.match(messages, /listMessageAttachments/);
  assert.match(messages, /attachPreparedMessageUploads/);
  assert.match(messages, /AND \(\$3::bigint IS NULL OR id = \$3\)/);
  assert.match(messages, /export async function markConversationRead/);
  assert.match(messages, /export async function getMessageCenterRevision/);
  assert.ok((messages.match(/\{ cache: false \}/g) ?? []).length >= 4);
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
  assert.match(migration, /mensaje_cargas_starlim_app_tenant/);
  assert.match(migration, /mensaje_adjuntos_starlim_app_tenant/);
  assert.ok((migration.match(/current_setting\('app\.current_empresa_id', true\)/g) ?? []).length >= 4);
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
  assert.match(dataTable, /\[&>tr\]:h-11/);
  assert.match(dataTable, /\[&>tr\]:h-\[58px\]/);
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
  assert.match(fiscal, /AS item_count/);
  assert.match(fiscal, /sale\.itemCount <= 0/);
  assert.match(fiscal, /La venta no tiene detalle de productos/);
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
  assert.match(billingPage, /<TableActionMenu>[\s\S]*Factura PDF[\s\S]*Nota credito[\s\S]*Nota debito/);
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
  assert.match(fiscalIntegrityMigration, /WHERE s\.empresa_id = 1/);
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

test("cargar pedido exposes price message toggle with iva in the confirmation panel", () => {
  const fields = read("apps/web/src/app/orders/new/order-entry-fields.tsx");
  assert.match(fields, /pricedLines/);

  const preview = read("apps/web/src/app/orders/new/order-confirmation-preview.tsx");
  assert.match(preview, /Mostrar precios/);
  assert.match(preview, /showPrices/);
  assert.match(preview, /ivaRate/);
  assert.match(preview, /Comprobante e IVA derivados del cliente/);
  assert.match(preview, /desiredDocumentLabel/);
  assert.doesNotMatch(preview, /¿Lleva factura\?|onIvaRateChange/);
  assert.doesNotMatch(preview, /Sin IVA/);
});

test("the sale VAT rate is displayed from the client document and cannot be picked manually", () => {
  const preview = read("apps/web/src/app/orders/new/order-confirmation-preview.tsx");
  assert.match(preview, /desiredDocument/);
  assert.match(preview, /ivaRate/);
  assert.doesNotMatch(preview, /confirmation-iva|onIvaRateChange|value="21"|value="10.5"/);
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
  // Los recibos siguen siendo privados: la única URL pública permitida es la del
  // bucket de imágenes de producto (miniaturas de catálogo, no sensibles).
  assert.doesNotMatch(storage, /\/storage\/v1\/object\/public\/(?!\$\{PRODUCT_IMAGES_BUCKET\})/);
  assert.match(storage, /storage\/v1\/object\/public\/\$\{PRODUCT_IMAGES_BUCKET\}/);

  const purchases = read("apps/web/src/lib/purchases.ts");
  assert.match(purchases, /storageDownloadUrl\(row\.receipt_photo\)/);

  const storageRoute = read("apps/web/src/app/api/storage/[bucket]/[...path]/route.ts");
  assert.match(storageRoute, /requireApiSession/);
  assert.match(storageRoute, /assertCompanyStoragePath/);
  assert.match(storageRoute, /createSignedStorageUrl/);
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
  assert.match(workflow, /security-events: write/);
  assert.match(workflow, /github\/codeql-action\/init@v3/);
  assert.match(workflow, /npm run security:scan/);
  assert.match(workflow, /npm audit signatures/);
});

test("Precios menu opens a real per-product sale-price screen, not the stock catalog", () => {
  const navigation = read("apps/web/src/lib/navigation.ts");
  assert.match(
    navigation,
    /label: "Precios",\s*active: "prices",\s*items: \[\s*\{ href: "\/prices", label: "Lista de precios"/,
    "the Precios menu group must open /prices",
  );
  assert.doesNotMatch(navigation, /href: "\/products", label: "Precios"/, "Precios must no longer point at the stock catalog");

  const catalog = read("apps/web/src/lib/catalog.ts");
  assert.match(catalog, /export async function listSalePrices/);
  assert.match(catalog, /listas_precio/, "sale prices must be computed over the active price lists");
  assert.match(catalog, /margenes_listas/, "sale prices must use the per-list margin multipliers");

  const pricesPage = read("apps/web/src/app/prices/page.tsx");
  assert.match(pricesPage, /listSalePrices/);
  assert.match(pricesPage, /lists\.map\(\(list\)/, "the screen must render one column per active price list");
});

test("Sueldos y dividendos page allows adding employees and partners", () => {
  const finance = read("apps/web/src/lib/finance.ts");
  assert.match(finance, /export async function createSalaryPlan/);
  assert.match(finance, /export async function createPartner/);
  assert.match(finance, /INSERT INTO admin_sueldos_config/);
  assert.match(finance, /INSERT INTO admin_socios/);

  const actions = read("apps/web/src/app/balance/remunerations/actions.ts");
  assert.match(actions, /createSalaryPlanAction/);
  assert.match(actions, /createPartnerAction/);
  assert.match(actions, /ADMIN_SALARIES_WRITE_PERMISSION/);
  assert.match(actions, /ADMIN_DIVIDENDS_WRITE_PERMISSION/);

  const page = read("apps/web/src/app/balance/remunerations/page.tsx");
  assert.match(page, /createSalaryPlanAction/);
  assert.match(page, /createPartnerAction/);
  assert.match(page, /listEmployees/);
  assert.match(page, /name="employeeId"/);
  assert.match(page, /name="share"/);
});

test("Caja records manual movements and reflects payments and approved purchases", () => {
  const finance = read("apps/web/src/lib/finance.ts");
  assert.match(finance, /export async function createCashMovement/);
  assert.match(finance, /export async function getCashMovements/);
  assert.match(finance, /manual_cash_movements/, "manual cash movements must feed the treasury balance");
  assert.match(finance, /caja_entrada/);

  const cashActions = read("apps/web/src/app/cash/actions.ts");
  assert.match(cashActions, /createCashMovementAction/);
  assert.match(cashActions, /ADMIN_TREASURY_WRITE_PERMISSION/);

  const cashPage = read("apps/web/src/app/cash/page.tsx");
  assert.match(cashPage, /createCashMovementAction/);
  assert.match(cashPage, /getCashMovements/);
  assert.match(cashPage, /name="direction"/);

  const approvals = read("apps/web/src/lib/approvals.ts");
  assert.match(approvals, /compra_aprobada/, "approving a purchase must leave an informational cash entry");
});

test("Auditoria screen surfaces the operational audit log", () => {
  const audit = read("apps/web/src/lib/audit.ts");
  assert.match(audit, /export async function listAuditLog/);
  assert.match(audit, /FROM audit_log/);
  assert.match(audit, /LEFT JOIN profiles/, "the audit reader must resolve the actor name");

  const page = read("apps/web/src/app/admin/audit/page.tsx");
  assert.match(page, /listAuditLog/);
  assert.match(page, /ADMIN_MOVEMENTS_READ_PERMISSION/);

  const navigation = read("apps/web/src/lib/navigation.ts");
  assert.match(navigation, /href: "\/admin\/audit",\s*label: "Auditoria"/);
  assert.match(navigation, /groupByLabel\("Auditoria"\)/);
});

test("Recompra MRP groups by supplier and preserves both purchase request paths", () => {
  const page = read("apps/web/src/app/purchases/replenishment/page.tsx");
  // agrupa por proveedor y despliega el detalle
  assert.match(page, /<details/, "supplier boxes must be expandable");
  assert.match(page, /group\.items\.length/, "each supplier box shows how many articles to re-buy");
  assert.match(page, /group\.supplierId/);
  // boton que manda a nueva compra precargada
  assert.match(page, /Mandar a nueva compra/);
  assert.match(page, /\/purchases\?view=nueva&mrpSupplier=\$\{group\.supplierId\}/);

  // la pantalla de nueva compra lee mrpSupplier y precarga el form
  const purchasesPage = read("apps/web/src/app/purchases/page.tsx");
  assert.match(purchasesPage, /mrpSupplier/);
  assert.match(purchasesPage, /initialSupplierId/);
  assert.match(purchasesPage, /initialLines/);

  // el form acepta valores iniciales
  const entry = read("apps/web/src/app/purchases/purchase-entry-fields.tsx");
  assert.match(entry, /initialSupplierId/);
  assert.match(entry, /initialLines/);

  // la solicitud directa por item convive con la compra agrupada y editable
  assert.equal(
    existsSync(join(webRoot, "src/app/purchases/replenishment/actions.ts")),
    true,
    "the per-item request action must stay available",
  );
  assert.match(page, /createReplenishmentPurchaseRequestAction/);
});

test("Registro de ventas can edit and cancel a delivered sale", () => {
  const salesAdmin = read("apps/web/src/lib/sales-admin.ts");
  assert.match(salesAdmin, /nextStatus === "cancelado"/, "cancelling a delivered sale must be allowed");
  assert.match(salesAdmin, /restoreSaleStock/, "cancelling a delivered sale must return its stock");
  assert.match(salesAdmin, /orderStatusTransitionError/, "other lifecycle locks stay centralized");

  const orderStatus = read("apps/web/src/lib/order-status.ts");
  assert.match(orderStatus, /No se puede volver un pedido a cargado/);
  assert.match(orderStatus, /Solo los pedidos cargados o confirmados pueden marcarse como entregados/);

  const stock = read("apps/web/src/lib/stock.ts");
  assert.match(stock, /export async function restoreSaleStock/);
  assert.match(stock, /ajuste_positivo/);

  const actions = read("apps/web/src/app/sales/actions.ts");
  assert.match(actions, /editSaleAction/);
  assert.match(actions, /cancelSaleAction/);
  assert.match(actions, /resource: "ventas", action: "editar"/);
  assert.match(actions, /estado_pedido: "cancelado"/);

  const page = read("apps/web/src/app/sales/page.tsx");
  assert.match(page, /editSaleAction/);
  assert.match(page, /cancelSaleAction/);
  assert.match(page, /SaleRowActions/);
});

test("Balance shows gross vs net sales, and profit metrics run on net-of-VAT revenue", () => {
  const salesVat = read("apps/web/src/lib/sales-vat.ts");
  assert.match(salesVat, /export function netSalesAmountSql/);
  assert.match(salesVat, /IN \(1, 2, 3, 6, 7, 8\)/, "only VAT-discriminating receipt types (factura A/B) get netted");
  assert.match(salesVat, /fiscal_status.*=.*'aprobado'/, "only sales actually invoiced with an approved CAE are netted");

  const adminMetrics = read("apps/web/src/lib/admin-metrics.ts");
  assert.match(adminMetrics, /netSalesAmountSql/, "admin metrics must compute sales net of VAT for margin/profit figures");
  assert.match(adminMetrics, /grossCurrent/, "admin metrics must also expose the gross sales figure for display");

  const profitability = read("apps/web/src/lib/profitability.ts");
  assert.match(profitability, /netSalesAmountSql/, "break-even revenue must run on net-of-VAT sales too");

  const balancePage = read("apps/web/src/app/balance/page.tsx");
  assert.match(balancePage, /Ventas brutas/);
  assert.match(balancePage, /Ventas netas/);
});

test("future sales persist the VAT rate derived from the client document, never from a posted selector", () => {
  const migrationSql = read("supabase/migrations/20260812144142_persist_future_sales_vat_rate.sql");
  assert.match(migrationSql, /ALTER TABLE public\.sales/);
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS vat_rate/);
  assert.match(migrationSql, /DEFAULT 0/, "historical sales without a captured rate must default to 0 (net = gross)");

  const salesVat = read("apps/web/src/lib/sales-vat.ts");
  assert.match(salesVat, /vat_rate/, "the net calculation must read the sale's own vat_rate column");
  assert.doesNotMatch(salesVat, /\/ 1\.21/, "the divisor must use the sale's own stored rate, not a hardcoded 21%");

  const orders = read("apps/web/src/lib/orders.ts");
  assert.match(orders, /saleVatRateForDocument\(customer\.receipt_type\)/);
  assert.match(orders, /vat_rate/, "order creation must persist vat_rate on the sales row");

  const entryFields = read("apps/web/src/app/orders/new/order-entry-fields.tsx");
  assert.doesNotMatch(entryFields, /name="vatRate"|onIvaRateChange/);

  const preview = read("apps/web/src/app/orders/new/order-confirmation-preview.tsx");
  assert.match(preview, /Comprobante e IVA derivados del cliente/);
});

test("cargar pedido and presupuestos quantity steppers move by whole units, not thousandths", () => {
  const entryFields = read("apps/web/src/app/orders/new/order-entry-fields.tsx");
  assert.doesNotMatch(entryFields, /step="0\.001"/, "quantity inputs must not step by 0.001");
  assert.doesNotMatch(entryFields, /min="0\.001"/, "quantity inputs must not allow fractional minimums");
  const orderQuantityStepCount = (entryFields.match(/step="1"/g) ?? []).length;
  assert.ok(orderQuantityStepCount >= 2, "both the draft line and existing line quantity inputs must step by 1");

  const quoteEntryFields = read("apps/web/src/app/quotes/quote-entry-fields.tsx");
  assert.doesNotMatch(quoteEntryFields, /step="0\.001"/);
  assert.doesNotMatch(quoteEntryFields, /min="0\.001"/);
  const quoteQuantityStepCount = (quoteEntryFields.match(/step="1"/g) ?? []).length;
  assert.ok(quoteQuantityStepCount >= 2);
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
  const pricesPage = read("apps/web/src/app/prices/page.tsx");
  const inventory = read("apps/web/src/lib/inventory.ts");
  const quoteMigration = read("supabase/migrations/20260722123457_quote_customers_vat_and_commercial_numbers.sql");
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
  // El alta de catálogo vive en su propia ruta auditada (/prices/new), separada del stock.
  assert.match(pricesPage, /Nuevo producto/);
  assert.match(pricesPage, /href="\/prices\/new"/);
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
  assert.doesNotMatch(stockPage, /timeStyle/);
  assert.doesNotMatch(stockPage, /DataTableHead[^>]*>Origen/);
  assert.doesNotMatch(stockPage, /movement\.productCode/);
  assert.match(stockPage, /Ver motivo/);
  assert.match(stockPage, /title=\{movement\.reason\}/);
  assert.match(stockPage, /icon=\{<AppIcon className="h-6 w-6" name="package" \/>\}/);
  assert.match(stockWorkspace, /Modificar stock/);
  assert.match(stockWorkspace, /Ver detalle/);
  assert.match(stockWorkspace, /Proveedor/);
  assert.match(stockWorkspace, /compactOptions/);
  assert.match(stockWorkspace, /Card className="overflow-visible[^"]*"/);
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

  const purchases = read("apps/web/src/lib/purchases.ts");
  assert.match(purchases, /export async function deletePurchase\(session: AuthSession/);
  assert.match(purchases, /purchase\.deleted/);
  assert.match(purchases, /pago conciliado y no puede borrarse/);

  const sales = read("apps/web/src/lib/sales-admin.ts");
  assert.match(sales, /export async function deleteSale\(session: AuthSession/);
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

test("order comprobante flow separates the commercial remito from stock", () => {
  const documents = read("apps/web/src/lib/pdf/documents.ts");
  assert.match(documents, /export async function buildOrderRemitoPdf/);
  assert.match(documents, /FROM sale_items si/, "the commercial remito reads sale_items, not delivery_document_items");
  assert.match(documents, /includePrices \? "remito_con_precios" : "remito_sin_precios"/);
  assert.match(documents, /copia \? "COPIA" : "ORIGINAL"/);
  assert.doesNotMatch(documents, /buildOrderRemitoPdf[\s\S]*INSERT INTO/, "the commercial remito must not write to the database");
  // El remito valorizado usa el helper compartido y muestra neto, IVA y final por renglon.
  assert.match(documents, /COALESCE\(s\.vat_rate, 0\)::text AS vat_rate/);
  assert.match(documents, /requireValuedRemittanceVatRate/);
  assert.match(documents, /valuedDocumentLines/);
  for (const label of ["Unit. neto", "IVA %", "IVA unit.", "Unit. final", "Imp. neto", "Imp. final"]) {
    assert.match(documents, new RegExp(label.replace(".", "\\.")));
  }
  assert.match(documents, /\["Subtotal neto", pdfMoney\(valuedSummary\.net\)\]/);
  assert.match(documents, /includePrices \? "Total final" : "Control"/);

  const remitoRoute = read("apps/web/src/app/api/pdfs/orders/[id]/remito/route.ts");
  assert.match(remitoRoute, /requireApiSession\(\[\{ resource: "pedidos", action: "ver" \}\]\)/);
  assert.match(remitoRoute, /buildOrderRemitoPdf/);
  assert.match(remitoRoute, /searchParams\.get\("precios"\) === "si"/);
  assert.match(remitoRoute, /searchParams\.get\("copia"\) === "1"/);
});

test("orders register exposes the comprobante sequence with fiscal gating", () => {
  const ordersPage = read("apps/web/src/app/orders/page.tsx");
  assert.match(ordersPage, /hasCompleteFiscalData/);
  assert.match(ordersPage, /\/api\/pdfs\/orders\/\$\{order\.id\}\/remito/);
  assert.match(ordersPage, /Remito sin precios/);
  assert.doesNotMatch(ordersPage, /Copia \(chofer\)/, "the chofer copy is redundant with the remito sin precios");
  assert.match(ordersPage, /Remito con precios/);
  assert.match(ordersPage, /precios=si/);
  assert.match(ordersPage, /canRequestInvoice/, "the fiscal invoice action must be gated by the entregado + fiscal-data state");
});

test("approving a quote leaves the order loaded with its commercial remito, not a priced delivery", () => {
  const quoteActions = read("apps/web/src/app/quotes/actions.ts");
  assert.match(quoteActions, /export async function acceptQuoteAndRemitAction/);
  assert.doesNotMatch(quoteActions, /createDeliveryDocumentFromSale/, "approval must not create a priced delivery document");
  assert.doesNotMatch(quoteActions, /redirect\("\/billing/, "approval must not jump to billing to build a remito by hand");
  assert.match(quoteActions, /redirect\("\/orders\?status=cargado"\)/);
});

test("Solicitar Factura requests a fiscal invoice that ARCA emits on approval", () => {
  const fiscal = read("apps/web/src/lib/fiscal.ts");
  assert.match(fiscal, /export async function requestSaleFiscalInvoice/);
  assert.match(fiscal, /order_status !== "entregado"/, "only delivered orders can request a fiscal invoice");
  assert.match(fiscal, /hasCompleteFiscalData/);
  assert.match(fiscal, /metadata->>'action' = 'fiscal_invoice'/);
  assert.match(fiscal, /WHERE NOT EXISTS/, "requesting an invoice must be idempotent");

  const approvals = read("apps/web/src/lib/approvals.ts");
  assert.match(approvals, /metadata\.action === "fiscal_invoice"/);
  assert.match(approvals, /authorizeSaleFiscalDocument\(session, String\(metadata\.saleId/);
  // El flujo fiscal viejo (source dedicada) sigue removido.
  assert.doesNotMatch(approvals, /source: "fiscal"|listPendingFiscalApprovals/);

  const orders = read("apps/web/src/lib/orders.ts");
  assert.match(orders, /has_pending_fiscal_request/);
  assert.match(orders, /COALESCE\(s\.fiscal_status, 'no_enviado'\) AS fiscal_status/);
  assert.match(orders, /hasPendingFiscalRequest: boolean/);

  const actions = read("apps/web/src/app/orders/actions.ts");
  assert.match(actions, /export async function requestFiscalInvoiceAction/);
  assert.match(actions, /requestSaleFiscalInvoice/);
  assert.match(actions, /revalidatePath\("\/admin\/approvals"\)/);

  const ordersPage = read("apps/web/src/app/orders/page.tsx");
  assert.match(ordersPage, /Solicitar Factura/);
  assert.match(ordersPage, /Factura Solicitada/);
  assert.match(ordersPage, /name="clock"/);
  assert.match(ordersPage, /name="download"/);
});

test("editing blocks historical zero-rate orders and derives VAT from the selected document", () => {
  const entryFields = read("apps/web/src/app/orders/new/order-entry-fields.tsx");
  assert.match(entryFields, /vatRate\?: number/, "OrderEntryInitialValue must carry the saved vatRate");
  assert.match(entryFields, /saleVatRateForDocument\(desiredDocument\)/);
  assert.match(entryFields, /requestedDocument === "factura"/);
  assert.match(entryFields, /initialValue\?\.vatRate === undefined \|\| initialValue\.vatRate > 0/);

  const editPage = read("apps/web/src/app/orders/[id]/edit/page.tsx");
  assert.match(editPage, /vatRate: order\.vatRate/);
  assert.match(editPage, /order\.vatRate === 0/);
  assert.match(editPage, /No se modifica automáticamente/);

  const orders = read("apps/web/src/lib/orders.ts");
  assert.match(orders, /hasConsistentOrderVatSnapshot/);
  assert.match(orders, /COALESCE\(s\.vat_rate, 0\)::text AS vat_rate/);
});
