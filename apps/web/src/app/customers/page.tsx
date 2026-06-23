import { ModulePage } from "@/components/module-page";
import { PaginationLinks } from "@/components/pagination-links";
import {
  Button,
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
  StatusBadge,
  Toolbar,
  type StatusBadgeTone,
} from "@/components/ui";
import { listCustomers } from "@/lib/catalog";
import { formatNumber } from "@/lib/format";
import { requireStaffSession } from "@/lib/auth";

type CustomersPageProps = {
  searchParams: Promise<{
    q?: string;
    page?: string;
  }>;
};

function customerStatusTone(status: string): StatusBadgeTone {
  const normalized = status.trim().toLowerCase();
  if (normalized === "activo") return "success";
  if (normalized === "en riesgo" || normalized === "riesgo") return "warning";
  if (normalized === "perdido") return "danger";
  return "neutral";
}

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const session = await requireStaffSession();
  const params = await searchParams;
  const result = await listCustomers({
    companyId: session.companyId,
    query: params.q,
    page: params.page,
    pageSize: "25",
  });

  return (
    <ModulePage
      active="database"
      description="Clientes consultados desde PostgreSQL con sesion Node y contexto multiempresa."
      session={session}
      title="Clientes"
    >
      <div className="grid gap-5">
        <PageHeader
          description="Base comercial de clientes con identificacion fiscal, contacto y segmentacion operativa."
          title="Clientes"
        />

        <Toolbar ariaLabel="Busqueda de clientes">
          <form
            action="/customers"
            aria-label="Busqueda"
            className="grid w-full gap-3 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-end"
          >
            <Field htmlFor="customers-query" label="Buscar">
              <Input
                defaultValue={result.meta.query}
                id="customers-query"
                name="q"
                placeholder="Nombre, razon social, CUIT o telefono"
                type="search"
              />
            </Field>
            <Button type="submit">Buscar</Button>
          </form>
        </Toolbar>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            className="p-3"
            detail={`Pagina ${result.meta.page} de ${result.meta.totalPages} - ${result.meta.pageSize} por pagina`}
            label="Clientes encontrados"
            value={formatNumber(result.meta.total)}
          />
        </div>

        <Card className="overflow-hidden">
          <DataTable
            caption="Listado paginado de clientes"
            className="rounded-none border-0 shadow-none"
            minWidth="980px"
            tableLabel="Clientes"
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>Cliente</DataTableHead>
                <DataTableHead>Identificacion</DataTableHead>
                <DataTableHead>Contacto</DataTableHead>
                <DataTableHead>Ubicacion</DataTableHead>
                <DataTableHead>Lista</DataTableHead>
                <DataTableHead>Estado</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {result.data.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={6}>
                    <EmptyState
                      description="Ajusta la busqueda para encontrar clientes por nombre, razon social, CUIT o telefono."
                      title="No hay clientes para la busqueda actual"
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                result.data.map((customer) => (
                  <DataTableRow key={customer.id}>
                    <DataTableCell>
                      <div className="max-w-[260px] break-words font-medium">
                        {customer.name || "Sin nombre"}
                      </div>
                      <div className="mt-1 max-w-[260px] break-words text-xs text-[color:var(--muted)]">
                        {customer.businessName || customer.code || `ID ${customer.id}`}
                      </div>
                    </DataTableCell>
                    <DataTableCell className="whitespace-nowrap font-mono text-xs">
                      {customer.taxIdType || "ID"} {customer.taxId || "-"}
                    </DataTableCell>
                    <DataTableCell>
                      <div className="max-w-[180px] break-words">{customer.phone || "-"}</div>
                    </DataTableCell>
                    <DataTableCell className="text-[color:var(--muted)]">
                      <div className="max-w-[220px] break-words">
                        {[customer.city, customer.province].filter(Boolean).join(", ") || "-"}
                      </div>
                    </DataTableCell>
                    <DataTableCell>{customer.priceList || "-"}</DataTableCell>
                    <DataTableCell>
                      <StatusBadge tone={customerStatusTone(customer.status)}>
                        {customer.status || "Sin estado"}
                      </StatusBadge>
                    </DataTableCell>
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>
          <PaginationLinks
            basePath="/customers"
            page={result.meta.page}
            query={result.meta.query}
            totalPages={result.meta.totalPages}
          />
        </Card>
      </div>
    </ModulePage>
  );
}
