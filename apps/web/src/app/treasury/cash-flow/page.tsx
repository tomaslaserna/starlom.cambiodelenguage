import { ModulePage } from "@/components/module-page";
import { formatCurrency, formatDate } from "@/lib/format";
import { getCashflow } from "@/lib/admin-metrics";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { ADMIN_CASHFLOW_READ_PERMISSION, ADMIN_TREASURY_READ_PERMISSION } from "@/lib/route-auth";
import {
  Card,
  CardHeader,
  CardTitle,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
  StatCard,
} from "@/components/ui";

export default async function CashFlowPage() {
  const session = await requireStaffSession();
  await requirePagePermission(session, [ADMIN_CASHFLOW_READ_PERMISSION, ADMIN_TREASURY_READ_PERMISSION]);
  const cashflow = await getCashflow(session.companyId);

  return (
    <ModulePage
      active="treasury"
      description="Liquidez proyectada, gastos proyectados, compras, sueldos e impuestos."
      session={session}
      title="Cash Flow"
    >
      <div className="grid gap-5">

        <div className="grid gap-3 md:grid-cols-3">
          <StatCard label="Ingresos proyectados" tone="success" value={formatCurrency(cashflow.meta.inflow)} />
          <StatCard label="Gastos proyectados" tone="warning" value={formatCurrency(cashflow.meta.outflow)} />
          <StatCard label="Neto proyectado" tone="accent" value={formatCurrency(cashflow.meta.net)} />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {cashflow.meta.horizons.map((horizon) => (
            <StatCard
              detail={`Ingresos ${formatCurrency(horizon.inflow)} · Egresos ${formatCurrency(horizon.outflow)}`}
              key={horizon.days}
              label={`${horizon.days} dias`}
              value={formatCurrency(horizon.net)}
            />
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Calendario de caja</CardTitle>
          </CardHeader>
          <DataTable
            caption="Calendario de movimientos proyectados"
            className="rounded-none border-0 shadow-none"
            minWidth="820px"
            tableLabel="Calendario de caja"
          >
              <DataTableHeader>
                <DataTableRow className="hover:bg-transparent">
                  <DataTableHead>Fecha</DataTableHead>
                  <DataTableHead>Movimientos</DataTableHead>
                  <DataTableHead align="right">Ingresos</DataTableHead>
                  <DataTableHead align="right">Egresos</DataTableHead>
                  <DataTableHead align="right">Neto</DataTableHead>
                </DataTableRow>
              </DataTableHeader>
              <DataTableBody>
                {cashflow.calendar.length === 0 ? (
                  <DataTableRow className="hover:bg-transparent">
                    <DataTableCell className="py-8 text-center text-[color:var(--muted)]" colSpan={5}>
                      No hay movimientos para calendarizar.
                    </DataTableCell>
                  </DataTableRow>
                ) : (
                  cashflow.calendar.map((day) => (
                    <DataTableRow key={day.date ?? "sin_fecha"}>
                      <DataTableCell className="whitespace-nowrap">{formatDate(day.date)}</DataTableCell>
                      <DataTableCell>
                        <div className="grid gap-1">
                          {day.items.slice(0, 3).map((item) => (
                            <span className="truncate" key={`${item.kind}-${item.id}-${item.label}`}>
                              {item.kind === "inflow" ? "Ingreso" : "Egreso"} - {item.label}
                            </span>
                          ))}
                          {day.items.length > 3 ? (
                            <span className="text-xs text-[color:var(--muted)]">
                              +{day.items.length - 3} movimientos mas
                            </span>
                          ) : null}
                        </div>
                      </DataTableCell>
                      <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs">{formatCurrency(day.inflow)}</DataTableCell>
                      <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs">{formatCurrency(day.outflow)}</DataTableCell>
                      <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs">{formatCurrency(day.net)}</DataTableCell>
                    </DataTableRow>
                  ))
                )}
              </DataTableBody>
          </DataTable>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Movimientos proyectados</CardTitle>
          </CardHeader>
          <DataTable
            caption="Detalle de movimientos proyectados"
            className="rounded-none border-0 shadow-none"
            minWidth="760px"
            tableLabel="Movimientos proyectados"
          >
              <DataTableHeader>
                <DataTableRow className="hover:bg-transparent">
                  <DataTableHead>Fecha</DataTableHead>
                  <DataTableHead>Concepto</DataTableHead>
                  <DataTableHead>Tipo</DataTableHead>
                  <DataTableHead align="right">Monto</DataTableHead>
                </DataTableRow>
              </DataTableHeader>
              <DataTableBody>
                {cashflow.data.length === 0 ? (
                  <DataTableRow className="hover:bg-transparent">
                    <DataTableCell className="py-8 text-center text-[color:var(--muted)]" colSpan={4}>
                      No hay movimientos proyectados.
                    </DataTableCell>
                  </DataTableRow>
                ) : (
                  cashflow.data.map((item) => (
                    <DataTableRow key={`${item.kind}-${item.id}-${item.label}`}>
                      <DataTableCell className="whitespace-nowrap">{formatDate(item.date)}</DataTableCell>
                      <DataTableCell>{item.label}</DataTableCell>
                      <DataTableCell>{item.kind === "inflow" ? "Ingreso" : "Egreso"}</DataTableCell>
                      <DataTableCell align="right" className="whitespace-nowrap font-mono text-xs">{formatCurrency(item.amount)}</DataTableCell>
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
