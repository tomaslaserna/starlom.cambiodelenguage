import { ModulePage } from "@/components/module-page";
import { redirect } from "next/navigation";
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
} from "@/components/ui";
import { listEmployeePermissions, listEmployees } from "@/lib/employees";
import { formatDate } from "@/lib/format";
import { requireStaffSession } from "@/lib/auth";
import { sessionCanReadEmployees } from "@/lib/route-auth";

type EmployeesPageProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

function matchesQuery(item: Awaited<ReturnType<typeof listEmployees>>[number], query: string) {
  if (!query) {
    return true;
  }

  return [item.displayName, item.email, item.username, item.role, item.title]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

export default async function EmployeesPage({ searchParams }: EmployeesPageProps) {
  const session = await requireStaffSession();
  if (!(await sessionCanReadEmployees(session))) {
    redirect("/");
  }

  const params = await searchParams;
  const query = params.q?.trim().toLowerCase() ?? "";

  const [allEmployees, permissions] = await Promise.all([
    listEmployees(session.companyId),
    listEmployeePermissions(session.companyId),
  ]);

  const employees = allEmployees.filter((item) => matchesQuery(item, query));
  const activeCount = employees.filter((employee) => employee.active).length;
  const inactiveCount = employees.length - activeCount;

  return (
    <ModulePage
      active="employees"
      description="Empleados, rangos, permisos y estado de acceso."
      session={session}
      title="Empleados"
    >
      <div className="grid gap-5">
        <PageHeader
          title="Empleados"
          description="Gestiona el directorio interno, rangos, cargos y permisos disponibles del personal."
        />

        <Toolbar ariaLabel="Busqueda de empleados">
          <form
            action="/employees"
            aria-label="Buscar empleados"
            className="grid w-full gap-3 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-end"
          >
            <Field htmlFor="employees-query" label="Buscar">
              <Input
                id="employees-query"
                name="q"
                type="search"
                defaultValue={params.q ?? ""}
                placeholder="Empleado, usuario, email, cargo o rango"
              />
            </Field>
            <Button type="submit">Buscar</Button>
          </form>
        </Toolbar>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Empleados filtrados" value={employees.length} />
          <StatCard label="Activos filtrados" value={activeCount} />
          <StatCard label="Inactivos filtrados" value={inactiveCount} />
          <StatCard label="Permisos disponibles" value={permissions.length} />
        </div>

        <Card className="overflow-hidden">
          <DataTable
            caption="Listado administrativo de empleados"
            minWidth="1040px"
            tableLabel="Empleados"
            className="rounded-none border-0 shadow-none"
          >
            <DataTableHeader>
              <DataTableRow>
                <DataTableHead>Empleado</DataTableHead>
                <DataTableHead>Usuario</DataTableHead>
                <DataTableHead>Contacto</DataTableHead>
                <DataTableHead>Rango</DataTableHead>
                <DataTableHead>Cargo</DataTableHead>
                <DataTableHead>Ingreso</DataTableHead>
                <DataTableHead className="text-right">Permisos</DataTableHead>
                <DataTableHead>Estado</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {employees.length === 0 ? (
                <DataTableRow>
                  <DataTableCell colSpan={8} className="py-10">
                    <EmptyState
                      title="No hay empleados para mostrar"
                      description={
                        query
                          ? "Ajusta la busqueda para revisar otros empleados."
                          : "Todavia no hay empleados cargados en este directorio."
                      }
                    />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                employees.map((employee) => (
                  <DataTableRow key={employee.id}>
                    <DataTableCell className="min-w-[220px]">
                      <div className="font-medium text-[var(--color-text-primary)]">
                        {employee.displayName || employee.name}
                      </div>
                      <div className="mt-1 text-[var(--text-caption)] text-[var(--color-text-muted)]">
                        DNI {employee.document || "-"}
                      </div>
                    </DataTableCell>
                    <DataTableCell className="whitespace-nowrap font-mono text-[var(--text-body-sm)]">
                      {employee.username}
                    </DataTableCell>
                    <DataTableCell className="min-w-[220px]">
                      <div className="break-all text-[var(--color-text-primary)]">{employee.email || "-"}</div>
                      <div className="mt-1 text-[var(--text-caption)] text-[var(--color-text-muted)]">
                        {employee.phone || "-"}
                      </div>
                    </DataTableCell>
                    <DataTableCell className="whitespace-nowrap">{employee.role}</DataTableCell>
                    <DataTableCell className="min-w-[160px] text-[var(--color-text-secondary)]">
                      {employee.title || "-"}
                    </DataTableCell>
                    <DataTableCell className="whitespace-nowrap text-[var(--color-text-secondary)]">
                      {formatDate(employee.hireDate)}
                    </DataTableCell>
                    <DataTableCell className="whitespace-nowrap text-right tabular-nums">
                      {employee.permissionIds.length}
                    </DataTableCell>
                    <DataTableCell className="whitespace-nowrap">
                      <StatusBadge
                        aria-label={`Estado laboral: ${employee.active ? "Activo" : "Inactivo"}`}
                        tone={employee.active ? "success" : "neutral"}
                      >
                        {employee.active ? "Activo" : "Inactivo"}
                      </StatusBadge>
                    </DataTableCell>
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>
        </Card>
      </div>
    </ModulePage>
  );
}
