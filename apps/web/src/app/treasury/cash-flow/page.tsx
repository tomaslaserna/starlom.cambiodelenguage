import { ModulePage } from "@/components/module-page";
import { fastOr } from "@/lib/fast-data";
import { formatCurrency, formatDate } from "@/lib/format";
import { getCashflow } from "@/lib/admin-metrics";
import { requireStaffSession } from "@/lib/auth";

export default async function CashFlowPage() {
  const session = await requireStaffSession();
  const cashflow = await fastOr(getCashflow(session.companyId), {
    data: [],
    meta: {
      inflow: 0,
      outflow: 0,
      net: 0,
    },
  });

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
