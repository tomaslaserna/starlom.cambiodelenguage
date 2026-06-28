import { ModulePage } from "@/components/module-page";
import { redirect } from "next/navigation";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
} from "@/components/ui";
import { createEmployeeAction } from "@/app/employees/actions";
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

function normalizedRole(role: string) {
  return (
    {
      Admin: "administrador",
      Jefe: "jefe",
      Jefe1: "jefe",
      Empleado: "operador",
      Empleado1: "operador",
      Empleado2: "vendedor",
      Empleado_1: "operador",
      Empleado_2: "vendedor",
    }[role] ?? role
  );
}

const ROLE_LABELS: Record<string, string> = {
  administrador: "Administrador",
  jefe: "Jefe",
  deposito: "Deposito",
  logistica: "Logistica",
  operador: "Operador",
  vendedor: "Vendedor",
};

function roleOptionsFor(currentRole: string) {
  const role = normalizedRole(currentRole);
  if (role === "administrador") {
    return ["jefe", "deposito", "logistica", "operador", "vendedor"];
  }
  if (role === "jefe") {
    return ["deposito", "logistica", "operador", "vendedor"];
  }
  return [];
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
  const creatableRoles = roleOptionsFor(session.role);
  const canCreateEmployees = creatableRoles.length > 0;
  const visiblePermissions =
    normalizedRole(session.role) === "administrador"
      ? permissions
      : permissions.filter((permission) => !permission.sensitive);
  const permissionGroups = visiblePermissions.reduce<Record<string, typeof visiblePermissions>>(
    (groups, permission) => {
      const key = permission.module || "general";
      groups[key] = groups[key] ?? [];
      groups[key].push(permission);
      return groups;
    },
    {},
  );

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

        {canCreateEmployees ? (
          <Card>
            <CardHeader>
              <CardTitle>Crear empleado</CardTitle>
              <CardDescription>
                Define cargo, usuario, contrasena, rango y ventanas habilitadas para el nuevo acceso.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createEmployeeAction} className="grid gap-5">
                <div className="grid gap-4 lg:grid-cols-3">
                  <Field htmlFor="employee-name" label="Nombre" required>
                    <Input id="employee-name" name="name" required autoComplete="given-name" />
                  </Field>
                  <Field htmlFor="employee-last-name" label="Apellido">
                    <Input id="employee-last-name" name="lastName" autoComplete="family-name" />
                  </Field>
                  <Field htmlFor="employee-title" label="Cargo">
                    <Input id="employee-title" name="title" placeholder="Ej. Produccion, deposito, ventas" />
                  </Field>
                  <Field htmlFor="employee-email" label="Email" required>
                    <Input id="employee-email" name="email" type="email" required autoComplete="email" />
                  </Field>
                  <Field htmlFor="employee-username" label="Usuario" required>
                    <Input id="employee-username" name="username" required autoComplete="username" />
                  </Field>
                  <Field htmlFor="employee-password" label="Contrasena inicial" required>
                    <Input
                      id="employee-password"
                      name="password"
                      type="password"
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                  </Field>
                  <Field htmlFor="employee-role" label="Rango" required>
                    <Select id="employee-role" name="role" required defaultValue={creatableRoles[0]}>
                      {creatableRoles.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role] ?? role}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <div className="grid gap-3">
                  <div>
                    <h3 className="erp-text-body font-extrabold text-[color:var(--foreground)]">
                      Ventanas habilitadas
                    </h3>
                    <p className="erp-text-body-sm mt-1 text-[color:var(--muted)]">
                      Los permisos sensibles no se muestran para jefes y el servidor vuelve a validarlos al guardar.
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {Object.entries(permissionGroups).map(([module, modulePermissions]) => (
                      <fieldset
                        key={module}
                        className="rounded-[9px] border border-[color:var(--border)] bg-[color:var(--panel-muted)] p-4"
                      >
                        <legend className="px-1 text-[var(--text-caption)] font-extrabold uppercase text-[color:var(--muted)]">
                          {module}
                        </legend>
                        <div className="mt-2 grid gap-2">
                          {modulePermissions.map((permission) => (
                            <label
                              key={permission.key}
                              className="flex min-h-9 items-start gap-2 rounded-[7px] px-2 py-1.5 text-[var(--text-body-sm)] text-[color:var(--foreground)] hover:bg-white"
                            >
                              <input
                                className="mt-1 h-4 w-4 rounded border-[color:var(--border)] accent-[var(--accent)]"
                                name="permissionKeys"
                                type="checkbox"
                                value={permission.key}
                              />
                              <span className="min-w-0">{permission.name}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button type="submit">Crear empleado</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : null}

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
                      <div className="font-medium text-[color:var(--foreground)]">
                        {employee.displayName || employee.name}
                      </div>
                      <div className="mt-1 text-[var(--text-caption)] text-[color:var(--muted)]">
                        DNI {employee.document || "-"}
                      </div>
                    </DataTableCell>
                    <DataTableCell className="whitespace-nowrap font-mono text-[var(--text-body-sm)]">
                      {employee.username}
                    </DataTableCell>
                    <DataTableCell className="min-w-[220px]">
                      <div className="break-all text-[color:var(--foreground)]">{employee.email || "-"}</div>
                      <div className="mt-1 text-[var(--text-caption)] text-[color:var(--muted)]">
                        {employee.phone || "-"}
                      </div>
                    </DataTableCell>
                    <DataTableCell className="whitespace-nowrap">{employee.role}</DataTableCell>
                    <DataTableCell className="min-w-[160px] text-[color:var(--muted)]">
                      {employee.title || "-"}
                    </DataTableCell>
                    <DataTableCell className="whitespace-nowrap text-[color:var(--muted)]">
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
