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
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { ORDERS_READ_PERMISSION } from "@/lib/route-auth";
import { updateOrderStatusAction } from "@/app/orders/actions";

type OrdersPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    page?: string;
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
  "flex w-full items-center rounded-[6px] px-2.5 py-1.5 text-left text-xs font-semibold text-[color:var(--foreground)] transition-colors hover:bg-[color:var(--hover)] hover:text-[color:var(--accent-strong)]";

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [ORDERS_READ_PERMISSION]);
  const params = await searchParams;
  const result = await listOrders({
    companyId: session.companyId,
    query: params.q,
    status: params.status,
    page: params.page,
    pageSize: "25",
  });

  return (
    <ModulePage
      active="orders"
      description="Pedidos cargados, confirmados para stock y entregados."
      session={session}
      title="Pedidos"
    >
      <div className="grid gap-5">
        <PageHeader
          description="Carga, confirmacion para stock, entrega y apertura de cobro."
          moduleIntro
          title="Gestion de pedidos"
        />

        <Toolbar ariaLabel="Filtros de pedidos">
          <form
            action="/orders"
            className="grid w-full gap-3 lg:grid-cols-[minmax(240px,1fr)_210px_auto_auto] lg:items-end"
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
            <Button className="lg:mb-0" type="submit">
              Filtrar
            </Button>
            <ButtonLink href="/orders" variant="secondary">
              Limpiar
            </ButtonLink>
          </form>
        </Toolbar>

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
                  const orderNumberLabel = order.receiptNumber ? String(order.receiptNumber) : order.id.slice(0, 8);
                  const isOpenOrder = order.orderStatus === "cargado" || order.orderStatus === "confirmado";

                  return (
                    <DataTableRow key={order.id}>
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
                        <details className="rounded-[8px] border border-[color:var(--border)] bg-white">
                          <summary className="cursor-pointer select-none rounded-[8px] px-2.5 py-1.5 text-xs font-black text-[color:var(--accent-strong)]">
                            Acciones
                          </summary>
                          <div className="grid gap-0.5 border-t border-[color:var(--border)] p-1">
                            <a
                              aria-label={`Ver documento del pedido ${order.id}`}
                              className={actionItemClass}
                              href={`/api/pdfs/orders/${order.id}/document`}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Ver documento
                            </a>
                            {isOpenOrder ? (
                              <>
                                <a
                                  aria-label={`Modificar pedido ${order.id}`}
                                  className={actionItemClass}
                                  href={`/orders/${order.id}/edit`}
                                >
                                  Modificar
                                </a>
                                <form action={updateOrderStatusAction}>
                                  <input name="id" type="hidden" value={order.id} />
                                  <input name="status" type="hidden" value="entregado" />
                                  <button
                                    aria-label={`Marcar entregado el pedido ${order.id}`}
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
                                    aria-label={`Cancelar pedido ${order.id}`}
                                    className={`${actionItemClass} text-[color:var(--danger)] hover:text-[color:var(--danger)]`}
                                    suppressHydrationWarning
                                    type="submit"
                                  >
                                    Cancelar
                                  </button>
                                </form>
                              </>
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
