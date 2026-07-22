import { ModulePage } from "@/components/module-page";
import { redirect } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  listPurchaseFormProducts,
  listPurchaseFormSuppliers,
  listPurchaseItemsByPurchaseIds,
  listPurchases,
} from "@/lib/purchases";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import {
  PURCHASES_CREATE_PERMISSION,
  PURCHASES_EDIT_PERMISSION,
  PURCHASES_READ_PERMISSION,
  sessionAllows,
  sessionCanDeleteOperationalRecords,
} from "@/lib/route-auth";
import { localDateIso } from "@/lib/timezone";
import {
  Button,
  ButtonLink,
  Card,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  StatCard,
  StatusBadge,
  Textarea,
  Toolbar,
  type StatusBadgeTone,
} from "@/components/ui";
import {
  createPurchaseAction,
  deletePurchaseAction,
  requestSupplierPaymentAction,
  reviewPurchasePackageAction,
  updatePurchaseStatusAction,
  uploadPurchaseReceiptAction,
} from "@/app/purchases/actions";
import { PurchaseEntryFields } from "@/app/purchases/purchase-entry-fields";
import { PurchaseReceiptUpload } from "@/app/purchases/purchase-receipt-upload";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { getReplenishmentSuggestions } from "@/lib/replenishment";

type PurchasesPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    type?: string;
    view?: string;
    mrpSupplier?: string;
  }>;
};

const purchaseStates = [
  { value: "", label: "Todos los estados" },
  { value: "pendiente", label: "Pendiente" },
  { value: "recibida", label: "Recibida" },
  { value: "cancelada", label: "Cancelada" },
];

type PurchaseRow = Awaited<ReturnType<typeof listPurchases>>[number];

const purchaseRequestTypes = ["solicitud", "solicitud_compra", "solicitud de compra"] as const;

const purchaseViews = {
  nueva: {
    href: "/purchases?view=nueva",
    title: "Nueva compra",
    description: "Carga una compra de proveedor con los datos operativos necesarios.",
    excludeTypes: null,
    emptyTitle: "No hay compras recientes",
  },
  registro: {
    href: "/purchases",
    title: "Registro de compras",
    description: "Historial de compras, pagos, saldos y control de paquetes.",
    excludeTypes: purchaseRequestTypes,
    emptyTitle: "No hay compras registradas",
  },
} as const;

function normalizePurchaseType(value: string) {
  return value.trim().toLowerCase().replaceAll("-", "_");
}

type PurchaseView = (typeof purchaseViews)[keyof typeof purchaseViews];

function viewForParams(type: string, viewParam: string) {
  if (normalizePurchaseType(viewParam) === "nueva") return purchaseViews.nueva;
  const normalized = normalizePurchaseType(type);
  if (purchaseRequestTypes.some((requestType) => normalizePurchaseType(requestType) === normalized)) {
    redirect("/admin/approvals");
  }
  return purchaseViews.registro;
}

function matchesType(item: PurchaseRow, view: PurchaseView) {
  const normalized = normalizePurchaseType(item.type);
  if (view.excludeTypes?.some((type) => normalizePurchaseType(type) === normalized)) {
    return false;
  }
  return true;
}

