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
  StatCard,
  Toolbar,
} from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { listOrders } from "@/lib/orders";
import { formatSaleCommercialCode } from "@/lib/sale-commercial-code";
import { getSalesSummary } from "@/lib/sales-admin";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import {
  SALES_READ_PERMISSION,
  sessionAllows,
  sessionCanDeleteOperationalRecords,
} from "@/lib/route-auth";
import { SaleRowActions } from "@/app/sales/sale-row-actions";
import { cancelSaleAction, deleteSaleAction, editSaleAction } from "@/app/sales/actions";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";

const SALES_EDIT_PERMISSION = { resource: "ventas", action: "editar" } as const;

type SalesPageProps = {
  searchParams: Promise<{ q?: string; page?: string; error?: string; message?: string }>;
};

export default async function SalesPage({ searchParams }: SalesPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [SALES_READ_PERMISSION]);
  const params = await searchParams;
  const [summary, sales, canEdit, canDeleteRecords] = await Promise.all([
    getSalesSummary(session.companyId, "mes"),
    listOrders({
      companyId: session.companyId,
      query: params.q,
      status: "entregado",
      page: params.page,
      pageSize: "25",
    }),
    sessionAllows(session, [SALES_EDIT_PERMISSION]),
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
          <StatCard icon={<AppIcon className="h-6 w-6" name="receipt" />} label="Comprobantes" tone="accent" value={summary.totalInvoices} />
          <StatCard icon={<AppIcon className="h-6 w-6" name="money" />} label="Monto vendido" tone="success" value={formatCurrency(summary.totalAmount)} />
          <StatCard icon={<AppIcon className="h-6 w-6" name="trend" />} label="Facturado" tone="accent" value={formatCurrency(summary.invoiced)} />
          <StatCard icon={<AppIcon className="h-6 w-6" name="clock" />} label="Pendiente de cobro" tone="warning" value={formatCurrency(summary.pending)} />
        </div>

        <Toolbar ariaLabel="Buscar ventas">
          <form action="/sales" className="grid w-full gap-4 lg:grid-cols-[minmax(320px,1fr)_144px_144px] lg:items-end">
            <Field htmlFor="sales-query" label="Buscar">
              <SearchInput
                defaultValue={sales.meta.query}
                id="sales-query"
                key={`sales-query-${sales.meta.query}`}
                name="q"
                placeholder="Cliente, CUIT o vendedor"
                type="search"
              />
            </Field>
            <Button className="w-full" leadingIcon={<AppIcon name="filter" />} type="submit">
              Filtrar
            </Button>
            <ButtonLink className="w-full" href="/sales" leadingIcon={<AppIcon name="refresh" />} variant="outline">
              Limpiar
            </ButtonLink>
          </form>
        </Toolbar>

        <Card className="overflow-hidden">
          <DataTable
            caption="Listado de ventas entregadas"
            className="rounded-none border-0 shadow-none"
            minWidth="960px"
            tableLabel="Ventas"
            tableProps={{ className: "table-fixed" }}
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead className="w-[11%] px-2">Venta</DataTableHead>
                <DataTableHead className="w-[29%] px-2">Cliente</DataTableHead>
                <DataTableHead className="w-[14%] px-2">Vendedor</DataTableHead>
                <DataTableHead className="w-[13%] px-2">Fecha</DataTableHead>
                <DataTableHead className="w-[14%] px-2">Monto</DataTableHead>
                <DataTableHead className="w-[19%] px-2">Acciones</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {sales.data.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={6}>
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
                        <div className="inline-flex max-w-full truncate rounded-full bg-[#e6f6f1] px-2.5 py-1 font-mono text-xs font-black text-[#087a63]">
                          #{saleNumberLabel}
                        </div>
                      </DataTableCell>
                      <DataTableCell className="px-2 py-2">
                        <div className="truncate font-medium">{sale.customerName || "Sin cliente"}</div>
                        <div className="mt-1 truncate font-mono text-xs text-[color:var(--muted)]">
                          {sale.customerDocument || "-"}
                        </div>
                      </DataTableCell>
                      <DataTableCell className="truncate px-2 py-2">{sale.seller || "-"}</DataTableCell>
                      <DataTableCell className="whitespace-nowrap px-2 py-2 text-xs">{formatDate(sale.date)}</DataTableCell>
                      <DataTableCell className="whitespace-nowrap px-2 py-2 text-xs font-bold text-[#08783b]">
                        {formatCurrency(sale.amount)}
                      </DataTableCell>
                      <DataTableCell className="px-2 py-2">
                        <div className="flex items-start gap-2">
                          <div className="min-w-[142px] flex-1">
                            <SaleRowActions
                              canEdit={canEdit}
                              cancelAction={cancelSaleAction}
                              editAction={editSaleAction}
                              sale={{
                                id: sale.id,
                                receiptLabel: `#${saleNumberLabel}`,
                                customerName: sale.customerName,
                                customerDocument: sale.customerDocument,
                                date: sale.date ?? "",
                                amount: sale.amount,
                                seller: sale.seller,
                                paymentCondition: sale.paymentCondition,
                                receiptNumber: sale.receiptNumber,
                              }}
                            />
                          </div>
                          {canDeleteRecords ? (
                            <form action={deleteSaleAction} className="shrink-0">
                              <input name="id" type="hidden" value={sale.id} />
                              <ConfirmDeleteButton
                                aria-label={`Borrar venta ${saleNumberLabel}`}
                                className="h-10 min-h-10 w-10 min-w-10 p-0 [&>span]:flex [&>span]:h-5 [&>span]:w-5 [&>span]:shrink-0 [&>span]:items-center [&>span]:justify-center"
                                confirmation={`¿Borrar definitivamente la venta #${saleNumberLabel}? Esta acción también elimina sus movimientos relacionados.`}
                                size="sm"
                                title="Borrar venta"
                              >
                                <TrashIcon />
                              </ConfirmDeleteButton>
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

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      className="block h-5 w-5 shrink-0"
      fill="none"
      height="20"
      viewBox="0 0 24 24"
      width="20"
    >
      <path d="M4.5 7h15" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M9 7V4.75h6V7" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
      <path d="m7 7 .75 12h8.5L17 7" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
      <path d="M10 10.5v5M14 10.5v5" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}
