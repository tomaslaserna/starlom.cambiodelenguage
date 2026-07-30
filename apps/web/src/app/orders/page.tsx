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
  StatusBadge,
  Toolbar,
  type StatusBadgeTone,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import { ORDER_STATUS_OPTIONS, orderStatusLabel } from "@/lib/order-status";
import { listOrders } from "@/lib/orders";
import { formatSaleCommercialCode } from "@/lib/sale-commercial-code";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { ORDERS_READ_PERMISSION, sessionAllows } from "@/lib/route-auth";
import { updateOrderStatusAction } from "@/app/orders/actions";

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

const actionItemClass =
  "block min-h-9 w-full appearance-none rounded-[6px] border-0 bg-transparent px-2.5 py-2 text-left text-sm font-semibold leading-5 text-[color:var(--foreground)] transition-colors hover:bg-[color:var(--hover)] hover:text-[color:var(--accent-strong)]";

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
            className="grid w-full gap-3 lg:grid-cols-[minmax(240px,1fr)_210px_auto_auto] lg:items-end"
          >
            <Field htmlFor="orders-query" label="Buscar">
              <Input
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
            <Button className="min-w-28 font-extrabold lg:mb-0" type="submit">
              Filtrar
            </Button>
            <ButtonLink className="min-w-28 font-extrabold" href="/orders" variant="secondary">
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
                <DataTableHead className="w-[22%] px-2">Acciones</DataTableHead>
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

                  return (
                    <DataTableRow key={order.id}>
                      <DataTableCell className="px-2 py-2">
                        <div className="truncate font-mono text-xs font-black">#{orderNumberLabel}</div>
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
                        <details className="erp-action-menu">
                          <summary>
                            Acciones
                          </summary>
                          <div className="grid gap-0.5">
                            {isOpenOrder && canEditOrders ? (
                              <>
                                <form action={updateOrderStatusAction}>
                                  <input name="id" type="hidden" value={order.id} />
                                  <input name="status" type="hidden" value="entregado" />
                                  <button
                                    aria-label={`Marcar entregado el pedido ${orderNumberLabel}`}
                                    className={actionItemClass}
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
                                    className={`${actionItemClass} text-[color:var(--danger)] hover:text-[color:var(--danger)]`}
                                    suppressHydrationWarning
                                    type="submit"
                                  >
                                    Cancelar
                                  </button>
                                </form>
                                <a
                                  aria-label={`Modificar pedido ${orderNumberLabel}`}
                                  className={actionItemClass}
                                  href={`/orders/${order.id}/edit`}
                                >
                                  Modificar
                                </a>
                              </>
                            ) : null}
                            <a
                              aria-label={`Ver PDF del pedido ${orderNumberLabel}`}
                              className={actionItemClass}
                              href={`/api/pdfs/orders/${order.id}/document`}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Ver PDF
                            </a>
                          </div>
                        </details>
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