function matchesQuery(item: PurchaseRow, query: string) {
  if (!query) return true;
  return [item.supplierName, item.description, item.status]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function statusLabel(value: string) {
  const normalized = value.replaceAll("_", " ").trim();
  if (!normalized) return "-";
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function purchaseStatusTone(value: string): StatusBadgeTone {
  if (value === "recibida") return "success";
  if (value === "cancelada") return "danger";
  if (value === "pendiente") return "warning";
  return "neutral";
}

function packageStatusTone(value: string): StatusBadgeTone {
  const normalized = value.toLowerCase();
  if (normalized === "revisado") return "success";
  if (normalized === "falla") return "danger";
  if (normalized) return "warning";
  return "neutral";
}

export default async function PurchasesPage({ searchParams }: PurchasesPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [PURCHASES_READ_PERMISSION]);
  const params = await searchParams;
  const query = params.q?.trim().toLowerCase() ?? "";
  const status = params.status?.trim() ?? "";
  const type = params.type?.trim() ?? "";
  const viewParam = params.view?.trim() ?? "";
  const view = viewForParams(type, viewParam);
  const today = localDateIso();
  const [canCreatePurchases, canEditPurchases, canDeleteRecords] = await Promise.all([
    sessionAllows(session, [PURCHASES_CREATE_PERMISSION]),
    sessionAllows(session, [PURCHASES_EDIT_PERMISSION]),
    sessionCanDeleteOperationalRecords(session),
  ]);
  const showCreateForm = view === purchaseViews.nueva && canCreatePurchases;
  const showRegistry = view !== purchaseViews.nueva;
  const [allPurchases, suppliers, products] = await Promise.all([
    listPurchases(session.companyId),
    showCreateForm ? listPurchaseFormSuppliers(session.companyId) : Promise.resolve([]),
    showCreateForm ? listPurchaseFormProducts(session.companyId) : Promise.resolve([]),
  ]);

  // Precarga desde Recompra MRP: el detalle sugerido del proveedor entra al form editable.
  const mrpSupplierId = params.mrpSupplier?.trim() ?? "";
  let initialSupplierId = "";
  let initialLines: { productId: string; quantity: number }[] = [];
  if (showCreateForm && mrpSupplierId) {
    const suggestions = await getReplenishmentSuggestions(session.companyId);
    const supplierItems = suggestions.items.filter(
      (item) => item.supplierId === mrpSupplierId && item.suggestedQuantity > 0,
    );
    if (supplierItems.length) {
      initialSupplierId = mrpSupplierId;
      initialLines = supplierItems.map((item) => ({ productId: item.productId, quantity: item.suggestedQuantity }));
    }
  }
  const purchases = showRegistry
    ? allPurchases.filter(
        (item) =>
          matchesQuery(item, query) &&
          (!status || item.status === status) &&
          matchesType(item, view),
      )
    : [];
  const openBalance = purchases.reduce((sum, item) => sum + item.balance, 0);
  const total = purchases.reduce((sum, item) => sum + item.total, 0);
  const pendingReviewIds = purchases
    .filter((item) => item.status === "recibida" && item.packageStatus === "pendiente")
    .map((item) => item.id);
  const itemsByPurchase = showRegistry && canEditPurchases
    ? await listPurchaseItemsByPurchaseIds(session.companyId, pendingReviewIds)
    : new Map<string, { productId: string; name: string; quantity: number }[]>();

  return (
    <ModulePage
      active="purchases"
      description={view.description}
      session={session}
      title={view.title}
    >
      <div className="grid gap-5">
        <PageHeader
          description={view.description}
          moduleIntro
          title={view.title}
        />

        {showCreateForm ? (
          <Card className="p-4">
            <form action={createPurchaseAction} className="grid gap-4">
              <PurchaseEntryFields
                defaultDate={today}
                initialLines={initialLines}
                initialSupplierId={initialSupplierId}
                products={products}
                suppliers={suppliers}
              />
              <div className="grid gap-3 lg:grid-cols-[minmax(0,180px)_minmax(0,160px)_minmax(0,180px)_minmax(260px,1fr)_auto] lg:items-end">
                <Field className="min-w-0" htmlFor="purchase-total" label="Total">
                  <Input id="purchase-total" min="0" name="total" required step="0.01" type="number" />
                </Field>
                <Field className="min-w-0" htmlFor="purchase-tax-mode" label="IVA">
                  <Select id="purchase-tax-mode" name="taxMode" defaultValue="con_iva">
                    <option value="con_iva">Con IVA</option>
                    <option value="sin_iva">Sin IVA</option>
                  </Select>
                </Field>
                <Field className="min-w-0" htmlFor="purchase-vat-rate" label="Alicuota">
                  <Select id="purchase-vat-rate" name="vatRate" defaultValue="21">
                    <option value="21">21%</option>
                    <option value="10.5">10,5%</option>
                    <option value="0">0%</option>
                  </Select>
                </Field>
                <Field className="min-w-0" htmlFor="purchase-description" label="Descripcion">
                  <Input id="purchase-description" name="description" placeholder="Detalle o referencia interna" />
                </Field>
                <Button type="submit">Crear compra</Button>
              </div>
            </form>
          </Card>
        ) : null}

        {view === purchaseViews.nueva && !canCreatePurchases ? (
          <Card className="p-4">
            <EmptyState
              description="Tu usuario puede consultar compras, pero no tiene permiso para cargar una nueva."
              title="Sin permiso para crear compras"
            />
          </Card>
        ) : null}

        {showRegistry ? (
          <>
            <Toolbar ariaLabel="Filtros de compras">
              <form
                action="/purchases"
                className="grid w-full gap-3 lg:grid-cols-[minmax(240px,1fr)_220px_auto_auto] lg:items-end"
              >
                <Field htmlFor="purchases-query" label="Buscar">
                  <Input
                    defaultValue={params.q ?? ""}
                    id="purchases-query"
                    name="q"
                    placeholder="Proveedor, descripcion o estado"
                    type="search"
                  />
                </Field>
                <Field htmlFor="purchases-status" label="Estado">
                  <Select defaultValue={status} id="purchases-status" name="status">
                    {purchaseStates.map((state) => (
                      <option key={state.value} value={state.value}>
                        {state.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button type="submit">Filtrar</Button>
                <ButtonLink href={view.href} variant="secondary">
                  Limpiar
                </ButtonLink>
                {type ? <input name="type" type="hidden" value={type} /> : null}
              </form>
            </Toolbar>

            <div className="grid gap-3 md:grid-cols-3">
              <StatCard className="p-3" label="Compras filtradas" value={purchases.length} />
              <StatCard className="p-3" label="Total filtrado" value={formatCurrency(total)} />
              <StatCard className="p-3" label="Saldo abierto" value={formatCurrency(openBalance)} />
            </div>

            <Card className="overflow-hidden">
              <DataTable
                caption="Listado de compras filtradas"
                className="rounded-none border-0 shadow-none"
                minWidth="1180px"
                tableLabel="Compras"
                tableProps={{ className: "table-fixed" }}
              >
                <DataTableHeader>
                  <DataTableRow className="hover:bg-transparent">
                    <DataTableHead className="w-[14%]">Compra</DataTableHead>
                    <DataTableHead className="w-[16%]">Proveedor</DataTableHead>
                    <DataTableHead className="w-[9%]">Fecha</DataTableHead>
                    <DataTableHead className="w-[10%]">Estado</DataTableHead>
                    <DataTableHead className="w-[10%]">Paquete</DataTableHead>
                    <DataTableHead align="right" className="w-[9%]">Total</DataTableHead>
                    <DataTableHead align="right" className="w-[9%]">Pagado</DataTableHead>
                    <DataTableHead align="right" className="w-[9%]">Saldo</DataTableHead>
                    <DataTableHead className="w-[14%]">Acciones</DataTableHead>
                  </DataTableRow>
                </DataTableHeader>
                <DataTableBody>
                  {purchases.length === 0 ? (
                    <DataTableRow className="hover:bg-transparent">
                      <DataTableCell colSpan={9}>
                        <EmptyState
                          description="Ajusta la busqueda o limpia los filtros para revisar esta bandeja."
                          title={view.emptyTitle}
                        />
                      </DataTableCell>
                    </DataTableRow>
                  ) : (
                    purchases.map((purchase) => {
                      const statusSelectId = `purchase-${purchase.id}-status`;
                      const paymentDateInputId = `purchase-${purchase.id}-payment-date`;
                      const paymentAmountInputId = `purchase-${purchase.id}-payment-amount`;
                      const paymentNotesInputId = `purchase-${purchase.id}-payment-notes`;

                      return (
                        <DataTableRow key={purchase.id}>
                          <DataTableCell>
                            <div className="break-all font-mono text-xs">#{purchase.id}</div>
                            <div className="mt-1 text-xs text-[color:var(--muted)]">
                              {purchase.description || "-"}
                            </div>
                            <div className="mt-1 text-xs font-semibold text-[color:var(--muted)]">
                              {purchase.taxMode === "sin_iva" ? "Sin IVA" : `IVA ${purchase.vatRate}% incluido`}
                            </div>
                          </DataTableCell>
                          <DataTableCell>
                            <div className="font-medium">{purchase.supplierName || "Sin proveedor"}</div>
                          </DataTableCell>
                          <DataTableCell className="whitespace-nowrap">{formatDate(purchase.date)}</DataTableCell>
                          <DataTableCell>
                            <StatusBadge tone={purchaseStatusTone(purchase.status)}>
                              {statusLabel(purchase.status)}
                            </StatusBadge>
                          </DataTableCell>
                          <DataTableCell>
                            <StatusBadge tone={packageStatusTone(purchase.packageStatus)}>
                              {statusLabel(purchase.packageStatus)}
                            </StatusBadge>
                          </DataTableCell>
                          <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs">
                            {formatCurrency(purchase.total)}
                          </DataTableCell>
                          <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs">
                            {formatCurrency(purchase.paidAmount)}
                          </DataTableCell>
                          <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs">
                            {formatCurrency(purchase.balance)}
                          </DataTableCell>
                          <DataTableCell>
                            <details className="rounded-[8px] border border-[color:var(--border)] bg-[color:var(--panel)] p-2">
                              <summary className="flex min-h-[var(--control-height-md)] cursor-pointer list-none select-none items-center justify-center rounded-[var(--radius-md)] bg-[color:var(--accent)] px-4 font-black text-white shadow-sm [&::-webkit-details-marker]:hidden">
                                Acciones
                              </summary>
                              <div className="mt-2 grid min-w-0 gap-2">
                              <div className="grid gap-2">
                                <ButtonLink
                                  aria-label={`Abrir orden de compra PDF ${purchase.id}`}
                                  className="w-full"
                                  href={`/api/pdfs/purchases/${purchase.id}/order`}
                                  prefetch={false}
                                  rel="noreferrer"
                                  size="sm"
                                  target="_blank"
                                  variant="secondary"
                                >
                                  OC PDF
                                </ButtonLink>
                                <ButtonLink
                                  aria-label={`Abrir solicitud de devolucion PDF ${purchase.id}`}
                                  className="w-full"
                                  href={`/api/pdfs/purchases/${purchase.id}/return-request`}
                                  prefetch={false}
                                  rel="noreferrer"
                                  size="sm"
                                  target="_blank"
                                  variant="secondary"
                                >
                                  Devol.
                                </ButtonLink>
                              </div>
                              {canDeleteRecords ? (
                                <form action={deletePurchaseAction}>
                                  <input name="id" type="hidden" value={purchase.id} />
                                  <ConfirmDeleteButton
                                    aria-label={`Borrar compra ${purchase.id}`}
                                    className="w-full"
                                    confirmation={`¿Borrar definitivamente la compra #${purchase.id}? También se eliminarán pagos y movimientos relacionados que no estén conciliados.`}
                                    size="sm"
                                  />
                                </form>
                              ) : null}
                              {canEditPurchases ? (
                                <form action={updatePurchaseStatusAction} className="grid min-w-0 gap-2">
                                  <input name="id" type="hidden" value={purchase.id} />
                                  <label className="sr-only" htmlFor={statusSelectId}>
                                    Cambiar estado de compra {purchase.id}
                                  </label>
                                  <Select
                                    className="min-h-9 flex-1 px-2 text-xs"
                                    defaultValue={purchase.status}
                                    id={statusSelectId}
                                    name="status"
                                  >
                                    {purchaseStates.slice(1).map((state) => (
                                      <option key={state.value} value={state.value}>
                                        {state.label}
                                      </option>
                                    ))}
                                  </Select>
                                  <Button
                                    aria-label={`Guardar estado de compra ${purchase.id}`}
                                    size="sm"
                                    type="submit"
                                  >
                                    Guardar
                                  </Button>
                                </form>
                              ) : null}
                          {purchase.balance > 0 && purchase.status !== "cancelada" && canEditPurchases ? (
                            <details className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-2 text-xs">
                              <summary className="cursor-pointer select-none font-semibold text-[color:var(--accent-strong)]">
                                Solicitar pago
                              </summary>
                              <form action={requestSupplierPaymentAction} className="mt-2 grid gap-2">
                                <input name="id" type="hidden" value={purchase.id} />
                                <Field className="gap-1" htmlFor={paymentAmountInputId} label="Monto">
                                  <Input
                                    defaultValue={purchase.balance.toFixed(2)}
                                    id={paymentAmountInputId}
                                    min="0"
                                    name="amount"
                                    required
                                    step="0.01"
                                    type="number"
                                  />
                                </Field>
                                <Field className="gap-1" htmlFor={paymentDateInputId} label="Fecha de pago">
                                  <Input
                                    defaultValue={today}
                                    id={paymentDateInputId}
                                    name="date"
                                    required
                                    type="date"
                                  />
                                </Field>
                                <Field className="gap-1" htmlFor={paymentNotesInputId} label="Notas">
                                  <Input
                                    id={paymentNotesInputId}
                                    name="notes"
                                    placeholder="Cuenta, referencia o condicion"
                                  />
                                </Field>
                                <Button
                                  aria-label={`Solicitar pago de compra ${purchase.id}`}
                                  className="w-full"
                                  size="sm"
                                  type="submit"
                                  variant="secondary"
                                >
                                  Enviar a aprobacion
                                </Button>
                              </form>
                            </details>
                          ) : null}
                          {purchase.status === "recibida" && canEditPurchases ? (
                            <form
                              action={uploadPurchaseReceiptAction}
                              className="grid gap-1"
                              suppressHydrationWarning
                            >
                              <input name="id" type="hidden" value={purchase.id} />
                              <span className="text-xs">Recibo</span>
                              <PurchaseReceiptUpload purchaseId={purchase.id} />
                            </form>
                          ) : null}
                          {purchase.status === "recibida" &&
                          purchase.packageStatus === "pendiente" &&
                          canEditPurchases ? (
                            <div className="grid gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] p-2">
                              <form action={reviewPurchasePackageAction}>
                                <input name="id" type="hidden" value={purchase.id} />
                                <input name="action" type="hidden" value="marcar_revisado" />
                                <Button
                                  aria-label={`Acreditar compra ${purchase.id}`}
                                  className="w-full"
                                  size="sm"
                                  type="submit"
                                  variant="secondary"
                                >
                                  Acreditar compra
                                </Button>
                              </form>
                              <details className="text-xs">
                                <summary className="cursor-pointer select-none font-medium text-[color:var(--muted)]">
                                  Reportar falla
                                </summary>
                                <form action={reviewPurchasePackageAction} className="mt-2 grid gap-2">
                                  <input name="id" type="hidden" value={purchase.id} />
                                  <input name="action" type="hidden" value="reportar_falla" />
                                  <Field
                                    className="gap-1"
                                    htmlFor={`purchase-${purchase.id}-failure`}
                                    label="Motivo de la falla"
                                  >
                                    <Textarea
                                      id={`purchase-${purchase.id}-failure`}
                                      name="failure"
                                      required
                                      rows={2}
                                    />
                                  </Field>
                                  {(itemsByPurchase.get(purchase.id) ?? []).map((item) => (
                                    <div
                                      className="grid grid-cols-[1fr_90px] items-center gap-2"
                                      key={item.productId}
                                    >
                                      <span className="truncate" title={item.name || item.productId}>
                                        {item.name || item.productId} (pidio {item.quantity})
                                      </span>
                                      <input name="itemProductId" type="hidden" value={item.productId} />
                                      <Input
                                        aria-label={`Cantidad llegada de ${item.name || item.productId} en compra ${purchase.id}`}
                                        defaultValue={0}
                                        min="0"
                                        name="itemQuantity"
                                        step="1"
                                        type="number"
                                      />
                                    </div>
                                  ))}
                                  <Button
                                    aria-label={`Reportar falla en la compra ${purchase.id}`}
                                    className="w-full"
                                    size="sm"
                                    type="submit"
                                    variant="secondary"
                                  >
                                    Reportar falla
                                  </Button>
                                </form>
                              </details>
                            </div>
                          ) : null}
                              </div>
                            </details>
                      </DataTableCell>
                    </DataTableRow>
                  );
                })
              )}
            </DataTableBody>
              </DataTable>
            </Card>
          </>
        ) : null}
      </div>
    </ModulePage>
  );
}
