import { Fragment } from "react";
import { ModulePage } from "@/components/module-page";
import { PaginationLinks } from "@/components/pagination-links";
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
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { ORDER_STATUS_OPTIONS, orderStatusLabel } from "@/lib/order-status";
import { getOrdersDashboard, listOrders, type OrderSummary } from "@/lib/orders";
import { desiredDocumentLabel, invoiceDocumentForFiscalCondition } from "@/lib/receipt-types";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import {
  COLLECTIONS_CREATE_PERMISSION,
  ORDERS_READ_PERMISSION,
  sessionAllows,
} from "@/lib/route-auth";
import { registerOrderCollectionAction, updateOrderStatusAction } from "@/app/orders/actions";

type OrdersPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    collectionStatus?: string;
    page?: string;
  }>;
};

const orderStates = [
  { value: "", label: "Todos los estados" },
  ...ORDER_STATUS_OPTIONS,
];

const collectionStates = [
  { value: "", label: "Todos los cobros" },
  { value: "no_aplica", label: "No habilitado" },
  { value: "pendiente", label: "Pendiente" },
  { value: "pendiente_aprobacion", label: "Pendiente aprobacion" },
  { value: "recibido", label: "Cobrado" },
  { value: "vencido", label: "Vencido" },
  { value: "cancelado", label: "Cancelado" },
];

