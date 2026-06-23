import { ModulePage } from "@/components/module-page";
import { PaginationLinks } from "@/components/pagination-links";
import { SectionTabs } from "@/components/section-tabs";
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
  cn,
  type StatusBadgeTone,
} from "@/components/ui";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { getOrdersDashboard, listOrders } from "@/lib/orders";
import { requireStaffSession } from "@/lib/auth";
import { updateOrderStatusAction } from "@/app/orders/actions";

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
  { value: "recibido", label: "Recibido" },
  { value: "en_proceso", label: "En proceso" },
  { value: "pendiente_entrega", label: "Pendiente entrega" },
  { value: "entregado", label: "Entregado" },
];

const collectionStates = [
  { value: "", label: "Todos los cobros" },
  { value: "pendiente", label: "Pendiente" },
  { value: "pendiente_aprobacion", label: "Pendiente aprobacion" },
  { value: "en_proceso", label: "En proceso" },
  { value: "recibido", label: "Recibido" },
  { value: "cancelado", label: "Cancelado" },
];

function statusLabel(value: string) {
  const normalized = value.replaceAll("_", " ").trim();
  if (!normalized) return "-";
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function orderStatusTone(value: string): StatusBadgeTone {
  if (value === "entregado") return "success";
  if (value === "en_proceso") return "info";
  if (value === "pendiente_entrega") return "warning";
  return "neutral";
}

function collectionStatusTone(value: string): StatusBadgeTone {
  if (value === "recibido") return "success";
  if (value === "pendiente_aprobacion" || value === "en_proceso") return "warning";
  if (value === "cancelado") return "danger";
  return "neutral";
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const session = await requireStaffSession();
  const params = await searchParams;
  const [result, dashboard] = await Promise.all([
    listOrders({
      companyId: session.companyId,
      query: params.q,
      status: params.status,
      collectionStatus: params.collectionStatus,
      page: params.page,
      pageSize: "25",
    }),
    getOrdersDashboard(session.companyId),
  ]);
  const pageAmount = result.data.reduce((sum, order) => sum + order.amount, 0);

  return (
    <ModulePage
      active="orders"
      description="Pedidos y ventas migrados a React/Node, con filtros por estado operativo y estado de cobro."
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
          description="Seguimiento de pedidos recibidos, en proceso, pendientes de entrega y entregados."
          title="Gestion de pedidos"
        />

        <SectionTabs
          tabs={[
            { href: "/orders", label: "Dashboard", active: !params.status },
            { href: "/orders?status=recibido", label: "Recibidos", active: params.status === "recibido", badge: dashboard.receivedMonth },
            { href: "/orders?status=en_proceso", label: "En proceso", active: params.status === "en_proceso", badge: dashboard.inProcess },
            { href: "/orders?status=pendiente_entrega", label: "Pendiente entrega", active: params.status === "pendiente_entrega", badge: dashboard.pendingDelivery },
          ]}
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
          <StatCard className="p-3" label="Recibidos este mes" value={formatNumber(dashboard.receivedMonth)} />
          <StatCard className="p-3" label="Entregados este mes" value={formatNumber(dashboard.deliveredMonth)} />
          <StatCard
            className="p-3"
            detail={`Importe pagina actual ${formatCurrency(pageAmount)}`}
            label="En proceso"
            value={formatNumber(dashboard.inProcess)}
          />
        </div>

        <Card className="overflow-hidden">
          <DataTable
            caption="Listado de pedidos filtrados"
            className="rounded-none border-0 shadow-none"
            minWidth="1160px"
            tableLabel="Pedidos"
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>Pedido</DataTableHead>
                <DataTableHead>Cliente</DataTableHead>
                <DataTableHead>Vendedor</DataTableHead>
                <DataTableHead>Fecha</DataTableHead>
                <DataTableHead>Estado</DataTableHead>
                <DataTableHead>Cobro</DataTableHead>
                <DataTableHead align="right">Total</DataTableHead>
                <DataTableHead>Stock</DataTableHead>
                <DataTableHead>Acciones</DataTableHead>
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
                  const statusSelectId = `order-${order.id}-status`;

                  return (
                    <DataTableRow key={order.id}>
                      <DataTableCell>
                        <div className="font-mono text-xs">#{order.id}</div>
                        <div className="mt-1 text-xs text-[color:var(--muted)]">
                          Comp. {order.receiptNumber || "-"}
                        </div>
                      </DataTableCell>
                      <DataTableCell>
                        <div className="font-medium">{order.customerName || "Sin cliente"}</div>
                        <div className="mt-1 font-mono text-xs text-[color:var(--muted)]">
                          {order.customerDocument || "-"}
                        </div>
                      </DataTableCell>
                      <DataTableCell>{order.seller || "-"}</DataTableCell>
                      <DataTableCell className="whitespace-nowrap">{formatDate(order.date)}</DataTableCell>
                      <DataTableCell>
                        <StatusBadge tone={orderStatusTone(order.orderStatus)}>
                          {statusLabel(order.orderStatus)}
                        </StatusBadge>
                      </DataTableCell>
                      <DataTableCell>
                        <StatusBadge tone={collectionStatusTone(order.collectionStatus)}>
                          {statusLabel(order.collectionStatus)}
                        </StatusBadge>
                      </DataTableCell>
                      <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs">
                        {formatCurrency(order.amount)}
                      </DataTableCell>
                      <DataTableCell>
                        <StatusBadge tone={order.stockDiscounted ? "success" : "warning"}>
                          {order.stockDiscounted ? "Descontado" : "Pendiente"}
                        </StatusBadge>
                      </DataTableCell>
                      <DataTableCell>
                        <div className="flex min-w-[320px] items-center gap-2">
                          <ButtonLink
                            aria-label={`Abrir solicitud PDF del pedido ${order.id}`}
                            className="shrink-0"
                            href={`/api/pdfs/orders/${order.id}/request`}
                            prefetch={false}
                            rel="noreferrer"
                            size="sm"
                            target="_blank"
                            variant="secondary"
                          >
                            Solicitud PDF
                          </ButtonLink>
                          <form action={updateOrderStatusAction} className="flex min-w-0 flex-1 gap-2">
                            <input name="id" type="hidden" value={order.id} />
                            <label className="sr-only" htmlFor={statusSelectId}>
                              Cambiar estado del pedido {order.id}
                            </label>
                            <Select
                              className="min-h-9 flex-1 px-2 text-xs"
                              defaultValue={order.orderStatus}
                              id={statusSelectId}
                              name="status"
                            >
                              {orderStates.slice(1).map((state) => (
                                <option key={state.value} value={state.value}>
                                  {state.label}
                                </option>
                              ))}
                            </Select>
                            <Button
                              aria-label={`Guardar estado del pedido ${order.id}`}
                              className={cn("min-h-9 px-3 text-xs")}
                              size="sm"
                              type="submit"
                            >
                              Guardar
                            </Button>
                          </form>
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
