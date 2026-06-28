import { ModulePage } from "@/components/module-page";
import { fastOr } from "@/lib/fast-data";
import { formatCurrency, formatNumber } from "@/lib/format";
import { getBalanceDashboard } from "@/lib/finance";
import { requireStaffSession } from "@/lib/auth";

export default async function BalancePage() {
  const session = await requireStaffSession();
  const { metrics, payables, cashflow } = await fastOr(getBalanceDashboard(session.companyId), {
    metrics: {
      period: {
        currentStart: "",
        nextStart: "",
        previousStart: "",
      },
      sales: { current: 0, previous: 0, deltaPercent: null },
      collections: { current: 0, previous: 0, deltaPercent: null },
      margin: { grossCost: 0, grossProfit: 0, operatingCosts: 0, operatingResult: 0 },
      stock: { value: 0, units: 0, products: 0 },
      purchases: { current: 0, openTotal: 0 },
      receivables: { openTotal: 0 },
    },
    payables: { data: [], meta: { count: 0, total: 0 } },
    cashflow: { data: [], meta: { inflow: 0, outflow: 0, net: 0 } },
  });
  const incomeRows = [
    { label: "Ventas entregadas", amount: metrics.sales.current },
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

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Ventas del mes</div>
            <div className="mt-2 text-2xl font-semibold">{formatCurrency(metrics.sales.current)}</div>
          </div>
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Resultado operativo</div>
            <div className="mt-2 text-2xl font-semibold">{formatCurrency(metrics.margin.operatingResult)}</div>
          </div>
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Costos operativos</div>
            <div className="mt-2 text-2xl font-semibold">{formatCurrency(metrics.margin.operatingCosts)}</div>
          </div>
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Stock valorizado</div>
            <div className="mt-2 text-2xl font-semibold">{formatCurrency(metrics.stock.value)}</div>
            <div className="mt-2 text-xs text-[color:var(--muted)]">{formatNumber(metrics.stock.units)} unidades</div>
          </div>
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

          <section className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)]">
            <div className="border-b border-[color:var(--border)] px-4 py-3">
              <h2 className="font-semibold">Estado de resultados</h2>
            </div>
            <table className="w-full border-collapse text-left text-sm">
              <tbody>
                {incomeRows.map((row) => (
                  <tr className="border-t border-[color:var(--border)] first:border-t-0" key={row.label}>
                    <td className={`px-4 py-3 ${row.strong ? "font-semibold" : ""}`}>{row.label}</td>
                    <td className={`px-4 py-3 text-right font-mono text-xs ${row.strong ? "font-semibold" : ""}`}>
                      {formatCurrency(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

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
