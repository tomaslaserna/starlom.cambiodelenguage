import { ModulePage } from "@/components/module-page";
import { fastOr } from "@/lib/fast-data";
import { formatCurrency, formatDate } from "@/lib/format";
import { listPurchases } from "@/lib/purchases";
import { listProducts } from "@/lib/catalog";
import { listSuppliers } from "@/lib/catalog-management";
import { requireStaffSession } from "@/lib/auth";
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
  Toolbar,
  type StatusBadgeTone,
} from "@/components/ui";
import {
  createPurchaseAction,
  updatePurchaseStatusAction,
  uploadPurchaseReceiptAction,
} from "@/app/purchases/actions";

type PurchasesPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    type?: string;
  }>;
};

const purchaseStates = [
  { value: "", label: "Todos los estados" },
  { value: "pendiente", label: "Pendiente" },
  { value: "recibida", label: "Recibida" },
  { value: "cancelada", label: "Cancelada" },
];

type PurchaseRow = Awaited<ReturnType<typeof listPurchases>>[number];

const purchaseViews = {
  nueva: {
    href: "/purchases",
    title: "Nueva compra",
    description: "Carga una compra y revisa las operaciones recientes.",
    filterTypes: null,
    createType: "compra",
    emptyTitle: "No hay compras cargadas",
  },
  urgente: {
    href: "/purchases?type=urgente",
    title: "Compras urgentes",
    description: "Bandeja de compras que requieren prioridad operativa.",
    filterTypes: ["urgente"],
    createType: "urgente",
    emptyTitle: "No hay compras urgentes",
  },
  anticipada: {
    href: "/purchases?type=anticipada",
    title: "Compras anticipadas",
    description: "Compras planificadas antes de la necesidad inmediata.",
    filterTypes: ["anticipada"],
    createType: "anticipada",
    emptyTitle: "No hay compras anticipadas",
  },
  solicitud: {
    href: "/purchases?type=solicitud",
    title: "Solicitudes de compra",
    description: "Solicitudes pendientes o cargadas por el equipo.",
    filterTypes: ["solicitud", "solicitud_compra", "solicitud de compra"],
    createType: "solicitud",
    emptyTitle: "No hay solicitudes de compra",
  },
} as const;

function normalizePurchaseType(value: string) {
  return value.trim().toLowerCase().replaceAll("-", "_");
}

function viewForType(type: string) {
  const normalized = normalizePurchaseType(type);
  if (normalized === "urgente") return purchaseViews.urgente;
  if (normalized === "anticipada") return purchaseViews.anticipada;
  if (["solicitud", "solicitud_compra", "solicitud de compra"].includes(normalized)) return purchaseViews.solicitud;
  return purchaseViews.nueva;
}

function matchesType(item: PurchaseRow, filterTypes: readonly string[] | null) {
  if (!filterTypes) return true;
  const normalized = normalizePurchaseType(item.type);
  return filterTypes.some((type) => normalizePurchaseType(type) === normalized);
}

function matchesQuery(item: PurchaseRow, query: string) {
  if (!query) return true;
  return [item.supplierName, item.description, item.status, item.type]
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
  const params = await searchParams;
  const query = params.q?.trim().toLowerCase() ?? "";
  const status = params.status?.trim() ?? "";
  const type = params.type?.trim() ?? "";
  const view = viewForType(type);
  const showCreateForm = view === purchaseViews.nueva;
  const [allPurchases, suppliers, products] = await Promise.all([
    fastOr(listPurchases(session.companyId), []),
    showCreateForm
      ? fastOr(listSuppliers({ companyId: session.companyId, pageSize: "100" }).then((result) => result.data), [])
      : Promise.resolve([]),
    showCreateForm
      ? fastOr(listProducts({ companyId: session.companyId, pageSize: "100" }).then((result) => result.data), [])
      : Promise.resolve([]),
  ]);
  const purchases = allPurchases.filter(
    (item) =>
      matchesQuery(item, query) &&
      (!status || item.status === status) &&
      matchesType(item, view.filterTypes),
  );
  const openBalance = purchases.reduce((sum, item) => sum + item.balance, 0);
  const total = purchases.reduce((sum, item) => sum + item.total, 0);

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
              <div className="grid gap-3 md:grid-cols-4">
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
                <Field htmlFor="purchase-type" label="Tipo">
                  <Select defaultValue={view.createType} id="purchase-type" name="type">
                    <option value="compra">Compra</option>
                    <option value="urgente">Urgente</option>
                    <option value="anticipada">Anticipada</option>
                    <option value="solicitud">Solicitud</option>
                  </Select>
                </Field>
                <Field htmlFor="purchase-date" label="Fecha">
                  <Input defaultValue={new Date().toISOString().slice(0, 10)} id="purchase-date" name="date" type="date" />
                </Field>
                <Field htmlFor="purchase-status" label="Estado inicial">
                  <Select defaultValue="pendiente" id="purchase-status" name="status">
                    <option value="pendiente">Pendiente</option>
                    <option value="recibida">Recibida</option>
                  </Select>
                </Field>
              </div>
              <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_160px_160px]">
                <Field htmlFor="purchase-description" label="Descripcion">
                  <Input id="purchase-description" name="description" placeholder="Detalle o referencia interna" />
                </Field>
                <Field htmlFor="purchase-total" label="Total">
                  <Input id="purchase-total" min="0" name="total" required step="0.01" type="number" />
                </Field>
                <Field htmlFor="purchase-quantity" label="Cantidad opcional">
                  <Input id="purchase-quantity" min="1" name="quantity" step="1" type="number" />
                </Field>
              </div>
              <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_auto] md:items-end">
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
                <Button type="submit">Crear compra</Button>
              </div>
            </form>
          </Card>
        ) : null}

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
                placeholder="Proveedor, descripcion o tipo"
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
            minWidth="1120px"
            tableLabel="Compras"
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>Compra</DataTableHead>
                <DataTableHead>Proveedor</DataTableHead>
                <DataTableHead>Fecha</DataTableHead>
                <DataTableHead>Estado</DataTableHead>
                <DataTableHead>Paquete</DataTableHead>
                <DataTableHead align="right">Total</DataTableHead>
                <DataTableHead align="right">Pagado</DataTableHead>
                <DataTableHead align="right">Saldo</DataTableHead>
                <DataTableHead>Acciones</DataTableHead>
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
                        <div className="font-mono text-xs">#{purchase.id}</div>
                        <div className="mt-1 text-xs text-[color:var(--muted)]">
                          {purchase.description || purchase.type || "-"}
                        </div>
                      </DataTableCell>
                      <DataTableCell>
                        <div className="font-medium">{purchase.supplierName || "Sin proveedor"}</div>
                        <div className="mt-1 text-xs text-[color:var(--muted)]">{purchase.type || "-"}</div>
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
                        <div className="grid min-w-[300px] gap-2">
                          <div className="flex gap-2">
                            <ButtonLink
                              aria-label={`Abrir orden de compra PDF ${purchase.id}`}
                              className="flex-1"
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
                              className="flex-1"
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
                          <form action={updatePurchaseStatusAction} className="flex min-w-0 gap-2">
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
                          {purchase.status === "recibida" ? (
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
                        </div>
                      </DataTableCell>
                    </DataTableRow>
                  );
                })
              )}
            </DataTableBody>
          </DataTable>
        </Card>
      </div>
    </ModulePage>
  );
}
