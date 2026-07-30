import { ModulePage } from "@/components/module-page";
import { MetricIcon } from "@/components/metric-icon";
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
  StatCard,
  Toolbar,
} from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { listOrders } from "@/lib/orders";
import { formatSaleCommercialCode } from "@/lib/sale-commercial-code";
import { getSalesSummary } from "@/lib/sales-admin";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { SALES_READ_PERMISSION, sessionCanDeleteOperationalRecords } from "@/lib/route-auth";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { deleteSaleAction } from "@/app/sales/actions";

type SalesPageProps = {
  searchParams: Promise<{ q?: string; page?: string; error?: string; message?: string }>;
};

export default async function SalesPage({ searchParams }: SalesPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [SALES_READ_PERMISSION]);
  const params = await searchParams;
  const [summary, sales, canDeleteRecords] = await Promise.all([
    getSalesSummary(session.companyId, "mes"),
    listOrders({
      companyId: session.companyId,
      query: params.q,
      status: "entregado",
      page: params.page,
      pageSize: "25",
    }),
    sessionCanDeleteOperationalRecords(session),
  ]);

  return (
    <ModulePage
      active="sales"
      description="Registro de pedidos entregados que ya cuentan como venta."
      session={session}
      title="Ventas"
    >
      <div className="grid gap-5">
        <PageHeader
          description="Listado de ventas entregadas, con su cliente, vendedor, fecha y monto."
          moduleIntro
          title="Registro de ventas"
        />

        {params.error ? (
          <div
            className="rounded-lg border border-[color:var(--danger)] bg-[color:var(--danger-subtle)] px-4 py-3 text-sm font-semibold text-[color:var(--danger)]"
            role="alert"
          >
            {params.message ?? "No se pudo borrar la venta."}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-4">
          <StatCard icon={<MetricIcon name="document" />} label="Comprobantes" tone="accent" value={summary.totalInvoices} />
          <StatCard icon={<MetricIcon name="sales" />} label="Monto vendido" tone="success" value={formatCurrency(summary.totalAmount)} />
          <StatCard icon={<MetricIcon name="receipt" />} label="Facturado" tone="info" value={formatCurrency(summary.invoiced)} />
          <StatCard icon={<MetricIcon name="wallet" />} label="Pendiente de cobro" tone="warning" value={formatCurrency(summary.pending)} />
        </div>

        <Toolbar ariaLabel="Buscar ventas">
          <form action="/sales" className="grid w-full gap-3 lg:grid-cols-[minmax(240px,1fr)_auto_auto] lg:items-end">
            <Field htmlFor="sales-query" label="Buscar">
              <Input
                defaultValue={sales.meta.query}
                id="sales-query"
                key={`sales-query-${sales.meta.query}`}
                name="q"
                placeholder="Cliente, CUIT o vendedor"
                type="search"
              />
            </Field>
            <Button className="lg:mb-0" type="submit">
              Filtrar
            </Button>
            <ButtonLink href="/sales" variant="secondary">
              Limpiar
            </ButtonLink>
          </form>
        </Toolbar>

        <Card className="overflow-hidden">
          <DataTable
            caption="Listado de ventas entregadas"
            className="rounded-none border-0 shadow-none"
            minWidth="1040px"
            tableLabel="Ventas"
            tableProps={{ className: "table-fixed" }}
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead className="w-[13%] px-2">Venta</DataTableHead>
                <DataTableHead className="w-[30%] px-2">Cliente</DataTableHead>
                <DataTableHead className="w-[16%] px-2">Vendedor</DataTableHead>
                <DataTableHead className="w-[13%] px-2">Fecha</DataTableHead>
                <DataTableHead className="w-[13%] px-2">Monto</DataTableHead>
                <DataTableHead align="center" className="w-[10%] px-2">Comprobante</DataTableHead>
                {canDeleteRecords ? <DataTableHead className="w-[10%] px-2">Acciones</DataTableHead> : null}
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {sales.data.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={canDeleteRecords ? 7 : 6}>
                    <EmptyState
                      description="Ajusta la busqueda para volver al listado completo de ventas entregadas."
                      title="No hay ventas entregadas para los filtros actuales"
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                sales.data.map((sale) => {
                  const saleNumberLabel = formatSaleCommercialCode({
                    commercialNumber: sale.commercialNumber,
                    saleNumber: sale.saleNumber,
                    deliveryNumber: sale.deliveryNumber,
                    legacyRemittanceNumber: sale.receiptNumber,
                  });

                  return (
                    <DataTableRow key={sale.id}>
                      <DataTableCell className="px-2 py-2">
                        <div className="truncate font-mono text-xs font-black">#{saleNumberLabel}</div>
                      </DataTableCell>
                      <DataTableCell className="px-2 py-2">
                        <div className="truncate font-medium">{sale.customerName || "Sin cliente"}</div>
                        <div className="mt-1 truncate font-mono text-xs text-[color:var(--muted)]">
                          {sale.customerDocument || "-"}
                        </div>
                      </DataTableCell>
                      <DataTableCell className="truncate px-2 py-2">{sale.seller || "-"}</DataTableCell>
                      <DataTableCell className="whitespace-nowrap px-2 py-2 text-xs">{formatDate(sale.date)}</DataTableCell>
                      <DataTableCell className="whitespace-nowrap px-2 py-2 text-xs font-semibold">
                        {formatCurrency(sale.amount)}
                      </DataTableCell>
                      <DataTableCell align="center" className="px-2 py-2">
                        <a
                          aria-label={`Ver PDF de solicitud de la venta ${saleNumberLabel}`}
                          className="text-xs font-black text-[color:var(--accent-strong)] hover:underline"
                          href={`/api/pdfs/orders/${sale.id}/request`}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Ver PDF
                        </a>
                      </DataTableCell>
                      {canDeleteRecords ? (
                        <DataTableCell className="px-2 py-2">
                          <form action={deleteSaleAction}>
                            <input name="id" type="hidden" value={sale.id} />
                            <ConfirmDeleteButton
                              aria-label={`Borrar venta ${saleNumberLabel}`}
                              className="w-full px-2"
                              confirmation={`¿Borrar definitivamente la venta #${saleNumberLabel}? Esta acción también elimina sus movimientos relacionados.`}
                              size="sm"
                            />
                          </form>
                        </DataTableCell>
                      ) : null}
                    </DataTableRow>
                  );
                })
              )}
            </DataTableBody>
          </DataTable>
          <PaginationLinks
            basePath="/sales"
            page={sales.meta.page}
            query={sales.meta.query}
            totalPages={sales.meta.totalPages}
          />
        </Card>
      </div>
    </ModulePage>
  );
}
