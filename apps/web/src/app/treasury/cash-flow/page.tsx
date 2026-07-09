import { ModulePage } from "@/components/module-page";
import { formatCurrency, formatDate } from "@/lib/format";
import { getCashflow } from "@/lib/admin-metrics";
import { requireStaffSession } from "@/lib/auth";
import { requirePagePermission } from "@/lib/page-auth";
import { ADMIN_CASHFLOW_READ_PERMISSION, ADMIN_TREASURY_READ_PERMISSION } from "@/lib/route-auth";

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
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Ingresos proyectados</div>
            <div className="mt-2 text-2xl font-semibold">{formatCurrency(cashflow.meta.inflow)}</div>
          </div>
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Gastos proyectados</div>
            <div className="mt-2 text-2xl font-semibold">{formatCurrency(cashflow.meta.outflow)}</div>
          </div>
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Neto proyectado</div>
            <div className="mt-2 text-2xl font-semibold">{formatCurrency(cashflow.meta.net)}</div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {cashflow.meta.horizons.map((horizon) => (
            <div
              className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4"
              key={horizon.days}
            >
              <div className="text-sm font-semibold text-[color:var(--muted)]">{horizon.days} dias</div>
              <div className="mt-2 text-2xl font-semibold">{formatCurrency(horizon.net)}</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[color:var(--muted)]">
                <span>Ingresos {formatCurrency(horizon.inflow)}</span>
                <span>Egresos {formatCurrency(horizon.outflow)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)]">
          <div className="border-b border-[color:var(--border)] px-4 py-3">
            <h2 className="font-semibold">Calendario de caja</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead className="bg-[color:var(--panel-subtle)] text-xs uppercase text-[color:var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Movimientos</th>
                  <th className="px-4 py-3 text-right font-semibold">Ingresos</th>
                  <th className="px-4 py-3 text-right font-semibold">Egresos</th>
                  <th className="px-4 py-3 text-right font-semibold">Neto</th>
                </tr>
              </thead>
              <tbody>
                {cashflow.calendar.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-[color:var(--muted)]" colSpan={5}>
                      No hay movimientos para calendarizar.
                    </td>
                  </tr>
                ) : (
                  cashflow.calendar.map((day) => (
                    <tr className="border-t border-[color:var(--border)]" key={day.date ?? "sin_fecha"}>
                      <td className="whitespace-nowrap px-4 py-4">{formatDate(day.date)}</td>
                      <td className="px-4 py-4">
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
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-xs">{formatCurrency(day.inflow)}</td>
                      <td className="px-4 py-4 text-right font-mono text-xs">{formatCurrency(day.outflow)}</td>
                      <td className="px-4 py-4 text-right font-mono text-xs">{formatCurrency(day.net)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-[color:var(--panel-subtle)] text-xs uppercase text-[color:var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Concepto</th>
                  <th className="px-4 py-3 font-semibold">Tipo</th>
                  <th className="px-4 py-3 text-right font-semibold">Monto</th>
                </tr>
              </thead>
              <tbody>
                {cashflow.data.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-[color:var(--muted)]" colSpan={4}>
                      No hay movimientos proyectados.
                    </td>
                  </tr>
                ) : (
                  cashflow.data.map((item) => (
                    <tr className="border-t border-[color:var(--border)]" key={`${item.kind}-${item.id}-${item.label}`}>
                      <td className="px-4 py-4">{formatDate(item.date)}</td>
                      <td className="px-4 py-4">{item.label}</td>
                      <td className="px-4 py-4">{item.kind === "inflow" ? "Ingreso" : "Egreso"}</td>
                      <td className="px-4 py-4 text-right font-mono text-xs">{formatCurrency(item.amount)}</td>
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
