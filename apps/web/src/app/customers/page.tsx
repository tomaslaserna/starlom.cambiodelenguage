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
  Select,
  StatCard,
  StatusBadge,
  Textarea,
  Toolbar,
  type StatusBadgeTone,
} from "@/components/ui";
import { createCustomerAction } from "@/app/customers/actions";
import { listCustomers } from "@/lib/catalog";
import { fastOr } from "@/lib/fast-data";
import { formatNumber } from "@/lib/format";
import { listPriceLists } from "@/lib/pricing";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { CUSTOMERS_READ_PERMISSION, sessionAllows } from "@/lib/route-auth";
import { getNavigationAuthorization } from "@/lib/navigation";

type CustomersPageProps = {
  searchParams: Promise<{
    q?: string;
    page?: string;
    created?: string;
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
  await requirePagePermission(session, [CUSTOMERS_READ_PERMISSION]);
  const navigationAuthorization = await fastOr(
    getNavigationAuthorization(session),
    { allowedPermissionKeys: new Set<string>() },
    60,
  );

  const params = await searchParams;
  const [result, priceLists, canCreateCustomers] = await Promise.all([
    listCustomers({
      companyId: session.companyId,
      query: params.q,
      page: params.page,
      pageSize: "25",
    }),
    listPriceLists(session.companyId, true),
    sessionAllows(session, [{ resource: "clientes", action: "crear" }]),
  ]);
  const activePriceLists = priceLists.filter((list) => list.active);

  return (
    <ModulePage
      active="database"
      description="Directorio de clientes con datos comerciales y de contacto."
      navigationAuthorization={navigationAuthorization}
      session={session}
      title="Clientes"
    >
      <div className="grid gap-5">
        <PageHeader
          description="Base comercial de clientes con identificacion fiscal, contacto y segmentacion operativa."
          moduleIntro
          title="Clientes"
        />

        {params.created ? (
          <div className="rounded-lg border border-[color:var(--success)] bg-[color:var(--success-subtle)] px-4 py-3 text-sm font-semibold text-[color:var(--success)]">
            Cliente cargado correctamente.
          </div>
        ) : null}

        {canCreateCustomers ? (
          <Card className="p-4">
            <form action={createCustomerAction} className="grid gap-3">
              <div className="grid gap-3 lg:grid-cols-4">
                <Field htmlFor="customer-name" label="Cliente" required>
                  <Input id="customer-name" name="name" required />
                </Field>
                <Field htmlFor="customer-business" label="Razon social">
                  <Input id="customer-business" name="businessName" />
                </Field>
                <Field htmlFor="customer-tax-id" label="CUIT/DNI">
                  <Input id="customer-tax-id" name="taxId" />
                </Field>
                <Field htmlFor="customer-vat" label="Condicion IVA">
                  <Select id="customer-vat" name="vatCondition" defaultValue="Consumidor final">
                    <option value="Consumidor final">Consumidor final</option>
                    <option value="Responsable inscripto">Responsable inscripto</option>
                    <option value="Monotributo">Monotributo</option>
                    <option value="Exento">Exento</option>
                  </Select>
                </Field>
              </div>
              <div className="grid gap-3 lg:grid-cols-5">
                <Field htmlFor="customer-phone" label="Telefono">
                  <Input id="customer-phone" name="phone" />
                </Field>
                <Field htmlFor="customer-price-list" label="Lista">
                  <Select id="customer-price-list" name="priceList" defaultValue={activePriceLists[0]?.name ?? ""}>
                    {activePriceLists.length === 0 ? <option value="">Sin listas activas</option> : null}
                    {activePriceLists.map((list) => (
                      <option key={list.id} value={list.name}>
                        {list.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field htmlFor="customer-seller" label="Vendedor">
                  <Input id="customer-seller" name="seller" />
                </Field>
                <Field htmlFor="customer-city" label="Ciudad">
                  <Input id="customer-city" name="city" />
                </Field>
                <Field htmlFor="customer-province" label="Provincia">
                  <Input id="customer-province" name="province" />
                </Field>
              </div>
              <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_minmax(260px,1fr)_auto] lg:items-end">
                <Field htmlFor="customer-address" label="Direccion">
                  <Input id="customer-address" name="address" />
                </Field>
                <Field htmlFor="customer-observation" label="Observacion">
                  <Textarea id="customer-observation" name="observation" rows={2} />
                </Field>
                <Button type="submit">Crear cliente</Button>
              </div>
            </form>
          </Card>
        ) : null}

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
                      description={
                        result.meta.query
                          ? "Ajusta la busqueda para encontrar clientes por nombre, razon social, CUIT o telefono."
                          : "Cuando existan clientes cargados apareceran en este listado paginado."
                      }
                      title={result.meta.query ? "No hay clientes para la busqueda actual" : "No hay clientes cargados"}
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
                    <DataTableCell className="whitespace-nowrap">
                      {customer.phone || "-"}
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
