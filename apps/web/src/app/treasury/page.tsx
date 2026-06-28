import { ModulePage } from "@/components/module-page";
import { fastOr } from "@/lib/fast-data";
import { formatCurrency } from "@/lib/format";
import { getTreasuryBalances } from "@/lib/finance";
import { requireStaffSession } from "@/lib/auth";

export default async function TreasuryPage() {
  const session = await requireStaffSession();
  const treasury = await fastOr(getTreasuryBalances(session.companyId), {
    accounts: [],
    meta: {
      total: 0,
      cash: 0,
      bank: 0,
      other: 0,
    },
  });

  return (
    <ModulePage
      active="treasury"
      description="Tesoreria principal reducida a saldos actuales totales y por cuenta."
      session={session}
      title="Tesoreria"
    >
      <div className="grid gap-5">

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Total actual</div>
            <div className="mt-2 text-2xl font-semibold">{formatCurrency(treasury.meta.total)}</div>
          </div>
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Efectivo</div>
            <div className="mt-2 text-2xl font-semibold">{formatCurrency(treasury.meta.cash)}</div>
          </div>
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Ctas bancarias</div>
            <div className="mt-2 text-2xl font-semibold">{formatCurrency(treasury.meta.bank)}</div>
          </div>
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Otra</div>
            <div className="mt-2 text-2xl font-semibold">{formatCurrency(treasury.meta.other)}</div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)]">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-[color:var(--panel-subtle)] text-xs uppercase text-[color:var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-semibold">Cuenta</th>
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-4 py-3 text-right font-semibold">Movimientos</th>
                <th className="px-4 py-3 text-right font-semibold">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {treasury.accounts.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-[color:var(--muted)]" colSpan={4}>
                    No hay saldos actuales registrados.
                  </td>
                </tr>
              ) : (
                treasury.accounts.map((account) => (
                  <tr className="border-t border-[color:var(--border)]" key={`${account.accountType}-${account.account}`}>
                    <td className="px-4 py-4 font-medium">{account.account}</td>
                    <td className="px-4 py-4">{account.accountType}</td>
                    <td className="px-4 py-4 text-right">{account.movements}</td>
                    <td className="px-4 py-4 text-right font-mono text-xs">{formatCurrency(account.balance)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ModulePage>
  );
}
