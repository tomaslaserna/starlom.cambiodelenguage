import { ModulePage } from "@/components/module-page";
import { SearchBar } from "@/components/search-bar";
import { listEmployeePermissions, listEmployees } from "@/lib/employees";
import { formatDate } from "@/lib/format";
import { requireStaffSession } from "@/lib/auth";

type EmployeesPageProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

function matchesQuery(item: Awaited<ReturnType<typeof listEmployees>>[number], query: string) {
  if (!query) return true;
  return [item.displayName, item.email, item.username, item.role, item.title]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

export default async function EmployeesPage({ searchParams }: EmployeesPageProps) {
  const session = await requireStaffSession();
  const params = await searchParams;
  const query = params.q?.trim().toLowerCase() ?? "";
  const [allEmployees, permissions] = await Promise.all([
    listEmployees(session.companyId),
    listEmployeePermissions(session.companyId),
  ]);
  const employees = allEmployees.filter((item) => matchesQuery(item, query));
  const activeCount = employees.filter((employee) => employee.active).length;

  return (
    <ModulePage
      active="employees"
      description="Empleados, rangos y permisos migrados a la sesion Node con RBAC granular."
      session={session}
      title="Empleados"
    >
      <div className="grid gap-5">
        <div className="grid gap-4 rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4 md:grid-cols-[1fr_auto] md:items-center">
          <SearchBar
            action="/employees"
            placeholder="Buscar empleado, usuario, email, cargo o rango"
            query={params.q ?? ""}
          />
          <div className="rounded-md bg-[color:var(--panel-subtle)] px-3 py-2 text-sm">
            <span className="font-semibold">{permissions.length}</span>{" "}
            <span className="text-[color:var(--muted)]">permisos</span>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Empleados filtrados</div>
            <div className="mt-2 text-2xl font-semibold">{employees.length}</div>
          </div>
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Activos</div>
            <div className="mt-2 text-2xl font-semibold">{activeCount}</div>
          </div>
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Inactivos</div>
            <div className="mt-2 text-2xl font-semibold">{employees.length - activeCount}</div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
              <thead className="bg-[color:var(--panel-subtle)] text-xs uppercase text-[color:var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Empleado</th>
                  <th className="px-4 py-3 font-semibold">Usuario</th>
                  <th className="px-4 py-3 font-semibold">Contacto</th>
                  <th className="px-4 py-3 font-semibold">Rango</th>
                  <th className="px-4 py-3 font-semibold">Cargo</th>
                  <th className="px-4 py-3 font-semibold">Ingreso</th>
                  <th className="px-4 py-3 text-right font-semibold">Permisos</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-[color:var(--muted)]" colSpan={8}>
                      No hay empleados para la busqueda actual.
                    </td>
                  </tr>
                ) : (
                  employees.map((employee) => (
                    <tr className="border-t border-[color:var(--border)]" key={employee.id}>
                      <td className="px-4 py-4">
                        <div className="font-medium">{employee.displayName || employee.name}</div>
                        <div className="font-mono text-xs text-[color:var(--muted)]">
                          DNI {employee.document || "-"}
                        </div>
                      </td>
                      <td className="px-4 py-4 font-mono text-xs">{employee.username}</td>
                      <td className="px-4 py-4">
                        <div>{employee.email || "-"}</div>
                        <div className="text-xs text-[color:var(--muted)]">{employee.phone || "-"}</div>
                      </td>
                      <td className="px-4 py-4">{employee.role}</td>
                      <td className="px-4 py-4">{employee.title || "-"}</td>
                      <td className="px-4 py-4">{formatDate(employee.hireDate)}</td>
                      <td className="px-4 py-4 text-right">{employee.permissionIds.length}</td>
                      <td className="px-4 py-4">
                        <span className="rounded-md border border-[color:var(--border)] px-2 py-1 text-xs">
                          {employee.active ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ModulePage>
  );
}
