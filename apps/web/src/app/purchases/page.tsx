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
  reviewPurchasePackageAction,
  updatePurchaseStatusAction,
  uploadPurchaseReceiptAction,
} from "@/app/purchases/actions";

type PurchasesPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    type?: string;
    view?: string;
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
  const [canCreatePurchases, canEditPurchases] = await Promise.all([
    sessionAllows(session, [PURCHASES_CREATE_PERMISSION]),
    sessionAllows(session, [PURCHASES_EDIT_PERMISSION]),
  ]);
  const showCreateForm = view === purchaseViews.nueva && canCreatePurchases;
  const showRegistry = view !== purchaseViews.nueva;
  const [allPurchases, suppliers, products] = await Promise.all([
    listPurchases(session.companyId),
    showCreateForm ? listPurchaseFormSuppliers(session.companyId) : Promise.resolve([]),
    showCreateForm ? listPurchaseFormProducts(session.companyId) : Promise.resolve([]),
  ]);
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
          title={view.title}
        />

        {showCreateForm ? (
          <Card className="p-4">
            <form action={createPurchaseAction} className="grid gap-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px]">
                <Field htmlFor="purchase-supplier" label="Proveedor">
                  <Select id="purchase-supplier" name="supplierId" required>
                    <option value="">Seleccionar proveedor</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field htmlFor="purchase-date" label="Fecha">
                  <Input defaultValue={localDateIso()} id="purchase-date" name="date" type="date" />
                </Field>
              </div>
              <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_minmax(120px,150px)_minmax(140px,180px)]">
                <Field htmlFor="purchase-product" label="Producto opcional">
                  <Select id="purchase-product" name="productId">
                    <option value="">Sin producto asociado</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} {product.code ? `- ${product.code}` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field htmlFor="purchase-quantity" label="Cantidad">
                  <Input id="purchase-quantity" min="1" name="quantity" step="1" type="number" />
                </Field>
                <Field htmlFor="purchase-total" label="Total">
                  <Input id="purchase-total" min="0" name="total" required step="0.01" type="number" />
                </Field>
              </div>
              <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_auto] lg:items-end">
                <Field htmlFor="purchase-description" label="Descripcion">
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
                minWidth="100%"
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
                      const receiptInputId = `purchase-${purchase.id}-receipt`;

                      return (
                        <DataTableRow key={purchase.id}>
                          <DataTableCell>
                            <div className="break-all font-mono text-xs">#{purchase.id}</div>
                            <div className="mt-1 text-xs text-[color:var(--muted)]">
                              {purchase.description || "-"}
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
                            <div className="grid min-w-0 gap-2">
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
                                    className="min-h-9 px-3 text-xs"
                                    size="sm"
                                    type="submit"
                                  >
                                    Guardar
                                  </Button>
                                </form>
                              ) : null}
                          {purchase.status === "recibida" && canEditPurchases ? (
                            <form action={uploadPurchaseReceiptAction} className="grid gap-2">
                              <input name="id" type="hidden" value={purchase.id} />
                              <Field className="gap-1" htmlFor={receiptInputId} label="Recibo">
                                <input
                                  accept="image/jpeg,image/png,image/webp,image/gif"
                                  aria-label={`Seleccionar recibo de compra ${purchase.id}`}
                                  className="block w-full text-xs text-[color:var(--muted)] file:mr-2 file:min-h-9 file:rounded-[var(--radius-md)] file:border-0 file:bg-[color:var(--panel-subtle)] file:px-3 file:text-xs file:font-semibold file:text-[color:var(--foreground)]"
                                  id={receiptInputId}
                                  name="foto"
                                  type="file"
                                />
                              </Field>
                              <Button
                                aria-label={`Subir recibo de compra ${purchase.id}`}
                                className="w-full text-xs"
                                size="sm"
                                type="submit"
                                variant="secondary"
                              >
                                Subir recibo
                              </Button>
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
                                  aria-label={`Marcar revisado el paquete de la compra ${purchase.id}`}
                                  className="w-full text-xs"
                                  size="sm"
                                  type="submit"
                                  variant="secondary"
                                >
                                  Marcar revisado (acredita stock)
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
                                    className="w-full text-xs"
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
