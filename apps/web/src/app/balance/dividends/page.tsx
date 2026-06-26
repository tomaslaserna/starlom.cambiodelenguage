import { ModulePage } from "@/components/module-page";
import { SectionTabs } from "@/components/section-tabs";
import { fastOr } from "@/lib/fast-data";
import { formatCurrency } from "@/lib/format";
import { getDividendSheet } from "@/lib/finance";
import { requireStaffSession } from "@/lib/auth";

export default async function DividendsPage() {
  const session = await requireStaffSession();
  const dividends = await fastOr(getDividendSheet(session.companyId), {
    partners: [],
    meta: {
      totalShare: 0,
      owed: 0,
      withdrawn: 0,
      balance: 0,
    },
  });

  return (
    <ModulePage
      active="balance"
      description="Planilla simple por socio: participacion, dividendos asignados, retiros y saldo."
      session={session}
      title="Dividendos"
    >
      <div className="grid gap-5">
        <SectionTabs
          tabs={[
            { href: "/balance", label: "Resumen" },
            { href: "/balance/income-statement", label: "Estado de resultados" },
            { href: "/balance/salaries", label: "Sueldos" },
            { href: "/balance/dividends", label: "Dividendos", active: true },
          ]}
        />

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Participacion activa</div>
            <div className="mt-2 text-2xl font-semibold">{dividends.meta.totalShare.toFixed(2)}%</div>
          </div>
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Asignado</div>
            <div className="mt-2 text-2xl font-semibold">{formatCurrency(dividends.meta.owed)}</div>
          </div>
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Retirado</div>
            <div className="mt-2 text-2xl font-semibold">{formatCurrency(dividends.meta.withdrawn)}</div>
          </div>
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)] p-4">
            <div className="text-sm text-[color:var(--muted)]">Saldo</div>
            <div className="mt-2 text-2xl font-semibold">{formatCurrency(dividends.meta.balance)}</div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--panel)]">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-[color:var(--panel-subtle)] text-xs uppercase text-[color:var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-semibold">Socio</th>
                <th className="px-4 py-3 text-right font-semibold">Participacion</th>
                <th className="px-4 py-3 text-right font-semibold">Se le debe</th>
                <th className="px-4 py-3 text-right font-semibold">Retiro</th>
                <th className="px-4 py-3 text-right font-semibold">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {dividends.partners.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-[color:var(--muted)]" colSpan={5}>
                    No hay socios configurados.
                  </td>
                </tr>
              ) : (
                dividends.partners.map((item) => (
                  <tr className="border-t border-[color:var(--border)]" key={item.id}>
                    <td className="px-4 py-4">
                      <div className="font-medium">{item.partner}</div>
                      <div className="text-xs text-[color:var(--muted)]">{item.active ? "Activo" : "Inactivo"}</div>
                    </td>
                    <td className="px-4 py-4 text-right">{item.share.toFixed(2)}%</td>
                    <td className="px-4 py-4 text-right font-mono text-xs">{formatCurrency(item.owed)}</td>
                    <td className="px-4 py-4 text-right font-mono text-xs">{formatCurrency(item.withdrawn)}</td>
                    <td className="px-4 py-4 text-right font-mono text-xs">{formatCurrency(item.balance)}</td>
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
