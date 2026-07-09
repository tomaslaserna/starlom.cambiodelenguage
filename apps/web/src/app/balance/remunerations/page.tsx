import { ModulePage } from "@/components/module-page";
import { Card, DataTable, DataTableBody, DataTableCell, DataTableHead, DataTableHeader, DataTableRow, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { getDividendSheet, getSalaryPlan } from "@/lib/finance";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { ADMIN_DIVIDENDS_READ_PERMISSION, ADMIN_SALARIES_READ_PERMISSION } from "@/lib/route-auth";

export default async function RemunerationsPage() {
  const session = await requireStaffSession();
  await requirePagePermission(session, [ADMIN_SALARIES_READ_PERMISSION, ADMIN_DIVIDENDS_READ_PERMISSION]);
  const [salaries, dividends] = await Promise.all([
    getSalaryPlan(session.companyId),
    getDividendSheet(session.companyId),
  ]);

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
