import Link from "next/link";
import { redirect } from "next/navigation";
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
  StatusBadge,
  Toolbar,
  type StatusBadgeTone,
} from "@/components/ui";
import { requireStaffSession } from "@/lib/auth";
import { getVendorCustomers } from "@/lib/crm";
import { sessionCanUseCrm } from "@/lib/route-auth";

type CrmClientesPageProps = {
  searchParams: Promise<{ q?: string; page?: string }>;
};

function clientStatusTone(status: string): StatusBadgeTone {
  return status.trim().toLowerCase() === "activo" ? "success" : "neutral";
}

export default async function CrmClientesPage({ searchParams }: CrmClientesPageProps) {
  const session = await requireStaffSession();
  if (!(await sessionCanUseCrm(session))) redirect("/");

  const params = await searchParams;
  const customers = await getVendorCustomers(session, { query: params.q, page: params.page });

  const vendor = session.displayName || session.username || "vendedor";

  return (
    <ModulePage
      active="crm"
      description="Tu base de datos de clientes propios y a cargo."
      session={session}
      title="CRM · Clientes"
    >
      <div className="grid gap-5">
        <PageHeader
          title={`Hola, ${vendor} 👋`}
          description={`Tenés ${customers.meta.total} ${customers.meta.total === 1 ? "cliente" : "clientes"} entre propios y a cargo. El seguimiento por estado está en Perfil.`}
        />

        {/* Base de datos de tus clientes */}
        <Toolbar ariaLabel="Busqueda de clientes">
          <form action="/crm/clientes" className="grid w-full gap-3 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-end">
            <Field htmlFor="crm-clientes-query" label="Buscar">
              <Input
                defaultValue={customers.meta.query}
                id="crm-clientes-query"
                name="q"
                placeholder="Nombre, razon social, CUIT o telefono"
                type="search"
              />
            </Field>
            <Button type="submit">Buscar</Button>
          </form>
        </Toolbar>

        <Card className="overflow-hidden">
          <DataTable
            caption="Tus clientes (propios y a cargo)"
            className="rounded-none border-0 shadow-none"
            minWidth="960px"
            tableLabel="Clientes del vendedor"
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>Cliente</DataTableHead>
                <DataTableHead>CUIT</DataTableHead>
                <DataTableHead>Contacto</DataTableHead>
                <DataTableHead>Ubicacion</DataTableHead>
                <DataTableHead>Lista</DataTableHead>
                <DataTableHead>Relacion</DataTableHead>
                <DataTableHead>Estado</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {customers.data.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={7}>
                    <EmptyState
                      description={customers.meta.query
                        ? "Ajusta la busqueda para encontrar tus clientes."
                        : "Todavia no tenes clientes propios ni a cargo cargados."}
                      title={customers.meta.query ? "Sin resultados" : "Sin clientes asignados"}
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                customers.data.map((customer) => (
                  <DataTableRow key={customer.id}>
                    <DataTableCell>
                      <Link className="max-w-[260px] break-words font-medium text-[color:var(--accent)] hover:underline" href={`/customers/${customer.id}`}>
                        {customer.name || "Sin nombre"}
                      </Link>
                      <div className="mt-1 max-w-[260px] break-words text-xs text-[color:var(--muted)]">
                        {customer.businessName || `ID ${customer.id}`}
                      </div>
                    </DataTableCell>
                    <DataTableCell className="whitespace-nowrap font-mono text-xs">{customer.taxId || "-"}</DataTableCell>
                    <DataTableCell className="whitespace-nowrap">{customer.phone || "-"}</DataTableCell>
                    <DataTableCell className="text-[color:var(--muted)]">
                      <div className="max-w-[220px] break-words">
                        {[customer.city, customer.province].filter(Boolean).join(", ") || "-"}
                      </div>
                    </DataTableCell>
                    <DataTableCell>{customer.priceList || "-"}</DataTableCell>
                    <DataTableCell>
                      <StatusBadge tone={customer.relation === "propio" ? "success" : "neutral"}>
                        {customer.relation}
                      </StatusBadge>
                    </DataTableCell>
                    <DataTableCell>
                      <StatusBadge tone={clientStatusTone(customer.status)}>{customer.status}</StatusBadge>
                    </DataTableCell>
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>
          <PaginationLinks
            basePath="/crm/clientes"
            page={customers.meta.page}
            query={customers.meta.query}
            totalPages={customers.meta.totalPages}
          />
        </Card>
      </div>
    </ModulePage>
  );
}
