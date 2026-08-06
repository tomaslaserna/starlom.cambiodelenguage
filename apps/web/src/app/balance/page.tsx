import { ModulePage } from "@/components/module-page";
import { formatCurrency, formatNumber } from "@/lib/format";
import { getBalanceDashboard } from "@/lib/finance";
import { getEarliestSalesMonth } from "@/lib/admin-metrics";
import { requireStaffSession } from "@/lib/auth";
import { currentMonth } from "@/lib/month-range";
import { requirePagePermission } from "@/lib/page-auth";
import { availablePeriods, parsePeriod, periodLabel } from "@/lib/period-range";
import { ADMIN_BALANCE_READ_PERMISSION, REPORTS_READ_PERMISSION } from "@/lib/route-auth";
import { PeriodPicker } from "./period-picker";
import {
  Card,
  CardHeader,
  CardTitle,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableRow,
  StatCard,
} from "@/components/ui";

export default async function BalancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const session = await requireStaffSession();
  await requirePagePermission(session, [ADMIN_BALANCE_READ_PERMISSION, REPORTS_READ_PERMISSION]);

  const { period: periodParam } = await searchParams;
  const fallbackMonth = currentMonth(new Date());
  const period = parsePeriod(periodParam, fallbackMonth);
  const earliest = await getEarliestSalesMonth(session.companyId);
  const periods = availablePeriods(earliest, fallbackMonth);

  const { metrics, payables, cashflow } = await getBalanceDashboard(session.companyId, period);
  const incomeRows = [
    { label: "Ventas entregadas (neto, sin IVA facturado)", amount: metrics.sales.current },
    { label: "Costo de mercaderia vendida", amount: -metrics.margin.grossCost },
    { label: "Ganancia bruta", amount: metrics.margin.grossProfit, strong: true },
    { label: "Costos fijos operativos y sueldos vigentes", amount: -metrics.margin.operatingCosts },
    { label: "Resultado operativo", amount: metrics.margin.operatingResult, strong: true },
  ];

  return (
    <ModulePage
      active="balance"
      description="Balance operativo con resultado, costos vigentes y obligaciones pendientes."
      session={session}
      title="Balance"
    >
      <div className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="erp-text-title-md font-semibold text-[color:var(--foreground)]">
              Balance · {periodLabel(period)}
            </h2>
            <p className="erp-text-caption text-[color:var(--muted)]">
              Por cobrar y por pagar son saldos a la fecha.
            </p>
          </div>
          <PeriodPicker periods={periods} selectedKey={period.key} />
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            detail="Monto total cobrado, IVA incluido"
            label="Ventas brutas"
            tone="accent"
            value={formatCurrency(metrics.sales.grossCurrent)}
          />
          <StatCard
            detail="Sin el IVA de lo ya facturado"
            label="Ventas netas"
            tone="info"
            value={formatCurrency(metrics.sales.current)}
          />
          <StatCard label="Resultado operativo" tone="success" value={formatCurrency(metrics.margin.operatingResult)} />
          <StatCard label="Costos operativos" tone="warning" value={formatCurrency(metrics.margin.operatingCosts)} />
          <StatCard
            detail={`${formatNumber(metrics.stock.units)} unidades`}
            label="Stock valorizado"
            value={formatCurrency(metrics.stock.value)}
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)]">
            <div className="border-b border-[color:var(--border)] px-4 py-3">
              <h2 className="font-semibold">Posicion operativa</h2>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <div className="rounded-md bg-[color:var(--panel-subtle)] p-3">
                <div className="text-xs text-[color:var(--muted)]">Ganancia bruta</div>
                <div className="mt-1 font-semibold">{formatCurrency(metrics.margin.grossProfit)}</div>
              </div>
              <div className="rounded-md bg-[color:var(--panel-subtle)] p-3">
                <div className="text-xs text-[color:var(--muted)]">Costo mercaderia</div>
                <div className="mt-1 font-semibold">{formatCurrency(metrics.margin.grossCost)}</div>
              </div>
              <div className="rounded-md bg-[color:var(--panel-subtle)] p-3">
                <div className="text-xs text-[color:var(--muted)]">Por cobrar</div>
                <div className="mt-1 font-semibold">{formatCurrency(metrics.receivables.openTotal)}</div>
              </div>
              <div className="rounded-md bg-[color:var(--panel-subtle)] p-3">
                <div className="text-xs text-[color:var(--muted)]">Por pagar</div>
                <div className="mt-1 font-semibold">{formatCurrency(payables.meta.total)}</div>
              </div>
            </div>
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Resumen</CardTitle>
            </CardHeader>
            <DataTable
              caption="Resumen del resultado operativo"
              className="rounded-none border-0 shadow-none"
              minWidth="100%"
              tableLabel="Resumen de balance"
            >
              <DataTableBody>
                {incomeRows.map((row) => (
                  <DataTableRow key={row.label}>
                    <DataTableCell className={row.strong ? "font-bold" : ""}>{row.label}</DataTableCell>
                    <DataTableCell
                      align="right"
                      className={`whitespace-nowrap font-mono text-xs ${row.strong ? "font-bold" : ""}`}
                    >
                      {formatCurrency(row.amount)}
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          </Card>

          <section className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)]">
            <div className="border-b border-[color:var(--border)] px-4 py-3">
              <h2 className="font-semibold">Cash Flow resumido</h2>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-3">
              <div className="rounded-md bg-[color:var(--panel-subtle)] p-3">
                <div className="text-xs text-[color:var(--muted)]">Ingresos</div>
                <div className="mt-1 font-semibold">{formatCurrency(cashflow.meta.inflow)}</div>
              </div>
              <div className="rounded-md bg-[color:var(--panel-subtle)] p-3">
                <div className="text-xs text-[color:var(--muted)]">Egresos</div>
                <div className="mt-1 font-semibold">{formatCurrency(cashflow.meta.outflow)}</div>
              </div>
              <div className="rounded-md bg-[color:var(--panel-subtle)] p-3">
                <div className="text-xs text-[color:var(--muted)]">Neto</div>
                <div className="mt-1 font-semibold">{formatCurrency(cashflow.meta.net)}</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </ModulePage>
  );
}
