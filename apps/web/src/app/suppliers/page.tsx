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
  Textarea,
  Toolbar,
} from "@/components/ui";
import { createSupplierAction } from "@/app/suppliers/actions";
import { listSuppliers } from "@/lib/catalog-management";
import { formatNumber } from "@/lib/format";
import { requireStaffSession } from "@/lib/auth";
import { sessionAllows, sessionCanReadSuppliers } from "@/lib/route-auth";
import { redirect } from "next/navigation";

type SuppliersPageProps = {
  searchParams: Promise<{
    q?: string;
    page?: string;
    created?: string;
  }>;
};

export default async function SuppliersPage({ searchParams }: SuppliersPageProps) {
  const session = await requireStaffSession();
  if (!(await sessionCanReadSuppliers(session))) {
    redirect("/");
  }

  const params = await searchParams;
  const result = await listSuppliers({
    companyId: session.companyId,
    query: params.q,
    page: params.page,
    pageSize: "25",
  });
  const canCreateSuppliers = await sessionAllows(session, [{ resource: "proveedores", action: "crear" }]);
  const suppliersMetricDetail = result.meta.query
    ? `Coinciden con la busqueda actual - Pagina ${result.meta.page} de ${result.meta.totalPages} - ${result.meta.pageSize} por pagina`
    : `Total de proveedores cargados - Pagina ${result.meta.page} de ${result.meta.totalPages} - ${result.meta.pageSize} por pagina`;

  return (
    <ModulePage
      active="database"
      description="Base de proveedores, contacto y datos comerciales."
      session={session}
      title="Proveedores"
    >
      <div className="grid gap-5">
        <PageHeader
          description="Directorio de proveedores para compras y abastecimiento con datos de contacto operativos."
          moduleIntro
          title="Proveedores"
        />

        {params.created ? (
          <div className="rounded-lg border border-[color:var(--success)] bg-[color:var(--success-subtle)] px-4 py-3 text-sm font-semibold text-[color:var(--success)]">
            Proveedor cargado correctamente.
          </div>
        ) : null}

        {canCreateSuppliers ? (
          <Card className="p-4">
            <form action={createSupplierAction} className="grid gap-3">
              <div className="grid gap-3 lg:grid-cols-4">
                <Field htmlFor="supplier-name" label="Proveedor" required>
                  <Input id="supplier-name" name="name" required />
                </Field>
                <Field htmlFor="supplier-contact" label="Contacto">
                  <Input id="supplier-contact" name="contact" />
                </Field>
                <Field htmlFor="supplier-rubric" label="Rubro">
                  <Input id="supplier-rubric" name="rubric" placeholder="Descartables, quimicos, papel..." />
                </Field>
                <Field htmlFor="supplier-phone" label="Telefono">
                  <Input id="supplier-phone" name="phone" />
                </Field>
              </div>
              <div className="grid gap-3 lg:grid-cols-[minmax(180px,240px)_minmax(220px,1fr)_minmax(260px,1fr)_auto] lg:items-end">
                <Field htmlFor="supplier-email" label="Email">
                  <Input id="supplier-email" name="email" type="email" />
                </Field>
                <Field htmlFor="supplier-address" label="Direccion">
                  <Input id="supplier-address" name="address" />
                </Field>
                <Field htmlFor="supplier-notes" label="Notas">
                  <Textarea id="supplier-notes" name="notes" rows={2} />
                </Field>
                <Button type="submit">Crear proveedor</Button>
              </div>
            </form>
          </Card>
        ) : null}

        <Toolbar ariaLabel="Busqueda de proveedores">
          <form
            action="/suppliers"
            aria-label="Busqueda"
            className="grid w-full gap-3 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-end"
          >
            <Field htmlFor="suppliers-query" label="Buscar">
              <Input
                defaultValue={result.meta.query}
                id="suppliers-query"
                name="q"
                placeholder="Proveedor, contacto, telefono o email"
                type="search"
              />
            </Field>
            <Button type="submit">Buscar</Button>
          </form>
        </Toolbar>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            className="p-3"
            detail={suppliersMetricDetail}
            label="Proveedores encontrados"
            value={formatNumber(result.meta.total)}
          />
        </div>

        <Card className="overflow-hidden">
          <DataTable
            caption="Listado paginado de proveedores"
            className="rounded-none border-0 shadow-none"
            minWidth="760px"
            tableLabel="Proveedores"
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>Proveedor</DataTableHead>
                <DataTableHead>Rubro</DataTableHead>
                <DataTableHead>Contacto</DataTableHead>
                <DataTableHead>Telefono</DataTableHead>
                <DataTableHead>Email</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {result.data.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={5}>
                    <EmptyState
                      description={
                        result.meta.query
                          ? "Ajusta la busqueda para encontrar proveedores por nombre, contacto, telefono o email."
                          : "Cuando existan proveedores cargados apareceran en este listado paginado."
                      }
                      title={
                        result.meta.query
                          ? "No hay proveedores para la busqueda actual"
                          : "No hay proveedores cargados"
                      }
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                result.data.map((supplier) => (
                  <DataTableRow key={supplier.id}>
                    <DataTableCell>
                      <div className="max-w-[280px] break-words font-medium">
                        {supplier.name || "Sin nombre"}
                      </div>
                    </DataTableCell>
                    <DataTableCell className="text-[color:var(--muted)]">
                      <div className="max-w-[180px] break-words">
                        {supplier.rubric || "-"}
                      </div>
                    </DataTableCell>
                    <DataTableCell className="text-[color:var(--muted)]">
                      <div className="max-w-[220px] break-words">
                        {supplier.contact || "-"}
                      </div>
                    </DataTableCell>
                    <DataTableCell className="whitespace-nowrap">
                      {supplier.phone || "-"}
                    </DataTableCell>
                    <DataTableCell>
                      <div className="max-w-[260px] break-words">
                        {supplier.email || "-"}
                      </div>
                    </DataTableCell>
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>
          <PaginationLinks
            basePath="/suppliers"
            page={result.meta.page}
            query={result.meta.query}
            totalPages={result.meta.totalPages}
          />
        </Card>
      </div>
    </ModulePage>
  );
}
