import { ModulePage } from "@/components/module-page";
import { Button, Card, DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeader, DataTableRow, EmptyState, Field, Input, PageHeader, Select, StatCard } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { getDividendSheet, getSalaryPlan } from "@/lib/finance";
import { listEmployees } from "@/lib/employees";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import {
  ADMIN_DIVIDENDS_READ_PERMISSION,
  ADMIN_DIVIDENDS_WRITE_PERMISSION,
  ADMIN_SALARIES_READ_PERMISSION,
  ADMIN_SALARIES_WRITE_PERMISSION,
  sessionAllows,
} from "@/lib/route-auth";
import { createPartnerAction, createSalaryPlanAction } from "./actions";

export default async function RemunerationsPage() {
  const session = await requireStaffSession();
  await requirePagePermission(session, [ADMIN_SALARIES_READ_PERMISSION, ADMIN_DIVIDENDS_READ_PERMISSION]);
  const [salaries, dividends, canWriteSalaries, canWriteDividends] = await Promise.all([
    getSalaryPlan(session.companyId),
    getDividendSheet(session.companyId),
    sessionAllows(session, [ADMIN_SALARIES_WRITE_PERMISSION]),
    sessionAllows(session, [ADMIN_DIVIDENDS_WRITE_PERMISSION]),
  ]);
  const configuredIds = new Set(salaries.employees.map((item) => item.employeeId).filter(Boolean));
  const employees = canWriteSalaries ? await listEmployees(session.companyId) : [];
  const availableEmployees = employees.filter((item) => item.active && !configuredIds.has(item.id));

  return (
    <ModulePage
      active="balance-remunerations"
      description="Sueldos, cargas, dividendos asignados, retiros y saldos pendientes."
      session={session}
      title="Sueldos y dividendos"
    >
      <div className="grid gap-5">
        <PageHeader
          title="Sueldos y dividendos"
          description="Vista unificada de compromisos con empleados y socios."
          moduleIntro
        />

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Empleados activos" value={salaries.meta.activeCount} />
          <StatCard label="Sueldos a pagar" value={formatCurrency(salaries.meta.payable)} />
          <StatCard label="Dividendos asignados" value={formatCurrency(dividends.meta.owed)} />
          <StatCard label="Saldo socios" value={formatCurrency(dividends.meta.balance)} />
        </div>

        {canWriteSalaries ? (
          <Card className="p-4">
            <h2 className="erp-text-title-sm font-black">Agregar empleado a sueldos</h2>
            {availableEmployees.length === 0 ? (
              <p className="mt-2 text-sm text-[color:var(--muted)]">
                Todos los empleados activos ya tienen un sueldo configurado.
              </p>
            ) : (
              <form action={createSalaryPlanAction} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field htmlFor="salary-employee" label="Empleado">
                  <Select id="salary-employee" name="employeeId" required>
                    {availableEmployees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.displayName}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field htmlFor="salary-monthly" label="Sueldo mensual">
                  <Input id="salary-monthly" min="0.01" name="monthly" required step="0.01" type="number" />
                </Field>
                <Field htmlFor="salary-modality" label="Modalidad">
                  <Input defaultValue="mensual" id="salary-modality" name="modality" />
                </Field>
                <Field htmlFor="salary-bonus" label="Aguinaldo">
                  <Select defaultValue="true" id="salary-bonus" name="bonusEnabled">
                    <option value="true">Aplica</option>
                    <option value="false">No aplica</option>
                  </Select>
                </Field>
                <Field htmlFor="salary-charges" label="Cargas (%)">
                  <Input defaultValue="0" id="salary-charges" max="100" min="0" name="chargesPercent" step="0.01" type="number" />
                </Field>
                <Field htmlFor="salary-notes" label="Notas">
                  <Input id="salary-notes" name="notes" placeholder="Opcional" />
                </Field>
                <div className="flex items-end sm:col-span-2 lg:col-span-3">
                  <Button type="submit">Agregar</Button>
                </div>
              </form>
            )}
          </Card>
        ) : null}

        <Card className="overflow-hidden">
          <DataTable
            caption="Sueldos vigentes"
            className="rounded-none border-0 shadow-none"
            minWidth="980px"
            tableLabel="Sueldos"
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>Empleado</DataTableHead>
                <DataTableHead>Modalidad</DataTableHead>
                <DataTableHead align="right">Sueldo</DataTableHead>
                <DataTableHead align="right">Aguinaldo prop.</DataTableHead>
                <DataTableHead align="right">Cargas</DataTableHead>
                <DataTableHead align="right">Costo total</DataTableHead>
                <DataTableHead align="right">Pagado</DataTableHead>
                <DataTableHead align="right">A pagar</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {salaries.employees.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={8}>
                    <EmptyState title="No hay sueldos configurados" />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                salaries.employees.map((item) => (
                  <DataTableRow key={item.id}>
                    <DataTableCell>
                      <div className="font-medium">{item.employee}</div>
                      <div className="text-xs text-[color:var(--muted)]">{item.active ? "Activo" : "Inactivo"}</div>
                    </DataTableCell>
                    <DataTableCell>{item.modality}</DataTableCell>
                    <DataTableCell align="right">{formatCurrency(item.monthly)}</DataTableCell>
                    <DataTableCell align="right">{formatCurrency(item.bonusProvision)}</DataTableCell>
                    <DataTableCell align="right">{formatCurrency(item.charges)}</DataTableCell>
                    <DataTableCell align="right">{formatCurrency(item.totalCost)}</DataTableCell>
                    <DataTableCell align="right">{formatCurrency(item.paid)}</DataTableCell>
                    <DataTableCell align="right">{formatCurrency(item.payable)}</DataTableCell>
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>
        </Card>

        {canWriteDividends ? (
          <Card className="p-4">
            <h2 className="erp-text-title-sm font-black">Agregar socio</h2>
            <form action={createPartnerAction} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field htmlFor="partner-name" label="Socio">
                <Input id="partner-name" name="name" required />
              </Field>
              <Field htmlFor="partner-share" label="Participacion (%)">
                <Input id="partner-share" max="100" min="0.01" name="share" required step="0.01" type="number" />
              </Field>
              <Field htmlFor="partner-notes" label="Notas">
                <Input id="partner-notes" name="notes" placeholder="Opcional" />
              </Field>
              <div className="flex items-end">
                <Button type="submit">Agregar</Button>
              </div>
            </form>
          </Card>
        ) : null}

        <Card className="overflow-hidden">
          <DataTable
            caption="Dividendos por socio"
            className="rounded-none border-0 shadow-none"
            minWidth="720px"
            tableLabel="Dividendos"
          >
            <DataTableHeader>
              <DataTableRow className="hover:bg-transparent">
                <DataTableHead>Socio</DataTableHead>
                <DataTableHead align="right">Participacion</DataTableHead>
                <DataTableHead align="right">Se le debe</DataTableHead>
                <DataTableHead align="right">Retiro</DataTableHead>
                <DataTableHead align="right">Saldo</DataTableHead>
              </DataTableRow>
            </DataTableHeader>
            <DataTableBody>
              {dividends.partners.length === 0 ? (
                <DataTableRow className="hover:bg-transparent">
                  <DataTableCell colSpan={5}>
                    <EmptyState title="No hay socios configurados" />
                  </DataTableCell>
                </DataTableRow>
              ) : (
                dividends.partners.map((item) => (
                  <DataTableRow key={item.id}>
                    <DataTableCell>
                      <div className="font-medium">{item.partner}</div>
                      <div className="text-xs text-[color:var(--muted)]">{item.active ? "Activo" : "Inactivo"}</div>
                    </DataTableCell>
                    <DataTableCell align="right">{item.share.toFixed(2)}%</DataTableCell>
                    <DataTableCell align="right">{formatCurrency(item.owed)}</DataTableCell>
                    <DataTableCell align="right">{formatCurrency(item.withdrawn)}</DataTableCell>
                    <DataTableCell align="right">{formatCurrency(item.balance)}</DataTableCell>
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
