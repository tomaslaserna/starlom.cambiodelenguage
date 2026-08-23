import { ModulePage } from "@/components/module-page";
import { PaginationLinks } from "@/components/pagination-links";
import {
  AppIcon,
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
  PageHeader,
  SearchInput,
  Select,
  StatusBadge,
  TableHoverActionMenu,
  Toolbar,
  tableActionItemClass,
  type StatusBadgeTone,
} from "@/components/ui";
import { hasCompleteFiscalData } from "@/lib/client-fiscal";
import { formatDate } from "@/lib/format";
import { ORDER_STATUS_OPTIONS, orderStatusLabel } from "@/lib/order-status";
import { listOrders } from "@/lib/orders";
import { formatSaleCommercialCode } from "@/lib/sale-commercial-code";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { ORDERS_READ_PERMISSION, sessionAllows } from "@/lib/route-auth";
import { requestFiscalInvoiceAction, updateOrderStatusAction } from "@/app/orders/actions";

type OrdersPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    page?: string;
    error?: string;
    message?: string;
  }>;
};

const orderStates = [
  { value: "", label: "Todos los estados" },
  ...ORDER_STATUS_OPTIONS,
];

function orderStatusTone(value: string): StatusBadgeTone {
  if (value === "entregado") return "success";
  if (value === "confirmado") return "warning";
  if (value === "cancelado") return "danger";
  return "neutral";
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [ORDERS_READ_PERMISSION]);
  const params = await searchParams;
  const [result, canEditOrders] = await Promise.all([
    listOrders({
      companyId: session.companyId,
      query: params.q,
      status: params.status,
      page: params.page,
      pageSize: "25",
    }),
    sessionAllows(session, [{ resource: "pedidos", action: "editar" }]),
  ]);

  return (
    <ModulePage
      active="orders"
      description="Pedidos cargados, entregados o cancelados."
      session={session}
      title="Pedidos"
    >
      <div className="grid gap-5">
        <PageHeader
          description="Carga, entrega, cancelacion y apertura de cobro."
          moduleIntro
          title="Gestion de pedidos"
        />

        {params.error ? (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[color:var(--danger)] bg-[color:var(--danger-subtle)] px-4 py-3 text-sm font-semibold text-[color:var(--danger)]"
            role="alert"
          >
            <span>{params.message ?? "No se pudo actualizar el estado del pedido."}</span>
            {params.message?.startsWith("Stock insuficiente") ? (
              <ButtonLink href="/stock" size="sm" variant="secondary">
                Revisar stock
              </ButtonLink>
            ) : null}
          </div>
        ) : null}

        <Toolbar ariaLabel="Filtros de pedidos">
          <form
            action="/orders"
            className="grid w-full gap-4 lg:grid-cols-[minmax(320px,1fr)_260px_144px_144px] lg:items-end"
          >
            <Field htmlFor="orders-query" label="Buscar">
              <SearchInput
                defaultValue={result.meta.query}
                id="orders-query"
                key={`orders-query-${result.meta.query}`}
                name="q"
                placeholder="Cliente, CUIT o vendedor"
                type="search"
              />
            </Field>
            <Field htmlFor="orders-status" label="Estado">
              <Select
                defaultValue={result.meta.status}
                id="orders-status"
                key={`orders-status-${result.meta.status || "all"}`}
                name="status"
              >
                {orderStates.map((state) => (
                  <option key={state.value} value={state.value}>
                    {state.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button className="w-full min-w-28 font-extrabold" leadingIcon={<AppIcon name="filter" />} type="submit">
              Filtrar
            </Button>
            <ButtonLink
              className="w-full min-w-28 font-extrabold"
              href="/orders"
              leadingIcon={<AppIcon name="refresh" />}
              variant="outline"
            >
              Limpiar
            </ButtonLink>
          </form>
        </Toolbar>

        <Card className="overflow-hidden">
          <DataTable
            caption="Listado de pedidos filtrados"
            className="rounded-none border-0 shadow-none"
            minWidth="960px"
            tableLabel="Pedidos"
            tableProps={{ className: "table-fixed" }}
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead className="w-[11%] px-2">Pedido</DataTableHead>
                <DataTableHead className="w-[27%] px-2">Cliente</DataTableHead>
                <DataTableHead className="w-[14%] px-2">Vendedor</DataTableHead>
                <DataTableHead className="w-[12%] px-2">Fecha</DataTableHead>
                <DataTableHead className="w-[14%] px-2">Estado</DataTableHead>
                <DataTableHead align="center" className="w-[10%] px-2">Opciones</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {result.data.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={6}>
                    <EmptyState
                      description="Ajusta la busqueda o limpia los filtros para volver al listado completo."
                      title="No hay pedidos para los filtros actuales"
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                result.data.map((order) => {
                  const orderNumberLabel = formatSaleCommercialCode({
                    commercialNumber: order.commercialNumber,
                    saleNumber: order.saleNumber,
                    deliveryNumber: order.deliveryNumber,
                    legacyRemittanceNumber: order.receiptNumber,
                  });
                  const isOpenOrder = order.orderStatus === "cargado" || order.orderStatus === "confirmado";
                  const canInvoice = hasCompleteFiscalData({
                    taxId: order.customerDocument,
                    fiscalCondition: order.customerFiscalCondition,
                  });
                  const fiscalApproved = order.fiscalStatus === "aprobado";
                  const canRequestInvoice =
                    order.orderStatus === "entregado"
                    && canInvoice
                    && !fiscalApproved
                    && !order.hasPendingFiscalRequest;

                  return (
                    <DataTableRow key={order.id}>
                      <DataTableCell className="px-2 py-2">
                        <div className="inline-flex max-w-full truncate rounded-full bg-[#e8f0ff] px-2.5 py-1 font-mono text-xs font-black text-[#1d4ed8]">
                          #{orderNumberLabel}
                        </div>
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
                      <DataTableCell align="center" className="px-2 py-2">
                        <div className="flex justify-center">
                        <TableHoverActionMenu label={`Opciones del pedido ${orderNumberLabel}`}>
                          {isOpenOrder && canEditOrders ? (
                            <>
                              <form action={updateOrderStatusAction}>
                                <input name="id" type="hidden" value={order.id} />
                                <input name="status" type="hidden" value="entregado" />
                                <button
                                  aria-label={`Marcar entregado el pedido ${orderNumberLabel}`}
                                  className={tableActionItemClass}
                                  suppressHydrationWarning
                                  type="submit"
                                >
                                  Entregado
                                </button>
                              </form>
                              <form action={updateOrderStatusAction}>
                                <input name="id" type="hidden" value={order.id} />
                                <input name="status" type="hidden" value="cancelado" />
                                <button
                                  aria-label={`Cancelar pedido ${orderNumberLabel}`}
                                  className={`${tableActionItemClass} text-[color:var(--danger)] hover:bg-[color:var(--danger-subtle)] hover:text-[color:var(--danger)]`}
                                  suppressHydrationWarning
                                  type="submit"
                                >
                                  Cancelar
                                </button>
                              </form>
                              <a
                                aria-label={`Modificar pedido ${orderNumberLabel}`}
                                className={tableActionItemClass}
                                href={`/orders/${order.id}/edit`}
                              >
                                Modificar
                              </a>
                            </>
                          ) : null}
                          <a
                            aria-label={`Remito sin precios del pedido ${orderNumberLabel}`}
                            className={tableActionItemClass}
                            href={`/api/pdfs/orders/${order.id}/remito`}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Remito sin precios
                          </a>
                          <a
                            aria-label={`Remito con precios del pedido ${orderNumberLabel}`}
                            className={tableActionItemClass}
                            href={`/api/pdfs/orders/${order.id}/remito?precios=si`}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Remito con precios
                          </a>
                          {fiscalApproved ? (
                            <a
                              aria-label={`Factura fiscal del pedido ${orderNumberLabel}`}
                              className={`${tableActionItemClass} gap-2`}
                              href={`/api/pdfs/orders/${order.id}/document`}
                              rel="noreferrer"
                              target="_blank"
                            >
                              <AppIcon className="h-4 w-4" name="download" />
                              Factura
                            </a>
                          ) : order.hasPendingFiscalRequest ? (
                            <span
                              aria-label={`Factura solicitada del pedido ${orderNumberLabel}`}
                              className={`${tableActionItemClass} gap-2 cursor-default text-[color:var(--muted)] hover:bg-transparent hover:text-[color:var(--muted)]`}
                            >
                              <AppIcon className="h-4 w-4" name="clock" />
                              Factura Solicitada
                            </span>
                          ) : canRequestInvoice ? (
                            <form action={requestFiscalInvoiceAction}>
                              <input name="id" type="hidden" value={order.id} />
                              <button
                                aria-label={`Solicitar factura del pedido ${orderNumberLabel}`}
                                className={`${tableActionItemClass} gap-2`}
                                suppressHydrationWarning
                                type="submit"
                              >
                                <AppIcon className="h-4 w-4" name="invoice" />
                                Solicitar Factura
                              </button>
                            </form>
                          ) : null}
                        </TableHoverActionMenu>
                        </div>
                      </DataTableCell>
                    </DataTableRow>
                  );
                })
              )}
            </DataTableBody>
          </DataTable>
          <PaginationLinks
            basePath="/orders"
            extraParams={{
              status: result.meta.status,
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
