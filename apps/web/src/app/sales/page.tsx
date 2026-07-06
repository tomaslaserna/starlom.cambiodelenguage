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
  StatCard,
  Toolbar,
} from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { listOrders } from "@/lib/orders";
import { getSalesSummary } from "@/lib/sales-admin";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { SALES_READ_PERMISSION } from "@/lib/route-auth";

type SalesPageProps = {
  searchParams: Promise<{ q?: string; page?: string }>;
};

export default async function SalesPage({ searchParams }: SalesPageProps) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [SALES_READ_PERMISSION]);
  const params = await searchParams;
  const [summary, sales] = await Promise.all([
    getSalesSummary(session.companyId, "mes"),
    listOrders({
      companyId: session.companyId,
      query: params.q,
      status: "entregado",
      page: params.page,
      pageSize: "25",
    }),
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

        <div className="grid gap-3 md:grid-cols-4">
          <StatCard className="p-3" label="Comprobantes" value={summary.totalInvoices} />
          <StatCard className="p-3" label="Monto vendido" value={formatCurrency(summary.totalAmount)} />
          <StatCard className="p-3" label="Facturado" value={formatCurrency(summary.invoiced)} />
          <StatCard className="p-3" label="Pendiente de cobro" value={formatCurrency(summary.pending)} />
        </div>

        <Toolbar ariaLabel="Buscar ventas">
          <form action="/sales" className="grid w-full gap-3 lg:grid-cols-[minmax(240px,1fr)_auto_auto] lg:items-end">
            <Field htmlFor="sales-query" label="Buscar">
              <Input
                defaultValue={sales.meta.query}
                id="sales-query"
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
            minWidth="0"
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
                <DataTableHead className="w-[15%] px-2">Comprobante</DataTableHead>
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
                  const saleNumberLabel = sale.receiptNumber ? String(sale.receiptNumber) : sale.id.slice(0, 8);

                  return (
                    <DataTableRow key={sale.id}>
                      <DataTableCell className="px-2 py-2">
                        <div className="truncate font-mono text-xs font-black">#{saleNumberLabel}</div>
                        <div className="mt-1 truncate text-[11px] text-[color:var(--muted)]">ID {sale.id.slice(0, 8)}</div>
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
                      <DataTableCell className="px-2 py-2">
                        <a
                          aria-label={`Ver PDF de solicitud de la venta ${sale.id}`}
                          className="text-xs font-black text-[color:var(--accent-strong)] hover:underline"
                          href={`/api/pdfs/orders/${sale.id}/request`}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Ver PDF
                        </a>
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
