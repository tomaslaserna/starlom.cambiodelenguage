import { ModulePage } from "@/components/module-page";
import { HrNavigation } from "@/components/hr-navigation";
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
import {
  createEmployeeAction,
  deleteEmployeeAction,
  toggleEmployeeStatusAction,
  updateEmployeeAction,
} from "@/app/employees/actions";
import { PermissionBlocks } from "@/app/employees/permission-blocks";
import { listEmployeePermissions, listEmployees } from "@/lib/employees";
import { formatDate } from "@/lib/format";
import { requireStaffSession } from "@/lib/auth";
import { ADMIN_MOVEMENTS_READ_PERMISSION, sessionAllows, sessionCanReadEmployees } from "@/lib/route-auth";

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
    return ["jefe", "deposito", "logistica", "operador", "vendedor", "administrador"];
  }
  if (role === "jefe") {
    return ["jefe", "deposito", "logistica", "operador", "vendedor"];
  }
  return [];
}

function canEditEmployee(actorRole: string, targetRole: string) {
  const actor = normalizedRole(actorRole);
  const target = normalizedRole(targetRole);
  if (actor !== "administrador" && actor !== "jefe") return false;
  if (target === "administrador" && actor !== "administrador") return false;
  return true;
}

export default async function EmployeesPage({ searchParams }: EmployeesPageProps) {
  const session = await requireStaffSession();
  if (!(await sessionCanReadEmployees(session))) {
    redirect("/");
  }

  const params = await searchParams;
  const query = params.q?.trim().toLowerCase() ?? "";

  const [allEmployees, permissions, canAudit] = await Promise.all([
    listEmployees(session.companyId),
    listEmployeePermissions(session.companyId),
    sessionAllows(session, [ADMIN_MOVEMENTS_READ_PERMISSION]),
  ]);

  const employees = allEmployees.filter((item) => matchesQuery(item, query));
  const activeCount = employees.filter((employee) => employee.active).length;
  const inactiveCount = employees.length - activeCount;
  const creatableRoles = roleOptionsFor(session.role);
  const canCreateEmployees = creatableRoles.length > 0;
  const currentRole = normalizedRole(session.role);
  const visiblePermissions =
    currentRole === "administrador" || currentRole === "jefe"
      ? permissions
      : permissions.filter((permission) => !permission.sensitive);
  return (
    <ModulePage
      active="employees"
      description="Empleados, rangos, permisos y estado de acceso."
      session={session}
      title="Empleados"
    >
      <div className="grid gap-5">
        <PageHeader
          title="Recursos Humanos"
          description="Administra el equipo, los accesos, la gestión comercial y la trazabilidad interna desde un único módulo."
          eyebrow="Módulo unificado"
        />

        <HrNavigation active="employees" canAudit={canAudit} />

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
                      Accesos por bloques
                    </h3>
                    <p className="erp-text-body-sm mt-1 text-[color:var(--muted)]">
                      Habilita solamente los bloques que necesita para cumplir su función. Las acciones sensibles se identifican por separado.
                    </p>
                  </div>

                  <PermissionBlocks idPrefix="create-employee" permissions={visiblePermissions} />
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

        <Card className="overflow-visible">
          <DataTable
            caption="Listado administrativo de empleados"
            minWidth="720px"
            tableLabel="Empleados"
            className="erp-employees-table rounded-none border-0 shadow-none"
          >
            <DataTableHeader>
              <DataTableRow>
                <DataTableHead>Empleado</DataTableHead>
                <DataTableHead>Usuario</DataTableHead>
                <DataTableHead>Contacto</DataTableHead>
                <DataTableHead>Perfil</DataTableHead>
                <DataTableHead>Estado</DataTableHead>
                <DataTableHead align="right">Acciones</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {employees.length === 0 ? (
                <DataTableRow>
                  <DataTableCell colSpan={6} className="py-10">
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
                employees.map((employee) => {
                  const editable = canEditEmployee(session.role, employee.role);
                  const employeeRoleOptions = roleOptionsFor(session.role);

                  return (
                    <DataTableRow key={employee.id}>
                      <DataTableCell className="w-[22%]">
                        <div className="font-medium text-[color:var(--foreground)]">
                          {employee.displayName || employee.name}
                        </div>
                        <div className="mt-1 text-[var(--text-caption)] text-[color:var(--muted)]">
                          Alta {formatDate(employee.hireDate)}
                        </div>
                      </DataTableCell>
                      <DataTableCell className="w-[16%] break-all font-mono text-[var(--text-body-sm)]">
                        {employee.username}
                      </DataTableCell>
                      <DataTableCell className="w-[24%]">
                        <div className="break-all text-[color:var(--foreground)]">{employee.email || "-"}</div>
                        <div className="mt-1 text-[var(--text-caption)] text-[color:var(--muted)]">
                          {employee.phone || "-"}
                        </div>
                      </DataTableCell>
                      <DataTableCell className="w-[18%]">
                        <div>{ROLE_LABELS[employee.role] ?? employee.role}</div>
                        <div className="mt-1 text-[var(--text-caption)] text-[color:var(--muted)]">
                          {employee.title || "Sin cargo"} · {employee.permissionIds.length} permisos
                        </div>
                      </DataTableCell>
                      <DataTableCell className="w-[10%]">
                        <StatusBadge
                          aria-label={`Estado laboral: ${employee.active ? "Activo" : "Inactivo"}`}
                          tone={employee.active ? "success" : "neutral"}
                        >
                          {employee.active ? "Activo" : "Inactivo"}
                        </StatusBadge>
                      </DataTableCell>
                      <DataTableCell align="right" className="w-[10%]">
                        {editable ? (
                          <details className="relative inline-block text-left">
                            <summary className="flex min-h-[var(--control-height-md)] min-w-[132px] cursor-pointer list-none select-none items-center justify-center rounded-[var(--radius-md)] bg-[color:var(--accent)] px-4 font-black text-white shadow-sm hover:bg-[color:var(--accent-strong)] [&::-webkit-details-marker]:hidden">
                              Modificar
                            </summary>
                            <div className="absolute right-0 top-full z-50 mt-2 grid max-h-[min(76vh,720px)] w-[min(680px,calc(100vw-2rem))] gap-4 overflow-y-auto rounded-[12px] border border-[color:var(--border)] bg-white p-4 text-left shadow-[0_20px_45px_rgba(15,23,42,0.18)]">
                              <form action={updateEmployeeAction} className="grid gap-4">
                                <input name="id" type="hidden" value={employee.id} />
                                <div className="grid gap-3 md:grid-cols-2">
                                  <Field htmlFor={`employee-${employee.id}-name`} label="Nombre" required>
                                    <Input
                                      id={`employee-${employee.id}-name`}
                                      name="name"
                                      required
                                      defaultValue={employee.name || employee.displayName}
                                      autoComplete="given-name"
                                    />
                                  </Field>
                                  <Field htmlFor={`employee-${employee.id}-title`} label="Cargo">
                                    <Input
                                      id={`employee-${employee.id}-title`}
                                      name="title"
                                      defaultValue={employee.title}
                                      autoComplete="organization-title"
                                    />
                                  </Field>
                                  <Field htmlFor={`employee-${employee.id}-email`} label="Email" required>
                                    <Input
                                      id={`employee-${employee.id}-email`}
                                      name="email"
                                      type="email"
                                      required
                                      defaultValue={employee.email}
                                      autoComplete="email"
                                    />
                                  </Field>
                                  <Field htmlFor={`employee-${employee.id}-username`} label="Usuario" required>
                                    <Input
                                      id={`employee-${employee.id}-username`}
                                      name="username"
                                      required
                                      defaultValue={employee.username}
                                      autoComplete="username"
                                    />
                                  </Field>
                                  <Field htmlFor={`employee-${employee.id}-password`} label="Nueva contrasena">
                                    <Input
                                      id={`employee-${employee.id}-password`}
                                      name="password"
                                      type="password"
                                      minLength={6}
                                      placeholder="Dejar vacio para no cambiar"
                                      autoComplete="new-password"
                                    />
                                  </Field>
                                  <Field htmlFor={`employee-${employee.id}-role`} label="Rango" required>
                                    <Select
                                      id={`employee-${employee.id}-role`}
                                      name="role"
                                      required
                                      defaultValue={employee.role}
                                    >
                                      {employeeRoleOptions.map((role) => (
                                        <option key={role} value={role}>
                                          {ROLE_LABELS[role] ?? role}
                                        </option>
                                      ))}
                                    </Select>
                                  </Field>
                                  <Field htmlFor={`employee-${employee.id}-active`} label="Estado" required>
                                    <Select
                                      id={`employee-${employee.id}-active`}
                                      name="active"
                                      required
                                      defaultValue={employee.active ? "true" : "false"}
                                    >
                                      <option value="true">Activo</option>
                                      <option value="false">Inactivo</option>
                                    </Select>
                                  </Field>
                                </div>

                                <details className="rounded-[9px] border border-[color:var(--border)] bg-[color:var(--panel-muted)] p-3">
                                  <summary className="cursor-pointer list-none select-none font-black text-[color:var(--accent-strong)] [&::-webkit-details-marker]:hidden">
                                    Accesos efectivos por bloques
                                  </summary>
                                  <p className="mt-2 text-[var(--text-caption)] leading-5 text-[color:var(--muted)]">
                                    Esta vista conserva el acceso actual del empleado. Habilitar o quitar un bloque modifica todos sus permisos visibles.
                                  </p>
                                  <div className="mt-3">
                                    <PermissionBlocks
                                      idPrefix={`employee-${employee.id}`}
                                      permissions={visiblePermissions}
                                      selectedKeys={employee.permissionIds}
                                    />
                                  </div>
                                </details>

                                <Button type="submit">Guardar cambios</Button>
                              </form>

                              <div className="grid gap-3 rounded-[9px] border border-[color:var(--border)] bg-[color:var(--panel-muted)] p-3 md:grid-cols-2 md:items-end">
                                <form action={toggleEmployeeStatusAction} className="grid gap-2">
                                  <input name="id" type="hidden" value={employee.id} />
                                  <Button type="submit" variant="outline">
                                    {employee.active ? "Desactivar" : "Activar"}
                                  </Button>
                                </form>
                                <form action={deleteEmployeeAction} className="grid gap-2">
                                  <input name="id" type="hidden" value={employee.id} />
                                  <label className="flex items-center gap-2 text-[var(--text-caption)] font-bold text-[color:var(--muted)]">
                                    <input
                                      className="h-4 w-4 rounded border-[color:var(--border)] accent-[var(--accent)]"
                                      name="confirmDelete"
                                      required
                                      suppressHydrationWarning
                                      type="checkbox"
                                      value="yes"
                                    />
                                    Confirmar borrado
                                  </label>
                                  <Button type="submit" variant="danger">
                                    Borrar acceso
                                  </Button>
                                </form>
                              </div>
                            </div>
                          </details>
                        ) : (
                          <span className="text-[var(--text-caption)] text-[color:var(--muted)]">Sin permiso</span>
                        )}
                      </DataTableCell>
                    </DataTableRow>
                  );
                })
              )}
            </DataTableBody>
          </DataTable>
        </Card>
      </div>
    </ModulePage>
  );
}
