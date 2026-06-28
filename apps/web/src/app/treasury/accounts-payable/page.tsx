import { ModulePage } from "@/components/module-page";
import { fastOr } from "@/lib/fast-data";
import { formatCurrency, formatDate } from "@/lib/format";
import { getAccountsPayable } from "@/lib/admin-metrics";
import { requireStaffSession } from "@/lib/auth";

export default async function AccountsPayablePage() {
  const session = await requireStaffSession();
  const payables = await fastOr(getAccountsPayable(session.companyId), {
    data: [],
    meta: {
      count: 0,
      total: 0,
    },
  });

  return (
    <ModulePage
      active="treasury"
      description="Compras recibidas, sueldos por pagar, servicios proyectados e impuestos pendientes."
      session={session}
      title="Cuentas por pagar"
    >
      <div className="grid gap-5">

        <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
          <div className="text-sm text-[color:var(--muted)]">Saldo abierto total</div>
          <div className="mt-2 text-2xl font-semibold">{formatCurrency(payables.meta.total)}</div>
        </div>

        <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead className="bg-[color:var(--panel-subtle)] text-xs uppercase text-[color:var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Origen</th>
                  <th className="px-4 py-3 font-semibold">Concepto</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                  <th className="px-4 py-3 text-right font-semibold">Pagado</th>
                  <th className="px-4 py-3 text-right font-semibold">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {payables.data.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-[color:var(--muted)]" colSpan={7}>
                      No hay cuentas por pagar abiertas.
                    </td>
                  </tr>
                ) : (
                  payables.data.map((item) => (
                    <tr className="border-t border-[color:var(--border)]" key={`${item.source}-${item.id}`}>
                      <td className="px-4 py-4">{formatDate(item.date)}</td>
                      <td className="px-4 py-4">{item.provider}</td>
                      <td className="px-4 py-4">{item.concept}</td>
                      <td className="px-4 py-4">{item.status}</td>
                      <td className="px-4 py-4 text-right font-mono text-xs">{formatCurrency(item.total)}</td>
                      <td className="px-4 py-4 text-right font-mono text-xs">{formatCurrency(item.paid)}</td>
                      <td className="px-4 py-4 text-right font-mono text-xs">{formatCurrency(item.balance)}</td>
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