function statusLabel(value: string) {
  const normalized = value.replaceAll("_", " ").trim();
  if (!normalized) return "-";
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function orderStatusTone(value: string): StatusBadgeTone {
  if (value === "entregado") return "success";
  if (value === "confirmado") return "warning";
  if (value === "cancelado") return "danger";
  return "neutral";
}

function collectionStatusTone(value: string): StatusBadgeTone {
  if (value === "recibido") return "success";
  if (value === "pendiente_aprobacion" || value === "en_proceso") return "warning";
  if (value === "cancelado") return "danger";
  return "neutral";
}

function collectionStatusLabel(value: string) {
  if (value === "recibido") return "Cobrado";
  if (value === "pendiente_aprobacion") return "Pendiente aprobacion";
  return statusLabel(value);
}

function canRegisterCollectionStatus(value: string) {
  return value === "pendiente" || value === "vencido";
}

function orderCollectionLabel(orderStatus: string, collectionStatus: string) {
  if (orderStatus !== "entregado") return "No habilitado";
  return collectionStatusLabel(collectionStatus);
}

function stockLabel(orderStatus: string, stockDiscounted: boolean) {
  if (stockDiscounted) return "Descontado";
  if (orderStatus === "confirmado") return "Para stock";
  if (orderStatus === "entregado") return "Pendiente";
  return "-";
}

type OrderStatusAction = {
  status: string;
  document: string;
  label: string;
  variant: "default" | "secondary";
};

function confirmationActions(order: OrderSummary): OrderStatusAction[] {
  const invoiceDocument = invoiceDocumentForFiscalCondition(
    order.customerFiscalCondition,
    order.desiredDocument,
  );
  const actions: OrderStatusAction[] = [];
  if (invoiceDocument !== "remito") {
    actions.push({
      status: "confirmado",
      document: invoiceDocument,
      label: "Factura",
      variant: "default" as const,
    });
  }
  actions.push({
    status: "confirmado",
    document: "remito",
    label: "Remito sin factura",
    variant: invoiceDocument === "remito" ? ("default" as const) : ("secondary" as const),
  });
  actions.push({
    status: "cancelado",
    document: "",
    label: "Cancelar",
    variant: "secondary" as const,
  });
  return actions;
}

function statusActions(order: OrderSummary): OrderStatusAction[] {
  if (order.orderStatus === "cargado") return confirmationActions(order);
  if (order.orderStatus === "confirmado") {
    return [
      { status: "entregado", document: "", label: "Entregado", variant: "default" as const },
      { status: "cancelado", document: "", label: "Cancelar", variant: "secondary" as const },
    ];
  }
  return [];
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [ORDERS_READ_PERMISSION]);
  const params = await searchParams;
  const [result, dashboard, canRegisterCollections] = await Promise.all([
    listOrders({
      companyId: session.companyId,
      query: params.q,
      status: params.status,
      collectionStatus: params.collectionStatus,
      page: params.page,
      pageSize: "25",
    }),
    getOrdersDashboard(session.companyId),
    sessionAllows(session, [COLLECTIONS_CREATE_PERMISSION]),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <ModulePage
      active="orders"
      description="Pedidos cargados, confirmados para stock y entregados."
      session={session}
      title="Pedidos"
    >
      <div className="grid gap-5">
        <PageHeader
          actions={
            <ButtonLink
              aria-label="Cargar nuevo pedido"
              href="/orders/new"
            >
              Cargar pedido
            </ButtonLink>
          }
          description="Carga, confirmacion para stock, entrega y apertura de cobro."
          title="Gestion de pedidos"
        />

        <Toolbar ariaLabel="Filtros de pedidos">
          <form
            action="/orders"
            className="grid w-full gap-3 lg:grid-cols-[minmax(240px,1fr)_210px_210px_auto_auto] lg:items-end"
          >
            <Field htmlFor="orders-query" label="Buscar">
              <Input
                defaultValue={result.meta.query}
                id="orders-query"
                name="q"
                placeholder="Cliente, CUIT o vendedor"
                type="search"
              />
            </Field>
            <Field htmlFor="orders-status" label="Estado">
              <Select defaultValue={result.meta.status} id="orders-status" name="status">
                {orderStates.map((state) => (
                  <option key={state.value} value={state.value}>
                    {state.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field htmlFor="orders-collection-status" label="Cobro">
              <Select
                defaultValue={result.meta.collectionStatus}
                id="orders-collection-status"
                name="collectionStatus"
              >
                {collectionStates.map((state) => (
                  <option key={state.value} value={state.value}>
                    {state.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button className="lg:mb-0" type="submit">
              Filtrar
            </Button>
            <ButtonLink href="/orders" variant="secondary">
              Limpiar
            </ButtonLink>
          </form>
        </Toolbar>

        <div className="grid gap-3 md:grid-cols-3">
          <StatCard className="p-3" label="Cargados este mes" value={formatNumber(dashboard.loadedMonth)} />
          <StatCard className="p-3" label="Confirmados para stock" value={formatNumber(dashboard.confirmed)} />
          <StatCard className="p-3" label="Entregados este mes" value={formatNumber(dashboard.deliveredMonth)} />
        </div>

        <Card className="overflow-hidden">
          <DataTable
            caption="Listado de pedidos filtrados"
            className="rounded-none border-0 shadow-none"
            minWidth="0"
            tableLabel="Pedidos"
            tableProps={{ className: "table-fixed" }}
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead className="w-[9%] px-2">Pedido</DataTableHead>
                <DataTableHead className="w-[17%] px-2">Cliente</DataTableHead>
                <DataTableHead className="w-[8%] px-2">Vendedor</DataTableHead>
                <DataTableHead className="w-[8%] px-2">Fecha</DataTableHead>
                <DataTableHead className="w-[9%] px-2">Estado</DataTableHead>
                <DataTableHead className="w-[9%] px-2">Cobro</DataTableHead>
                <DataTableHead align="right" className="w-[8%] px-2">Total</DataTableHead>
                <DataTableHead className="w-[9%] px-2">Stock</DataTableHead>
                <DataTableHead className="w-[23%] px-2">Acciones</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {result.data.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={9}>
                    <EmptyState
                      description="Ajusta la busqueda o limpia los filtros para volver al listado completo."
                      title="No hay pedidos para los filtros actuales"
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                result.data.map((order) => {
                  const defaultCollectionAmount = Math.max(order.outstandingAmount, 0);
                  const amountInputId = `order-${order.id}-collection-amount`;
                  const dateInputId = `order-${order.id}-collection-date`;
                  const methodSelectId = `order-${order.id}-collection-method`;
                  const destinationInputId = `order-${order.id}-collection-destination`;
                  const operationInputId = `order-${order.id}-collection-operation`;
                  const notesInputId = `order-${order.id}-collection-notes`;
                  const orderNumberLabel = order.receiptNumber ? String(order.receiptNumber) : order.id.slice(0, 8);
                  const actions = statusActions(order);
                  const stockBadgeTone: StatusBadgeTone = order.stockDiscounted
                    ? "success"
                    : order.orderStatus === "confirmado"
                      ? "warning"
                      : "neutral";
                  const canRegisterCollection =
                    canRegisterCollections &&
                    order.orderStatus === "entregado" &&
                    canRegisterCollectionStatus(order.collectionStatus) &&
                    defaultCollectionAmount > 0;

                  return (
                    <Fragment key={order.id}>
                      <DataTableRow>
                        <DataTableCell className="px-2 py-2">
                          <div className="truncate font-mono text-xs font-black">#{orderNumberLabel}</div>
                          <div className="mt-1 truncate text-[11px] text-[color:var(--muted)]">ID {order.id.slice(0, 8)}</div>
                        </DataTableCell>
                        <DataTableCell className="px-2 py-2">
                          <div className="truncate font-medium">{order.customerName || "Sin cliente"}</div>
                          <div className="mt-1 truncate font-mono text-xs text-[color:var(--muted)]">
                            {order.customerDocument || "-"}
                          </div>
                        </DataTableCell>
                        <DataTableCell className="truncate px-2 py-2">{order.seller || "-"}</DataTableCell>
                        <DataTableCell className="whitespace-nowrap px-2 py-2 text-xs">{formatDate(order.date)}</DataTableCell>
                        <DataTableCell className="px-2 py-2">
                          <StatusBadge tone={orderStatusTone(order.orderStatus)}>
                            {orderStatusLabel(order.orderStatus)}
                          </StatusBadge>
                        </DataTableCell>
                        <DataTableCell className="px-2 py-2">
                          <StatusBadge tone={order.orderStatus === "entregado" ? collectionStatusTone(order.collectionStatus) : "neutral"}>
                            {orderCollectionLabel(order.orderStatus, order.collectionStatus)}
                          </StatusBadge>
                        </DataTableCell>
                        <DataTableCell align="right" className="whitespace-nowrap px-2 py-2 font-mono text-xs">
                          <div>{formatCurrency(order.amount)}</div>
                          <div className="mt-1 text-[11px] text-[color:var(--muted)]">
                            {desiredDocumentLabel(order.desiredDocument)}
                          </div>
                          {order.collectedAmount > 0 ? (
                            <div className="mt-1 text-[11px] text-[color:var(--muted)]">
                              Saldo {formatCurrency(order.outstandingAmount)}
                            </div>
                          ) : null}
                        </DataTableCell>
                        <DataTableCell className="px-2 py-2">
                          <StatusBadge tone={stockBadgeTone}>
                            {stockLabel(order.orderStatus, order.stockDiscounted)}
                          </StatusBadge>
                        </DataTableCell>
                        <DataTableCell className="px-2 py-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            {order.orderStatus === "cargado" ? (
                              <ButtonLink
                                aria-label={`Modificar pedido ${order.id}`}
                                className="shrink-0"
                                href={`/orders/${order.id}/edit`}
                                size="sm"
                                variant="secondary"
                              >
                                Modificar
                              </ButtonLink>
                            ) : null}
                            {order.orderStatus !== "cargado" ? (
                              <ButtonLink
                                aria-label={`Abrir orden de stock del pedido ${order.id}`}
                                className="shrink-0"
                                href={`/api/pdfs/orders/${order.id}/request`}
                                prefetch={false}
                                rel="noreferrer"
                                size="sm"
                                target="_blank"
                                variant="secondary"
                              >
                                PDF stock
                              </ButtonLink>
                            ) : null}
                            {actions.length > 0 ? (
                              actions.map((action) => (
                                <form action={updateOrderStatusAction} key={`${action.status}-${action.document}`}>
                                  <input name="id" type="hidden" value={order.id} />
                                  <input name="status" type="hidden" value={action.status} />
                                  {action.document ? (
                                    <input
                                      name="confirmationDocument"
                                      type="hidden"
                                      value={action.document}
                                    />
                                  ) : null}
                                  <Button
                                    aria-label={`${action.label} pedido ${order.id}`}
                                    className="min-h-9 px-2 text-xs"
                                    size="sm"
                                    type="submit"
                                    variant={action.variant}
                                  >
                                    {action.label}
                                  </Button>
                                </form>
                              ))
                            ) : (
                              <span className="text-xs font-semibold text-[color:var(--muted)]">
                                {order.orderStatus === "entregado" ? "Venta generada" : "Sin acciones"}
                              </span>
                            )}
                          </div>
                        </DataTableCell>
                      </DataTableRow>
                      {canRegisterCollection ? (
                        <DataTableRow className="bg-[#f8fbff] hover:bg-[#f8fbff]">
                          <DataTableCell className="px-2 py-2" colSpan={9}>
                            <details className="rounded-md border border-[color:var(--border)] bg-white px-3 py-2">
                              <summary className="cursor-pointer select-none font-black text-[color:var(--accent-strong)]">
                                Registrar cobro
                                <span className="ml-2 font-semibold text-[color:var(--muted)]">
                                  Saldo {formatCurrency(defaultCollectionAmount)} - se envia a aprobacion
                                </span>
                              </summary>
                              <form
                                action={registerOrderCollectionAction}
                                className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-[120px_145px_150px_minmax(160px,1fr)_minmax(150px,1fr)_minmax(180px,1fr)_auto] xl:items-end"
                              >
                                <input name="id" type="hidden" value={order.id} />
                                <Field htmlFor={amountInputId} label="Monto">
                                  <Input
                                    className="min-h-9 px-2 text-xs"
                                    defaultValue={defaultCollectionAmount.toFixed(2)}
                                    id={amountInputId}
                                    max={defaultCollectionAmount.toFixed(2)}
                                    min="0.01"
                                    name="amount"
                                    required
                                    step="0.01"
                                    type="number"
                                  />
                                </Field>
                                <Field htmlFor={dateInputId} label="Fecha">
                                  <Input
                                    className="min-h-9 px-2 text-xs"
                                    defaultValue={today}
                                    id={dateInputId}
                                    name="date"
                                    required
                                    type="date"
                                  />
                                </Field>
                                <Field htmlFor={methodSelectId} label="Metodo">
                                  <Select
                                    className="min-h-9 px-2 text-xs"
                                    defaultValue="efectivo"
                                    id={methodSelectId}
                                    name="method"
                                  >
                                    <option value="efectivo">Efectivo</option>
                                    <option value="transferencia">Transferencia</option>
                                    <option value="echeck">E-check</option>
                                  </Select>
                                </Field>
                                <Field htmlFor={destinationInputId} label="Destino">
                                  <Input
                                    className="min-h-9 px-2 text-xs"
                                    defaultValue="Caja"
                                    id={destinationInputId}
                                    name="destination"
                                    placeholder="Cuenta o caja"
                                    required
                                  />
                                </Field>
                                <Field htmlFor={operationInputId} label="Operacion">
                                  <Input
                                    className="min-h-9 px-2 text-xs"
                                    id={operationInputId}
                                    name="operation"
                                    placeholder="Nro. o referencia"
                                  />
                                </Field>
                                <Field htmlFor={notesInputId} label="Notas">
                                  <Input
                                    className="min-h-9 px-2 text-xs"
                                    id={notesInputId}
                                    name="notes"
                                    placeholder="Opcional"
                                  />
                                </Field>
                                <Button className="min-h-9 px-3 text-xs" size="sm" type="submit">
                                  Registrar
                                </Button>
                              </form>
                            </details>
                          </DataTableCell>
                        </DataTableRow>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </DataTableBody>
          </DataTable>
          <PaginationLinks
            basePath="/orders"
            extraParams={{
              status: result.meta.status,
              collectionStatus: result.meta.collectionStatus,
            }}
            page={result.meta.page}
            query={result.meta.query}
            totalPages={result.meta.totalPages}
          />
        </Card>
      </div>
    </ModulePage>
  );
}
